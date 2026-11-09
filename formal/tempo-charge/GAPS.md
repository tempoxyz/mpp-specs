# Spec gaps

Each row is a rule draft-tempo-charge-00 leaves out. With its guard off, `TempoCharge/Counterexamples.lean` holds a `decide`-checked trace that breaks the named property; with the guard on, the same trace is rejected at the guarded step (`rejectedAt`), or for row 2 runs without a receipt. Row 5 holds with every guard on; row 6 is wording.

| # | Where | Gap | Guard (`Cfg`) | Breaks | Counterexample |
|---|---|---|---|---|---|
| 1 | §Hash Verification; core §Replay Protection | A settled transaction's hash is not refused again: one payment settles a pull challenge and then a hash challenge with the same request | `txSingleUse` | P3 | `G1_violates_P3`, `G1_guard_rejects` |
| 2 | §Settlement Procedure, §Transaction Verification | Pull settlement never requires the broadcast transaction to succeed (only hash settlement does); a reverted transfer gets a receipt | `pullNeedsSuccess` | P1 | `G2_violates_P1`, `G2_guard_no_receipt` |
| 3 | §Proof Verification | No amount check: a free proof settles a non-zero challenge (only clients are told not to) | `proofOnlyZero` | P1 | `G3_violates_P1`, `G3_guard_rejects` |
| 4 | §Ordering, §Transaction Verification step 6, §Hash Verification | Required transfers are not matched one-to-one: two identical splits are satisfied by one transfer, so less than `amount` is paid | `splitsOneToOne` | P1 | `G4_violates_P1`, `G4_guard_rejects` |
| 5 | §Hash Verification, §Hash Payload | A hash credential is bound to neither payer nor challenge: an observer claims another client's public transfer (even one older than its challenge) and the payer's own credential is then refused | none: every guard on | payer gets nothing for its payment | `Gap5_observer_claims_payment`, `Gap5_payer_rejected` |
| 6 | §Shared Fields, §Method Details; intent §Shared Fields | `expires` stays optional (core SHOULD), though the intent calls it REQUIRED for blockchain methods and `validBefore` "no later than `expires`" needs it | modelled: `expires` always present | wording | — |

- Row 1: with the guard, the server records every transaction it settles (pull or push) and refuses a hash credential naming one. Nonce consumption only stops a second broadcast.
- Row 2: with the guard, a reverted pull transaction leaves the challenge open and issues no receipt; the sponsor still paid its fee (§Server-Paid Fees, Denial of Service).
- Row 4: `splits[i]` entries with equal recipient and amount are allowed (only sum < `amount` and each > 0 are required). A split recipient equal to the primary recipient with an equal amount fails the same way.
- Row 5: closing it needs the transfer to commit to the challenge (for example a memo derived from the challenge id) or to the `source` account with `source` authenticated; the draft requires neither. Pull and proof credentials are not affected.
