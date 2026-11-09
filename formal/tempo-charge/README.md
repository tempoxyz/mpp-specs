# Tempo charge formal model

A Lean 4 model of [draft-tempo-charge-00](../../specs/methods/tempo/draft-tempo-charge-00.md): pull (transaction), push (hash) and zero-amount proof credentials, fee sponsorship, splits, expiry and validBefore, replay rules and receipts, on top of the core scheme's challenge binding and the charge intent's single-use rule. Lean checks every proof.

## Run

~~~bash
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
bash formal/tempo-charge/check.sh   # clean build plus axiom audit; prints OK
~~~

- `lean-toolchain` pins Lean (same as `../tempo-session`). No dependencies (no Mathlib).
- `check.sh` and `Audit.lean` are `../tempo-session`'s with the library renamed: `warningAsError`, no `set_option`, no metaprogramming or `import Lean` in the library, and an axiom audit that rules out `sorry`, `admit`, `native_decide` and declared axioms.

## Files

| File | Contents |
|---|---|
| `Model.lean` | Requests, challenges, credentials, transactions, the computable `step` with § citations, `Reachable` |
| `Invariant.lean` | Inductive invariant `SysInv`, proved for every reachable state |
| `Properties.lean` | P1–P9, below, and the split arithmetic (`matchOne_amount`) |
| `Counterexamples.lean` | One `decide`-checked trace per gap ([GAPS.md](./GAPS.md)) |
| `Witnesses.lean` | Legitimate flows that succeed with every guard on, and boundary calls that fail |
| `Audit.lean` | Axiom audit, run by `check.sh` |

## What is modelled

- Server: issues challenges (fresh id, its realm, valid request: splits each > 0 with sum < amount, at least one mode), and handles one credential per step: binding (echo = issued), unused, not expired, then the method checks.
- Pull: §Transaction Verification steps 2–7, broadcast with the server's fee payer signature when `feePayer`, receipt.
- Push: §Hash Settlement limitations (no `feePayer`, `push` allowed) and §Hash Verification (successful receipt, matching Transfer events).
- Proof: §Proof Verification steps 1–4 with domain version 3 (account, challengeId, realm, chainId).
- Chain: TIP-20 balances, atomic transfers, 2D nonce consumption (a revert still consumes it), validBefore, chain id, fee sponsorship.

## What is abstracted

- Crypto is perfect: hashes are injective (a transaction is its hash; the challenge binding is equality), signatures unforgeable (only `signTx` / `signProof` add).
- Network: one server handles one credential per step (verify, broadcast, settle, deliver are atomic), so concurrent requests are serialized; a receipt stands for 200 + `Payment-Receipt` + resource.
- Chain: one chain, immediate finality, no reorgs; a transaction's calls are its transfers and their events (no swaps or smart wallets); fee amounts and fee tokens are not tracked, only who paid (`sponsored`).
- Not modelled: access-key proof signers (§Proof Verification step 5), ERC-1271, `Idempotency-Key`, `digest` / `opaque` / `header`, `externalId`, `description`.

## Properties

State properties hold for all reachable states with every guard on (`Cfg.Guarded`, four flags).

| # | Property | Theorems |
|---|---|---|
| P1 | A receipt means its challenge was paid: a successful on-chain transaction matching the request one-to-one, moving at least `amount` of `currency`; or, for a proof, a free challenge and a version 3 proof binding its id, realm and chain | `P1_receipt_paid`, `matchOne_amount` |
| P2 | At most one receipt per challenge (single use, no double delivery) | `P2_one_receipt_per_challenge` |
| P3 | At most one challenge per transaction, across pull and push (no double counting) | `P3_one_challenge_per_tx` |
| P4 | A receipt answers the submitted credential's challenge, which was issued with that exact echo, unused and unexpired; nothing else issues receipts; replayed, expired and tampered credentials are rejected | `P4_receipt_answers_challenge`, `P4_replay_rejected`, `P4_expired_rejected`, `P4_unbound_rejected` |
| P5 | Receipts and used challenges are permanent | `P5_monotone` |
| P6 | The server pays fees only for challenges with `feePayer: true`; hash credentials for those are rejected | `P6_sponsor_only_feePayer`, `P6_hash_feePayer_rejected` |
| P7 | A transaction lands only before its `validBefore`, so a client following §Method Details is never charged after `expires` | `P7_included_before_validBefore`, `P7_no_charge_after_expiry` |
| P8 | Proofs need `source` and must bind challenge id, realm, chain, signer = account and version 3 | `P8_proof_needs_source`, `P8_proof_binding` |
| P9 | Pull needs `pull` and push needs `push` in `supportedModes` | `P9_pull_needs_pull_mode`, `P9_hash_needs_push_mode` |

The one-step `*_rejected`, `P8` and `P9` theorems are sanity checks that `step` encodes the rule as the draft states it.

## Modelling choices

- Guards for rules the draft leaves out are `Cfg` flags, default on; each has a counterexample with it off ([GAPS.md](./GAPS.md)).
- `splits = []` means absent; `pull` / `push` stand for `supportedModes` (both true when omitted).
- A pull transaction that reverts stays on chain (nonce used, fee paid by the sponsor) and the challenge stays open, so a client can retry; §Server-Paid Fees accepts that fee risk.
- The server sponsors any pull transaction for a `feePayer` challenge; one with `sponsor = false` needs no fee payer.
- `expires` is always present (see GAPS.md row 6).
- `Challenge.client` is a ghost field (who asked), used only to state Gap 5.
