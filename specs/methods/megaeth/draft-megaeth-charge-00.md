---
title: MegaETH Charge Intent for HTTP Payment Authentication
abbrev: MegaETH Charge
docname: draft-megaeth-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Brett DiNovi
    ins: B. DiNovi
    email: bread@megaeth.com
    organization: MegaETH Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  EIP-712:
    title: "Typed structured data hashing and signing"
    target: https://eips.ethereum.org/EIPS/eip-712
    author:
      - name: Remco Bloemen
    date: 2017-09
  PERMIT2:
    title: "Permit2"
    target: https://github.com/Uniswap/permit2
    author:
      - org: Uniswap Labs
  MEGAETH:
    title: "MegaETH Documentation"
    target: https://docs.megaeth.com
    author:
      - org: MegaETH Labs
---

--- abstract

This document defines the "charge" intent for the "megaeth"
payment method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and
servers exchange one-time ERC-20 token transfers on the
MegaETH blockchain using Permit2 authorization signatures.

--- middle

# Introduction

The `charge` intent represents a one-time payment of a
specified amount. The server submits the authorized
transfer on-chain any time before the challenge `expires`
auth-param timestamp.

MegaETH is an EVM-compatible blockchain with 10ms block
times and sub-second finality. These properties make it
well-suited for real-time machine-to-machine payments
where settlement latency is critical.

This specification uses Permit2 {{PERMIT2}} for asset
transfers. Permit2 works with any ERC-20 token via
Uniswap's universal approval contract. The client signs
an off-chain `PermitWitnessTransferFrom` message; the
server submits the transfer on-chain. Only an off-chain
signature is required from the client.

## Charge Flow

~~~
Client                Server             MegaETH
  |                      |                  |
  | (1) GET /resource    |                  |
  |--------------------->|                  |
  |                      |                  |
  | (2) 402 Payment Req  |                  |
  |     intent="charge"  |                  |
  |<---------------------|                  |
  |                      |                  |
  | (3) Sign EIP-712     |                  |
  |     authorization    |                  |
  |                      |                  |
  | (4) Authorization:   |                  |
  |     Payment <cred>   |                  |
  |--------------------->|                  |
  |                      | (5) Submit tx    |
  |                      |----------------->|
  |                      | (6) Receipt      |
  |                      |    (~10ms)       |
  |                      |<-----------------|
  | (7) 200 OK + Receipt |                  |
  |<---------------------|                  |
  |                      |                  |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

ERC-20
: The standard interface for fungible tokens on
  EVM-compatible blockchains.

Permit2
: Uniswap's universal token approval contract deployed
  at `0x000000000022D473030F116dDEE9F6B43aC78BA3`.
  Enables off-chain signed approvals for any ERC-20
  token.

EIP-712
: A standard for typed structured data hashing and
  signing {{EIP-712}}, used by Permit2 to create
  human-readable, replay-protected signatures.

Fee Payer
: The server or a designated account that pays
  transaction gas fees on behalf of the client. On
  MegaETH, gas costs are negligible (<$0.001 per tx).

# Request Schema

The `request` parameter in the `WWW-Authenticate`
challenge contains a base64url-encoded JSON object. The
JSON MUST be serialized using JSON Canonicalization
Scheme (JCS) {{RFC8785}} before base64url encoding, per
{{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Req | Description |
|-------|------|-----|-------------|
| `amount` | string | REQUIRED | Amount in base units |
| `currency` | string | REQUIRED | ERC-20 token address |
| `recipient` | string | REQUIRED | Recipient address |
| `description` | string | OPTIONAL | Human-readable desc |
| `externalId` | string | OPTIONAL | Merchant reference |

Challenge expiry is conveyed by the `expires` auth-param
in `WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Method Details

| Field | Type | Req | Description |
|-------|------|-----|-------------|
| `chainId` | number | OPTIONAL | Chain ID (default: 4326) |
| `testnet` | boolean | OPTIONAL | If true, use testnet (chain 6343) |
| `feePayer` | boolean | OPTIONAL | If true, server pays gas (default: false) |
| `permit2Address` | string | OPTIONAL | Permit2 contract (default: canonical) |
| `splits` | array | OPTIONAL | Additional payment splits (max 8) |

### Chain ID Resolution

If `testnet` is `true`, the chain ID is 6343 regardless
of the `chainId` field. Otherwise, the chain ID defaults
to 4326 (MegaETH mainnet).

| Network | Chain ID | RPC |
|---------|----------|-----|
| Mainnet | 4326 | `https://mainnet.megaeth.com/rpc` |
| Testnet | 6343 | `https://carrot.megaeth.com/rpc` |

### Asset Transfer via Permit2

The client signs a Permit2 `PermitWitnessTransferFrom`
message. This works with any ERC-20 token.

**Prerequisite:** The client MUST have an active ERC-20
approval from the payment token to the Permit2 contract.
This is a one-time operation per token.

**Example:**

~~~json
{
  "amount": "1000000000000000000",
  "currency": "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4326,
    "feePayer": false
  }
}
~~~

This requests a transfer of 1.0 USDm (10^18 base units,
18 decimals) with client-paid gas.

### Payment Splits

The `splits` field allows a single payment to be
distributed across multiple recipients. Each entry is
a JSON object with the following fields:

- `recipient` (REQUIRED): ERC-20 address of the split
  recipient.
- `amount` (REQUIRED): Amount in the same base units as
  the primary `amount`.
- `memo` (OPTIONAL): Human-readable label for this
  split (e.g., "platform fee", "referral"). MUST NOT
  exceed 256 characters.

When present, the client MUST include a transfer
authorization for each split in addition to the primary
transfer. All splits use the same token as the primary
payment (`currency`).

The top-level `amount` is the total the client pays.
The sum of all split amounts MUST NOT exceed `amount`.
The primary `recipient` receives `amount` minus the sum
of all split amounts; this remainder MUST be greater
than zero. Servers MUST reject challenges where splits
consume the entire amount. Servers MUST verify each
split transfer on-chain during credential verification.

At most 8 splits MAY be specified. This mechanism
enables platform fees, revenue sharing, referral
commissions, and fee payer cost recovery without
additional infrastructure.

**Example (Permit2 with splits):**

~~~json
{
  "amount": "1050000000000000000",
  "currency": "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "description": "Marketplace purchase",
  "methodDetails": {
    "chainId": 4326,
    "feePayer": false,
    "splits": [
      {
        "recipient": "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
        "amount": "50000000000000000",
        "memo": "platform fee"
      }
    ]
  }
}
~~~

This requests a total payment of 1.05 USDm. The platform
receives 0.05 USDm and the primary recipient receives
1.00 USDm.

# Credential Schema

The credential in the `Authorization` header contains a
base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Req | Description |
|-------|------|-----|-------------|
| `challenge` | object | REQUIRED | Echoed challenge |
| `payload` | object | REQUIRED | Payment proof |
| `source` | string | OPTIONAL | Payer DID |

The `source` field, if present, SHOULD use the `did:pkh`
method with the MegaETH chain ID and the payer's address
(e.g., `did:pkh:eip155:4326:0x...`).

## Permit2 Payload

The payload contains the signed Permit2 witness transfer:

| Field | Type | Req | Description |
|-------|------|-----|-------------|
| `type` | string | REQUIRED | `"permit2"` |
| `permit` | object | REQUIRED | Permit2 permit data |
| `witness` | object | REQUIRED | Transfer witness |
| `signature` | string | REQUIRED | EIP-712 signature |

The `permit` object:

| Field | Type | Description |
|-------|------|-------------|
| `permitted` | object | `{ token, amount }` |
| `nonce` | string | Permit2 nonce |
| `deadline` | string | Unix timestamp |

The `witness` object:

| Field | Type | Description |
|-------|------|-------------|
| `transferDetails` | object | `{ to, requestedAmount }` |

**Example:**

~~~json
{
  "challenge": {
    "id": "aB3cDeF4gHiJkLmN",
    "realm": "api.example.com",
    "method": "megaeth",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-20T12:05:00Z"
  },
  "payload": {
    "type": "permit2",
    "permit": {
      "permitted": {
        "token": "0xFAfDdbb3...82079E7",
        "amount": "1000000000000000000"
      },
      "nonce": "1",
      "deadline": "1742472300"
    },
    "witness": {
      "transferDetails": {
        "to": "0x742d35Cc...5f8fE00",
        "requestedAmount": "1000000000000000000"
      }
    },
    "signature": "0x1b2c3d4e5f..."
  },
  "source": "did:pkh:eip155:4326:0x1234...5678"
}
~~~

# Fee Payment

MegaETH transaction fees are negligible (<$0.001 per
transaction). Servers SHOULD sponsor gas by default.

## Server-Paid Fees

When `feePayer` is `true`:

1. The client signs only the Permit2 authorization.
   No transaction is signed by the client.
2. The server constructs and signs the on-chain
   transaction using its own hot wallet.
3. The server pays gas from its own balance.

This is the expected flow. The client never interacts
with the chain directly.

## Client-Paid Fees (Default)

When `feePayer` is `false` or omitted, the client MAY submit the
transaction directly to the MegaETH network and provide
a hash credential (see {{hash-payload}}).

## Hash Payload {#hash-payload}

When the client has already broadcast the transaction,
the payload contains only the transaction hash:

| Field | Type | Req | Description |
|-------|------|-----|-------------|
| `type` | string | REQUIRED | `"hash"` |
| `hash` | string | REQUIRED | Tx hash (`0x`-prefixed) |

**Limitations:**

- Cannot be used with `feePayer: true`
- Server cannot modify the transaction
- Weaker challenge binding than Permit2 payloads
  (see {{hash-binding}})

# Settlement Procedure

## Permit2 Settlement

1. Server receives credential with `type: "permit2"`
2. Server verifies the signature recovers to a valid
   signer with sufficient token balance and Permit2
   allowance
3. Server calls `Permit2.permitWitnessTransferFrom()`
   on-chain via its hot wallet
4. If `splits` are present, server executes additional
   `permitWitnessTransferFrom()` calls for each split
5. Server receives transaction receipt(s)

## Hash Settlement

1. Server receives credential with `type: "hash"`
2. Server fetches the transaction receipt from the chain
3. Server verifies the emitted `Transfer` event logs
   match the challenge parameters (token, from, to,
   amount) including any `splits`

## Transaction Submission

MegaETH offers `realtime_sendRawTransaction`, a custom
RPC method that returns the full transaction receipt
inline with the response. Unlike standard
`eth_sendRawTransaction` which returns only a transaction
hash (requiring subsequent polling for the receipt), this
eliminates one round-trip and provides confirmation in a
single call.

Servers SHOULD use `realtime_sendRawTransaction` when
available. Servers MAY fall back to standard
`eth_sendRawTransaction` with receipt polling.

## Settlement Latency

MegaETH's 10ms block times and sub-second finality
enable settlement in under 50ms end-to-end (signature
verification + transaction submission + receipt).

## Transaction Verification

Before broadcasting, servers MUST verify:

1. The signature is valid and recovers to the `from`
   address
2. The `from` address has sufficient token balance
3. The amount matches the challenge `amount`
4. The recipient matches the challenge `recipient`
5. The token address matches the challenge `currency`
6. The `from` address has sufficient Permit2 allowance
7. Validity timestamps are current

## Receipt Generation

Upon successful settlement, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}.
Servers MUST NOT include a `Payment-Receipt` header on
error responses; failures are communicated via HTTP
status codes and Problem Details.

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"megaeth"` |
| `challengeId` | string | The challenge `id` from `WWW-Authenticate` |
| `reference` | string | Transaction hash |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL. Echoed from request |

# Error Responses

When rejecting a credential, the server MUST return HTTP
402 (Payment Required) with a fresh
`WWW-Authenticate: Payment` challenge per
{{I-D.httpauth-payment}}. The server SHOULD include a
response body conforming to RFC 9457 {{RFC9457}} Problem
Details, with `Content-Type: application/problem+json`.

Servers MUST use the standard problem types defined in
{{I-D.httpauth-payment}}: `malformed-credential`,
`invalid-challenge`, and `verification-failed`. The
`detail` field SHOULD contain a human-readable
description of the specific failure.

All error responses MUST include a fresh challenge in
`WWW-Authenticate`.

**Example:**

~~~json
{
  "type": "https://paymentauth.org/problems/verification-failed",
  "title": "Transfer Mismatch",
  "status": 402,
  "detail": "Transfer amount does not match challenge"
}
~~~

# Security Considerations

## Signature Replay Protection

### Permit2

Permit2 nonces are consumed on-chain upon use. Each
nonce can only be used once per (owner, token, spender)
tuple. The `deadline` field provides temporal bounds.

### Cross-Chain Replay

Permit2 signatures include the chain ID in the EIP-712
domain separator. Signatures for MegaETH mainnet (4326)
cannot be replayed on testnet (6343) or other EVM chains.

## Hash Payload Challenge Binding {#hash-binding}

The `type="hash"` credential has weaker challenge-specific
binding than Permit2 payloads. A hash
credential proves that a payment matching the challenge
terms was made on-chain, but the on-chain transaction
itself does not carry a challenge-specific marker.

If two valid challenges exist with identical payment
terms (same amount, recipient, and token), a single
on-chain transaction could satisfy either challenge.
The first credential presentation wins, as servers MUST
track consumed transaction hashes and reject duplicates.

Permit2 payloads do not have this weakness because each
signature is bound to a unique nonce that is consumed
on-chain.

Servers requiring strong challenge-specific binding
SHOULD prefer Permit2 payloads. Servers
accepting hash payloads SHOULD avoid issuing concurrent
challenges with identical payment terms.

## Amount Verification

Clients MUST verify before signing:

1. The `amount` is reasonable for the resource
2. The `recipient` is the expected party
3. The `currency` is the expected token
4. The `chainId` matches the expected network
5. If `splits` are present, they contain expected
   recipients and amounts — malicious servers could
   add splits to redirect funds

Clients MUST NOT rely on the `description` field for
payment verification.

## Fee Payer Risks

Servers acting as fee payers accept the risk of paying
gas for transactions that may fail on-chain.

When `feePayer` is `true`, servers MUST simulate
transactions via `eth_call` before submission to catch
failures without spending gas. When `feePayer` is
`false`, servers SHOULD simulate before broadcasting.

Servers SHOULD also:

- Implement rate limiting per client address
- Monitor hot wallet balance
- Require client authentication before accepting
  fee-sponsored transactions

On MegaETH, gas costs are negligible, limiting the
financial impact of this risk.

## Permit2 Approval Scope

Clients granting Permit2 approval SHOULD use bounded
amounts rather than unlimited approval where possible.
The approval is to the Permit2 contract, not to the
server, limiting exposure.

## Server Hot Wallet Security

The server's hot wallet holds ETH for gas and submits
transactions on behalf of clients. Servers MUST:

- Use a dedicated hot wallet for payment settlement
- Monitor for anomalous transaction patterns
- Implement key rotation procedures
- Keep minimal balance sufficient for operations

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in
the "HTTP Payment Methods" registry established by
{{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `megaeth` | MegaETH ERC-20 token transfer | This document |

Contact: MegaETH Labs (<bread@megaeth.com>)

## Payment Intent Registration

This document registers the following payment intent in
the "HTTP Payment Intents" registry established by
{{I-D.httpauth-payment}}:

| Intent | Methods | Description | Reference |
|--------|---------|-------------|-----------|
| `charge` | `megaeth` | One-time ERC-20 transfer | This document |

--- back

# ABNF Collected

~~~ abnf
megaeth-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "megaeth" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

megaeth-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Known Tokens

The following tokens are commonly used with the MegaETH
payment method:

| Token | Address | Decimals |
|-------|---------|----------|
| USDm | `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7` | 18 |

# Key Contracts

| Contract | Address | Chain |
|----------|---------|-------|
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 4326, 6343 |

# Example

## Full Charge Flow (Permit2)

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="mE9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="megaeth",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMDAwIiwiY3VycmVuY3kiOiIweEZBZkRkYmIzRkM3Njg4NDk0OTcxYTc5Y2M2NURDYTNFRjgyMDc5RTciLCJyZWNpcGllbnQiOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQzMjYsImFzc2V0VHJhbnNmZXJNZXRob2QiOiJwZXJtaXQyIiwiZmVlUGF5ZXIiOnRydWV9fQ",
  expires="2026-03-20T12:05:00Z"
~~~

Decoded `request`:

~~~json
{
  "amount": "1000000000000000000",
  "currency": "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4326,
    "feePayer": false
  }
}
~~~

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJtRTl4UHFXdlQybkpySHNZNGFEZkViIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJtZWdhZXRoIiwiaW50ZW50IjoiY2hhcmdlIiwicmVxdWVzdCI6ImV5Si4uLiIsImV4cGlyZXMiOiIyMDI2LTAzLTIwVDEyOjA1OjAwWiJ9LCJwYXlsb2FkIjp7InR5cGUiOiJwZXJtaXQyIiwicGVybWl0Ijp7InBlcm1pdHRlZCI6eyJ0b2tlbiI6IjB4RkFmRGRiYjNGQzc2ODg0OTQ5NzFhNzljYzY1RENhM0VGODIwNzlFNyIsImFtb3VudCI6IjEwMDAwMDAwMDAwMDAwMDAwMDAifSwibm9uY2UiOiIxIiwiZGVhZGxpbmUiOiIxNzQyNDcyMzAwIn0sIndpdG5lc3MiOnsidHJhbnNmZXJEZXRhaWxzIjp7InRvIjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjhmRTAwIiwicmVxdWVzdGVkQW1vdW50IjoiMTAwMDAwMDAwMDAwMDAwMDAwMCJ9fSwic2lnbmF0dXJlIjoiMHgxYjJjM2Q0ZTVmLi4uIn19
~~~

**Success:**

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoibWVnYWV0aCIsInRpbWVzdGFtcCI6IjIwMjYtMDMtMjBUMTI6MDA6MDFaIiwicmVmZXJlbmNlIjoiMHhhYmNkZWYxMjM0NTY3ODkwIn0
Content-Type: application/json

{"data": "..."}
~~~

Decoded receipt:

~~~json
{
  "method": "megaeth",
  "challengeId": "mE9xPqWvT2nJrHsY4aDfEb",
  "reference": "0xabcdef1234567890...",
  "status": "success",
  "timestamp": "2026-03-20T12:00:01Z"
}
~~~

# Acknowledgements

The authors thank the Tempo Labs team for the MPP
specification framework that this method builds upon,
and the MegaETH engineering team for chain-level
optimizations that enable sub-50ms settlement.
