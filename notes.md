| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| GLOB-001 | Best Practices | Inconsistent draft names across documents | Medium | Standardize on `I-D.ietf-httpauth-payment` or `I-D.httpauth-payment` throughout | YES |  |  |
| GLOB-002 | Best Practices | Cites RFC 7235 but HTTP core is now RFC 9110/9111/9112 | High | Update normative references to HTTP core update set (RFC 9110 obsoletes 7230-7235) | YES |  | X |

---

## Core Spec (`specs/core/draft-httpauth-payment-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| CORE-001 | Best Practices | ABNF redefines base grammar incorrectly | High | Don't restate `challenge`, `auth-param`; instead reference RFC 9110 and extend with parameters | YES |  |  |
| CORE-002 | Best Practices | Uses `b64token` (OAuth) but describes base64url JSON | High | Define `base64url-nopad` production explicitly per RFC 4648 §5, don't borrow OAuth's `b64token` syntax | YES |  | X |
| CORE-003 | Best Practices | Missing RFC 9457 reference for Problem Details | Medium | Add normative reference since `application/problem+json` is used in examples | YES |  | X |
| CORE-004 | Best Practices | `realm` marked REQUIRED but RFC 9110 says RECOMMENDED | Medium | Align with HTTP semantics or justify deviation | YES | Make it required | X |
| CORE-005 | Best Practices | No Processing Instructions for JSON-in-headers | Medium | Define precise parsing rules: token vs quoted-string escaping, whitespace, max size, error behavior | YES | **PLAN:** Add one paragraph: "Servers receiving malformed credentials (invalid base64url, non-UTF-8 content, or invalid JSON) MUST return 400 (Bad Request). Implementations SHOULD limit the `request` parameter to 4096 bytes before encoding." |  |
| CORE-009 | Prior Art | OAuth error response conventions not adopted | Low | Consider `error`/`error_description` in WWW-Authenticate per RFC 6750 pattern | YES | **PLAN:** Add clarifying note: "Error details are provided in the response body using Problem Details {{RFC9457}} rather than in the `WWW-Authenticate` header." |  |
| CORE-010 | Ambiguity | `id` binding insufficiently specified | High | Normatively require binding to `{origin, realm, method, intent, request, target URI, HTTP method}` | YES | **PLAN:** Strengthen to: "Servers MUST associate each challenge `id` with the specific target URI and HTTP method for which it was issued. Servers MUST reject credentials where the target URI or HTTP method differs from the original challenge." |  |
| CORE-011 | Ambiguity | No idempotency guidance for non-GET requests | High | Add MUST: server MUST NOT perform side effects for unpaid requests; provide idempotency key guidance | YES |  |  |
| CORE-012 | Ambiguity | 401 vs 400 distinction unclear | High | Create decision table: condition → status code → fresh challenge? → problem details? | YES | **PLAN:** Use 402 for payment-related errors instead of 400/401. Decision table: No auth header + payment required → 402 + challenge; Malformed credential → 402 + `malformed-credential` problem + fresh challenge; Unknown/expired/used `id` → 402 + `invalid-challenge` problem + fresh challenge; Payment proof invalid → 402 + `verification-failed` problem + fresh challenge; Payment verified but policy denies → 403. |  |
| CORE-013 | Ambiguity | Request body binding undefined | High | If POST is pay-gated, is proof bound to body hash? Attackers could pay for cheap body, use credential for expensive one | YES |  |  |
| CORE-014 | Ambiguity | Multiple challenges: client behavior undefined | Medium | Clarify: client chooses one, sends one Authorization; define error if multiple sent | YES |  |  |
| CORE-016 | Ambiguity | Expiry handling ambiguous | Medium | What if client clock differs from server? Network latency causes edge-case expiry? | YES | **PLAN:** Add: "Servers SHOULD allow a clock skew tolerance of up to 60 seconds when validating `expires` timestamps. Clients SHOULD submit credentials well before the stated expiry to account for network latency." |  |
| CORE-018 | Security | Replay protection relies on server state only | High | Require TLS 1.2+ (not just 1.3); add operational guidance against credential logging | YES | Fine – this seems not super necessary |  |
| CORE-019 | Security | No request-body binding for non-idempotent methods | High | For POST/PUT pay-gating, include body hash in challenge binding to prevent substitution attacks | YES |  |  |
| CORE-020 | Security | Confused deputy possible across realms | High | Explicitly bind `id` to protected resource scope; reject cross-realm credential reuse | YES | **PLAN:** Add: "Servers MUST verify that the credential's challenge `id` was issued for the same realm as the current request. Credentials MUST NOT be accepted across different realms." |  |
| CORE-021 | Security | 402 vs 401 may confuse intermediaries | Medium | HTTP proxies/caches treat 401 specially; clarify `WWW-Authenticate` on 402 is equivalent for this scheme | YES |  |  |
| CORE-022 | Security | Double-spend/double-deliver race condition | Medium | Clarify: two parallel retries with same credential must not cause double payment/delivery | YES |  |  |

---

## Intent Specs (General)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| INT-001 | Ambiguity | Intent specs impose "generic" fields but core says request is method-specific | High | Either intents define method-independent abstract model OR collapse intents into core for \-00 | YES | Intents should be method specific and only define the shape of the flow |  |
| INT-002 | Simplification | Separate intent drafts may be premature | Medium | Consider starting with charge only; add authorize/subscription as extensions later | Maybe | \<To discuss\> |  |

---

## Charge Intent (`specs/intents/draft-payment-intent-charge-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| CHARGE-001 | Ambiguity | `amount` field type is "string/number" — pick one | Medium | Specify canonical type; strings recommended for precision with large numbers | YES | **PLAN:** Use string type. |  |
| CHARGE-002 | Ambiguity | No guidance on decimal handling or precision | Medium | Specify base units vs decimal, max precision, rounding behavior | YES | **PLAN:** Use string representation of base units (smallest indivisible unit). Add: "The `amount` field MUST be a string containing a non-negative integer representing the amount in the asset's smallest unit (e.g., cents for USD, wei for ETH, base units for TIP-20). Implementations MUST NOT use floating-point representations to avoid precision loss." Prior art: Stripe API (integer minor units), ISO 4217 (minor units), Lightning (millisatoshis). |  |

---

## Authorize Intent (`specs/intents/draft-payment-intent-authorize-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| AUTH-001 | Ambiguity | Authorization revocation mechanism undefined at protocol level | Medium | Define HTTP endpoint or header for revocation, or explicitly delegate to method specs |  |  |  |
| AUTH-002 | Ambiguity | "Reasonable max" windows are guidance not normative | Low | Consider SHOULD-level recommendations with specific durations |  |  |  |

---

## Subscription Intent (`specs/intents/draft-payment-intent-subscription-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| SUB-001 | Ambiguity | `period` as both string name and number seconds is ambiguous | Medium | Define canonical format; recommend seconds as number with named constants as informative |  |  |  |
| SUB-002 | Ambiguity | "\~30 days" and "\~365 days" are imprecise | Low | Define exact second values or clarify calendar-month semantics |  |  |  |
| SUB-003 | Ambiguity | Failed payment retry policy undefined | Medium | Define protocol-level guidance or explicitly delegate to methods |  |  |  |

---

## Tempo Method (`specs/methods/draft-tempo-payment-method-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| TEMPO-002 | Best Practices | References `[TEMPO-TX-SPEC]` but never defines it | Medium | Add normative reference or inline the specification | Yes | Link to [https://docs.tempo.xyz/protocol\#tempo-protocol](https://docs.tempo.xyz/protocol#tempo-protocol) | X |
| TEMPO-003 | Ambiguity | Chain ID 42431 is hardcoded (Moderato testnet) | Medium | Clarify how mainnet/other networks are identified; consider `method:chainId` sub-method syntax | YES | **PLAN:** Use CAIP-2 identifiers in the `request` object, not in method identifier. Add `"chain": "eip155:42431"` field to request schema. Keep `method="tempo"` simple. Reference: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md. Example: `{"amount": "1000000", "asset": "0x...", "chain": "eip155:42431", ...}` |  |
| TEMPO-004 | Ambiguity | `feePayer: true` server obligations not fully specified | Medium | What if server lacks fee balance? Error code? Fallback behavior? | YES | Indicate error |  |
| TEMPO-007 | Security | Server as fee payer could be griefed with invalid txs | Medium | Add rate limiting guidance; clarify server SHOULD validate before signing fee commitment | YES |  |  |

---

## Stripe Method (`specs/methods/draft-stripe-payment-method-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| STRIPE-002 | Security | Stripe Business Network IANA registry misuse | Medium | IANA is not for vendor-internal IDs; remove this registry request | YES |  |  |
| STRIPE-003 | Ambiguity | SPT creation mechanism is Stripe.js-specific | Medium | Clarify this is not a fully open protocol; relies on Stripe proprietary APIs | Yes |  |  |
| STRIPE-004 | Ambiguity | `businessNetwork` field semantics unclear for non-Stripe readers | Low | Add more context or mark as Stripe-specific extension | Yes |  |  |
| STRIPE-005 | Ambiguity | 7-day authorization window is card-specific | Low | Clarify this varies by payment method type | Yes |  |  |

---

## Discovery Extension (`specs/extensions/draft-payment-discovery-00.md`)

| ID | Category | Issue | Severity | Recommendation | Should Do? | Notes | Done |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :----: |
| DISC-002 | Simplification | DNS discovery adds complexity with marginal gain | Medium | 402 challenge already provides discovery; consider dropping DNS TXT or marking experimental | Yes – ok with dropping |  |  |
| DISC-003 | Ambiguity | Well-known response caching vs dynamic capabilities | Low | If server adds/removes methods, how should clients invalidate cache? | YES | Should have short ttl – look at prior art |  |

---

# Implementation Plan

## Dependency Graph

```
PR1 (Core: Status Codes) ─────┐
                              │
PR2 (Core: Challenge Binding) ┼──► PR5 (Core: Body Binding) ──► PR7 (Intents)
                              │
PR3 (Core: Processing)  ──────┘
                                                                    │
PR4 (Core: Idempotency & Race) ─────────────────────────────────────┤
                                                                    │
PR6 (Core: Multi-Challenge & TLS) ──────────────────────────────────┤
                                                                    ▼
                                                              PR8 (Tempo)
                                                              PR9 (Stripe)  [parallel]
                                                              PR10 (Discovery)

PR0 (Global: Draft Names) ── can land anytime, no deps
```

---

## PR 0: Global Cleanup (no deps)
**Branch:** `fix/glob-draft-names`
**Items:** GLOB-001

| ID | Task |
|:---|:-----|
| GLOB-001 | Search all specs for `I-D.ietf-httpauth-payment` vs `I-D.httpauth-payment` and standardize |

**Files:** All spec files

---

## PR 1: Core - Status Codes & Error Handling
**Branch:** `fix/core-status-codes`
**Items:** CORE-009, CORE-012, CORE-021

| ID | Task |
|:---|:-----|
| CORE-009 | Add note: "Error details are provided in the response body using Problem Details {{RFC9457}} rather than in the `WWW-Authenticate` header." |
| CORE-012 | Replace current status code table with decision table. Change 400/401 cases to use 402 with fresh challenge. Only 403 for policy denial. Update "Failed Payment Verification" example from 401→402. |
| CORE-021 | Add paragraph in Security Considerations explaining that 402 with `WWW-Authenticate` follows same semantics as 401 for this scheme, but intermediaries may not cache/handle identically. |

**Files:** `specs/core/draft-httpauth-payment-00.md`

---

## PR 2: Core - Challenge Binding & Scope
**Branch:** `fix/core-challenge-binding`
**Items:** CORE-010, CORE-020
**Depends on:** PR 1

| ID | Task |
|:---|:-----|
| CORE-010 | In `id` parameter description, add: "Servers MUST associate each challenge `id` with the specific target URI and HTTP method for which it was issued. Servers MUST reject credentials where the target URI or HTTP method differs from the original challenge." |
| CORE-020 | Add: "Servers MUST verify that the credential's challenge `id` was issued for the same realm as the current request. Credentials MUST NOT be accepted across different realms." |

**Files:** `specs/core/draft-httpauth-payment-00.md`

---

## PR 3: Core - Processing & Validation
**Branch:** `fix/core-processing`
**Items:** CORE-001, CORE-005, CORE-016

| ID | Task |
|:---|:-----|
| CORE-001 | Remove restated ABNF for `challenge`, `auth-params`, `auth-param`. Reference RFC 9110 Section 11.3 instead. Keep only Payment-specific productions. |
| CORE-005 | Add new subsection "Processing Malformed Credentials": "Servers receiving malformed credentials (invalid base64url, non-UTF-8 content, or invalid JSON) MUST return 402 with a `malformed-credential` problem type and a fresh challenge. Implementations SHOULD limit the `request` parameter to 4096 bytes before encoding." |
| CORE-016 | Add: "Servers SHOULD allow a clock skew tolerance of up to 60 seconds when validating `expires` timestamps. Clients SHOULD submit credentials well before the stated expiry to account for network latency." |

**Files:** `specs/core/draft-httpauth-payment-00.md`

---

## PR 4: Core - Idempotency & Race Conditions
**Branch:** `fix/core-idempotency`
**Items:** CORE-011, CORE-022

| ID | Task |
|:---|:-----|
| CORE-011 | Add new section "Idempotency": "Servers MUST NOT perform side effects (database writes, external API calls) for requests that have not been paid. For non-idempotent methods (POST, PUT, DELETE), servers SHOULD accept an `Idempotency-Key` header to enable safe retries." |
| CORE-022 | Add: "Servers MUST ensure that concurrent requests with the same credential result in at most one successful payment settlement and one resource delivery. Implementations SHOULD use atomic operations or distributed locks to prevent race conditions." |

**Files:** `specs/core/draft-httpauth-payment-00.md`

---

## PR 5: Core - Request Body Binding
**Branch:** `fix/core-body-binding`
**Items:** CORE-013, CORE-019
**Depends on:** PR 2

| ID | Task |
|:---|:-----|
| CORE-013 | Add new section "Request Body Binding": For non-idempotent methods, explain that credentials are bound to the request that triggered the challenge. |
| CORE-019 | Add optional `body_hash` field to challenge parameters. "For POST, PUT, PATCH requests, servers MAY include a `body_hash` parameter containing the SHA-256 hash of the expected request body. When present, servers MUST reject credentials submitted with a different request body." |

**Files:** `specs/core/draft-httpauth-payment-00.md`

---

## PR 6: Core - Multiple Challenges & TLS
**Branch:** `fix/core-multi-challenge-tls`
**Items:** CORE-014, CORE-018

| ID | Task |
|:---|:-----|
| CORE-014 | Add: "When a server returns multiple Payment challenges, clients SHOULD select one based on their capabilities and preferences. Clients MUST send only one `Authorization` header. Servers receiving multiple Payment credentials in a single request SHOULD reject with 400." |
| CORE-018 | Add to Security Considerations: "This specification REQUIRES TLS 1.2 {{RFC5246}} or later for all Payment authentication flows. Implementations MUST NOT transmit Payment credentials over unencrypted connections. Servers SHOULD NOT log credential values." |

**Files:** `specs/core/draft-httpauth-payment-00.md`

---

## PR 7: Intent Specs - Amount & Schema Cleanup
**Branch:** `fix/intent-amount-schema`
**Items:** INT-001, CHARGE-001, CHARGE-002, AUTH-001, AUTH-002, SUB-001, SUB-002, SUB-003
**Depends on:** PR 5

| ID | Task |
|:---|:-----|
| INT-001 | Clarify that intent specs define flow semantics only; `request` schema is method-specific. Remove generic field definitions from intent specs. |
| CHARGE-001 | Change `amount` type from "string/number" to "string" |
| CHARGE-002 | Add: "The `amount` field MUST be a string containing a non-negative integer representing the amount in the asset's smallest unit (e.g., cents for USD, wei for ETH, satoshis for BTC). Implementations MUST NOT use floating-point representations to avoid precision loss." |
| AUTH-001 | Add: "Revocation mechanisms are defined by payment method specifications." |
| AUTH-002 | Add SHOULD-level guidance: "Authorization windows SHOULD NOT exceed 7 days for card-based methods or 30 days for token-based methods." |
| SUB-001 | Specify `period` as integer seconds. Add informative table with named constants (daily=86400, weekly=604800, monthly=2592000). |
| SUB-002 | Define exact values: monthly=2592000s (30 days), yearly=31536000s (365 days). Note these are fixed durations, not calendar periods. |
| SUB-003 | Add: "Retry policies for failed subscription payments are defined by payment method specifications." |

**Files:** `specs/intents/draft-payment-intent-charge-00.md`, `specs/intents/draft-payment-intent-authorize-00.md`, `specs/intents/draft-payment-intent-subscription-00.md`

---

## PR 8: Tempo Method Updates
**Branch:** `fix/tempo-method`
**Items:** TEMPO-003, TEMPO-004, TEMPO-007
**Depends on:** PR 7

| ID | Task |
|:---|:-----|
| TEMPO-003 | Add `chain` field to all request schemas using CAIP-2 format (e.g., `"chain": "eip155:42431"`). Add CAIP-2 informative reference. Update all examples. |
| TEMPO-004 | Add error handling: "If `feePayer: true` but server cannot pay fees (insufficient balance, rate limited), server MUST return 402 with problem type `fee-payment-unavailable` and a fresh challenge with `feePayer: false`." |
| TEMPO-007 | Add to Security Considerations: "Servers offering fee payment MUST validate transaction structure before signing fee commitments. Servers SHOULD implement rate limiting per client address to prevent griefing attacks." |

**Files:** `specs/methods/draft-tempo-payment-method-00.md`

---

## PR 9: Stripe Method Cleanup
**Branch:** `fix/stripe-method`
**Items:** STRIPE-002, STRIPE-003, STRIPE-004, STRIPE-005
**Depends on:** PR 7

| ID | Task |
|:---|:-----|
| STRIPE-002 | Remove "Stripe Business Network Registry" IANA section entirely. Business network IDs are Stripe-internal. |
| STRIPE-003 | Add clarification: "This payment method relies on Stripe's proprietary APIs and Stripe.js for payment token creation. Implementations require a Stripe account and API keys." |
| STRIPE-004 | Add: "The `businessNetwork` field is a Stripe-specific identifier for merchant networks participating in Stripe's business payment programs. This field is OPTIONAL and only applicable to Stripe business accounts." |
| STRIPE-005 | Add: "Authorization validity periods vary by payment method: card authorizations typically expire after 7 days; bank transfers may have different windows. Servers SHOULD consult Stripe documentation for method-specific guidance." |

**Files:** `specs/methods/draft-stripe-payment-method-00.md`

---

## PR 10: Discovery Simplification
**Branch:** `fix/discovery-simplify`
**Items:** DISC-002, DISC-003
**Depends on:** PR 1

| ID | Task |
|:---|:-----|
| DISC-002 | Remove DNS TXT record discovery section entirely. Keep only `/.well-known/payment-methods` and 402 challenge discovery. |
| DISC-003 | Add caching guidance: "Servers SHOULD return `Cache-Control: max-age=300` (5 minutes) for `/.well-known/payment-methods` responses. Clients SHOULD respect cache headers and refetch when capabilities change." |

**Files:** `specs/extensions/draft-payment-discovery-00.md`

---

## Summary: PR Order

```
Can land in any order (no deps):
  PR0: Global draft names

Stack 1 (Core):
  PR1: Status codes & errors
    └── PR2: Challenge binding
          └── PR5: Body binding
    └── PR3: Processing & validation
  PR4: Idempotency (parallel to PR2/PR3)
  PR6: Multi-challenge & TLS (parallel)

Stack 2 (Depends on Core):
  PR7: Intent specs (after PR5)
    ├── PR8: Tempo method
    └── PR9: Stripe method

Stack 3 (Independent):
  PR10: Discovery (after PR1)
```

| PR | Branch | Items | Depends On |
|:---|:-------|:------|:-----------|
| 0 | `fix/glob-draft-names` | GLOB-001 | - |
| 1 | `fix/core-status-codes` | CORE-009, CORE-012, CORE-021 | - |
| 2 | `fix/core-challenge-binding` | CORE-010, CORE-020 | PR1 |
| 3 | `fix/core-processing` | CORE-001, CORE-005, CORE-016 | PR1 |
| 4 | `fix/core-idempotency` | CORE-011, CORE-022 | - |
| 5 | `fix/core-body-binding` | CORE-013, CORE-019 | PR2 |
| 6 | `fix/core-multi-challenge-tls` | CORE-014, CORE-018 | - |
| 7 | `fix/intent-amount-schema` | INT-001, CHARGE-001/002, AUTH-001/002, SUB-001/002/003 | PR5 |
| 8 | `fix/tempo-method` | TEMPO-003, TEMPO-004, TEMPO-007 | PR7 |
| 9 | `fix/stripe-method` | STRIPE-002/003/004/005 | PR7 |
| 10 | `fix/discovery-simplify` | DISC-002, DISC-003 | PR1 |
