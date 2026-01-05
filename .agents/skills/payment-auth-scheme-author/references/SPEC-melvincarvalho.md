# HTTP 402 Payment Required - Open Standards Specification

**Version:** 0.1.0
**Status:** Draft
**Date:** 2025-10-28
**Authors:** Melvin Carvalho

## Abstract

This specification defines a minimal, open standards-based protocol for implementing HTTP 402 "Payment Required" responses. It adheres to W3C and IETF standards, is blockchain-agnostic, and avoids proprietary dependencies. The specification leverages existing HTTP authentication frameworks (RFC 7235) and is compatible with multiple payment methods including Bitcoin, Lightning Network, and web-based payment systems.

## 1. Introduction

### 1.1 Purpose

HTTP 402 "Payment Required" was reserved in HTTP/1.1 (RFC 7231) but never standardized. This specification provides a minimal, interoperable protocol for implementing pay-per-request HTTP resources using open web standards.

### 1.2 Design Principles

1. **Open Standards**: Use W3C and IETF specifications exclusively
2. **Blockchain Agnostic**: Support any payment method or currency
3. **Standards Compliant Headers**: Follow RFC 6648 (no "X-" prefix)
4. **Minimal Specification**: Keep the protocol simple and extensible
5. **Privacy Preserving**: Stateless, no mandatory account/session tracking
6. **Decentralized**: No required third-party intermediaries

## 2. Protocol Overview

### 2.1 Request Flow

```
Client                          Server
  |                               |
  |---(1) GET /resource---------->|
  |                               |
  |<--(2) 402 Payment Required----|
  |       WWW-Authenticate        |
  |       Payment-Info            |
  |                               |
  |---(3) GET /resource---------->|
  |       Authorization           |
  |       Payment-Proof           |
  |                               |
  |<--(4) 200 OK------------------|
  |       Resource Content        |
```

### 2.2 Status Codes

- **402 Payment Required**: Resource requires payment
- **200 OK**: Payment verified, resource provided
- **400 Bad Request**: Invalid payment proof format
- **402 Payment Required** (retry): Payment verification failed

## 3. HTTP Headers

### 3.1 Server Response Headers

#### 3.1.1 WWW-Authenticate

**Specification:** RFC 7235

Indicates the authentication scheme and payment challenge.

```
WWW-Authenticate: Payment realm="resource-access",
                  method="bitcoin:lightning",
                  amount="1000",
                  currency="sat"
```

**Parameters:**
- `realm` (required): Protection space identifier
- `method` (required): Payment method identifier (see Section 4)
- `amount` (required): Payment amount in specified currency
- `currency` (required): Currency or unit identifier

#### 3.1.2 Payment-Info

Provides additional payment details in JSON format.

```
Payment-Info: {"invoice":"lnbc...", "address":"bc1q..."}
```

**Fields** (payment method specific):
- Lightning: `invoice` (BOLT-11 invoice)
- Bitcoin: `address` (on-chain address), `amount_btc`
- WebCredits: `recipient` (URI), `currency`

### 3.2 Client Request Headers

#### 3.2.1 Authorization

**Specification:** RFC 7235

Contains payment authentication credentials.

```
Authorization: Payment <credentials>
```

Where `<credentials>` is base64-encoded payment method-specific data.

#### 3.2.2 Payment-Proof

Contains payment verification data (transaction ID, preimage, signature, etc.).

```
Payment-Proof: {"preimage":"a1b2c3...", "type":"lightning"}
```

**Common Fields:**
- `type` (required): Payment method identifier
- `preimage`: Lightning payment preimage
- `txid`: Bitcoin transaction ID
- `signature`: Cryptographic signature
- `timestamp`: Payment timestamp (ISO 8601)

## 4. Payment Method Identifiers

### 4.1 Identifier Format

Payment methods use URI-like identifiers following W3C Payment Method Identifiers patterns:

```
payment-method = scheme ":" [ sub-method ]
```

### 4.2 Registered Methods

| Identifier | Description | Specification |
|------------|-------------|---------------|
| `bitcoin` | Bitcoin on-chain | BIP-21, BIP-70 |
| `bitcoin:lightning` | Lightning Network | BOLT-11 |
| `webcredits` | WebCredits protocol | [WebCredits Spec] |
| `w3c:payment-request` | W3C Payment Request API | W3C PR API |

### 4.3 Method Registration

New payment methods should:
1. Use descriptive, non-proprietary names
2. Reference open specifications
3. Be blockchain/platform agnostic
4. Document the payment-proof format

## 5. Payment Proof Formats

### 5.1 Lightning Network

```json
{
  "type": "bitcoin:lightning",
  "preimage": "hex-encoded-preimage",
  "invoice": "lnbc...",
  "timestamp": "2025-10-28T12:00:00Z"
}
```

**Verification:**
1. Hash preimage with SHA-256
2. Compare to invoice payment_hash
3. Verify amount matches requirement

### 5.2 Bitcoin On-Chain

```json
{
  "type": "bitcoin",
  "txid": "transaction-id",
  "vout": 0,
  "confirmations": 1,
  "timestamp": "2025-10-28T12:00:00Z"
}
```

**Verification:**
1. Query blockchain for transaction
2. Verify output address and amount
3. Check minimum confirmations

### 5.3 WebCredits

```json
{
  "type": "webcredits",
  "transaction": "https://example.org/tx/123",
  "signature": "base64-signature",
  "timestamp": "2025-10-28T12:00:00Z"
}
```

**Verification:**
1. Fetch transaction document
2. Verify cryptographic signature
3. Check amount and recipient

## 6. Security Considerations

### 6.1 Replay Protection

Servers SHOULD implement one or more:
- Nonce-based challenges (include nonce in WWW-Authenticate)
- Timestamp validation (reject old proofs)
- Payment-proof uniqueness tracking
- Invoice/address single-use enforcement

### 6.2 Privacy

- Servers MUST NOT require user accounts
- Payment methods SHOULD support pseudonymous payments
- Servers SHOULD NOT log identifying information beyond payment verification
- TLS (HTTPS) MUST be used for all communications

### 6.3 Amount Verification

Clients MUST verify:
1. Payment amount matches server requirement
2. Currency/unit is as expected
3. Recipient address is correct

Servers MUST verify:
1. Payment amount meets or exceeds requirement
2. Payment is confirmed/settled
3. Payment proof is cryptographically valid

## 7. Error Handling

### 7.1 Error Response Format

```json
{
  "error": "payment_verification_failed",
  "description": "Lightning payment preimage does not match invoice hash",
  "retry": true
}
```

### 7.2 Common Error Codes

| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `payment_insufficient` | Amount too low | 402 |
| `payment_verification_failed` | Invalid proof | 402 |
| `payment_expired` | Payment window expired | 402 |
| `payment_method_unsupported` | Method not accepted | 400 |
| `malformed_proof` | Invalid proof format | 400 |

## 8. Examples

### 8.1 Lightning Network Payment

**Request 1: Initial Request**
```http
GET /premium-content HTTP/1.1
Host: example.org
```

**Response 1: Payment Required**
```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment realm="premium-content",
                  method="bitcoin:lightning",
                  amount="1000",
                  currency="sat"
Payment-Info: {"invoice":"lnbc1500n1..."}
Content-Type: application/json

{
  "error": "payment_required",
  "message": "This resource requires payment of 1000 satoshis"
}
```

**Request 2: With Payment Proof**
```http
GET /premium-content HTTP/1.1
Host: example.org
Authorization: Payment dGVzdC1jcmVkZW50aWFscw==
Payment-Proof: {"type":"bitcoin:lightning","preimage":"a1b2c3d4...","invoice":"lnbc1500n1..."}
```

**Response 2: Success**
```http
HTTP/1.1 200 OK
Content-Type: text/html

<!DOCTYPE html>
<html>...premium content...</html>
```

### 8.2 Bitcoin On-Chain Payment

**Response: Payment Required**
```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment realm="api-access",
                  method="bitcoin",
                  amount="0.0001",
                  currency="BTC"
Payment-Info: {"address":"bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"}
```

**Request: With Payment Proof**
```http
GET /api/data HTTP/1.1
Host: api.example.org
Authorization: Payment dGVzdA==
Payment-Proof: {"type":"bitcoin","txid":"a1b2c3...","vout":0,"confirmations":1}
```

## 9. Implementation Considerations

### 9.1 Server Implementation

Servers implementing this specification:

1. MUST respond with 402 and WWW-Authenticate header
2. MUST specify payment method, amount, and currency
3. SHOULD provide Payment-Info with method-specific details
4. MUST verify payment proofs cryptographically
5. SHOULD implement replay protection
6. MAY support multiple payment methods

### 9.2 Client Implementation

Clients implementing this specification:

1. MUST handle 402 responses
2. MUST parse WWW-Authenticate and Payment-Info headers
3. MUST verify payment details before sending funds
4. MUST construct valid payment proofs
5. SHOULD support common payment methods
6. MAY cache payment proofs for resource re-access

### 9.3 Facilitator Services (Optional)

Third-party services MAY provide:
- Payment verification APIs
- Transaction monitoring
- Multi-method payment gateways
- Rate limiting and fraud prevention

Facilitators MUST NOT:
- Require proprietary protocols
- Act as mandatory intermediaries
- Violate decentralization principles

## 10. Extensibility

### 10.1 Custom Payment Methods

Implementations MAY define custom payment methods following these guidelines:

1. Use descriptive, lowercase identifiers
2. Document the payment-proof format
3. Specify verification procedures
4. Maintain backward compatibility
5. Avoid proprietary dependencies

### 10.2 Additional Headers

Implementations MAY define additional headers for:
- Rate limiting information
- Payment history
- Service-level agreements
- Multi-resource bundling

New headers MUST:
- Follow RFC 6648 (no "X-" prefix)
- Be documented publicly
- Remain optional

## 11. Conformance

An implementation conforms to this specification if it:

1. Uses HTTP 402 status code per RFC 7231
2. Uses WWW-Authenticate header per RFC 7235
3. Supports at least one payment method from Section 4.2
4. Implements payment verification per Section 5
5. Follows security considerations in Section 6

## 12. References

### 12.1 Normative References

- **RFC 7231**: HTTP/1.1 Semantics and Content
- **RFC 7235**: HTTP/1.1 Authentication
- **RFC 6648**: Deprecating the "X-" Prefix
- **RFC 3986**: URI Generic Syntax

### 12.2 Informative References

- **W3C Payment Request API**: https://www.w3.org/TR/payment-request/
- **W3C Payment Method Identifiers**: https://www.w3.org/TR/payment-method-id/
- **BOLT-11**: Lightning Invoice Protocol
- **BIP-21**: Bitcoin URI Scheme
- **WebCredits**: https://webcredits.org/

## 13. Acknowledgments

This specification builds upon work from:
- W3C Web Payments Working Group
- IETF HTTP Working Group
- Lightning Labs (L402 protocol concepts)
- Coinbase (x402 protocol concepts)
- WebCredits community

## Appendix A: Changelog

### Version 0.1.0 (2025-10-28)
- Initial draft specification
- Core protocol definition
- Lightning, Bitcoin, and WebCredits payment methods
- Security considerations

---

**License:** This specification is released into the public domain (CC0 1.0 Universal).