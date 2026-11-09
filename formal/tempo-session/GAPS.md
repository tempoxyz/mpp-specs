# Spec gaps

Each row is a rule the draft left out. With its guard off, `TempoSession/Counterexamples.lean` holds a `decide`-checked trace that breaks the named property; with the guard on, the same trace runs up to the guarded step and that step reverts (`rejectedAt`). Row 8 is a wording gap with no trace.

| # | Where | Gap | Guard (`Cfg`) | Breaks | Counterexample |
|---|---|---|---|---|---|
| 1 | §6.4.6 | withdraw without a close request | `withdrawNeedsRequest` | P8b | `G1_withdraw_without_request` |
| 2 | §6.4 | settle, close or withdraw on a finalized channel | `guardFinalized` | P2, P6 | `G2_violates_P2`, `G2_violates_P6`, `G2c_violates_P2` |
| 3 | §6.4.2, §6.4.4 | settle bounds only in §14.1 | `guardBounds` | P2, P3 | `G4a_violates_P2`, `G4c_replay_accepted` |
| 4 | §6.4.3 | topUp on a finalized channel | `guardFinalized` | P4b, P6, P7 | `G2b_violates_P7`, `G2b_violates_P4b`, `G2b_violates_P6` |
| 5 | §12.1, §13.4 | accounting per session, not per channel | `spentPerChannel` | P8 | `G5_violates_P8` |
| 6 | §6.4.4, §13.2 | v1 close captures the whole voucher | none: the server's choice | P9 (v1) | `G6_violates_P9` |
| 7 | §6.4.1 | a channel ID can be reopened | `guardExists` | P1 | `G3_violates_P1` |
| 8 | core §11.3 | vouchers are idempotent, not single-use | — | wording | — |
| 9 | §6.4.5, §13.3 | repeat requestClose and minimum grace unstated | modelled: a repeat keeps the first time; `Cfg.Guarded` asks for grace ≥ 900 s | P4a | `closeReq_sticky`, `W_repeat_requestClose_keeps_timer` |
| 10 | §6.4.2, §13.2 | settle redeems unconsumed vouchers | every guard on | intent of §13.2 | `Gap10_settle_then_close_unconsumed` |
| 11 | §12.2 | delivery while a close is pending | `guardDelivery` | P8c | `G7_unpaid_delivery`, `G7_settle_too_late` |

- Row 6: the contract (TIP-1034) never checks consumption, and #399 resolves it with the server rule. A v2 server captures max(spent, settled) (`P9_capture_le_consumed`); a v1 server closes with the lowest accepted voucher at or above that. `G6_violates_P9` shows a v1 close of the full voucher, which the contract accepts.
- Row 9: the model now follows #399 and TIP-1034, so it is no longer a gap in the model.

[tempoxyz/mpp-specs#399](https://github.com/tempoxyz/mpp-specs/pull/399) adds every one of these rules to the draft.
