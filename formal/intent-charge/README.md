# Charge intent formal model

A Lean 4 model of the Payment HTTP authentication scheme ([draft-httpauth-payment-01](../../specs/core/draft-httpauth-payment-01.md)) with the charge intent ([draft-payment-intent-charge-00](../../specs/intents/draft-payment-intent-charge-00.md)), independent of any payment method. Lean checks every proof.

## Run

Install elan from a release, checking its SHA-256 as `.github/workflows/formal.yml` does (it pins the version and checksum), then:

~~~bash
bash formal/intent-charge/check.sh   # clean build plus axiom audit; prints OK
~~~

- `lean-toolchain` pins Lean (the same as `formal/tempo-session`). No dependencies, no Mathlib.
- A clean build takes about 5 s.

## What it checks

- `lakefile.toml` sets `warningAsError`: a `sorry` or an unused hypothesis fails the build.
- `Audit.lean` fails on any axiom beyond Lean's three standard ones, which rules out `sorry`, `admit` and `native_decide`.
- `check.sh` builds from clean, runs the audit as its own program over every module, and refuses `set_option`, `import Lean`, metaprogramming and `skipKernelTC`. Same rules as `formal/tempo-session`.

## Files

| File | Contents |
|---|---|
| `Model.lean` | Challenge, Credential, Receipt, the server's `check` and `step`, with § citations; `Reachable` |
| `Invariant.lean` | Inductive invariant `Inv`, proved for every reachable state and every `Cfg` |
| `Properties.lean` | P1–P8, below |
| `Counterexamples.lean` | One trace per gap with its guard off, checked by `decide` ([GAPS.md](./GAPS.md)) |
| `Witnesses.lean` | Legitimate flows that succeed with every guard on, and boundary cases that fail |
| `Audit.lean` | Axiom audit, run by `check.sh` (not part of the library) |

## What is modelled

- Unpaid request: 402 with a fresh challenge, and no other state change.
- Challenge parameters bound to the id: realm, method, intent, request (amount, currency, recipient), expires, digest, opaque, header.
- Credential verification in the order of core §Status Codes and charge §Server Responsibilities: binding, single use, expiry, credential field, body digest, then the method's proof check (amount, recipient, currency).
- 200 with a Payment-Receipt, or 402 with a problem type and a fresh challenge.
- Idempotency-Key retries served from the cached response.
- Anyone can make any payment, and payments are public (core §Threat Model).

## What is abstracted

- Crypto is perfect: the challenge id *is* its bound parameter tuple (an injective, unforgeable MAC), so a stateless HMAC server and a stateful one are the same model. `hmacInput` models the draft's string encoding separately (gap 8).
- The payment method is an opaque verifier: a payment is a record of what was paid and for which challenge. The method's own single-use rule (core §Replay Protection) is a check on spent payment refs.
- Network, TLS, parsing (`malformed-credential`), 401/403, caching, finality and chargebacks are not modelled.
- Each step is atomic, as core §Concurrent Request Handling requires.

## Properties

Every theorem holds for all reachable states with the guards on (`Cfg.Guarded`: five flags, [GAPS.md](./GAPS.md)).

| # | Property | Theorems |
|---|---|---|
| P1 | A Credential only pays the Challenge it answers, with a real payment | `P1_pays_own_challenge`, `P1_payment_real` |
| P2 | Every delivery answers a challenge this server issued (realm, method, charge); altered or unknown ids are refused | `P2_binding`, `P2_tampered_rejected`, `P2_unknown_rejected` |
| P3 | Every delivery is before its challenge's expiry, at most `ttl` after issue; expired ones get `payment-expired` | `P3_delivered_before_expiry`, `P3_expired_rejected` |
| P4 | At most one delivery per challenge and per payment; a replay gets `invalid-challenge` | `P4_single_use`, `P4_no_double_spend`, `P4_replay_rejected` |
| P5 | Amount, recipient and currency match the request and the target's price; body matches the digest; wrong field refused | `P5_matches_request`, `P5_matches_target_price`, `P5_digest`, `P5_wrong_field_rejected` |
| P6 | Receipts only on a 200 after verified payment; every error is a 402 with a fresh issued challenge and no receipt; deliveries only from an accepted credential | `P6_receipt_only_after_payment`, `P6_error_is_402_with_challenge`, `P6_delivery_only_after_check` |
| P7 | Unpaid requests and failed verifications only record a challenge; retries add no settlement or delivery | `P7_unpaid_request_only_records_challenge`, `P7_failed_no_effect`, `P7_retry_no_effect` |
| P8 | Challenge ids are unique | `P8_unique_ids` |

- One-step theorems (`*_rejected`, P6 delivery, P7) check that `check` and `step` encode each rule as the drafts state it.

## Modelling choices

- Used ids and spent payments are read off the delivery log, so single use cannot drift from what was delivered.
- The server keeps a used-id store even when it binds with HMAC: core §Status Codes requires `invalid-challenge` for an already-used id (gap 6).
- A credential in the wrong field counts as no credential (`payment-required`).
- A payment matches when the amount is equal, not greater.
- One server, one realm and method; `Cfg.price` is its route table. Clients' own checks (core §Amount Verification) are not modelled: the properties hold whatever clients pay.

