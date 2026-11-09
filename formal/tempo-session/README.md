# Tempo session formal model

A Lean 4 model of [draft-tempo-session-00](../../specs/methods/tempo/draft-tempo-session-00.md): the escrow contract (open, settle, topUp, close, requestClose, withdraw), voucher signatures, and the server's voucher acceptance and accounting. Lean checks every proof. Where the draft's contract text is silent, the contract steps follow TIP-1034 (`tempoxyz/tempo` `tips/tip-1034.md`, `tips/verify/src/TIP20ChannelReserve.sol`).

## Run

```bash
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
bash formal/tempo-session/check.sh   # clean build plus axiom audit; prints OK
```

- `lean-toolchain` pins Lean, and elan installs it on first build. There are no dependencies (no Mathlib).
- A clean build takes about 10 s.
- CI (`.github/workflows/formal.yml`) runs `check.sh` on every pull request that touches `formal/`.

## What it checks

- `lakefile.toml` sets `warningAsError`, so a `sorry`, a deprecated name or an unused hypothesis fails the build.
- `Audit.lean` fails when any declaration is an axiom or depends on one beyond Lean's three standard axioms. That rules out `sorry`, `admit` and `native_decide`.
- `check.sh` runs `Audit.lean` after the build as its own program, over every module under `TempoSession/` and the root. It imports only `Lean` and loads the built modules at run time, so no model module can redefine its syntax or print its result for it.
- `check.sh` fails when any file uses `set_option` (which could raise `maxHeartbeats` or turn warnings back off), imports `Lean`, runs metaprograms or names `skipKernelTC`: the audit doesn't re-check declarations in the kernel, so code that skipped the kernel check would pass it.

## Files

| File | Contents |
|---|---|
| `Model.lean` | State, actions and the computable `step` function, with § citations; `Reachable` |
| `Invariant.lean` | Inductive invariant `SysInv` (`Unopened` / `OpenInv` per channel), proved for every reachable state |
| `Properties.lean` | P1–P9, below |
| `Counterexamples.lean` | One trace per spec gap with its guard off, checked by `decide` ([GAPS.md](./GAPS.md)) |
| `Witnesses.lean` | Fixed traces in which every action succeeds with the guards on, so the guarded model is not vacuous |
| `../Audit.lean` | Axiom audit, run by `check.sh` (outside `TempoSession/`, not part of the library) |

## Proofs

- The invariant step and every property that ranges over all actions use one case split: `cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;> grind [...]`. That gives one goal per action and per guard outcome, and `grind` closes each one.
- Each `grind` lists what it unfolds (`ChanInv`, `OpenInv`, `step`, `upd_apply`, `ValidSig`) and the guards it relies on (`hg.finalized`, `hg.bounds`, ...).
- Proofs stay hand-written only where `grind` cannot finish: evaluating a three-step `run`, and naming a witness voucher.

## Properties

Every theorem holds for all reachable states with the guards on (`Cfg.Guarded`: five guard flags and a grace period of at least 900 s).

| # | Property | Theorems |
|---|---|---|
| P1 | The payee never gets more than a signed voucher | `P1_payee_le_signed` |
| P2 | Funds are conserved | `P2_conservation` |
| P3 | Settled and accepted amounts only grow; lower vouchers and replays are rejected | `P3_*` |
| P4a | The payer can always force-close: requestClose, wait the grace period, withdraw. Only a topUp the payer signed cancels a pending request; no other action does. The model treats a topUp as the payer's action whoever broadcasts it, so a payee holding a payer-signed topUp could still cancel the request: #399 bounds that with the topUp's expiring nonce (`validBefore`) and requires servers to broadcast a topUp at once | `P4_withdraw_enabled`, `P4_forced_close_path`, `closeReq_sticky` |
| P4b | A finalized channel refunds exactly deposit − settled | `P4_refund_is_deposit_minus_settled` |
| P5 | A voucher only pays its own channel, escrow and chain, as far as `Key` and the domain model them (see below) | `P5_*` |
| P6 | A channel finalizes at most once and is frozen after | `P6_finalize_at_most_once`, `P6_finalized_frozen` |
| P7 | topUp preserves the invariant, and a finalized channel holds no residual funds | `P7_*` |
| P8 | Service charged (`spent`, which bounds delivered service) ≤ accepted amount | `P8_delivered_le_accepted` |
| P8a | The accepted amount is within the deposit and backed by a valid voucher | `P8a_accepted_backed` |
| P8b | withdraw needs a close request at least a grace period old; the payee can always settle the accepted voucher | `P8b_*` |
| P8c | No delivery while a close is pending (with `guardDelivery`) | `P8c_no_delivery_while_closing` |
| P9 | A close whose capture follows the §13.2 server rule captures ≤ max(settled, spent) | `P9_capture_le_consumed` |

The one-step theorems that only read a guard back (`P3_*_rejected`, `P3_server_*`, `P5_*`, `P8b_withdraw_needs_request`, `P8c`) are sanity checks that `step` encodes the rule as the spec states it.

## Modelling choices

- keccak256 is injective, so a channel ID is its preimage (`Key`). `Key` includes the v2 `expiringNonceHash`, and a `Key` opens at most once, as in TIP-1034.
- Signatures are unforgeable: only `Act.sign` adds to the signed set.
- uint256 subtraction is checked, so an underflow reverts.
- close follows TIP-1034: settled ≤ capture ≤ cumulativeAmount and capture ≤ deposit, with a signature only when capture > settled. The §13.2 capture bound is the server's rule, not a contract check (P9).
- A repeat requestClose keeps the first request's time, as TIP-1034 does and [#399](https://github.com/tempoxyz/mpp-specs/pull/399) adds to §6.4.5. The draft without #399 resets the time on every call, which only lets the payer delay its own withdraw; `closeReq_sticky` holds for the amended draft.
- topUp only raises the deposit and leaves the accepted amount and `spent` unchanged, as [#399](https://github.com/tempoxyz/mpp-specs/pull/399) amends §11.2. The draft without #399 tells the server to credit the top-up to the available balance, which would let service exceed signed vouchers.
- `charge` persists `spent` and delivers in one step, so `delivered = spent` in every reachable state. The draft lets a server persist `spent` and crash before delivering; then service delivered can fall short of `spent` by that request's cost, and P8 and P9 bound `spent`, not delivered service.
- The server never accepts a voucher for, or charges on, a finalized channel, in every `Cfg`. The draft without #399 states no such check; #399's Cooperative Close forbids delivery once a close starts, which implies it (the model stops delivery only at finalization, or at a close request with `guardDelivery`). See [GAPS.md](./GAPS.md) row 13.
- There is one server, and it is every channel's payee: the payee and token checks of §11.1 Open Verification step 2 are assumed, not modelled. P8b shows `k.payee` can settle what the server accepted.
- The server reads chain state with no lag; reorgs aren't modelled.
- Token transfers are ghost counters (`paid`, `refunded`, `deposited`) per channel.
- The payee's operator isn't modelled, so `Key` omits the v2 descriptor's operator. The EIP-712 domain is (chainId, verifyingContract); its name and version aren't modelled. P5 covers only the components `Key` and `Voucher` hold: two channels that differ only by operator, or v1 and v2 domains of one contract address, aren't told apart.
