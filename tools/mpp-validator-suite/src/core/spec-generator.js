/**
 * MPP Specification Payload & Header Generator
 */

import crypto from 'crypto';

export class MppSpecGenerator {
  generateChallengeHeader(realm = '/v1/ai/stream', amount = '0.005', currency = 'USD') {
    const invoiceId = `inv_${crypto.randomBytes(10).toString('hex')}`;
    const nonce = crypto.randomBytes(12).toString('hex');
    return `MPP realm="${realm}", invoice="${invoiceId}", amount="${amount}", currency="${currency}", nonce="${nonce}"`;
  }

  generateProofHeader(invoiceId = 'inv_demo12345678', payer = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e') {
    const sig = '0x' + crypto.randomBytes(65).toString('hex');
    const tx = '0x' + crypto.randomBytes(32).toString('hex');
    return `MPP-Proof invoice="${invoiceId}", payer="${payer}", sig="${sig}", tx="${tx}"`;
  }

  generateReceiptHeader(invoiceId = 'inv_demo12345678') {
    const receiptId = `rcpt_${crypto.randomBytes(10).toString('hex')}`;
    return `MPP-Receipt receipt="${receiptId}", invoice="${invoiceId}", status="settled", network="tempo-424242"`;
  }
}

export const defaultSpecGenerator = new MppSpecGenerator();
