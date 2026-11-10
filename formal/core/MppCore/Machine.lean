/-
  The state machine every model is: a step function that takes one action and returns the next
  state, or none when a guard refuses it. run replays a trace; Reachable is the set of states a
  model can reach, and "holds in every reachable state" is proved by induction on it.
-/
namespace MppCore

/-- Run actions in order from st, stopping with none at the first refused one. -/
def run {σ α : Type} (next : σ → α → Option σ) : σ → List α → Option σ
  | st, [] => some st
  | st, a :: as => match next st a with
    | none => none
    | some st' => run next st' as

/-- Running no actions returns the state unchanged. -/
@[simp] theorem run_nil {σ α : Type} (next : σ → α → Option σ) (st : σ) :
    run next st [] = some st := rfl

/-- Running a, then the rest from wherever a leads. -/
@[simp] theorem run_cons {σ α : Type} (next : σ → α → Option σ) (st : σ) (a : α) (as : List α) :
    run next st (a :: as) = (match next st a with
      | none => none
      | some st' => run next st' as) := rfl

/-- States reachable from start: start, closed under successful steps. -/
inductive Reachable {σ α : Type} (next : σ → α → Option σ) (start : σ) : σ → Prop where
  | init : Reachable next start start
  | step {s s' : σ} (a : α) : Reachable next start s → next s a = some s' →
      Reachable next start s'

end MppCore
