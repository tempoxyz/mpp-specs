# Subscription intent formal model

A Lean 4 model of [draft-payment-intent-subscription-00](../../specs/intents/draft-payment-intent-subscription-00.md) on the core [Payment scheme](../../specs/core/draft-httpauth-payment-01.md): Challenges and Credentials, activation, renewal, cancellation, expiry, receipts and service delivery. Lean checks every proof.

## Run

```bash
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
bash formal/intent-subscription/check.sh   # clean build plus axiom audit; prints OK
```

- `lean-toolchain` pins Lean (same as `formal/tempo-session`). No dependencies, no Mathlib.
- `check.sh` and `Audit.lean` are `formal/tempo-session`'s with the library name changed: `warningAsError`, no `set_option`, no metaprogramming or `import Lean` in the library, and an axiom audit that rejects `sorry`, `axiom` and `native_decide`.

## Files

| File | Contents |
|---|---|
| `Model.lean` | State, actions, the computable `step`, with § citations; `Reachable` |
| `Invariant.lean` | Inductive invariant `Inv` (`SubInv` per subscription plus the logs), proved for every reachable state |
| `Properties.lean` | P1–P11, below |
| `Counterexamples.lean` | One trace per gap with its guard off, checked by `decide` ([GAPS.md](./GAPS.md)) |
| `Witnesses.lean` | Guarded traces where legitimate flows succeed and boundary calls are rejected |
| `Audit.lean` | Axiom audit, run by `check.sh` (not part of the library) |

## Properties

Every state property holds in all reachable states with the guards on (`Cfg.Guarded`: three flags).

| # | Property | Theorems |
|---|---|---|
| P1 | At most one charge per subscription and billing period | `P1_charges_ordered`, `P1_one_charge_per_period` |
| P2 | No charge beyond the authorization: at most one charge, and `amount`, per period begun since activation (no advance charges, no accumulated missed periods) | `P2_charges_le_elapsed`, `P2_collected_le_elapsed` |
| P3 | A charge pays exactly the amount, currency and recipient of the issued Challenge its Credential answers, from the payer who signed it | `P3_charge_matches_grant` |
| P4 | A Challenge activates at most one subscription; replayed, unsigned, unbound (tampered) and expired Credentials are rejected | `P4_*` |
| P5 | No charge for a period after the one in which the payer cancelled; a cancellation is never undone or postponed | `P5_no_charge_after_cancel`, `P5_cancel_sticky` |
| P6 | Every receipt matches a collected charge | `P6_receipt_backed` |
| P7 | Service only to the payer, only for a charged period | `P7_access_paid` |
| P8 | No charge once `subscriptionExpires` is reached | `P8_charge_before_expiry` |
| P9 | Fresh `subscriptionId` per activation | `P9_subscription_id_fresh` |
| P10 | Issuing a Challenge (unpaid request) has no other side effect | `P10_challenge_no_side_effect` |
| P11 | Renewal is idempotent: a retry or a missed period is rejected; `lastPaid` only grows | `P11_*` |

- One-step theorems that only read a guard back (`P4_*_rejected`, `P11_missed_period_rejected`) are sanity checks that `step` encodes the rule.
- 50 hand-written theorems; the audit counts 143 including generated equation lemmas.

## Abstractions

- Crypto is perfect: a Credential is in `St.creds` only if its payer signed it (`Act.sign`), and challenge binding holds exactly when the echoed Challenge equals an issued one.
- `realm`, `method`, `intent`, `digest`, `opaque` and `header` are folded into the Challenge's id and request.
- Network and payment rail are a ghost log (`St.charges`); a collected charge settles in the step that collects it. A failed renewal is a step that does not happen.
- Steps are atomic, so concurrent requests are interleavings of them.

## Modelling choices

- Periods have a fixed length `len` (`periodCount` × day or week). Calendar months are abstracted: proofs use only that the period index `(now - anchor) / len` never decreases (`cur_mono`).
- Renewal is server-initiated (`renew sid p`); with the guards on, `p` must be the current period.
- Cancellation is in period indices: `cancel` records the current period `r` and an effective period `e`; renewals need `p < e`. Only the first cancellation counts; the draft doesn't say what a second one does.
- Access after cancellation or expiry for an already-paid period is method-specific in the draft; the model allows it for a charged period.
- Client authentication for a `subscriptionId` is the `caller` argument of `serve` and `cancel`.
- One server; the challenge `expires` check is on the server (core §Status Codes), always.
