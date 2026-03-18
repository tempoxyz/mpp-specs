---
title: Tempo Sign Intent for HTTP Payment Authentication
abbrev: Tempo Sign
docname: draft-tempo-sign-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-sign:
    title: "Sign Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-sign/
    author:
      - name: Jake Moxey
    date: 2026-03

informative:
  ERC-191:
    title: "ERC-191: Signed Data Standard"
    target: https://eips.ethereum.org/EIPS/eip-191
    author:
      - name: Martin Holst Swende
      - name: Nick Johnson
    date: 2016-01
  EIP-712:
    title: "EIP-712: Typed structured data hashing and signing"
    target: https://eips.ethereum.org/EIPS/eip-712
    author:
      - name: Remco Bloemen
      - name: Leonid Logvinov
      - name: Jacob Evans
    date: 2017-09
  ERC-1271:
    title: "ERC-1271: Standard Signature Validation Method for Contracts"
    target: https://eips.ethereum.org/EIPS/eip-1271
    author:
      - name: Francisco Giordano
      - name: Matt Condon
      - name: Philippe Castonguay
    date: 2018-07
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
    author:
      - name: Vitalik Buterin
    date: 2016-01
  TEMPO-TX-SPEC:
    title: "Tempo Transaction Specification"
    target: https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "sign" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients produce cryptographic signatures over
server-provided data using ERC-191 (`personal_sign`) and EIP-712
(`signTypedData_v4`) signing schemes on the Tempo blockchain.

--- middle

# Introduction

The `sign` intent enables a server to challenge a client to produce
a cryptographic signature over server-provided data. This document
defines how the "tempo" payment method implements the sign intent
{{I-D.payment-intent-sign}} using Ethereum-compatible signing
schemes.

Two signing schemes are supported:

- **`personal_sign`**: Signs a plaintext message using the
  ERC-191 {{ERC-191}} "Ethereum Signed Message" encoding.
  Suitable for simple authentication ceremonies and human-readable
  messages.

- **`typed_data`**: Signs a structured, typed data object using the
  EIP-712 {{EIP-712}} `signTypedData_v4` encoding. Suitable for
  on-chain verification, typed authorization, and structured
  attestations.

Both schemes provide domain separation, preventing signatures from
being repurposed as valid transaction authorizations.

## Sign Flow

~~~
   Client                        Server
      |                             |
      |  (1) GET /api/resource      |
      |-------------------------->  |
      |                             |
      |  (2) 402 Payment Required   |
      |      intent="sign"          |
      |      type="personal_sign"   |
      |        or "typed_data"      |
      |<--------------------------  |
      |                             |
      |  (3) Inspect payload,       |
      |      sign with wallet       |
      |                             |
      |  (4) Authorization: Payment |
      |-------------------------->  |
      |                             |
      |  (5) Recover signer,        |
      |      verify authorization   |
      |                             |
      |  (6) 200 OK + Receipt       |
      |<--------------------------  |
      |                             |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Personal Sign
: A signature over a plaintext message using the ERC-191 {{ERC-191}}
  "Ethereum Signed Message" encoding. Equivalent to the
  `personal_sign` / `signMessage` operation supported by Ethereum
  wallets.

Typed Data Sign
: A signature over a structured, typed data object using the
  EIP-712 {{EIP-712}} `signTypedData_v4` encoding. Supports
  recursive struct encoding and array types.

# Supported Signing Schemes

The "tempo" method supports the following `type` values for the
sign intent:

| Type | Scheme | Reference |
|------|--------|-----------|
| `personal_sign` | ERC-191 "Ethereum Signed Message" | {{ERC-191}} |
| `typed_data` | EIP-712 `signTypedData_v4` | {{EIP-712}} |

Servers MUST use one of these `type` values. Clients that receive
an unrecognized `type` MUST reject the challenge.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains
a base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Type: personal_sign {#personal-sign}

When `type` is `"personal_sign"`, the `payload` field is a plaintext
string that the client will sign.

### Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"personal_sign"` |
| `payload` | string | REQUIRED | Plaintext message to sign |

### Method Details

The `personal_sign` type does not require any `methodDetails`.
Servers MAY include `methodDetails` for application-specific
extensions.

### Signing Procedure

The client MUST compute the signature per ERC-191 {{ERC-191}}:

~~~
H = keccak256(
  "\x19Ethereum Signed Message:\n" ||
  decimal(len(payload)) ||
  payload
)
signature = ecdsaSign(privateKey, H)
~~~

This is equivalent to the `personal_sign` / `signMessage` operation
supported by Ethereum wallets and signing libraries.

### Example Request

~~~json
{
  "type": "personal_sign",
  "payload": "Authorize access to api.example.com\nNonce: qB3wErTyU7iOpAsD9fGhJk\nIssued At: 2026-03-18T12:00:00Z"
}
~~~

## Type: typed_data {#typed-data}

When `type` is `"typed_data"`, the `payload` field is a structured
object that the client will sign using EIP-712 {{EIP-712}}
`signTypedData_v4`.

### Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"typed_data"` |
| `payload` | object | REQUIRED | Structured data to sign (the EIP-712 `message`) |

### Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.domain` | object | REQUIRED | EIP-712 {{EIP-712}} domain separator |
| `methodDetails.types` | object | REQUIRED | EIP-712 {{EIP-712}} type definitions (MUST NOT include `EIP712Domain`) |
| `methodDetails.primaryType` | string | REQUIRED | The primary type to sign |

The `methodDetails.domain` object MAY contain any of the fields
defined by EIP-712 {{EIP-712}}:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable name |
| `version` | string | Signing domain version |
| `chainId` | number | EIP-155 chain identifier |
| `verifyingContract` | string | Contract address (`0x`-prefixed) |
| `salt` | string | Disambiguating salt (`0x`-prefixed) |

The `methodDetails.types` object MUST define all struct types
referenced by `primaryType` and its fields, following the
`signTypedData_v4` encoding rules. The `EIP712Domain` type MUST
NOT be included in `methodDetails.types`; it is implicitly derived
from the `methodDetails.domain` object.

### Signing Procedure

The client MUST compute the signature per EIP-712 {{EIP-712}}:

~~~
domainSeparator = hashStruct(
  "EIP712Domain",
  methodDetails.domain
)
structHash = hashStruct(
  methodDetails.primaryType,
  payload
)
H = keccak256("\x19\x01" || domainSeparator || structHash)
signature = ecdsaSign(privateKey, H)
~~~

### Example Request

~~~json
{
  "type": "typed_data",
  "payload": {
    "action": "access /api/v1/resource",
    "nonce": "zL4xCvBnM6kJhGfD8sAaWe",
    "expiry": "1742313600"
  },
  "methodDetails": {
    "domain": {
      "name": "Example API",
      "version": "1",
      "chainId": 42431
    },
    "types": {
      "Authorization": [
        { "name": "action", "type": "string" },
        { "name": "nonce", "type": "string" },
        { "name": "expiry", "type": "uint256" }
      ]
    },
    "primaryType": "Authorization"
  }
}
~~~

# Credential Schema

The credential in the `Authorization` header contains a
base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Signer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method
with the Tempo chain ID and the signer's Ethereum address.

## Payload Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded signature (`0x`-prefixed) |

The `signature` format depends on the signer's key type. See
{{signature-verification}} for supported formats and their
encodings.

**Example:**

~~~json
{
  "challenge": {
    "id": "qB3wErTyU7iOpAsD9fGhJk",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "sign",
    "request": "eyJ0eXBlIjoicGVyc29uYWxfc2lnbi...",
    "expires": "2026-03-18T12:05:00Z"
  },
  "payload": {
    "signature": "0x1b2c3d4e5f...1c"
  },
  "source": "did:pkh:eip155:42431:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
}
~~~

# Verification

## Server Responsibilities

Servers verifying a "sign" credential MUST:

1. Verify the `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. Reconstruct the signing hash from the `request` data:
   - For `personal_sign`: compute ERC-191 hash of `payload`
   - For `typed_data`: compute EIP-712 hash using `payload`
     and `methodDetails`
4. Determine the signature type from the signature format
   (see {{signature-verification}})
5. Verify the signature using the appropriate curve
6. Verify the recovered or derived address satisfies the
   server's authorization policy

## Signature Verification {#signature-verification}

Tempo EOAs support three signature types. The signature type is
determined by the length and type identifier of the decoded
signature bytes.

### secp256k1 (65 bytes)

~~~
signature = r (32 bytes) || s (32 bytes) || v (1 byte)
~~~

- **Detection**: Exactly 65 bytes with no type identifier prefix.
- **Verification**: Standard `ecrecover` to recover the signer
  address from the hash and signature. The recovered address is
  compared against the server's authorization policy.
- **Canonical signatures**: Servers MUST reject signatures with
  non-canonical (high-s) values. Signatures MUST have
  `s <= secp256k1_order / 2` where the half-order is
  `0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0`.
- **Recovery ID**: `v` MUST be 27 or 28.

Servers MAY also accept 64-byte EIP-2098 compact signatures.

### P256 (130 bytes)

~~~
signature = 0x01 || r (32 bytes) || s (32 bytes)
         || pub_key_x (32 bytes) || pub_key_y (32 bytes)
         || pre_hash (1 byte)
~~~

- **Detection**: First byte is `0x01` and total length is
  130 bytes.
- **Verification**: P256 curve verification using the provided
  public key coordinates (`pub_key_x`, `pub_key_y`). The signer
  address is derived from the public key coordinates.
- **Pre-hash**: If the `pre_hash` byte is `0x01`, the digest
  MUST be pre-hashed with SHA-256 before P256 verification:
  `digest = sha256(digest)`. This accommodates P256
  implementations (e.g., Web Crypto API) that require
  pre-hashed input.
- **Address derivation**: The signer address is derived from the
  P256 public key. The specific derivation method is defined by
  the Tempo protocol {{TEMPO-TX-SPEC}}.

### WebAuthn (variable length, max 2KB)

~~~
signature = 0x02 || webauthn_data (variable)
         || r (32 bytes) || s (32 bytes)
         || pub_key_x (32 bytes) || pub_key_y (32 bytes)
~~~

- **Detection**: First byte is `0x02` and total length is between
  129 and 2049 bytes.
- **Parsing**: Parse by working backwards from the end of the
  signature: last 128 bytes are `pub_key_y`, `pub_key_x`, `s`,
  `r` (each 32 bytes). Remaining bytes after the type identifier
  are `webauthn_data` (`authenticatorData || clientDataJSON`).
- **Verification**:
  1. Parse `authenticatorData` and `clientDataJSON` from
     `webauthn_data`.
  2. Validate `authenticatorData` is at least 37 bytes.
  3. Verify the User Presence (UP) flag is set
     (`authenticatorData[32] & 0x01`).
  4. Verify `clientDataJSON` contains `"type":"webauthn.get"`.
  5. Verify the `challenge` field in `clientDataJSON` matches the
     base64url encoding of the signing hash.
  6. Compute `clientDataHash = sha256(clientDataJSON)`.
  7. Compute `messageHash = sha256(authenticatorData ||
     clientDataHash)`.
  8. Verify the P256 signature (`r`, `s`) over `messageHash`
     using the public key (`pub_key_x`, `pub_key_y`).
- **Address derivation**: Same as P256 — derived from the public
  key coordinates per the Tempo protocol {{TEMPO-TX-SPEC}}.

### Signature Type Summary

| Type | Type ID | Length | Curve | Verification |
|------|---------|--------|-------|-------------|
| secp256k1 | (none) | 65 bytes | secp256k1 | `ecrecover` |
| P256 | `0x01` | 130 bytes | P256 | P256 verify with public key |
| WebAuthn | `0x02` | 129–2049 bytes | P256 | WebAuthn + P256 verify |

## SCA Verification

For Smart Contract Accounts (SCAs), the server MAY verify the
signature using ERC-1271 {{ERC-1271}} `isValidSignature` on the
Smart Contract Account on the Tempo chain.

The server calls:

~~~
isValidSignature(hash, signature) == 0x1626ba7e
~~~

Where `hash` is the reconstructed signing hash and `signature` is
the raw signature bytes from the credential payload.

## Address Format

Ethereum addresses in `source` and server authorization policies
MUST be compared case-insensitively. Addresses SHOULD be formatted
using EIP-55 {{EIP-55}} mixed-case checksum encoding for display
purposes.

# Security Considerations

## Blind Signing Prevention

The "tempo" method MUST NOT request signatures over raw digests.
Only `personal_sign` and `typed_data` types are supported, both
of which require the server to provide the pre-image. This
ensures clients can inspect the content before signing.

Clients SHOULD inspect the `payload` before producing a signature.
Clients MAY reject signing requests that contain suspicious or
unexpected content.

## Domain Separation

Both signing schemes apply a domain-specific prefix:

- `personal_sign`: Prepends `"\x19Ethereum Signed Message:\n"`
  per ERC-191 {{ERC-191}}, preventing the signature from being
  valid as a raw transaction signature.

- `typed_data`: Prepends `"\x19\x01"` with a domain separator
  per EIP-712 {{EIP-712}}, preventing cross-domain replay.

Servers SHOULD prefer `typed_data` when the signed data will be
verified on-chain, as EIP-712 provides stronger domain separation
through the `verifyingContract` and `chainId` fields.

## Replay Protection

Replay protection is provided by the challenge `id` mechanism
defined in {{I-D.httpauth-payment}}. Each challenge `id` is
single-use.

For additional replay protection within the signed data, servers
SHOULD include a nonce or timestamp in the `payload`.

## Signature Reuse Across Contexts

A signature produced for a `personal_sign` challenge could be
valid in any context that accepts ERC-191 signatures over the
same message bytes. Servers SHOULD include context-specific data
(realm, nonce, timestamp) in the `payload` to limit reuse.

For `typed_data`, the EIP-712 domain separator (particularly
`verifyingContract` and `chainId`) provides stronger protection
against cross-context reuse. Servers SHOULD set `chainId` in
the domain to bind signatures to the Tempo chain.

## Financial Operation Authorization

Clients MUST verify that a `sign` challenge does not contain
`typed_data` that would authorize a financial operation (e.g.,
token transfer, approval, permit) unless the client explicitly
intends to authorize such an action.

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `sign` | `tempo` | Cryptographic signature over server-provided data | This document |

--- back

# Examples

## Personal Sign Authentication

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="qB3wErTyU7iOpAsD9fGhJk",
  realm="api.example.com",
  method="tempo",
  intent="sign",
  expires="2026-03-18T12:05:00Z",
  request="eyJ0eXBlIjoicGVyc29uYWxfc2lnbiIsInBheWxvYWQiOiJBdXRob3JpemUgYWNjZXNzIHRvIGFwaS5leGFtcGxlLmNvbVxuTm9uY2U6IHFCM3dFclR5VTdpT3BBc0Q5ZkdoSmtcbklzc3VlZCBBdDogMjAyNi0wMy0xOFQxMjowMDowMFoifQ"

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Signature Required",
  "status": 402,
  "detail": "Signature required for access."
}
~~~

Decoded `request`:

~~~json
{
  "type": "personal_sign",
  "payload": "Authorize access to api.example.com\nNonce: qB3wErTyU7iOpAsD9fGhJk\nIssued At: 2026-03-18T12:00:00Z"
}
~~~

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJxQjN3RXJUWVU3aU9wQXNEOWZHaEprIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJ0ZW1wbyIsImludGVudCI6InNpZ24iLCJyZXF1ZXN0IjoiZXlKMGVYQmxJam9pY0dWeWMyOXVZV3hmYzJsbmJpSXNJbkJoZVd4dllXUWlPaUpCZFhSb2IzSnBlbVVnWVdOalpYTnpJSFJ2SUdGd2FTNWxlR0Z0Y0d4bExtTnZiVnh1VG05dVkyVTZJSEZDTTNkRmNsUjVWVGRwVDNCQmMwUTVaa2RvU210Y2JrbHpjblZsWkNCQmREb2dNakF5Tmkwd015MHhPRlF4TWpvd01Eb3dNRm9pZlEiLCJleHBpcmVzIjoiMjAyNi0wMy0xOFQxMjowNTowMFoifSwicGF5bG9hZCI6eyJzaWduYXR1cmUiOiIweDFiMmMzZDRlNWYuLi42NSBieXRlcy4uLjFjIn0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjQyNDMxOjB4ZDhkQTZCRjI2OTY0QUY5RDdlRWQ5ZTAzRTUzNDE1RDM3YUE5NjA0NSJ9
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "qB3wErTyU7iOpAsD9fGhJk",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "sign",
    "request": "eyJ0eXBlIjoicGVyc29uYWxfc2lnbi...",
    "expires": "2026-03-18T12:05:00Z"
  },
  "payload": {
    "signature": "0x1b2c3d4e5f...65 bytes...1c"
  },
  "source": "did:pkh:eip155:42431:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
}
~~~

## Typed Data Authorization

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="zL4xCvBnM6kJhGfD8sAaWe",
  realm="api.example.com",
  method="tempo",
  intent="sign",
  expires="2026-03-18T12:05:00Z",
  request="eyJ0eXBlIjoidHlwZWRfZGF0YSIsInBheWxvYWQiOnsiYWN0aW9uIjoiYWNjZXNzIC9hcGkvdjEvcmVzb3VyY2UiLCJub25jZSI6InpMNHhDdkJuTTZrSmhHZkQ4c0FhV2UiLCJleHBpcnkiOiIxNzQyMzEzNjAwIn0sIm1ldGhvZERldGFpbHMiOnsiZG9tYWluIjp7Im5hbWUiOiJFeGFtcGxlIEFQSSIsInZlcnNpb24iOiIxIiwiY2hhaW5JZCI6NDI0MzF9LCJ0eXBlcyI6eyJBdXRob3JpemF0aW9uIjpbeyJuYW1lIjoiYWN0aW9uIiwidHlwZSI6InN0cmluZyJ9LHsibmFtZSI6Im5vbmNlIiwidHlwZSI6InN0cmluZyJ9LHsibmFtZSI6ImV4cGlyeSIsInR5cGUiOiJ1aW50MjU2In1dfSwicHJpbWFyeVR5cGUiOiJBdXRob3JpemF0aW9uIn19"

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Signature Required",
  "status": 402,
  "detail": "Typed data signature required for access."
}
~~~

Decoded `request`:

~~~json
{
  "type": "typed_data",
  "payload": {
    "action": "access /api/v1/resource",
    "nonce": "zL4xCvBnM6kJhGfD8sAaWe",
    "expiry": "1742313600"
  },
  "methodDetails": {
    "domain": {
      "name": "Example API",
      "version": "1",
      "chainId": 42431
    },
    "types": {
      "Authorization": [
        { "name": "action", "type": "string" },
        { "name": "nonce", "type": "string" },
        { "name": "expiry", "type": "uint256" }
      ]
    },
    "primaryType": "Authorization"
  }
}
~~~

**Credential:**

~~~json
{
  "challenge": {
    "id": "zL4xCvBnM6kJhGfD8sAaWe",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "sign",
    "request": "eyJ0eXBlIjoidHlwZWRfZGF0YSIs...",
    "expires": "2026-03-18T12:05:00Z"
  },
  "payload": {
    "signature": "0x1b2c3d4e5f...65 bytes...1c"
  },
  "source": "did:pkh:eip155:42431:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
}
~~~

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.
