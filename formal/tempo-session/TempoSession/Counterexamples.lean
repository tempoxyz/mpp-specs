import TempoSession.Model
/-
  Spec gaps as machine-checked counterexamples. Each trace runs on the executable model with
  ONE guard switched off (the literal reading of the §6.4.x function text), shows the property
  violated, and shows the same trace is rejected when the guard is on. All checked by 'decide'
  (kernel evaluation, no native code, no extra axioms). GAPS.md maps each flag to its spec gap.
-/
namespace TempoSession.Examples
open TempoSession

-- Concrete instance: one escrow, one chain, one payer and one payee.
def ESCROW : Nat := 0xE5C
def CHAIN : Nat := 4217
def PAYER : Nat := 1
def PAYEE : Nat := 2

/-- All guards on (the model the theorems are about). -/
def guarded : Cfg := { escrow := ESCROW, chainId := CHAIN, grace := 900, minDelta := 0 }

/-- The channel every trace uses (authSigner = 0: the payer signs). -/
def k : Key := { payer := PAYER, payee := PAYEE, token := 3, salt := 7, authSigner := 0 }
/-- A voucher for k signed by the payer (k.authSigner = 0, so the payer is the signer). -/
def v (amt : Nat) : Sig := { signer := PAYER, v := { chainId := CHAIN, escrow := ESCROW, chan := k, amount := amt } }

-- Boolean property checks on a state (Bool versions of the theorems, so decide can evaluate them)
-- p1: P1 (paid backed by a signed voucher); p2: P2 conservation; p4b: P4b refund =
-- deposit - settled once finalized; p7: P7 no residual funds once finalized; p8: P8 delivered
-- <= accepted. P6's "frozen" half is a step property: see movesAfterFinal.
def p1 (cfg : Cfg) (st : St) (k : Key) : Bool :=
  st.paid k == 0 || st.sigs.any (fun x => x.signer == k.signer && x.v.chan == k &&
    x.v.escrow == cfg.escrow && x.v.chainId == cfg.chainId && decide (st.paid k ≤ x.v.amount))
def p2 (st : St) (k : Key) : Bool := decide (st.paid k + st.refunded k ≤ st.deposited k)
def p4b (st : St) (k : Key) : Bool := match st.chans k with
  | some c => !c.finalized || st.refunded k == c.deposit - c.settled
  | none => true
def p7 (st : St) (k : Key) : Bool := match st.chans k with
  | some c => !c.finalized || st.paid k + st.refunded k == st.deposited k
  | none => true
def p8 (st : St) (k : Key) : Bool := decide (st.delivered k ≤ st.accepted k)

/-- A second channel of the same payer in the same escrow, used only to fund it.
  The model has no escrow token balance: transfers are ghost counters, so on its own a trace
  can pay out of one channel more than the escrow ever received. A real escrow's ERC-20
  transfer would revert then. The traces that overpay a channel (G2, G4a) therefore first open
  kFund with 100, so the escrow really holds the tokens the overpayment draws on (§6.1: one
  contract holds every channel), and escrowSolvent checks that it does. -/
def kFund : Key := { k with salt := 99 }
/-- The escrow, counting both channels the traces use, has paid out no more than it took in:
  every transfer in the trace is one a real token balance covers. -/
def escrowSolvent (st : St) : Bool :=
  decide (st.paid k + st.refunded k + st.paid kFund + st.refunded kFund ≤
    st.deposited k + st.deposited kFund)

/-- Run tr from the empty escrow and evaluate prop on the final state; none if a step reverts. -/
def check (cfg : Cfg) (tr : List Act) (prop : St → Bool) : Option Bool :=
  (run cfg St.init tr).map prop

/-- P6 "frozen" broken (Bool form of P6_finalized_frozen): after tr, channel k is finalized,
  the step a succeeds, and it changes k's record, one of its money counters or its finals
  count, the five things P6_finalized_frozen keeps fixed. -/
def movesAfterFinal (cfg : Cfg) (tr : List Act) (a : Act) : Bool :=
  match run cfg St.init tr with
  | none => false
  | some st => match st.chans k, step cfg st a with
    | some c, some st' => c.finalized &&
        (st'.chans k != st.chans k || st'.paid k != st.paid k ||
         st'.refunded k != st.refunded k || st'.deposited k != st.deposited k ||
         st'.finals k != st.finals k)
    | _, _ => false

/-! ### G1 — §6.4.6 withdraw has no "close was requested" precondition.
  closeRequestedAt = 0 when no close is pending, so 'now >= 0 + grace' holds on any real chain:
  the payer can withdraw everything at any time, after receiving service. The trace has no
  requestClose, so its success contradicts P8b_withdraw_needs_request (§14.6). -/
def trG1 : List Act :=
  [.openCh PAYER k 100, .sign (v 60), .accept k (v 60), .charge k 60, .tick 900, .withdraw PAYER k]
def cfgG1 : Cfg := { guarded with withdrawNeedsRequest := false }
/-- G1: with the guard off, the whole trace (withdraw with no close request) succeeds.
  * Proof: decide evaluates run in the kernel. -/
theorem G1_withdraw_without_request : (run cfgG1 St.init trG1).isSome = true := by decide
/-- G1: with every guard on, the same trace reverts (the final withdraw fails). -/
theorem G1_guard_rejects : (run guarded St.init trG1).isNone = true := by decide
/-- G1 alone gives no double withdraw: G2 is still on, so a second withdraw on the finalized
  channel reverts. GAPS.md row 1 breaks P8b only; the double refund (P2, P6) is G2's
  (G2c_violates_P2). -/
theorem G1_no_double_withdraw : (run cfgG1 St.init (trG1 ++ [.withdraw PAYER k])).isNone = true := by
  decide

/-! ### G2 — §6.4.2-6.4.6 never say settle/close/topUp/requestClose/withdraw revert on a
  finalized channel (only the informative ChannelFinalized error, Appendix B, and server-side
  checks in §11.1/§11.2). Literal reading: payee settles after the payer withdrew. -/
def trG2pre : List Act :=
  [.openCh PAYER kFund 100, -- funds the escrow: the late settle's 60 comes out of kFund's deposit
   .openCh PAYER k 100, .sign (v 60), .requestClose PAYER k, .tick 900, .withdraw PAYER k]
/-- The late settle after the withdraw that finalized k. -/
def lateSettle : Act := .settle PAYEE k (v 60)
def trG2 : List Act := trG2pre ++ [lateSettle]
def cfgG2 : Cfg := { guarded with guardFinalized := false }
/-- G2: with the guard off, the trace ends with paid + refunded > deposited (P2 broken):
  the payer was refunded 100, then the payee settled 60 more. -/
theorem G2_violates_P2 : check cfgG2 trG2 (fun st => p2 st k) = some false := by decide
/-- G2: and the escrow as a whole stays solvent (160 out of 200 in), so the overpayment is a
  real transfer of another channel's funds, not an artefact of the ghost counters. -/
theorem G2_escrow_solvent : check cfgG2 trG2 escrowSolvent = some true := by decide
/-- G2: the late settle moves money out of a finalized channel (P6 frozen broken). -/
theorem G2_violates_P6 : movesAfterFinal cfgG2 trG2pre lateSettle = true := by decide
/-- G2: with every guard on, the late settle reverts, so the trace is rejected. -/
theorem G2_guard_rejects : (run guarded St.init trG2).isNone = true := by decide
/-- G2b (GAPS.md row 4): topUp into a finalized channel strands funds. -/
def trG2bpre : List Act :=
  [.openCh PAYER k 100, .requestClose PAYER k, .tick 900, .withdraw PAYER k]
/-- The top-up after the withdraw that finalized k. -/
def lateTopUp : Act := .topUp PAYER k 50
def trG2b : List Act := trG2bpre ++ [lateTopUp]
/-- G2b: with the guard off, a finalized channel ends with deposited > paid + refunded
  (P7 broken). -/
theorem G2b_violates_P7 : check cfgG2 trG2b (fun st => p7 st k) = some false := by decide
/-- G2b: the deposit grows after the refund, so refunded ≠ deposit - settled (P4b broken). -/
theorem G2b_violates_P4b : check cfgG2 trG2b (fun st => p4b st k) = some false := by decide
/-- G2b: the top-up changes a finalized channel's record (P6 frozen broken). -/
theorem G2b_violates_P6 : movesAfterFinal cfgG2 trG2bpre lateTopUp = true := by decide
/-- G2b: with every guard on, the topUp of a finalized channel reverts. -/
theorem G2b_guard_rejects : (run guarded St.init trG2b).isNone = true := by decide
/-- G2c: a second withdraw after a proper close request refunds the deposit twice. With G1 on
  (a close was requested), this is the finalized gap alone. kFund funds the escrow, as in trG2. -/
def trG2c : List Act :=
  [.openCh PAYER kFund 100, .openCh PAYER k 100, .requestClose PAYER k, .tick 900,
   .withdraw PAYER k, .withdraw PAYER k]
/-- G2c: with the guard off, refunded = 200 > deposited = 100 (P2 broken). -/
theorem G2c_violates_P2 : check cfgG2 trG2c (fun st => p2 st k) = some false := by decide
/-- G2c: the escrow stays solvent (200 out of 200 in): the second 100 is kFund's. -/
theorem G2c_escrow_solvent : check cfgG2 trG2c escrowSolvent = some true := by decide
/-- G2c: with every guard on, the second withdraw reverts. -/
theorem G2c_guard_rejects : (run guarded St.init trG2c).isNone = true := by decide

/-! ### G3 — §6.4.1 open does not forbid re-opening an existing (e.g. finalized) channelId; the
  v1 channelId (§6.1) has no nonce, so payer+salt reuse gives the same id with settled = 0 and
  old vouchers replay. ChannelAlreadyExists appears only in informative Appendix B. -/
def trG3 : List Act :=
  [.openCh PAYER k 100, .sign (v 60), .settle PAYEE k (v 60), .close PAYEE k (v 60) 60,
   .openCh PAYER k 100, .settle PAYEE k (v 60)]
def cfgG3 : Cfg := { guarded with guardExists := false }
/-- G3: with the guard off, the re-opened channel pays 60 + 60 = 120 on a single 60 voucher,
  so paid exceeds every signed amount (P1 broken). -/
theorem G3_violates_P1 : check cfgG3 trG3 (fun st => p1 cfgG3 st k) = some false := by decide
/-- G3: with every guard on, the second open reverts. -/
theorem G3_guard_rejects : (run guarded St.init trG3).isNone = true := by decide

/-! ### G4 — §6.4.2 settle states no bounds; they live only in §14.1 ("cum > settled",
  "cum <= deposit"), and §14.1 strict '>' conflicts with §13.1 (close at the same amount) and §11.1
  ('>='). Checked uint subtraction still reverts when cum < settled (settle) or capture > deposit
  (close), so two of its bounds are missing: the cum <= deposit cap, so settle pays more than the
  channel holds, out of other channels' funds in the same escrow (G4a, P2),
  and the strict cum > settled, so settle accepts a replay at settled (G4c, P3).
  The earlier close(150) and "settle 60, 30, 60" traces relied on saturating Nat subtraction and
  revert under checked arithmetic; they are gone. -/
def trG4a : List Act :=
  [.openCh PAYER kFund 100, -- funds the escrow: 50 of the 150 come out of kFund's deposit
   .openCh PAYER k 100, .sign (v 150), .settle PAYEE k (v 150)]
def cfgG4 : Cfg := { guarded with guardBounds := false }
/-- G4: with the bounds off, settle(150) on a 100 deposit pays 150 > deposited (P2 broken). -/
theorem G4a_violates_P2 : check cfgG4 trG4a (fun st => p2 st k) = some false := by decide
/-- G4: and the escrow as a whole stays solvent (150 out of 200 in): the extra 50 is kFund's. -/
theorem G4a_escrow_solvent : check cfgG4 trG4a escrowSolvent = some true := by decide
/-- G4: with every guard on, settle above the deposit reverts. -/
theorem G4a_guard_rejects : (run guarded St.init trG4a).isNone = true := by decide

/-- G4c: settle 50, then settle the same 50-voucher again (a replay at settled, delta 0). -/
def trG4c : List Act :=
  [.openCh PAYER k 100, .sign (v 50), .settle PAYEE k (v 50), .settle PAYEE k (v 50)]
/-- G4c: with the bounds off, the replay succeeds (P3_settle_lower_or_replay_rejected says it
  reverts): the whole trace runs. No money moves (delta 0), so P2 holds. -/
theorem G4c_replay_accepted : (run cfgG4 St.init trG4c).isSome = true := by decide
/-- G4c: settled is still 50 after the replay, so only the "replay reverts" half of P3 breaks. -/
theorem G4c_settled_unchanged :
    check cfgG4 trG4c (fun st => (st.chans k).map (·.settled) == some 50) = some true := by decide
/-- G4c: with every guard on, the replay reverts (cum > settled fails). -/
theorem G4c_guard_rejects : (run guarded St.init trG4c).isNone = true := by decide

/-! ### G5 — §12.1 keys accounting by (challengeId, channelId); §13.4 says the previous
  session's spending state is irrelevant and highestVoucherAmount (per channel) is the source of
  truth. Reading both literally, a new session restarts 'spent' at 0 while acceptedCumulative
  stays, so available = accepted − 0 re-grants service already paid for (§14.11 claims
  cross-session replay is harmless; it is not for service delivery). -/
def trG5 : List Act :=
  [.openCh PAYER k 100, .sign (v 100), .accept k (v 100), .charge k 100, .newSession k, .charge k 100]
def cfgG5 : Cfg := { guarded with spentPerChannel := false }
/-- G5: with spent reset per session, 200 units are delivered against 100 accepted (P8 broken). -/
theorem G5_violates_P8 : check cfgG5 trG5 (fun st => p8 st k) = some false := by decide
/-- G5: with every guard on, the second charge fails the balance check (spent stays 100). -/
theorem G5_guard_rejects : (run guarded St.init trG5).isNone = true := by decide

/-! ### G6 — §6.4.4 v1 close pays the full cumulativeAmount; §13.2 says servers MUST NOT capture
  more than consumed, and the v2 close with captureAmount is never specified. With the §13.2
  rule off (v1 semantics: capture = cumulativeAmount), the payee closes on a 60 voucher with
  nothing delivered. -/
def trG6 : List Act := [.openCh PAYER k 100, .sign (v 60)]
def closeG6 : Act := .close PAYEE k (v 60) 60
def cfgG6 : Cfg := { guarded with guardCapture := false }
/-- The close succeeds from the end of tr, and captures more than max(settled, delivered). -/
def overCaptures (cfg : Cfg) (tr : List Act) (k : Key) (x : Sig) (cap : Nat) : Bool :=
  match run cfg St.init tr with
  | none => false
  | some st => match st.chans k with
    | none => false
    | some c => (step cfg st (.close PAYEE k x cap)).isSome && !decide (cap ≤ max c.settled (st.delivered k))
/-- G6: with the §13.2 cap off, close(60) succeeds with settled = 0 and nothing delivered
  (P9 broken). -/
theorem G6_violates_P9 : overCaptures cfgG6 trG6 k (v 60) 60 = true := by decide
/-- G6: with every guard on, the same close reverts (60 > max(0, spent = 0)). -/
theorem G6_guard_rejects : (run guarded St.init (trG6 ++ [closeG6])).isNone = true := by decide

/-! ### G7 — §11.3 step 5 rejects vouchers while a close is pending, but §12.2 lets the server
  keep delivering against an accepted voucher (GAPS.md row 11). P8 still holds (delivered ≤ accepted), which is why P8c exists.

  What the gap costs: service delivered before a close request is covered, because the payee
  has the whole grace window to settle it. Without the guard, the server can also deliver after
  the grace window has run out, when the payer may withdraw at once: the payee gets no settle
  window for that service at all. trG7 does exactly that: requestClose, wait out the grace
  period, deliver, withdraw.

  An unpaid finalized channel by itself is not the gap: with every guard on, a payee that
  never settles during the grace window also ends up unpaid (G7_idle_payee_unpaid). The
  difference is that there the payee had the window and chose not to use it. -/
def trG7 : List Act :=
  [.openCh PAYER k 100, .sign (v 60), .accept k (v 60), .requestClose PAYER k, .tick 900,
   .charge k 60, .withdraw PAYER k]
def cfgG7 : Cfg := { guarded with guardDelivery := false }
/-- The channel is finalized and the payee was paid less than was delivered. -/
def unpaidAfterFinal (st : St) (k : Key) : Bool := match st.chans k with
  | some c => c.finalized && decide (st.paid k < st.delivered k)
  | none => false
/-- G7: with the guard off, 60 units are delivered after the grace window has passed and
  none are paid: the payer's withdraw lands before any settle. The payee could have settled
  before delivering; once it delivers after GRACE, being paid is a race it can lose. -/
theorem G7_unpaid_delivery : check cfgG7 trG7 (fun st => unpaidAfterFinal st k) = some true := by
  decide
/-- G7: and it stays unpaid. G2 is still on, so settling the 60 voucher after the withdraw
  reverts on the finalized channel. -/
theorem G7_settle_too_late : (run cfgG7 St.init (trG7 ++ [.settle PAYEE k (v 60)])).isNone = true := by
  decide
/-- G7: with the guard on, the charge after requestClose reverts. -/
theorem G7_guard_rejects : (run guarded St.init trG7).isNone = true := by decide

/-- Baseline for G7, with every guard on: delivery before the close request, then the payee
  never settles during the 900 s grace window, and the payer withdraws. Unpaid too, but the
  payee had the window (P8b_payee_can_settle_accepted), so this is the payee's choice and not
  a spec gap. -/
def trG7idle : List Act :=
  [.openCh PAYER k 100, .sign (v 60), .accept k (v 60), .charge k 60, .requestClose PAYER k,
   .tick 900, .withdraw PAYER k]
theorem G7_idle_payee_unpaid :
    check guarded trG7idle (fun st => unpaidAfterFinal st k) = some true := by decide

/-! ### Gap 10 — settle-then-close collects an unconsumed voucher, with EVERY guard on.
  Not a guard-off counterexample like G1-G7: this trace runs on 'guarded', the configuration
  every theorem is about, and shows what P9_capture_le_consumed deliberately does not claim.

  §13.2 bounds a cooperative close by max(spent, settledOnChain). settle (§6.4.2) has no
  consumption bound at all: it redeems any valid signed voucher up to the deposit. So the payee
  settles a 60 voucher with nothing delivered (settled = 60), then closes capturing 60: the
  close is within the §13.2 bound (60 ≤ max(settled 60, spent 0)), so P9 holds, yet the payee
  has collected 60 for 0 units of service. Whether that is allowed (a signed voucher is a
  payment the payer cannot reclaim) or a gap (settle should be bounded by consumption too) is
  what GAPS.md row 10 asks the spec to say. -/
def trGap10 : List Act :=
  [.openCh PAYER k 100, .sign (v 60), .settle PAYEE k (v 60), .close PAYEE k (v 60) 60]
/-- The channel is finalized, the payee was paid 60 and the payer refunded the other 40, and
  no service at all was delivered on it. -/
def prepaidCaptured (st : St) (k : Key) : Bool := match st.chans k with
  | some c => c.finalized && st.paid k == 60 && st.refunded k == 40 && st.delivered k == 0
  | none => false
/-- Gap 10: with every guard on, the whole trace succeeds and ends with the payee holding the
  full unconsumed voucher.
  * Proof: decide evaluates run on the four actions in the kernel. -/
theorem Gap10_settle_then_close_unconsumed :
    check guarded trGap10 (fun st => prepaidCaptured st k) = some true := by decide

end TempoSession.Examples
