/-
  Point updates of maps modelled as functions (per channel, per challenge id).
-/
namespace MppCore

/-- Point update: k gets b, every other key is unchanged. -/
def upd {κ β : Type} [DecidableEq κ] (f : κ → β) (k : κ) (b : β) : κ → β :=
  fun k' => if k' = k then b else f k'

/-- Reading the updated key returns the new value. -/
@[simp] theorem upd_same {κ β : Type} [DecidableEq κ] (f : κ → β) (k : κ) (b : β) :
    upd f k b k = b := by simp [upd]

/-- Reading any other key returns the old value: the frame rule that keeps proofs per key. -/
@[simp] theorem upd_other {κ β : Type} [DecidableEq κ] (f : κ → β) (k k' : κ) (b : β)
    (h : k' ≠ k) : upd f k b k' = f k' := by simp [upd, h]

/-- Reading an updated map at any key, as one case split (the form grind uses). -/
theorem upd_apply {κ β : Type} [DecidableEq κ] (f : κ → β) (k k' : κ) (b : β) :
    upd f k b k' = if k' = k then b else f k' := rfl

end MppCore
