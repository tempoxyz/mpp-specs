import IntentSubscription.Model
/-
  Inductive invariant over all reachable states (every guard on).
  * SubInv: what holds for one activated subscription.
  * Inv: SubInv for every subscription, plus the Challenge, charge, receipt and access logs.
  * inv_step: one case split over step (one goal per action and guard outcome), each closed
    by grind; reachable_inv: induction on Reachable.
-/
namespace IntentSubscription

/-- The period index never decreases as time passes. -/
theorem cur_mono (s : Sub) {t t' : Nat} (h : t ≤ t') : s.cur t ≤ s.cur t' :=
  Nat.div_le_div_right (by omega)

/-- Invariant of subscription sid with record s. -/
structure SubInv (st : St) (sid : Nat) (s : Sub) : Prop where
  /-- subscriptionIds are allocated below nextSub -/
  lt_next : sid < st.nextSub
  /-- activation happened in the past -/
  anchor_le : s.anchor ≤ st.now
  /-- no period after the current one has been charged -/
  paid_le_cur : s.lastPaid ≤ s.cur st.now
  /-- the terms come from a grant the payer signed for an issued Challenge -/
  authorized : ∃ c ∈ st.creds, c.payer = s.payer ∧ c.chal.req = s.req ∧ c.chal.id = s.chal ∧
    c.chal ∈ st.issued
  /-- the Challenge that activated it is consumed -/
  chal_used : s.chal ∈ st.usedChal
  /-- after a cancellation at period r, nothing beyond r is charged or chargeable -/
  cancel : (s.cancelReq = none ∧ s.cancelEff = none) ∨
    ∃ r e, s.cancelReq = some r ∧ s.cancelEff = some e ∧ s.lastPaid ≤ r ∧ e ≤ r + 1

/-- Global invariant. -/
structure Inv (st : St) : Prop where
  fresh : ∀ sid, st.nextSub ≤ sid → st.subs sid = none
  subs : ∀ sid s, st.subs sid = some s → SubInv st sid s
  /-- one Challenge, one subscription -/
  chal_inj : ∀ i j si sj, st.subs i = some si → st.subs j = some sj → si.chal = sj.chal → i = j
  /-- every charge matches its subscription's terms -/
  charges : ∀ c ∈ st.charges, ∃ s, st.subs c.sub = some s ∧ c.period ≤ s.lastPaid ∧
    c.payer = s.payer ∧ c.amount = s.req.amount ∧ c.currency = s.req.currency ∧
    c.recipient = s.req.recipient ∧ before s.req.subExp c.time = true ∧
    (∀ r, s.cancelReq = some r → c.period ≤ r)
  /-- newer charges of one subscription are for strictly later periods -/
  ordered : st.charges.Pairwise (fun a b => a.sub = b.sub → b.period < a.period)
  /-- every receipt has its charge -/
  receipts : ∀ r ∈ st.receipts, ∃ c ∈ st.charges, c.sub = r.sub ∧ c.period = r.period ∧
    c.amount = r.amount
  /-- every delivery went to the payer for a charged period -/
  served : ∀ a ∈ st.served, ∃ s, st.subs a.sub = some s ∧ a.caller = s.payer ∧
    ∃ c ∈ st.charges, c.sub = a.sub ∧ c.period = a.period

/-- The initial state satisfies Inv. -/
theorem inv_init : Inv St.init := by
  constructor <;> simp [St.init]

/-- Every successful step preserves Inv (every guard on). -/
theorem inv_step {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {a : Act}
    (hI : Inv s) (h : step cfg s a = some s') : Inv s' := by
  obtain ⟨hf, hs, hinj, hc, ho, hr, hsv⟩ := hI
  -- one goal per action and guard outcome; the rejecting branches close by cases h
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h
  -- one goal per field of Inv
  all_goals refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  -- SubInv goals: open the structure, then grind each field
  all_goals try (intro sid t ht; refine ⟨?_, ?_, ?_, ?_, ?_, ?_⟩)
  -- receipts and charges with a new head: split the membership first
  all_goals try (intro x hx; rcases List.mem_cons.1 hx with rfl | hx)
  -- a new receipt or charge: name its witness; tick: the period index only grows (cur_mono);
  -- everything else: grind reads updated maps through upd_apply and uses the guards
  all_goals first
    | exact ⟨_, List.mem_cons_self .., rfl, rfl, rfl⟩
    | exact ⟨_, upd_same .., by grind [before, hg.expiry]⟩
    | exact Nat.le_trans (hs sid t ht).paid_le_cur (cur_mono t (Nat.le_add_right _ _))
    | grind [SubInv, Sub.cur, upd_apply, before, List.pairwise_cons, hg.current,
      hg.bounded, hg.expiry]

/-- Every reachable state satisfies Inv (every guard on). -/
theorem reachable_inv {cfg : Cfg} (hg : cfg.Guarded) {s : St} (h : Reachable cfg s) : Inv s := by
  induction h with
  | init => exact inv_init
  | step a _ hs ih => exact inv_step hg ih hs

end IntentSubscription
