# Formal models

Lean 4 models of MPP drafts, one Lake project per draft. Each proves the draft's security properties for every reachable state, and shows each rule the draft leaves out with a counterexample (its `GAPS.md`).

| Model | Draft |
|---|---|
| [core](./core) | Shared definitions and the proof gate (no draft) |
| [intent-charge](./intent-charge) | Core scheme and the charge intent |
| [tempo-charge](./tempo-charge) | Tempo charge method |
| [tempo-session](./tempo-session) | Tempo session method |

- Run one: `bash formal/<model>/check.sh` (clean build, then the axiom audit).
- CI runs every `formal/*/check.sh` with the Lean release pinned in `.github/workflows/formal.yml`.
- Every model requires [core](./core) (`MppCore`): the state machine harness (`run`, `Reachable`), map updates (`upd`), and the shared gate (`core/check-lib.sh`, `core/Audit.lean`). Each model is audited together with `MppCore`.
- A new model requires `MppCore` in its `lakefile.toml`, has a short `check.sh` that calls `../core/check-lib.sh <Library>`, and keeps the same `lean-toolchain`.
