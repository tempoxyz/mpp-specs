# Formal models

Lean 4 models of MPP drafts, one Lake project per draft. Each proves the draft's security properties for every reachable state, and shows each rule the draft leaves out with a counterexample (its `GAPS.md`).

| Model | Draft |
|---|---|
| [intent-charge](./intent-charge) | Core scheme and the charge intent |
| [intent-subscription](./intent-subscription) | Subscription intent |
| [tempo-charge](./tempo-charge) | Tempo charge method |
| [tempo-session](./tempo-session) | Tempo session method |

- Run one: `bash formal/<model>/check.sh` (clean build, then the axiom audit).
- CI runs every `formal/*/check.sh` with the Lean release pinned in `.github/workflows/formal.yml`.
- A new model copies `check.sh` and `Audit.lean` from an existing one, renaming the library, and keeps the same `lean-toolchain`.
