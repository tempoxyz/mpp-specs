import IntentSubscription.Model
/-
  Spec gaps as machine-checked counterexamples. Each trace runs with ONE guard flag off and
  breaks the named property; with every guard on, the same trace runs up to the guarded step
  and that step is rejected (rejectedAt). All checked by 'decide' (kernel evaluation, no
  native code, no extra axioms). GAPS.md maps each flag to its section.
-/
namespace IntentSubscription.Examples
open IntentSubscription

def PAYER : Nat := 1
def MERCHANT : Nat := 2
def USD : Nat := 840
/-- periodUnit = day, periodCount = 1 -/
def DAY : Nat := 86400

/-- Every guard on. -/
def guarded : Cfg := {}

/-- 100 base units per day to MERCHANT, no subscriptionExpires. -/
def req : Req := { amount := 100, currency := USD, recipient := MERCHANT, len := DAY, subExp := none }
/-- The first Challenge the server issues (id 0), with no expires. -/
def chal0 : Chal := ⟨0, req, none⟩
/-- A grant PAYER signs for chal0; n is the method payload nonce. -/
def cred (n : Nat) : Cred := ⟨chal0, PAYER, n⟩

/-- Run tr from St.init and evaluate prop; none if a step is rejected. -/
def check (cfg : Cfg) (tr : List Act) (prop : St → Bool) : Option Bool :=
  (run cfg St.init tr).map prop

/-- cfg rejects tr exactly at action n: the first n actions succeed and action n is rejected. -/
def rejectedAt (cfg : Cfg) (tr : List Act) (n : Nat) : Bool :=
  match run cfg St.init (tr.take n), tr[n]? with
  | some st, some a => (step cfg st a).isNone
  | _, _ => false

/-- Charges of subscription sid. -/
def chargesOf (st : St) (sid : Nat) : List Charge := st.charges.filter (fun c => c.sub == sid)

-- Bool forms of the theorems, so decide can evaluate them.
/-- P4: Challenge id activated at most one subscription. -/
def p4 (st : St) (id : Nat) : Bool :=
  decide (((List.range st.nextSub).filter (fun i => (st.subs i).any (·.chal == id))).length ≤ 1)
/-- P2: subscription sid has at most one charge per period begun. -/
def p2 (st : St) (sid : Nat) : Bool := match st.subs sid with
  | some t => decide ((chargesOf st sid).length ≤ t.cur st.now + 1)
  | none => true
/-- P5: no charge of sid for a period after the one in which it was cancelled. -/
def p5 (st : St) (sid : Nat) : Bool := match st.subs sid with
  | some t => match t.cancelReq with
    | some r => (chargesOf st sid).all (fun c => decide (c.period ≤ r))
    | none => true
  | none => true
/-- P8: every charge of sid happened before its subscriptionExpires. -/
def p8 (st : St) (sid : Nat) : Bool := match st.subs sid with
  | some t => (chargesOf st sid).all (fun c => before t.req.subExp c.time)
  | none => true

/-! ### G1 — §Single-Use makes the Credential single-use per Challenge, not the Challenge.
  Two grants for one Challenge (different payloads) activate two subscriptions, so one 402
  charges the payer twice for every period. -/
def trG1 : List Act :=
  [.issue req none, .sign (cred 0), .sign (cred 1), .activate (cred 0), .activate (cred 1)]
def cfgG1 : Cfg := { guarded with challengeSingleUse := false }
/-- G1: with the guard off, Challenge 0 activates two subscriptions (P4 broken). -/
theorem G1_violates_P4 : check cfgG1 trG1 (fun st => p4 st 0) = some false := by decide
/-- G1: and the payer pays 200 for period 0 of one Challenge whose amount is 100. -/
theorem G1_double_charge :
    check cfgG1 trG1 (fun st => (st.charges.map (·.amount)).sum == 200) = some true := by decide
/-- G1: with every guard on, the second activation is rejected. -/
theorem G1_guard_rejects : rejectedAt guarded trG1 4 = true := by decide

/-! ### G2 — §Renewal forbids accumulating missed periods but not charging future periods in
  advance. On day 0 the server collects periods 1 and 2 as well. -/
def trG2 : List Act :=
  [.issue req none, .sign (cred 0), .activate (cred 0), .renew 0 1, .renew 0 2]
def cfgG2 : Cfg := { guarded with renewCurrentOnly := false }
/-- G2: with the guard off, three charges in period 0 (P2 broken). -/
theorem G2_violates_P2 : check cfgG2 trG2 (fun st => p2 st 0) = some false := by decide
/-- G2: with every guard on, the advance renewal is rejected. -/
theorem G2_guard_rejects : rejectedAt guarded trG2 3 = true := by decide
/-- G2: a charge in advance also survives a later cancellation: the payer cancels in
  period 0, effective at once, and has still paid for periods 1 and 2 (P5 broken). -/
theorem G2_violates_P5 :
    check cfgG2 (trG2 ++ [.cancel PAYER 0 0]) (fun st => p5 st 0) = some false := by decide

/-! ### G3 — §Cancellation leaves the effective time to the method, with no bound. A
  cancellation effective at period 100 lets renewals continue after the payer cancelled. -/
def trG3 : List Act :=
  [.issue req none, .sign (cred 0), .activate (cred 0), .cancel PAYER 0 100, .tick DAY, .renew 0 1]
def cfgG3 : Cfg := { guarded with cancelBounded := false }
/-- G3: with the guard off, period 1 is charged after the payer cancelled in period 0
  (P5 broken). -/
theorem G3_violates_P5 : check cfgG3 trG3 (fun st => p5 st 0) = some false := by decide
/-- G3: with every guard on, the unbounded cancellation is rejected. -/
theorem G3_guard_rejects : rejectedAt guarded trG3 3 = true := by decide

/-! ### G4 — §Optional Fields stops subscriptionExpires authorizing future periods only; no
  rule refuses an activation once it is reached, so period 0 is charged after expiry. -/
def reqE : Req := { req with subExp := some 50 }
def credE : Cred := ⟨⟨0, reqE, none⟩, PAYER, 0⟩
def trG4 : List Act := [.issue reqE none, .sign credE, .tick 60, .activate credE]
def cfgG4 : Cfg := { guarded with activateBeforeExpiry := false }
/-- G4: with the guard off, the activation charge is collected at time 61, after
  subscriptionExpires = 50 (P8 broken). -/
theorem G4_violates_P8 : check cfgG4 trG4 (fun st => p8 st 0) = some false := by decide
/-- G4: with every guard on, the late activation is rejected. -/
theorem G4_guard_rejects : rejectedAt guarded trG4 3 = true := by decide

end IntentSubscription.Examples
