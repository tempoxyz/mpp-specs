import { describe, it, expect } from 'vitest'
import {
  validateFeeToken,
  validateSlippage,
  validateFeePaymentFields,
  validateSignatureDomain,
  FEE_PAYER_SIGNATURE_PLACEHOLDER,
  VALID_FEE_TOKEN_PLACEHOLDERS,
  DEFAULT_FEE_VALIDATION_CONFIG,
  MODERATO_FEE_TOKENS,
} from '../src/index.js'

describe('Fee Validation (Spec §9.1.6)', () => {
  const alphaUSD = '0x20c0000000000000000000000000000000000001' as const
  const unknownToken = '0x1234567890123456789012345678901234567890' as const

  describe('validateFeeToken', () => {
    it('accepts whitelisted token with valid fee', () => {
      const result = validateFeeToken(alphaUSD, 1_000_000n, 10_000n)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects non-whitelisted token', () => {
      const result = validateFeeToken(unknownToken, 1_000_000n, 10_000n)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('fee_token_rejected')
      expect(result.message).toContain('not in approved whitelist')
    })

    it('rejects fee exceeding 1% of payment (spec §9.1.6)', () => {
      // 1M payment, 20K fee = 2% > 1%
      const result = validateFeeToken(alphaUSD, 1_000_000n, 20_000n)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('fee_limit_exceeded')
      expect(result.message).toContain('exceeds maximum')
    })

    it('rejects fee exceeding $1 absolute cap (spec §9.1.6)', () => {
      // Large payment, 1.5M fee > 1M cap
      const result = validateFeeToken(alphaUSD, 1_000_000_000n, 1_500_000n)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('fee_limit_exceeded')
    })

    it('accepts fee at exactly 1% boundary', () => {
      const result = validateFeeToken(alphaUSD, 1_000_000n, 10_000n)
      expect(result.valid).toBe(true)
    })

    it('accepts fee at exactly $1 boundary', () => {
      const result = validateFeeToken(alphaUSD, 1_000_000_000n, 1_000_000n)
      expect(result.valid).toBe(true)
    })
  })

  describe('validateSlippage', () => {
    it('accepts slippage under 0.5%', () => {
      const result = validateSlippage(1_000_000n, 995_000n) // 0.5%
      expect(result.valid).toBe(true)
    })

    it('rejects slippage over 0.5%', () => {
      const result = validateSlippage(1_000_000n, 990_000n) // 1%
      expect(result.valid).toBe(false)
      expect(result.error).toBe('fee_slippage_exceeded')
    })

    it('handles zero expected amount', () => {
      const result = validateSlippage(0n, 0n)
      expect(result.valid).toBe(true)
    })
  })
})

describe('Credential Validation (Spec §8.3)', () => {
  describe('validateFeePaymentFields', () => {
    describe('when feePayer=true', () => {
      it('accepts 0x00 fee_payer_signature', () => {
        const result = validateFeePaymentFields('0x00', undefined, true)
        expect(result.valid).toBe(true)
      })

      it('accepts 0x00 with zero address fee_token', () => {
        const result = validateFeePaymentFields(
          '0x00',
          '0x0000000000000000000000000000000000000000',
          true
        )
        expect(result.valid).toBe(true)
      })

      it('accepts 0x00 with RLP null fee_token', () => {
        const result = validateFeePaymentFields('0x00', '0x80', true)
        expect(result.valid).toBe(true)
      })

      it('rejects non-0x00 fee_payer_signature', () => {
        const result = validateFeePaymentFields('0x01', undefined, true)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('fee_payer_signature must be')
      })

      it('rejects signature-length fee_payer_signature (tampering)', () => {
        const fakeSig = '0x' + 'ab'.repeat(65) // 65-byte "signature"
        const result = validateFeePaymentFields(fakeSig as `0x${string}`, undefined, true)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('potential tampering')
      })

      it('rejects non-placeholder fee_token', () => {
        const result = validateFeePaymentFields(
          '0x00',
          '0x20c0000000000000000000000000000000000001',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toContain('must be empty or zero address')
      })
    })

    describe('when feePayer=false', () => {
      it('requires valid fee_token address', () => {
        const result = validateFeePaymentFields(
          undefined,
          '0x20c0000000000000000000000000000000000001',
          false
        )
        expect(result.valid).toBe(true)
      })

      it('rejects missing fee_token', () => {
        const result = validateFeePaymentFields(undefined, undefined, false)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('must be a valid TIP-20 address')
      })

      it('rejects zero address fee_token', () => {
        const result = validateFeePaymentFields(
          undefined,
          '0x0000000000000000000000000000000000000000',
          false
        )
        expect(result.valid).toBe(false)
      })
    })
  })

  describe('validateSignatureDomain', () => {
    it('accepts 0x76 domain for client transactions', () => {
      const tx = '0x76f901...' as `0x${string}`
      const result = validateSignatureDomain(tx, '0x76')
      expect(result.valid).toBe(true)
    })

    it('rejects wrong domain', () => {
      const tx = '0x78f901...' as `0x${string}`
      const result = validateSignatureDomain(tx, '0x76')
      expect(result.valid).toBe(false)
    })
  })
})

describe('Constants match spec', () => {
  it('FEE_PAYER_SIGNATURE_PLACEHOLDER is 0x00 (spec §8.3)', () => {
    expect(FEE_PAYER_SIGNATURE_PLACEHOLDER).toBe('0x00')
  })

  it('VALID_FEE_TOKEN_PLACEHOLDERS include required values (spec §8.3)', () => {
    expect(VALID_FEE_TOKEN_PLACEHOLDERS).toContain(undefined)
    expect(VALID_FEE_TOKEN_PLACEHOLDERS).toContain('0x80')
    expect(VALID_FEE_TOKEN_PLACEHOLDERS).toContain('0x0000000000000000000000000000000000000000')
  })

  it('DEFAULT_FEE_VALIDATION_CONFIG has correct limits (spec §9.1.6)', () => {
    expect(DEFAULT_FEE_VALIDATION_CONFIG.maxFeePercentage).toBe(0.01) // 1%
    expect(DEFAULT_FEE_VALIDATION_CONFIG.maxAbsoluteFee).toBe(1_000_000n) // $1.00
    expect(DEFAULT_FEE_VALIDATION_CONFIG.maxSlippage).toBe(0.005) // 0.5%
  })

  it('MODERATO_FEE_TOKENS contains alphaUSD', () => {
    expect(MODERATO_FEE_TOKENS.some(t => 
      t.address.toLowerCase() === '0x20c0000000000000000000000000000000000001'
    )).toBe(true)
  })
})
