import TempoSession.Model
import TempoSession.Counterexamples
/-
  Witnesses: the guarded model is not vacuous. Every theorem in Properties.lean assumes
  Cfg.Guarded; a guard written too strictly (one that rejects a call the spec allows) would
  make those theorems easier to prove and less meaningful, without breaking any of them. Each
  theorem here runs the guarded model on one fixed trace and checks, by 'decide', that its
  legitimate calls succeed, so a guard that rejects one of these calls breaks the build. They
  cover only these traces: a guard that rejects an allowed call outside them goes unnoticed.
  Also checked: the guarded configurations satisfy Cfg.Guarded, and the boundary calls just
  outside the rules (withdraw one second early, a raise below minDelta) are rejected.
-/
namespace TempoSession.Witnesses
open TempoSession TempoSession.Examples

/-- The configuration the counterexamples use satisfies every guard, so the theorems apply
  to it. -/
theorem guarded_ok : guarded.Guarded := ⟨rfl, rfl, rfl, rfl, rfl, by decide⟩

/-- A guarded configuration with a nonzero minVoucherDelta, so the raise rule is exercised. -/
def strict : Cfg := { guarded with minDelta := 5 }
/-- strict also satisfies every guard. -/
theorem strict_ok : strict.Guarded := ⟨rfl, rfl, rfl, rfl, rfl, by decide⟩

/-- A trace that uses every action with all guards on: open, sign, accept (two raises), charge,
  settle, topUp, requestClose, newSession, tick, and a topUp of 0 that cancels the pending
  close. Ends with deposit 110, settled 30, accepted 60, spent 50. -/
def trAll : List Act :=
  [.openCh PAYER k 100, .sign (v 30), .sign (v 60), .accept k (v 30), .charge k 20,
   .accept k (v 60), .charge k 30, .settle PAYEE k (v 30), .topUp PAYER k 10,
   .requestClose PAYER k, .newSession k, .tick 5, .topUp PAYER k 0]

/-- Every action in trAll succeeds under the guarded model. -/
theorem W_every_action : (run strict St.init trAll).isSome = true := by decide

/-- A channel whose vouchers a delegated key signs (authorizedSigner = 9, §6.6). -/
def kd : Key := { k with salt := 8, authSigner := 9 }
/-- A voucher for kd signed by the delegated key. -/
def vd (amt : Nat) : Sig :=
  { signer := 9, v := { chainId := CHAIN, escrow := ESCROW, chan := kd, amount := amt } }

/-- A delegated-signer channel works end to end: open, the delegated key signs, accept, charge,
  and a cooperative close that captures spent = 30 from the 40 voucher. -/
theorem W_delegated_signer :
    check strict [.openCh PAYER kd 100, .sign (vd 40), .accept kd (vd 40), .charge kd 30,
      .close PAYEE kd (vd 40) 30]
      (fun st => st.paid kd == 30 && st.refunded kd == 70) = some true := by decide

/-- A replayed voucher (the same 60) is accepted as an idempotent retry (§11.4). -/
theorem W_accept_replay : (run strict St.init (trAll ++ [.accept k (v 60)])).isSome = true := by
  decide

/-- A raise below minVoucherDelta (60 → 62 with minDelta 5) is rejected (§11.3 step 6). -/
theorem W_accept_below_minDelta : rejectedAt strict (trAll ++ [.sign (v 62), .accept k (v 62)])
    (trAll.length + 1) = true := by decide

/-- A cooperative close capturing max(spent 50, settled 30) = 50 with the 60 voucher succeeds,
  pays the payee 50 in total and refunds the payer 110 - 50 = 60. -/
theorem W_close_capture :
    check strict (trAll ++ [.close PAYEE k (v 60) 50])
      (fun st => st.paid k == 50 && st.refunded k == 60 && st.finals k == 1) = some true := by
  decide

/-- A voucher nobody signed, for k at amount 0. -/
def unsigned : Sig :=
  { signer := 77, v := { chainId := CHAIN, escrow := ESCROW, chan := k, amount := 0 } }

/-- A close that captures nothing new (cap = settled = 0) needs no signature, as in TIP-1034:
  it refunds the whole deposit. -/
theorem W_close_unsigned :
    check strict [.openCh PAYER k 100, .close PAYEE k unsigned 0]
      (fun st => st.paid k == 0 && st.refunded k == 100) = some true := by decide

/-- The forced close: requestClose, wait the 900 s grace period, withdraw. The payer gets
  deposit - settled = 110 - 30 = 80. -/
theorem W_withdraw_after_grace :
    check strict (trAll ++ [.requestClose PAYER k, .tick 900, .withdraw PAYER k])
      (fun st => st.paid k == 30 && st.refunded k == 80 && st.finals k == 1) = some true := by
  decide

/-- One second before the grace period ends, withdraw is rejected. -/
theorem W_withdraw_early :
    rejectedAt strict (trAll ++ [.requestClose PAYER k, .tick 899, .withdraw PAYER k])
      (trAll.length + 2) = true := by decide

/-- A repeat requestClose keeps the first request's time: the withdraw 900 s after the first
  request succeeds although a second request came 900 s later (§6.4.5 with #399, TIP-1034). -/
theorem W_repeat_requestClose_keeps_timer :
    (run strict St.init [.openCh PAYER k 100, .requestClose PAYER k, .tick 900,
      .requestClose PAYER k, .withdraw PAYER k]).isSome = true := by decide

end TempoSession.Witnesses
