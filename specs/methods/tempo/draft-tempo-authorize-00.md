---
title: Tempo authorize Intent for HTTP Payment Authentication
abbrev: Tempo Authorize
docname: draft-tempo-authorize-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: thomas@tempo.xyz
    org: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-authorize:
    title: "Authorize Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-authorize/
    author:
      - name: Jake Moxey
    date: 2026-03
  EIP-2718:
    title: "Typed Transaction Envelope"
    target: https://eips.ethereum.org/EIPS/eip-2718
    author:
      - name: Micah Zoltu
    date: 2020-10
  TEMPO-TX-SPEC:
    title: "Tempo Transaction Specification"
    target: https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction
    author:
      - org: Tempo Labs

informative:
  DID-PKH:
    title: "The did:pkh Method"
    target: https://github.com/w3c-ccg/did-pkh/blob/main/did-pkh-method-draft.md
    author:
      - org: W3C Credentials Community Group
  SOLIDITY-ABI:
    title: "Contract ABI Specification"
    target: https://docs.soliditylang.org/en/latest/abi-spec.html
    author:
      - org: Solidity
---

--- abstract

This document defines the "authorize" intent for the "tempo" payment
method in the Payment HTTP Authentication Scheme. It specifies an
escrow-backed authorization flow where a client signs a Tempo transaction
that funds an escrow, and an operator later captures value up to the
authorized amount.

--- middle

# Introduction

The `authorize` intent for Tempo creates an on-chain escrow authorization.
The payer signs a Tempo transaction that calls an escrow contract's
`authorize` function and transfers the maximum authorized amount into
escrow. The server broadcasts that transaction, optionally sponsoring
fees. After the authorization is active, an operator can capture value to
the recipient, using cumulative capture semantics. The operator can also
void remaining uncaptured value.

This flow provides a true authorization-and-capture model: funds are
reserved at authorization time, captured value cannot exceed the escrowed
amount, and unused value can be returned to the payer.

## Flow

~~~
   Client                      Server / Operator              Tempo Network
      |                              |                              |
      |  (1) GET /api/resource       |                              |
      |----------------------------->|                              |
      |                              |                              |
      |  (2) 402 Payment Required    |                              |
      |      intent="authorize"      |                              |
      |<-----------------------------|                              |
      |                              |                              |
      |  (3) Sign tx calling         |                              |
      |      escrow.authorize(info)  |                              |
      |                              |                              |
      |  (4) Authorization: Payment  |                              |
      |      signed transaction      |                              |
      |----------------------------->|                              |
      |                              |  (5) Add fee-payer signature  |
      |                              |      if requested             |
      |                              |  (6) Broadcast transaction    |
      |                              |----------------------------->|
      |                              |                              |
      |  (7) 200 OK                  |  (escrow funded)              |
      |      authorization active    |<-----------------------------|
      |<-----------------------------|                              |
      |                              |                              |
      |         ... later ...        |                              |
      |                              |                              |
      |                              |  (8) capture(cumulative)      |
      |                              |----------------------------->|
      |                              |                              |
      |  (9) 200 OK + receipt        |  (delta paid to recipient)    |
      |<-----------------------------|<-----------------------------|
      |                              |                              |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places.

Tempo Transaction
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types, 2D nonces, and validity windows.

Escrow Contract
: A contract that holds authorized funds and enforces capture, void, and
  reclaim semantics.

Payer
: The account that funds the escrow authorization.

Recipient
: The address that receives captured funds.

Operator
: The address authorized to register the authorization transaction,
  capture cumulative amounts, and void remaining uncaptured funds.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and base64url-encoded
without padding per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Maximum authorization amount in base units (stringified non-negative integer, no leading zeros) |
| `currency` | string | REQUIRED | TIP-20 token address |
| `authorizationExpires` | string | REQUIRED | Last time the authorization can be captured, in {{RFC3339}} format |
| `recipient` | string | REQUIRED | Destination address that receives captured funds |
| `description` | string | OPTIONAL | Human-readable authorization description |
| `externalId` | string | OPTIONAL | Merchant reference, order ID, or cart ID |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.escrowContract` | string | REQUIRED | Tempo escrow contract address |
| `methodDetails.operator` | string | REQUIRED | Address authorized to capture and void this authorization |
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID. If omitted, the default value is 42431 (Tempo mainnet). |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees for the client-signed authorization transaction (default: `false`) |

The top-level `recipient` and `methodDetails.operator` are distinct
roles. The recipient receives captured funds. The operator drives the
authorization lifecycle. They MAY be the same address, but clients SHOULD
display both values when they differ.

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the challenge expiry value.
The `authorizationExpires` field instead defines when capture authority
expires.

Servers issuing a Tempo authorize challenge MUST include the `expires`
auth-param.

The `authorizationExpires` value MUST be strictly later than the
challenge `expires` timestamp. Servers MUST reject credentials where
`authorizationExpires` is at or before the challenge `expires`.

The `amount` value MUST fit the `uint120 maxAmount` field in
`AuthorizationInfo`. Servers MUST reject requests with an `amount` greater
than 2^120 - 1. The Unix-seconds representation of
`authorizationExpires` MUST fit the `uint48 authorizationExpiry` field.

**Example:**

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
    "operator": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
    "feePayer": true
  }
}
~~~

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method
{{DID-PKH}} with the chain ID applicable to the challenge and the payer's
Ethereum address.
Servers MUST verify payer identity from the signed transaction and MUST
NOT trust `source` without verification.

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, `transaction` contains the complete
client-signed Tempo Transaction (type `0x76`) serialized as RLP and
hex-encoded with `0x` prefix. The transaction MUST call `authorize(info)`
on the escrow contract identified by `methodDetails.escrowContract`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction` | string | REQUIRED | Hex-encoded RLP-serialized signed Tempo Transaction |
| `type` | string | REQUIRED | `"transaction"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2026-05-13T12:05:00Z"
  },
  "payload": {
    "transaction": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

The signed transaction MUST:

1. Call `authorize(info)` on `methodDetails.escrowContract`.
2. Set `info.payer` to the transaction signer.
3. Set `info.recipient` to the challenge `recipient`.
4. Set `info.operator` to `methodDetails.operator`.
5. Set `info.token` to the challenge `currency`.
6. Set `info.maxAmount` to the challenge `amount`.
7. Set `info.authorizationExpiry` to the Unix-seconds representation of
   `authorizationExpires`.
8. Include a payer-generated salt or nonce that makes the authorization
   identifier unique.
9. Use a transaction validity window no later than the challenge
   `expires` auth-param.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty, allowing the
server to add the fee-payer signature before broadcasting. If
`feePayer` is `false` or omitted, the client MUST include valid fee
payment fields so the transaction is executable without server
sponsorship.

# Escrow Contract Semantics

Tempo authorize uses an escrow contract with the following abstract state
and operations. Exact Solidity types MAY vary, but implementations MUST
preserve these semantics.

## Authorization Info

~~~solidity
struct AuthorizationInfo {
    address payer;
    address recipient;
    address operator;
    address token;
    uint120 maxAmount;
    uint48 authorizationExpiry;
    bytes32 salt;
}
~~~

## Authorization State

~~~solidity
struct AuthorizationState {
    bool initialized;
    bool closed;
    uint120 authorizedAmount;
    uint120 capturedAmount;
}
~~~

The authorization identifier MUST be bound to the chain, escrow contract,
and economic terms. A compliant implementation SHOULD compute it using
Solidity ABI encoding and Keccak-256 {{SOLIDITY-ABI}} with a
domain-separated hash equivalent to:

~~~
authorizationId = keccak256(abi.encode(
    block.chainid,
    address(this),
    payer,
    recipient,
    operator,
    token,
    maxAmount,
    authorizationExpiry,
    salt
))
~~~

## Interface Sketch

~~~solidity
interface ITempoAuthCaptureEscrow {
    function authorize(AuthorizationInfo calldata info)
        external
        returns (bytes32 authorizationId);

    function capture(AuthorizationInfo calldata info, uint120 cumulativeCaptured)
        external
        returns (uint120 delta);

    function voidAuthorization(AuthorizationInfo calldata info) external;

    function reclaim(AuthorizationInfo calldata info) external;

    function getAuthorizationId(AuthorizationInfo calldata info)
        external
        view
        returns (bytes32 authorizationId);
}
~~~

### authorize

`authorize(info)` opens a new authorization and transfers
`info.maxAmount` from `info.payer` into escrow. It MUST reject duplicate
authorization identifiers. It MUST reject authorizations at or after
`info.authorizationExpiry`.

The client-signed Tempo transaction is the payer authorization for this
transfer. The account whose authorization causes the `authorize(info)`
call to execute MUST equal `info.payer`. If the transaction has a
separate fee payer, the fee payer MUST NOT be treated as the payer for
authorization purposes. Implementations MUST reject `authorize(info)` if
the effective transaction authorizer cannot be determined or does not
match `info.payer`.

### capture

`capture(info, cumulativeCaptured)` transfers the delta between
`cumulativeCaptured` and the previously recorded `capturedAmount` to
`info.recipient`.

Captures use cumulative semantics:

~~~
delta = cumulativeCaptured - capturedAmount
~~~

If `cumulativeCaptured` is less than or equal to `capturedAmount`, the
call MUST be treated as idempotent and MUST NOT transfer additional
funds. If `cumulativeCaptured` exceeds `info.maxAmount`, the call MUST
fail. Only `info.operator` can call `capture`. Captures MUST fail at or
after `info.authorizationExpiry`.

This design avoids per-capture storage. The single `capturedAmount`
watermark prevents replay from extracting additional funds.

The escrow contract MUST apply the following terminal-state behavior:

Active and before expiry:
: If `cumulativeCaptured` is greater than `capturedAmount` and no greater
  than `maxAmount`, advance the watermark and transfer the delta.

Active retry:
: If `cumulativeCaptured` is less than or equal to `capturedAmount`,
  return success without transferring funds.

Fully captured:
: Exact or lower cumulative retries return success without transferring
  funds. Higher values fail.

Voided:
: Capture fails.

Reclaimed:
: Capture fails.

Expired:
: Capture fails unless it is an exact or lower cumulative retry that
  transfers no funds.

### voidAuthorization

`voidAuthorization(info)` closes the authorization and returns all
uncaptured funds to `info.payer`:

~~~
remaining = authorizedAmount - capturedAmount
~~~

Only `info.operator` can void an authorization. Void MUST NOT alter or
refund captured funds.

### reclaim

`reclaim(info)` allows `info.payer` to recover remaining uncaptured funds
after `info.authorizationExpiry`. It closes the authorization and returns
the same `remaining` value as `voidAuthorization`.

Only `info.payer` can reclaim an authorization.

# Verification Procedure

On receipt of a `type="transaction"` credential, servers MUST:

1. Verify the challenge ID and challenge expiry.
2. Decode the transaction and verify it is a Tempo Transaction.
3. Verify the transaction calls `authorize(info)` on
   `methodDetails.escrowContract`.
4. Recover or otherwise determine the payer from the transaction.
5. Verify the `AuthorizationInfo` values match the challenge request:
   - `payer` matches the recovered transaction signer
   - `recipient` matches the challenge `recipient`
   - `operator` matches `methodDetails.operator`
   - `token` matches `currency`
   - `maxAmount` matches `amount`
   - `authorizationExpiry` matches `authorizationExpires`
6. Verify the transaction validity window expires no later than the
   challenge `expires` auth-param.
7. If `feePayer: true`, add the server's fee-payer signature using the
   Tempo fee-payer signature domain.
8. Broadcast the transaction.
9. Verify onchain that the authorization exists, is not closed, and has
   `authorizedAmount - capturedAmount` equal to the requested `amount`.

Servers MUST NOT return success until the escrow authorization is active
onchain.

# Capture, Void, and Refund

## Capture

The server or operator MAY capture value after authorization succeeds.
Capture operations are not carried in the client credential. They are
method-side lifecycle operations driven by the operator.

The operator SHOULD use cumulative capture values. For example:

| Call | Prior `capturedAmount` | Delta paid | New `capturedAmount` |
|------|------------------------|------------|----------------------|
| `capture(info, 100)` | 0 | 100 | 100 |
| `capture(info, 100)` retry | 100 | 0 | 100 |
| `capture(info, 250)` | 100 | 150 | 250 |

## Void

The operator SHOULD void authorizations when no further captures will be
made. Void releases all uncaptured value to the payer and closes the
authorization.

## Refund Requests

Refunds are out of band for this version of the Tempo authorize method.
Clients MAY request refunds through merchant-defined channels, and
merchants MAY honor them by issuing a separate payment or other
method-specific process. The escrow contract defined here does not require
an onchain refund operation for captured funds.

# Receipt Generation

Registration responses for `intent="authorize"` MUST NOT include a
`Payment-Receipt` header. Servers MUST return a `Payment-Receipt` header
only on successful responses that actually consume or capture authorized
value, per {{I-D.httpauth-payment}}.

The receipt payload for Tempo authorize:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `intent` | string | `"authorize"` |
| `reference` | string | Transaction hash of the capture transaction |
| `authorizationId` | string | Escrow authorization identifier |
| `capturedAmount` | string | Cumulative captured amount after this capture |
| `delta` | string | Amount captured by this receipt |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |

# Security Considerations

## Role Verification

Clients MUST parse and verify the `request` payload before signing. In
particular, clients MUST verify:

1. `amount` is reasonable for the service.
2. `currency` is the expected TIP-20 token.
3. `recipient` is controlled by the expected merchant or destination.
4. `methodDetails.operator` is expected or acceptable.
5. `methodDetails.escrowContract` is the expected escrow contract.
6. `authorizationExpires` is acceptable.

If `recipient` and `operator` differ, clients SHOULD display both values.

## Operator Power

The operator can capture escrowed funds without additional payer
interaction. This is intentional for delayed fulfillment and metered
billing. The escrow contract MUST bind the recipient, token, amount,
expiry, and operator into the authorization identifier so the operator
cannot redirect funds or exceed the authorized maximum.

## Replay Prevention

Tempo Transactions include chain ID, nonce, and optional `validBefore` /
`validAfter` timestamps that prevent transaction replay. The escrow
authorization identifier additionally binds the chain ID, escrow contract,
payer, recipient, operator, token, amount, expiry, and salt.

## Caching

Responses to authorization challenges (402 Payment Required), responses
that establish authorizations, and responses that consume authorized value
SHOULD include `Cache-Control: no-store` to prevent sensitive payment data
from being cached by intermediaries.

# IANA Considerations

This document has no IANA actions.

--- back

# ABNF Collected

~~~abnf
tempo-authorize-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "tempo" DQUOTE ","
  "intent=" DQUOTE "authorize" DQUOTE ","
  "expires=" quoted-string ","
  "request=" base64url-nopad

tempo-authorize-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj",
  realm="api.example.com",
  method="tempo",
  intent="authorize",
  expires="2026-05-13T12:05:00Z",
  request="<base64url-encoded JSON below>"
Cache-Control: no-store
~~~

Decoded request:

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
    "operator": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
    "feePayer": true
  }
}
~~~

**Credential:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2026-05-13T12:05:00Z"
  },
  "payload": {
    "transaction": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

**Authorization active response:**

~~~http
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json

{
  "authorization": {
    "id": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "method": "tempo",
    "status": "authorized",
    "amount": "50000000",
    "capturedAmount": "0",
    "remainingAmount": "50000000",
    "currency": "0x20c0000000000000000000000000000000000001",
    "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
    "operator": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
    "authorizationExpires": "2026-05-14T12:00:00Z",
    "reference": "0xauthorizeTxHash"
  }
}
~~~

## Capture Examples

### First Capture

The operator calls `capture(info, 10000000)`. Since the prior
`capturedAmount` is zero, the contract transfers 10.00 tokens to
`recipient`.

Decoded receipt:

~~~json
{
  "method": "tempo",
  "intent": "authorize",
  "reference": "0xcaptureTxHash1",
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "capturedAmount": "10000000",
  "delta": "10000000",
  "status": "success",
  "timestamp": "2026-05-13T12:10:00Z"
}
~~~

### Capture Retry

If the operator retries `capture(info, 10000000)`, the contract observes
that `cumulativeCaptured <= capturedAmount` and transfers no additional
funds. Implementations MAY return the original receipt from durable
server-side state.

Decoded receipt:

~~~json
{
  "method": "tempo",
  "intent": "authorize",
  "reference": "0xcaptureTxHash1",
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "capturedAmount": "10000000",
  "delta": "0",
  "status": "success",
  "timestamp": "2026-05-13T12:10:00Z"
}
~~~

### Later Incremental Capture

The operator calls `capture(info, 25000000)`. Since the prior
`capturedAmount` is 10.00 tokens, the contract transfers only the 15.00
token delta.

Decoded receipt:

~~~json
{
  "method": "tempo",
  "intent": "authorize",
  "reference": "0xcaptureTxHash2",
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "capturedAmount": "25000000",
  "delta": "15000000",
  "status": "success",
  "timestamp": "2026-05-13T12:30:00Z"
}
~~~

## Void Example

If the operator determines no further captures are needed, it calls
`voidAuthorization(info)`. With 25.00 tokens captured from a 50.00 token
authorization, the contract returns the remaining 25.00 tokens to the
payer and closes the authorization.

~~~json
{
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "status": "voided",
  "releasedAmount": "25000000",
  "reference": "0xvoidTxHash"
}
~~~

## Reclaim Example

If the operator does not void before `authorizationExpires`, the payer can
call `reclaim(info)` after expiry. The contract returns all remaining
uncaptured funds to the payer and closes the authorization.

~~~json
{
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "status": "reclaimed",
  "releasedAmount": "25000000",
  "reference": "0xreclaimTxHash"
}
~~~

## Out-of-Band Refund Request Example

Captured funds are not refunded by the escrow contract defined in this
version. A merchant can expose a separate refund request interface:

~~~http
POST /payments/tempo/authorizations/0x6d0f4fdf/refund-requests HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "reason": "requested_by_customer"
}
~~~

~~~http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "refundRequestId": "rr_789",
  "status": "pending_review"
}
~~~

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
