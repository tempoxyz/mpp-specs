import TempoSession.Model
/-
  Inductive invariant over all reachable states (for any Cfg with all guards on).

  Proof plan
  * ChanInv cfg st k: what must hold for one channel k (Unopened before open, OpenInv after);
    SysInv = ChanInv for every k.
  * inv_init: the empty escrow satisfies it.
  * inv_step: every successful step preserves it.
  * reachable_inv: induction on Reachable; every property in Properties.lean is then read off
    SysInv.

  inv_step states the case analysis once instead of one hand-written proof per action:
  split step into one goal per action and per guard outcome, discard the reverting ones, and
  let grind rebuild ChanInv in each successful one (frame rule for untouched channels, linear
  arithmetic and signature witnesses for the touched one).
-/
namespace TempoSession

/-- Invariant of a channel that was never opened: every ghost and server counter is still 0
  (nothing was paid, refunded, deposited, finalized, accepted, spent or delivered) and no
  voucher has been accepted. -/
structure Unopened (st : St) (k : Key) : Prop where
  paid : st.paid k = 0
  refunded : st.refunded k = 0
  deposited : st.deposited k = 0
  finals : st.finals k = 0
  accepted : st.accepted k = 0
  spent : st.spent k = 0
  delivered : st.delivered k = 0
  acceptedSig : st.acceptedSig k = none

/-- Invariant of an opened channel k with record c. The contract fields (paid_eq ..
  settled_signed, closeReq_le) back P1, P2, P4, P6, P7; the server fields (accepted_le ..
  accepted_signed) back P8, P8a, P8b, P9. -/
structure OpenInv (cfg : Cfg) (st : St) (k : Key) (c : Chan) : Prop where
  /-- The payee has received exactly the on-chain settled amount. -/
  paid_eq : st.paid k = c.settled
  /-- The channel never owes more than it holds. -/
  settled_le : c.settled ≤ c.deposit
  /-- The ghost inflow matches the on-chain deposit. -/
  deposited_eq : st.deposited k = c.deposit
  /-- The payer got the rest (deposit - settled) only at the end. -/
  refunded_eq : st.refunded k = if c.finalized then c.deposit - c.settled else 0
  /-- At most one finalization. -/
  finals_eq : st.finals k = if c.finalized then 1 else 0
  /-- Every payout is backed by a valid voucher for k of at least that amount. -/
  settled_signed : c.settled = 0 ∨ ∃ s, ValidSig cfg st.sigs k s ∧ c.settled ≤ s.v.amount
  /-- The server never accepts more than is locked. -/
  accepted_le : st.accepted k ≤ c.deposit
  /-- The server never charges past accepted vouchers. -/
  spent_le : st.spent k ≤ st.accepted k
  /-- With G5 on, spent is never reset, so it equals the service delivered. -/
  delivered_eq : st.delivered k = st.spent k
  /-- Nothing accepted yet, or the voucher the server persisted is itself valid for k and has
      amount = accepted: the server holds a redeemable voucher. -/
  accepted_signed : (st.acceptedSig k = none ∧ st.accepted k = 0) ∨
    ∃ s, st.acceptedSig k = some s ∧ ValidSig cfg st.sigs k s ∧ s.v.amount = st.accepted k
  /-- A pending close request was made in the past, so its grace period can run out. -/
  closeReq_le : ∀ r, c.closeReq = some r → r ≤ st.now

/-- Per-channel invariant: Unopened while k has no record, OpenInv once it has one. -/
def ChanInv (cfg : Cfg) (st : St) (k : Key) : Prop :=
  match st.chans k with
  | none => Unopened st k
  | some c => OpenInv cfg st k c

/-- The global invariant: ChanInv holds for every channel key. -/
def SysInv (cfg : Cfg) (st : St) : Prop := ∀ k, ChanInv cfg st k

/-- Base case: the empty escrow satisfies SysInv.
  * No channel exists and every counter is 0, so every channel is Unopened. -/
theorem inv_init (cfg : Cfg) : SysInv cfg St.init :=
  fun _ => ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- Adding a signature keeps a valid signature valid (sigs only grows).
  * Used by the sign case of inv_step: the witnesses of settled_signed and accepted_signed
    survive new signatures. -/
theorem validSig_cons {cfg sigs k s} (x : Sig) (h : ValidSig cfg sigs k s) :
    ValidSig cfg (x :: sigs) k s := by
  -- membership moves to the longer list; the other four conjuncts don't mention sigs
  obtain ⟨h1, h2⟩ := h; exact ⟨List.mem_cons_of_mem _ h1, h2⟩

/-- Inductive step: with all guards on, every successful step preserves SysInv.
  * Covers every action of step (§6.4.1-§6.4.6, §10.4, §11.3, §12.2, §13.4).
  * This is the heart of the development: every per-state property P1, P2, P4, P6, P8, P8b,
    P9 rests on it. -/
theorem inv_step {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {a : Act}
    (hI : SysInv cfg s) (h : step cfg s a = some s') : SysInv cfg s' := by
  intro k'
  have hi := hI k'
  -- One goal per action and per outcome of its guards: split every match and if of step;
  -- cases h then closes the reverting branches (none = some s') and substitutes s' in the
  -- others.
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    -- In each successful branch grind unfolds ChanInv for k' before and after, reads every
    -- updated map through upd_apply (k' = k is the touched channel, k' ≠ k is untouched),
    -- uses the branch's guards and the guard flags (G2 finalized, G3 fresh, G4 bounds, G5
    -- perChannel), and closes the arithmetic and the signature witnesses (validSig_cons for
    -- sign). Splits: the accept branch that raises 'accepted' needs more case splits than
    -- grind's default of 9.
    grind (splits := 16) [ChanInv, Unopened, OpenInv, upd_apply, validSig_cons,
      hg.finalized, hg.fresh, hg.bounds, hg.perChannel]

/-- Every reachable state satisfies SysInv (all guards on).
  * Induction on Reachable: inv_init for the base, inv_step for each successful step. -/
theorem reachable_inv {cfg : Cfg} (hg : cfg.Guarded) {s : St} (h : Reachable cfg s) :
    SysInv cfg s := by
  induction h with
  | init => exact inv_init cfg
  | step a _ hs ih => exact inv_step hg ih hs

end TempoSession
