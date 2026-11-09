# MppCore

Definitions every model shares, and the gate that checks every model.

- `MppCore/Machine.lean`: `run` replays a trace through a model's step function; `Reachable` is the set of states a model can reach, which its invariant is proved over by induction.
- `MppCore/Fn.lean`: `upd`, the point update of a map modelled as a function, with its simp lemmas.
- `check-lib.sh`: builds a project from clean, refuses `set_option`, `import Lean`, metaprogramming and `skipKernelTC` in it and in `MppCore`, then runs the audit. Each model's `check.sh` calls it.
- `Audit.lean`: fails on any declared axiom or any axiom beyond Lean's three standard ones (ruling out `sorry`, `admit` and `native_decide`), and replays every declaration of the model and `MppCore` through Lean's kernel.

Domain types (Challenge, Credential, Receipt) stay in each model: each draft abstracts them differently, and sharing them would tie one model's proofs to another's.

```bash
bash formal/core/check.sh   # MppCore on its own; every model's check.sh also audits it
```
