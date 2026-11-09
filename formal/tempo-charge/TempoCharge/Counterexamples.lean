import TempoCharge.Model
import TempoCharge.Properties
/-
  Spec gaps as machine-checked counterexamples. Each trace runs on the executable model with
  ONE guard off and shows a property broken; with every guard on the same trace is rejected at
  the step the guard blocks (rejectedAt), or, for G2, runs without issuing a receipt. Gap 5
  holds with every guard on. All checked by 'decide' (kernel evaluation, no native code).
  GAPS.md maps each one to its section.
-/
namespace TempoCharge.Examples
open TempoCharge

-- Concrete instance: one server realm, one chain, one token.
def REALM : Nat := 1
def CHAIN : Nat := 4217
def TOKEN : Nat := 0x20c0
def PAYER : Nat := 2
def OBSERVER : Nat := 3
def MERCHANT : Nat := 10
def PLATFORM : Nat := 11

/-- Every guard on (the model the theorems are about). -/
def guarded : Cfg := { realm := REALM, chainId := CHAIN }

/-- 100 base units of TOKEN to MERCHANT, both modes, client pays fees. -/
def req : Request := { amount := 100, currency := TOKEN, recipient := MERCHANT, chainId := CHAIN }
/-- A challenge issued to PAYER. -/
def chA : Challenge := { id := 1, realm := REALM, request := req, expires := 100, client := PAYER }
/-- The same request issued to someone else under another id (a fixed-price resource). -/
def chB : Challenge := { chA with id := 2, client := OBSERVER }
/-- The payment for req, signed by PAYER. -/
def pay : Transfer := { token := TOKEN, dst := MERCHANT, amount := 100 }
def tx1 : Tx := { sender := PAYER, chainId := CHAIN, nonce := 0, calls := [pay] }

/-- Run tr from St.init and evaluate prop on the final state; none if a step fails. -/
def check (cfg : Cfg) (tr : List Act) (prop : St → Bool) : Option Bool :=
  (run cfg St.init tr).map prop

/-- cfg rejects tr exactly at action n: the first n actions succeed and action n fails. -/
def rejectedAt (cfg : Cfg) (tr : List Act) (n : Nat) : Bool :=
  match run cfg St.init (tr.take n), tr[n]? with
  | some st, some a => (step cfg st a).isNone
  | _, _ => false

-- Bool forms of the properties, so decide can evaluate them.
/-- P3: no transaction backs two receipts. -/
def p3 (st : St) : Bool := decide (st.receipts.filterMap (fun r => r.ref.txOf)).Nodup
/-- P1 (transaction part): every transaction receipt's transaction succeeded on chain. -/
def p1ok (st : St) : Bool :=
  st.receipts.all fun r => match r.ref with
    | .tx t => succeeded st t
    | .challenge _ => true
/-- P1 (proof part): every proof receipt is for a free challenge. -/
def p1free (st : St) : Bool :=
  st.receipts.all fun r => match r.ref, st.issued r.cid with
    | .challenge _, some c => c.request.amount == 0
    | _, _ => true
/-- P1 (amount part): every transaction receipt's transaction moved at least amount. -/
def p1amount (st : St) : Bool :=
  st.receipts.all fun r => match r.ref, st.issued r.cid with
    | .tx t, some c => decide (c.request.amount ≤ sumOn c.request.currency t.calls)
    | _, _ => true

/-! ### G1 — §Hash Verification: a settled transaction's hash is not refused again.
  The hash checks (successful receipt, matching Transfer events, push allowed, no feePayer)
  hold for any challenge with the same request, so one payment settles two challenges: here
  by pull for chA, then by hash for chB. Core §Replay Protection wants single-use proofs;
  the draft relies on nonce consumption, which stops a second broadcast, not a second claim. -/
def trG1 : List Act :=
  [.fund TOKEN PAYER 100, .issue chA, .issue chB, .signTx tx1,
   .submit { echo := chA, payload := .transaction tx1 }, .submit { echo := chB, payload := .hash tx1 }]
def cfgG1 : Cfg := { guarded with txSingleUse := false }
/-- G1: with the guard off, one transaction backs two receipts (P3 broken). -/
theorem G1_violates_P3 : check cfgG1 trG1 p3 = some false := by decide
/-- G1: with every guard on, the second claim is rejected. -/
theorem G1_guard_rejects : rejectedAt guarded trG1 5 = true := by decide

/-! ### G2 — §Settlement Procedure: no rule that a pull transaction succeeded.
  §Hash Verification requires a successful receipt; the pull steps only say the transaction
  was "included in block". PAYER has no balance, so the transfer reverts (the sponsoring
  server even pays its fee), and a server that only checks inclusion delivers unpaid. -/
def reqF : Request := { req with feePayer := true, push := false }
def chF : Challenge := { chA with request := reqF }
def txF : Tx := { tx1 with sponsor := true }
def trG2 : List Act := [.issue chF, .signTx txF, .submit { echo := chF, payload := .transaction txF }]
def cfgG2 : Cfg := { guarded with pullNeedsSuccess := false }
/-- G2: with the guard off, a receipt backs a reverted transaction (P1 broken). -/
theorem G2_violates_P1 : check cfgG2 trG2 p1ok = some false := by decide
/-- G2: with every guard on, the same trace runs (the revert is on chain, the server paid the
  fee, as §Server-Paid Fees warns) but issues no receipt. -/
theorem G2_guard_no_receipt :
    check guarded trG2 (fun st => st.receipts.isEmpty && st.sponsored == [1]) = some true := by
  decide

/-! ### G3 — §Proof Verification: no amount check.
  Clients MUST NOT use a proof for a non-zero amount, but the server's five steps never look at
  the amount, so a free signature settles a paid challenge. -/
def proofA : ProofSig :=
  { signer := PAYER, account := PAYER, challengeId := 1, realm := REALM, chainId := CHAIN, version := 3 }
def trG3 : List Act :=
  [.issue chA, .signProof proofA, .submit { echo := chA, payload := .proof proofA, source := some (CHAIN, PAYER) }]
def cfgG3 : Cfg := { guarded with proofOnlyZero := false }
/-- G3: with the guard off, a 100-unit challenge gets a receipt for a proof (P1 broken), and
  MERCHANT received nothing. -/
theorem G3_violates_P1 :
    check cfgG3 trG3 (fun st => !p1free st && st.bal TOKEN MERCHANT == 0) = some true := by decide
/-- G3: with every guard on, the proof is rejected. -/
theorem G3_guard_rejects : rejectedAt guarded trG3 2 = true := by decide

/-! ### G4 — §Ordering, §Transaction Verification step 6: matching is not one-to-one.
  Two identical splits (10 each to PLATFORM, allowed: sum 20 < 30) are both "present" in one
  transfer of 10, so a transaction paying 20 passes a 30-unit challenge. -/
def reqS : Request :=
  { req with amount := 30, splits := [{ recipient := PLATFORM, amount := 10 }, { recipient := PLATFORM, amount := 10 }] }
def chS : Challenge := { chA with request := reqS }
def txS : Tx := { tx1 with calls := [{ pay with amount := 10 }, { pay with dst := PLATFORM, amount := 10 }] }
def trG4 : List Act := [.fund TOKEN PAYER 30, .issue chS, .signTx txS, .submit { echo := chS, payload := .transaction txS }]
def cfgG4 : Cfg := { guarded with splitsOneToOne := false }
/-- G4: with the guard off, a receipt backs a transaction that moved 20 of 30 (P1 broken). -/
theorem G4_violates_P1 :
    check cfgG4 trG4 (fun st => !p1amount st && st.bal TOKEN PAYER == 10) = some true := by decide
/-- G4: with every guard on, the transaction is rejected. -/
theorem G4_guard_rejects : rejectedAt guarded trG4 3 = true := by decide

/-! ### Gap 5 — §Hash Verification: a hash credential is bound to neither payer nor challenge.
  With every guard on: PAYER broadcasts tx1 for chA; before PAYER submits it, OBSERVER (who
  asked for chB, the same request) submits tx1's public hash and gets the resource; PAYER's own
  credential is then refused, since tx1 is spent. The transaction even predates chB. -/
def trGap5 : List Act :=
  [.fund TOKEN PAYER 100, .issue chA, .signTx tx1, .broadcast tx1, .issue chB,
   .submit { echo := chB, payload := .hash tx1 }, .submit { echo := chA, payload := .hash tx1 }]
/-- Gap 5: with every guard on, OBSERVER's claim of PAYER's transfer succeeds. -/
theorem Gap5_observer_claims_payment :
    check guarded (trGap5.take 6) (fun st => st.receipts == [⟨2, .tx tx1, 1⟩] &&
      tx1.sender != chB.client) = some true := by decide
/-- Gap 5: and PAYER's own credential for chA is then rejected. -/
theorem Gap5_payer_rejected : rejectedAt guarded trGap5 6 = true := by decide

end TempoCharge.Examples
