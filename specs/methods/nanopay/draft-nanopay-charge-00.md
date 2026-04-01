---
title: NanoPay Charge Intent for HTTP Payment Authentication
abbrev: NanoPay Charge
docname: draft-nanopay-charge-00
version: 00
category: info
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: NanoPay Team
    ins: NanoPay
    email: contact@cyberpay.org
    org: CyberPay

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/

informative:
  TON-DOCS:
    title: "TON Documentation"
    target: https://docs.ton.org
  PHALA-TEE:
    title: "Phala Cloud TEE Documentation"
    target: https://docs.phala.network
---

--- abstract

This document defines the "charge" intent for the "nanopay" payment method
within the Payment HTTP Authentication Scheme. NanoPay enables gas-free
nanopayments on the TON blockchain by combining offchain Ed25519 signature
authorization with TEE (Trusted Execution Environment) verification and
batch settlement. Buyers sign payment authorizations offchain (zero gas),
a TEE aggregator verifies and batches them, then periodically settles on-chain.

--- middle

# Introduction

NanoPay is a nanopayment protocol on TON that reduces per-payment gas costs
by 99% through batch settlement. Instead of executing each payment on-chain,
buyers sign Ed25519 authorizations offchain, a TEE aggregator verifies and
accumulates them, and periodically submits a single BatchSettle transaction.

This makes NanoPay suitable for high-frequency micropayment use cases:
AI agent API billing, per-token LLM inference, machine-to-machine data
purchases, where individual amounts may be as small as $0.000001.

## Payment Flow

~~~
   Client                     TEE Aggregator         TON Blockchain
      |                          |                        |
      |  (1) GET /resource       |                        |
      |----------------------->  |                        |
      |  (2) 402 Payment Required|                        |
      |<-----------------------  |                        |
      |  (3) Sign Ed25519 auth   |                        |
      |      (offchain, 0 gas)   |                        |
      |  (4) Authorization:      |                        |
      |      Payment <credential>|                        |
      |----------------------->  |                        |
      |                          |  (5) Verify sig,       |
      |                          |      deduct balance,   |
      |                          |      issue receipt     |
      |  (6) 200 OK + Receipt    |                        |
      |<-----------------------  |                        |
      |                          |  (7) BatchSettle()     |
      |                          |      (async, periodic) |
      |                          |--------------------->  |
~~~

Step (5) is verified by a TEE aggregator, enabling sub-second latency
and zero per-payment gas. On-chain settlement (step 7) is asynchronous.

## Trust Model

The TEE provides hardware-isolated execution (Intel TDX), remote
attestation, deterministic key derivation, and on-chain binding
(NanoVault contract only accepts TEE-signed settlements).

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

NanoVault Contract: TON smart contract holding deposited USDT,
executing batch settlements. Only accepts TEE-signed transactions.

TEE Aggregator: Service in a Trusted Execution Environment that
verifies payment signatures, manages balances, submits batches.

Confirmation ID: Unique identifier for a verified payment from the TEE.

# Intent Identifier

The intent identifier is "charge". It MUST be lowercase.

# Request Schema

## Shared Fields

amount: REQUIRED. Payment amount in USDT base units (6 decimals).
"1000" = $0.001. "1000000" = $1.00.

currency: REQUIRED. MUST be "USDT".

recipient: REQUIRED. Merchant's TON address.

description: OPTIONAL. Human-readable description. Max 256 chars.

## Method Details (under `methodDetails`)

network: OPTIONAL. "mainnet" or "testnet". Default: "testnet".

teeEndpoint: OPTIONAL. TEE aggregator URL.

attestationUrl: OPTIONAL. TEE attestation verification URL.

### Example

~~~json
{
  "amount": "1000",
  "currency": "USDT",
  "recipient": "EQxxx...",
  "description": "Premium API call",
  "methodDetails": {
    "network": "testnet",
    "teeEndpoint": "https://tee.nanopay.example.com",
    "attestationUrl": "https://tee.nanopay.example.com/attestation"
  }
}
~~~

# Credential Schema

## Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | REQUIRED | Buyer's TON address |
| to | string | REQUIRED | Merchant's TON address |
| amount | string | REQUIRED | Amount in USDT base units |
| validBefore | number | REQUIRED | Unix timestamp expiry |
| nonce | string | REQUIRED | 32-byte random hex |
| signature | string | REQUIRED | Ed25519 signature (hex) |

## Canonical Message Format

~~~
  prefix:      "NanoVault:v1:" (13 bytes ASCII)
  from:        32 bytes (TON address hash)
  to:          32 bytes (TON address hash)
  amount:      16 bytes (uint128 big-endian)
  validBefore: 8 bytes (uint64 big-endian)
  nonce:       32 bytes
  Total:       133 bytes, SHA-256 hashed before Ed25519 signing
~~~

### Example Credential

~~~json
{
  "challenge": {
    "id": "abc123",
    "realm": "api.example.com",
    "method": "nanopay",
    "intent": "charge",
    "request": "eyJ..."
  },
  "payload": {
    "from": "0:abc123...",
    "to": "EQxxx...",
    "amount": "1000",
    "validBefore": 1711234567,
    "nonce": "a1b2c3d4...",
    "signature": "ed25519-hex..."
  }
}
~~~

# Verification Procedure

1. Decode base64url credential, parse JSON.
2. Match challenge ID to stored challenge.
3. Forward payload to TEE `/verify` endpoint.
4. TEE verifies: Ed25519 signature, validBefore, nonce uniqueness,
   sufficient balance, spending policy compliance.
5. TEE deducts balance, returns signed receipt with confirmation ID.
6. Server returns resource with Payment-Receipt header.

# Receipt Schema

| Field | Type | Description |
|-------|------|-------------|
| status | string | "success" |
| reference | string | TEE confirmation ID |
| method | string | "nanopay" |

# Security Considerations

## TEE Trust
Users SHOULD verify TEE attestation before depositing funds.

## Replay Protection
Each authorization includes a unique nonce. TEE rejects reused nonces.

## Balance Protection
Funds held in NanoVault contract on TON. Only TEE-signed BatchSettle
accepted. Withdrawals require cooldown period.

## Spending Limits
Per-transaction limits and daily caps enforced by TEE and on-chain.

--- back

# Acknowledgments

Built on the Payment HTTP Authentication Scheme and charge intent
specifications by Jake Moxey, Brendan Ryan, and Tom Meagher.
