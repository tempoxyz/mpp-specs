---
name: http-payment-auth-extending
description: Creates payment method extensions for the HTTP Payment Authentication Scheme. Use when adding support for new blockchains (Solana, Lightning, Base, Polygon) or payment networks to the protocol.
---

# HTTP Payment Auth Extension Author

Create payment method specifications for new blockchains and payment networks.

## What is a Payment Method Extension?

A payment method extension defines how a specific blockchain or payment network integrates with the HTTP Payment Authentication Scheme. It specifies:

- How servers format payment requests
- How clients create payment proofs
- How servers verify and settle payments

## Required Sections

Every payment method spec MUST define:

1. **Method Identifier** - Lowercase ASCII string (e.g., `solana`, `lightning`)
2. **Payment Intents** - Supported intents (`charge`, `authorize`, `subscription`)
3. **Request Schema** - JSON for WWW-Authenticate `request` parameter
4. **Credential Schema** - JSON for Authorization `payload` field
5. **Verification Procedure** - How to validate proofs
6. **Settlement Procedure** - How payment is finalized
7. **Security Considerations** - Method-specific threats

## Template

```markdown
---
title: {Network} Payment Method for HTTP Payment Authentication
docName: draft-{network}-payment-method-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Your Name
    email: your@email.com
    organization: Your Org
---

## Abstract

This document defines the "{method}" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment].

## 1. Introduction

{Describe the payment network and its key features relevant to HTTP payments}

## 2. Method Identifier

```
{method-name}
```

The identifier is case-sensitive and MUST be lowercase.

## 3. Payment Intents

### 3.1. Intent: "charge"

{Define one-time payment semantics for this network}

### 3.2. Intent: "authorize" (if supported)

{Define authorization semantics}

## 4. Request Schema

For `intent="charge"`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | Yes | Amount in base units |
| `asset` | string | Yes | Token identifier |
| `destination` | string | Yes | Recipient address |
| `expires` | string | Yes | ISO 8601 expiry |
| ... | ... | ... | {network-specific fields} |

## 5. Credential Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Proof type |
| ... | ... | ... | {network-specific fields} |

## 6. Verification Procedure

1. {Step 1}
2. {Step 2}
3. ...

## 7. Settlement Procedure

1. {Step 1}
2. {Step 2}
3. ...

## 8. Security Considerations

### 8.1. {Consideration 1}
### 8.2. {Consideration 2}

## Appendix: Examples

### Example: Charge Flow

{Show complete request/response with real values}
```

## Workflow for New Payment Methods

### Step 1: Research the Blockchain

Look up official documentation:
- Transaction format and fields
- Signing algorithms (Ed25519, secp256k1, etc.)
- RPC methods for submission and confirmation
- Token standards (SPL, ERC20, etc.)
- Finality guarantees

### Step 2: Define Request Schema

What does a client need to construct a valid payment?

```json
{
  "amount": "string (base units)",
  "asset": "string (token identifier)",
  "destination": "string (recipient)",
  "expires": "string (ISO 8601)",
  // Chain-specific fields...
}
```

### Step 3: Define Credential Schema

What proof does the client provide?

```json
{
  "type": "transaction | signature | preimage",
  // Chain-specific proof data...
}
```

### Step 4: Write Verification Procedure

How does the server validate the proof?
- Signature verification
- Amount/recipient validation
- Expiry checks
- Replay protection

### Step 5: Write Settlement Procedure

How is payment finalized?
- Transaction broadcast
- Confirmation requirements
- Receipt generation

### Step 6: Document Security Considerations

- Replay attacks
- Front-running
- Finality delays
- Key management

## Example: Solana

```markdown
## Method Identifier
`solana`

## Request Schema (charge)
| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Lamports or token base units |
| `asset` | string | "native" or SPL mint address |
| `destination` | string | Recipient pubkey (base58) |
| `expires` | string | ISO 8601 expiry |

## Credential Schema
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "transaction" |
| `transaction` | string | Base64-encoded signed transaction |

## Verification
1. Deserialize transaction from base64
2. Verify signature(s)
3. Decode instructions, verify transfer to destination
4. Verify amount matches request
5. Check blockhash recency (< 150 blocks)

## Settlement
1. Submit via `sendTransaction` RPC
2. Poll `getSignatureStatuses` for confirmation
3. Return signature as receipt reference
```

## Example: Lightning

```markdown
## Method Identifier
`lightning`

## Request Schema (charge)
| Field | Type | Description |
|-------|------|-------------|
| `invoice` | string | BOLT11 payment request |

## Credential Schema
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "preimage" |
| `preimage` | string | 32-byte hex preimage |

## Verification
1. Decode BOLT11 invoice
2. Extract payment_hash
3. SHA256 hash the preimage
4. Compare: hash MUST equal payment_hash
5. Verify invoice not expired

## Settlement
Preimage revelation IS settlement (atomic swap)
```

## Example: EVM L2 (Base, Polygon, etc.)

```markdown
## Method Identifier
`evm:base` or `evm:polygon`

## Request Schema (charge)
| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Token base units |
| `asset` | string | ERC20 contract address |
| `destination` | string | Recipient address |
| `chainId` | number | Chain ID (8453 for Base) |
| `expires` | string | ISO 8601 expiry |

## Credential Schema
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "transaction" |
| `signature` | string | RLP-encoded signed transaction |

## Verification
1. RLP decode transaction
2. Recover signer from signature
3. Decode calldata as ERC20 transfer
4. Verify recipient and amount match
5. Verify chainId matches

## Settlement
1. Submit via eth_sendRawTransaction
2. Wait for receipt
3. Return txHash as reference
```

## External Documentation

When implementing, fetch docs for the target chain:

- **Solana**: https://solana.com/docs
- **Lightning**: https://github.com/lightning/bolts
- **Base**: https://docs.base.org
- **Polygon**: https://docs.polygon.technology

## Reference Implementations

See existing specs in this repo:
- `draft-tempo-payment-method.md` - Full Tempo implementation
- `draft-stripe-payment-method.md` - Traditional payments example
