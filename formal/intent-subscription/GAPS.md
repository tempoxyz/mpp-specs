# Spec gaps

Each row is a rule the draft leaves out. With its guard off, `IntentSubscription/Counterexamples.lean` holds a `decide`-checked trace that breaks the named property; with the guard on, the same trace runs up to the guarded step and that step is rejected (`rejectedAt`). Rows 4–7 have no trace.

| # | Where | Gap | Guard (`Cfg`) | Breaks | Counterexample |
|---|---|---|---|---|---|
| 1 | §Renewal | Missed periods can't accumulate, but nothing stops charging future periods in advance | `renewCurrentOnly` | P2, P5 | `G1_violates_P2`, `G1_violates_P5` |
| 2 | §Cancellation | Effective time is method-defined with no bound (cancel is only SHOULD), so renewals can go on after a cancellation | `cancelBounded` (effective by the end of the current period) | P5 | `G2_violates_P5` |
| 3 | §Optional Fields, §Activation | `subscriptionExpires` only stops future periods; nothing refuses an activation once it is reached | `activateBeforeExpiry` | P8 | `G3_violates_P8` |
| 4 | §Cancellation | A repeated cancellation is unspecified; one could postpone the effective time | modelled: only the first counts | P5 | — |
| 5 | core §Optional Parameters, §Status Codes | `expires` is a client MUST; the server-side rejection is only in the status table | modelled: the server rejects | P4 | — |
| 6 | §Optional Fields | A period begun before `subscriptionExpires` may end after it: the payer pays a full period for a partial one | none | wording | — |
| 7 | §Credential Requirements, §Activation | The grant format is method-defined and need not commit to the Challenge: a grant re-wrapped onto a second issued Challenge with the same terms would activate a second subscription | modelled: a Credential is a signature over the echoed Challenge | P3, P4 | — |

- Rows 1–3 also have `G*_guard_rejects` with the guard on.
- Row 1: a charge in advance also survives a later cancellation (`G1_violates_P5`), contradicting "MUST NOT collect renewal charges for billing periods after cancellation takes effect".
- Row 2: the draft's Cancellation Example uses the end of the current paid period, which is the guard.
- Row 7: P3 and P4 assume the grant commits to the Challenge it answers. A method whose grant doesn't (for example a reusable mandate reference) relies on the single-use Credential check alone; the draft should require the binding.
