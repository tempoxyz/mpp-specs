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
  EIP-712:
    title: "Typed structured data hashing and signing"
    target: https://eips.ethereum.org/EIPS/eip-712
    author:
      - name: Remco Bloemen
    date: 2017-09
  TIP-1034:
    title: "TIP-20 Channel Escrow Precompile"
    target: https://tips.sh/1034-1
    author:
      - name: Tanishk Goyal
      - name: Brendan Ryan
    date: 2026-04
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
---

--- abstract

This document defines the "authorize" intent for the "tempo" payment
method in the Payment HTTP Authentication Scheme. It profiles the
TIP-1034 TIP-20 channel escrow precompile for authorization-and-capture
flows. The payer opens a channel funded up to a maximum amount, and the
operator later captures value through TIP-1034 cumulative voucher
settlement.

--- middle

# Introduction

The `authorize` intent for Tempo creates an authorization by opening a
TIP-1034 channel. The payer signs a Tempo transaction that calls the
canonical TIP-20 channel escrow precompile's `open` function. That call
escrows the maximum authorized amount. After the authorization is active,
an operator captures value by submitting TIP-1034 vouchers signed by the
channel's `authorizedSigner`.

This document does not define a separate Tempo authorization escrow
contract. Instead, it maps the HTTP Payment Authentication authorize
lifecycle onto TIP-1034:

| Authorize lifecycle | TIP-1034 operation |
|---------------------|--------------------|
| Create authorization | `open(payee, operator, token, deposit, salt, authorizedSigner)` |
| Authorization identifier | `channelId` |
| Partial capture | `settle(descriptor, cumulativeAmount, signature)` |
| Final capture and release | `close(descriptor, cumulativeAmount, captureAmount, signature)` |
| Void unused value | `close(descriptor, settled, settled, emptySignature)` |
| Payer-initiated reclaim | `requestClose(descriptor)` followed by `withdraw(descriptor)` after the close grace period |

TIP-1034 channels do not carry an on-chain `authorizationExpires` field.
For this profile, `authorizationExpires` is enforced by the server and
operator. Implementations that require on-chain expiry enforcement need a
future TIP-1034 extension or a separate adapter.

## Flow

~~~
   Client                      Server / Operator              Tempo Network
      |                              |                              |
      |  (1) GET /api/resource       |                              |
      |----------------------------->|                              |
      |                              |                              |
      |  (2) 402 Payment Required    |                              |
      |      intent="authorize"      |                              |
      |      amount, recipient,      |                              |
      |      operator, signer        |                              |
      |<-----------------------------|                              |
      |                              |                              |
      |  (3) Sign tx calling         |                              |
      |      TIP-1034.open(...)      |                              |
      |                              |                              |
      |  (4) Authorization: Payment  |                              |
      |      signed open tx          |                              |
      |----------------------------->|                              |
      |                              |  (5) Add fee-payer signature  |
      |                              |      if requested             |
      |                              |  (6) Broadcast open tx        |
      |                              |----------------------------->|
      |                              |                              |
      |  (7) 200 OK                  |  (channel funded)             |
      |      authorization active    |<-----------------------------|
      |<-----------------------------|                              |
      |                              |                              |
      |         ... later ...        |                              |
      |                              |                              |
      |                              |  (8) settle(voucher)          |
      |                              |      or close(voucher)        |
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
: Tempo's enshrined token standard. TIP-20 tokens use 6 decimal places.

TIP-1034 Channel Escrow
: The canonical TIP-20 channel escrow precompile at
  `0x4d50500000000000000000000000000000000000`.

Tempo Transaction
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types, 2D nonces, and validity windows.

Payer
: The account that funds the authorization channel.

Recipient
: The address that receives captured funds. This profile maps the
  recipient to the TIP-1034 `payee`.

Operator
: The address authorized by TIP-1034 to call `settle` and `close` on the
  recipient's behalf. The operator does not receive captured funds unless
  it is also the recipient.

Authorized Signer
: The TIP-1034 `authorizedSigner` whose voucher signatures authorize
  capture. For server-initiated capture without further payer
  interaction, this address is expected to be controlled by the server,
  operator, or another merchant-authorized signing service.

Voucher
: The TIP-1034 EIP-712 signed message
  `Voucher(bytes32 channelId,uint96 cumulativeAmount)`.

Channel Descriptor
: The immutable TIP-1034 channel identity tuple supplied in post-open
  calls. It contains payer, payee, operator, token, salt,
  authorizedSigner, and expiringNonceHash.

# Encoding Conventions

Addresses and hashes use `0x`-prefixed hexadecimal encoding. Examples in
this document use lowercase hexadecimal. Implementations MUST compare
addresses and hashes by decoded byte value, not by case-sensitive string
comparison.

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
| `authorizationExpires` | string | REQUIRED | Last time the server or operator can capture, in {{RFC3339}} format |
| `recipient` | string | REQUIRED | Destination address that receives captured funds |
| `description` | string | OPTIONAL | Human-readable authorization description |
| `externalId` | string | OPTIONAL | Merchant reference, order ID, or cart ID |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.escrowContract` | string | REQUIRED | TIP-1034 channel escrow precompile address. It MUST equal `0x4d50500000000000000000000000000000000000`. |
| `methodDetails.operator` | string | REQUIRED | Address authorized to settle and close the channel |
| `methodDetails.authorizedSigner` | string | REQUIRED | Address whose voucher signatures authorize capture |
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID. If omitted, the default value is 42431 (Tempo mainnet). |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees for the client-signed open transaction (default: `false`) |

The top-level `recipient`, `methodDetails.operator`, and
`methodDetails.authorizedSigner` are distinct roles. The recipient
receives captured funds. The operator submits channel lifecycle
transactions. The authorized signer signs capture vouchers. Any two or
all three addresses MAY be the same, but clients SHOULD display them when
they differ.

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the challenge expiry value.
The `authorizationExpires` field instead defines the HTTP Payment
Authentication authorization expiry.

Servers issuing a Tempo authorize challenge MUST include the `expires`
auth-param.

The `authorizationExpires` value MUST be strictly later than the
challenge `expires` timestamp. Servers MUST reject credentials where
`authorizationExpires` is at or before the challenge `expires`.

The `amount` value MUST fit the TIP-1034 `uint96 deposit` and
`uint96 cumulativeAmount` fields. Servers MUST reject requests with an
`amount` greater than 2^96 - 1.

`methodDetails.authorizedSigner` MUST NOT be the zero address for
server-initiated authorize-and-capture flows. A zero authorized signer
would make the payer the voucher signer under TIP-1034 and would require
additional payer interaction for every capture.

**Example:**

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "escrowContract": "0x4d50500000000000000000000000000000000000",
    "operator": "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "authorizedSigner": "0xb1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6b1b2",
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
| `source` | string | OPTIONAL | Payer identifier as a DID, for example `did:pkh:eip155:42431:0x...` |

The `source` field, if present, SHOULD use the `did:pkh` method
{{DID-PKH}} with the chain ID applicable to the challenge and the payer's
Ethereum address. Servers MUST verify payer identity from the signed
transaction and MUST NOT trust `source` without verification.

## Transaction Payload

The `transaction` field contains the complete client-signed Tempo
Transaction (type `0x76`) serialized as RLP and hex-encoded with `0x`
prefix. The transaction MUST call `open` on the TIP-1034 channel escrow
precompile identified by `methodDetails.escrowContract`.

The `channelId` field is OPTIONAL and is only a client hint. Servers MUST
derive the authoritative `channelId` from the signed transaction and
TIP-1034 channel identity rules.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction` | string | REQUIRED | Hex-encoded RLP-serialized signed Tempo Transaction |
| `channelId` | string | OPTIONAL | Client-computed channel identifier hint |

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
    "transaction": "0x76f901...signed open transaction bytes...",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

The signed transaction MUST:

1. Call `open(payee, operator, token, deposit, salt, authorizedSigner)` on
   `methodDetails.escrowContract`.
2. Set `payee` to the challenge `recipient`.
3. Set `operator` to `methodDetails.operator`.
4. Set `token` to the challenge `currency`.
5. Set `deposit` to the challenge `amount`.
6. Set `authorizedSigner` to `methodDetails.authorizedSigner`.
7. Include a payer-generated `salt` that helps make the channel
   identifier unique.
8. Use a transaction validity window no later than the challenge
   `expires` auth-param.

The transaction signer is the TIP-1034 payer. If `methodDetails.feePayer`
is `true`, the client signs with `fee_payer_signature` set to `0x00` and
`fee_token` empty, allowing the server to add the fee-payer signature
before broadcasting. If `feePayer` is `false` or omitted, the client MUST
include valid fee payment fields so the transaction is executable without
server sponsorship.

# TIP-1034 Channel Semantics {#tip1034-channel-semantics}

Tempo authorize uses the TIP-1034 channel escrow precompile. This section
summarizes the TIP-1034 surface used by this profile. TIP-1034 remains
authoritative if this summary and TIP-1034 conflict.

## Channel Data

~~~solidity
struct ChannelDescriptor {
    address payer;
    address payee;
    address operator;
    address token;
    bytes32 salt;
    address authorizedSigner;
    bytes32 expiringNonceHash;
}

struct ChannelState {
    uint96 settled;
    uint96 deposit;
    uint32 closeRequestedAt;
}
~~~

The `channelId` is computed by TIP-1034 from the channel descriptor, the
canonical precompile address, and the chain ID. For `open`,
`expiringNonceHash` is derived from the enclosing transaction's
replay-protected signing context. For post-open operations, the complete
descriptor is supplied in calldata.

## Interface Subset

~~~solidity
interface ITIP20ChannelEscrow {
    function open(
        address payee,
        address operator,
        address token,
        uint96 deposit,
        bytes32 salt,
        address authorizedSigner
    ) external returns (bytes32 channelId);

    function settle(
        ChannelDescriptor calldata descriptor,
        uint96 cumulativeAmount,
        bytes calldata signature
    ) external;

    function close(
        ChannelDescriptor calldata descriptor,
        uint96 cumulativeAmount,
        uint96 captureAmount,
        bytes calldata signature
    ) external;

    function requestClose(ChannelDescriptor calldata descriptor) external;

    function withdraw(ChannelDescriptor calldata descriptor) external;

    function getChannel(ChannelDescriptor calldata descriptor)
        external
        view
        returns (Channel memory);
}
~~~

## Authorization Creation

An authorization is active only after the TIP-1034 `open` transaction is
confirmed and the server verifies that the channel exists with:

1. `descriptor.payer` equal to the recovered transaction signer.
2. `descriptor.payee` equal to `recipient`.
3. `descriptor.operator` equal to `methodDetails.operator`.
4. `descriptor.token` equal to `currency`.
5. `descriptor.authorizedSigner` equal to
   `methodDetails.authorizedSigner`.
6. `state.deposit` equal to `amount`.
7. `state.settled` equal to zero.
8. `state.closeRequestedAt` equal to zero.

The channel's `channelId` is the Tempo authorize `authorizationId`.

## Capture

Captures use TIP-1034 cumulative vouchers. The operator obtains or
creates a valid `Voucher(channelId,cumulativeAmount)` signature from the
channel's `authorizedSigner` and calls:

~~~
settle(descriptor, cumulativeAmount, signature)
~~~

The amount paid to `recipient` is:

~~~
delta = cumulativeAmount - previousSettled
~~~

For this authorize profile, `cumulativeAmount` MUST NOT exceed the
original challenge `amount`, even if the channel is later topped up. The
server and operator MUST NOT capture after `authorizationExpires`.

TIP-1034 requires `settle` amounts to be strictly increasing. Therefore
retried captures with the same or lower cumulative value are not
submitted on-chain as no-op captures. Servers MUST provide HTTP
idempotency from durable state by returning the previously recorded
receipt for duplicate capture requests.

## Final Capture and Close

The operator SHOULD close the channel when no further captures will be
made. A close that increases captured value uses:

~~~
close(descriptor, cumulativeAmount, captureAmount, signature)
~~~

For this profile, `captureAmount` is the final cumulative captured
amount. `captureAmount` MUST NOT exceed the original challenge `amount`
and MUST NOT exceed `cumulativeAmount`.

The close operation transfers `captureAmount - previousSettled` to the
recipient, refunds `deposit - captureAmount` to the payer, and deletes
the channel state.

## Void

Void maps to a TIP-1034 close that does not increase captured value:

~~~
close(descriptor, settled, settled, "0x")
~~~

The operator SHOULD void authorizations when no further captures will be
made. Void releases all uncaptured channel deposit to the payer and does
not alter captured value.

## Payer-Initiated Reclaim

TIP-1034 does not have a single `reclaim` operation tied to
`authorizationExpires`. The payer can initiate channel closure at any
time by calling:

~~~
requestClose(descriptor)
~~~

After the TIP-1034 close grace period elapses, the payer can call:

~~~
withdraw(descriptor)
~~~

This returns the remaining channel deposit to the payer and deletes the
channel state. Servers MUST stop accepting new captures for channels with
`closeRequestedAt != 0`, unless the capture is part of a terminal close
submitted before the grace period ends.

# Verification Procedure

On receipt of a Tempo authorize credential, servers MUST:

1. Verify the challenge ID and challenge expiry.
2. Decode the transaction and verify it is a Tempo Transaction.
3. Verify the transaction calls `open` on
   `methodDetails.escrowContract`.
4. Verify `methodDetails.escrowContract` equals the canonical TIP-1034
   channel escrow precompile address.
5. Recover or otherwise determine the payer from the transaction.
6. Verify the `open` calldata values match the challenge request:
   - `payee` matches `recipient`
   - `operator` matches `methodDetails.operator`
   - `token` matches `currency`
   - `deposit` matches `amount`
   - `authorizedSigner` matches `methodDetails.authorizedSigner`
7. Derive the TIP-1034 `expiringNonceHash` from the transaction signing
   context and compute the expected `channelId`.
8. Verify any client-provided `payload.channelId` matches the computed
   `channelId`.
9. Verify the transaction validity window expires no later than the
   challenge `expires` auth-param.
10. If `feePayer: true`, add the server's fee-payer signature using the
    Tempo fee-payer signature domain.
11. Broadcast the transaction.
12. Verify onchain that the channel exists with the expected descriptor,
    `state.deposit == amount`, `state.settled == 0`, and
    `state.closeRequestedAt == 0`.
13. Store durable authorization state, including the challenge ID,
    channel ID, full descriptor, authorized amount, captured amount,
    authorization expiry, and terminal state.

Servers MUST NOT return success until the authorization channel is active
onchain.

# Capture, Void, and Refund

## Capture

The server or operator MAY capture value after authorization succeeds.
Capture operations are not carried in the client credential. They are
method-side lifecycle operations driven by the server or operator using
TIP-1034 vouchers.

The server MUST enforce the following before signing, requesting, or
submitting a capture voucher:

1. The channel is active.
2. The latest observed Tempo block timestamp and server wall-clock time
   are before `authorizationExpires`.
3. The requested cumulative captured amount is greater than the stored
   captured amount.
4. The requested cumulative captured amount does not exceed the original
   challenge `amount`.
5. `closeRequestedAt == 0`, except for terminal close handling.
6. The HTTP request is not a duplicate idempotency key that has already
   consumed value.

For example:

| Operation | Prior captured | Submitted operation | Delta paid | New captured |
|-----------|----------------|---------------------|------------|--------------|
| First capture | 0 | `settle(..., 100, sig)` | 100 | 100 |
| Duplicate HTTP retry | 100 | no on-chain call | 0 | 100 |
| Later capture | 100 | `settle(..., 250, sig)` | 150 | 250 |
| Final close | 250 | `close(..., 400, 400, sig)` | 150 | 400 |

## Void

The operator SHOULD void authorizations when no further captures will be
made. Void is implemented with TIP-1034 `close` using the current settled
amount as both `cumulativeAmount` and `captureAmount`. Void releases all
uncaptured value to the payer and closes the channel.

## Top-Up

TIP-1034 supports `topUp`, but top-up is outside this authorize profile.
Clients MUST NOT top up channels created for `intent="authorize"`.
Servers and operators MUST NOT capture more than the original challenge
`amount`, even if a channel's TIP-1034 `deposit` is later increased.

Applications that need reusable or refillable channels SHOULD use the
Tempo `session` intent instead of this authorize profile.

## Refund Requests

Refunds are out of band for this version of the Tempo authorize method.
Clients MAY request refunds through merchant-defined channels, and
merchants MAY honor them by issuing a separate payment or other
method-specific process. TIP-1034 does not define an on-chain refund
operation for already captured funds.

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
| `reference` | string | Transaction hash of the `settle` or `close` transaction |
| `authorizationId` | string | TIP-1034 `channelId` |
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
5. `methodDetails.authorizedSigner` is expected or acceptable.
6. `methodDetails.escrowContract` is the canonical TIP-1034 channel
   escrow precompile address.
7. `authorizationExpires` is acceptable.

If `recipient`, `operator`, and `authorizedSigner` differ, clients SHOULD
display each role.

## Authorized Signer Power

The authorized signer can produce vouchers that allow the operator to
settle or close the channel without further payer interaction. This is
intentional for delayed fulfillment and metered billing. Clients MUST
treat `authorizedSigner` as capture authority over the full challenge
`amount`.

## Expiry Enforcement

TIP-1034 does not enforce `authorizationExpires` onchain. Servers and
operators MUST enforce `authorizationExpires` before issuing or submitting
capture vouchers. Clients MUST NOT assume that the precompile will reject
late captures solely because the HTTP authorization has expired.

For deployments that need on-chain expiry, implementers should use a
future TIP-1034 extension or a separate adapter that validates expiry
before voucher settlement.

## Top-Up Risk

TIP-1034 top-up increases the channel deposit, and the authorized signer
can authorize settlement up to the resulting deposit. This authorize
profile therefore forbids top-up use for authorization channels and
requires server-side capture accounting against the original challenge
`amount`. Clients SHOULD create a fresh channel for each authorization.

## Payer-Initiated Close

The payer can call `requestClose` before `authorizationExpires`. This is a
TIP-1034 channel exit mechanism and is a method-specific terminal path
for this profile. Servers SHOULD monitor channel state before capture and
stop service delivery if `closeRequestedAt != 0`.

## Replay Prevention

Tempo Transactions include chain ID, nonce, and optional `validBefore` /
`validAfter` timestamps that prevent transaction replay. TIP-1034 channel
identifiers additionally bind the channel descriptor, canonical precompile
address, chain ID, and transaction-derived `expiringNonceHash`.

TIP-1034 vouchers are bound to `channelId` and cumulative amount. The
channel settlement watermark prevents a voucher from extracting funds
more than once.

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
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "escrowContract": "0x4d50500000000000000000000000000000000000",
    "operator": "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "authorizedSigner": "0xb1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6b1b2",
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
    "transaction": "0x76f901...signed open transaction bytes...",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f"
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
    "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00",
    "operator": "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "authorizedSigner": "0xb1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6b1b2",
    "authorizationExpires": "2026-05-14T12:00:00Z",
    "reference": "0xopenTxHash"
  }
}
~~~

## Capture Examples

### First Capture

The operator obtains a voucher signature from `authorizedSigner` for
`Voucher(channelId, 10000000)` and calls
`settle(descriptor, 10000000, signature)`. Since the prior settled amount
is zero, the precompile transfers 10.00 tokens to `recipient`.

Decoded receipt:

~~~json
{
  "method": "tempo",
  "intent": "authorize",
  "reference": "0xsettleTxHash1",
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "capturedAmount": "10000000",
  "delta": "10000000",
  "status": "success",
  "timestamp": "2026-05-13T12:10:00Z"
}
~~~

### Capture Retry

If the HTTP request that produced the first capture is retried with the
same idempotency key, the server does not submit another TIP-1034
`settle` call. It returns the durable receipt for the original capture.

Decoded receipt:

~~~json
{
  "method": "tempo",
  "intent": "authorize",
  "reference": "0xsettleTxHash1",
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "capturedAmount": "10000000",
  "delta": "0",
  "status": "success",
  "timestamp": "2026-05-13T12:10:00Z"
}
~~~

### Later Incremental Capture

The operator obtains a voucher signature for `Voucher(channelId,
25000000)` and calls `settle(descriptor, 25000000, signature)`. Since the
prior settled amount is 10.00 tokens, the precompile transfers only the
15.00 token delta.

Decoded receipt:

~~~json
{
  "method": "tempo",
  "intent": "authorize",
  "reference": "0xsettleTxHash2",
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "capturedAmount": "25000000",
  "delta": "15000000",
  "status": "success",
  "timestamp": "2026-05-13T12:30:00Z"
}
~~~

## Void Example

If the operator determines no further captures are needed, it calls
`close(descriptor, 25000000, 25000000, "0x")`. With 25.00 tokens captured
from a 50.00 token authorization, the precompile returns the remaining
25.00 tokens to the payer and deletes the channel state.

~~~json
{
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "status": "voided",
  "releasedAmount": "25000000",
  "reference": "0xcloseTxHash"
}
~~~

## Payer Reclaim Example

If the operator does not void, the payer can call
`requestClose(descriptor)`. After the TIP-1034 close grace period, the
payer calls `withdraw(descriptor)` to recover all remaining uncaptured
funds.

~~~json
{
  "authorizationId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "status": "reclaimed",
  "releasedAmount": "25000000",
  "reference": "0xwithdrawTxHash"
}
~~~

## Out-of-Band Refund Request Example

Captured funds are not refunded by TIP-1034. A merchant can expose a
separate refund request interface:

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

The authors thank the MPP community and the TIP-1034 contributors for
their feedback on this specification.
