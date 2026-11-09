# Tempo session formal model

A Lean 4 model of [draft-tempo-session-00](../../specs/methods/tempo/draft-tempo-session-00.md): the escrow contract (open, settle, topUp, close, requestClose, withdraw), voucher signatures, and the server's voucher acceptance and accounting. Lean checks every proof.

## Run

```bash
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
bash formal/tempo-session/check.sh   # clean build plus axiom audit; prints OK
```

- `lean-toolchain` pins Lean, and elan installs it on first build. There are no dependencies (no Mathlib).
- A clean build takes about 20 s.
- CI (`.github/workflows/formal.yml`) runs `check.sh` on every pull request that touches `formal/`.

## What it checks

- `TempoSession/Audit.lean` fails the build when any declaration is an axiom or depends on one beyond Lean's three standard axioms. That rules out `sorry`, `admit` and `native_decide`.
- `check.sh` fails when a module isn't imported by `Audit.lean`, so every module is audited.

## Files

| File | Contents |
|---|---|
| `Model.lean` | State, actions and the computable `step` function, with § citations; `Reachable` |
| `Invariant.lean` | Inductive invariant `Inv`, proved for every reachable state |
| `Properties.lean` | P1–P9, below |
| `Counterexamples.lean` | One trace per spec gap with its guard off, checked by `decide` ([GAPS.md](./GAPS.md)) |
| `Audit.lean` | Axiom audit |

## Properties

Every theorem holds for all reachable states with the guards on (`Cfg.Guarded`).

| # | Property | Theorems |
|---|---|---|
| P1 | The payee never gets more than a signed voucher | `P1_payee_le_signed` |
| P2 | Funds are conserved | `P2_conservation` |
| P3 | Settled and accepted amounts only grow; lower vouchers and replays are rejected | `P3_*` |
| P4a | The payer can always force-close: requestClose, wait the grace period, withdraw | `P4_withdraw_enabled`, `P4_forced_close_path` |
| P4b | A finalized channel refunds exactly deposit − settled | `P4_refund_is_deposit_minus_settled` |
| P5 | A voucher only pays its own channel, escrow and chain | `P5_*` |
| P6 | A channel finalizes at most once and is frozen after | `P6_finalize_at_most_once`, `P6_finalized_frozen` |
| P7 | topUp keeps P1–P6, and a finalized channel holds no residual funds | `P7_*` |
| P8 | Service delivered ≤ accepted amount | `P8_delivered_le_accepted` |
| P8a | The accepted amount is within the deposit and backed by a valid voucher | `P8a_accepted_backed` |
| P8b | withdraw needs a close request at least a grace period old; the payee can always settle the accepted voucher | `P8b_*` |
| P8c | No delivery while a close is pending (with `guardDelivery`) | `P8c_no_delivery_while_closing` |
| P9 | close captures ≤ max(settled, delivered) | `P9_capture_le_consumed` |

## Modelling choices

- keccak256 is injective, so a channel ID is its preimage (`Key`).
- Signatures are unforgeable: only `Act.sign` adds to the signed set.
- uint256 subtraction is checked, so an underflow reverts.
- The server reads chain state with no lag; reorgs aren't modelled.
- Token transfers are ghost counters (`paid`, `refunded`, `deposited`) per channel.
