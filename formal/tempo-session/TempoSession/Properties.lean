import TempoSession.Model
import TempoSession.Invariant
/-
  Properties P1-P9 (with P4a/P4b and P8a/P8b/P8c); README.md lists each with its theorems.
  "for all reachable states" = proved by induction on Reachable via SysInv (Invariant.lean).
  Every theorem that needs them assumes cfg.Guarded and names the guards it uses
  (hg.finalized = G2, hg.fresh = G3, hg.bounds = G4, hg.request = G1, hg.perChannel = G5);
  Counterexamples.lean shows which property breaks when each guard is dropped.

  Proof styles (grind does the case analysis and the arithmetic in all of them)
  * State properties (P1, P2, P4b, P6 at-most-once, P7 no residue, P8, P8a, P9): take
    reachable_inv for the channel and let grind read the property off ChanInv's fields.
  * One-action properties: grind [step] unfolds that action's branch of step and checks its
    guards. The ones that only read a guard back (P3 rejections, P3 server, P5, P8b withdraw,
    P8c) are guard sanity checks: they confirm step encodes the rule the spec states.
  * Every-action properties (P3 monotone, P6 frozen, closeReq_sticky): the same case split as
    inv_step, one goal per action and guard outcome, each closed by grind.
  Lemma lists name what each proof unfolds: ChanInv / Unopened / OpenInv (the invariant), step
  (the transition), upd_apply (updated maps), ValidSig (to match statements that spell out a
  signature's five facts).
-/
namespace TempoSession

variable {cfg : Cfg} {s s' : St}

/-! ## P1 — payee never collects more than the highest amount signed for the channel
  §6.4.2 settle, §6.4.4 close, §6.6 signature verification, §13.2 captureAmount <= cum. -/

/-- P1: in every reachable state, what the payee has received from channel k is 0 or is
  covered by a real voucher for k, signed by k's signer, under this escrow's domain.
  * Why it matters: the payer only ever pays what it signed for (§6.6, §14.5).
  * Proof: OpenInv.paid_eq (paid = settled) and OpenInv.settled_signed. -/
theorem P1_payee_le_signed (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.paid k = 0 ∨
    ∃ v ∈ s.sigs, v.signer = k.signer ∧ v.v.chan = k ∧ v.v.escrow = cfg.escrow ∧
      v.v.chainId = cfg.chainId ∧ s.paid k ≤ v.v.amount := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, Unopened, OpenInv, ValidSig]

/-! ## P2 — conservation: payouts + refunds never exceed deposits (per channel, hence in total)
  §6.4.2, §6.4.4, §6.4.6, §14.6 "cannot be drained". -/

/-- P2: per channel, paid + refunded ≤ deposited in every reachable state.
  * Why it matters: no channel pays out more than was put in, so one channel can never drain
    another's funds held by the same escrow (§14.6).
  * Proof: paid = settled ≤ deposit = deposited, refunded = deposit - settled or 0. -/
theorem P2_conservation (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.paid k + s.refunded k ≤ s.deposited k := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, Unopened, OpenInv]

/-! ## P3 — settled never decreases; a lower or replayed voucher never changes it
  §6.4.2 delta = cum - settled, §10.5, §14.1 monotonicity, §11.3 step 6, §11.4. -/

/-- P3: one step never lowers a channel's on-chain settled amount, and an existing channel
  stays in storage.
  * Why it matters: settled is the high-water mark the contract uses to compute each payout
    (delta = cum - settled); if it could go down, a voucher could be paid twice (§14.1).
  * Proof: case split as in inv_step; only settle and close change settled, both only to an
    amount their guard puts at or above it, and G3 stops open from resetting it. -/
theorem P3_settled_monotone (hg : cfg.Guarded) {a : Act} (h : step cfg s a = some s')
    {k : Key} {c : Chan} (hc : s.chans k = some c) :
    ∃ c', s'.chans k = some c' ∧ c.settled ≤ c'.settled := by
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    grind [upd_apply, hg.fresh]

/-- P3 (guard sanity check): an on-chain settle with a voucher at or below 'settled' (lower
  or replayed) reverts.
  * Why it matters: replaying an old voucher cannot trigger a second payout (§14.1).
  * Proof: G4 requires settled < cum, which contradicts cum ≤ settled. -/
theorem P3_settle_lower_or_replay_rejected (hg : cfg.Guarded) {k : Key} {c : Chan} {x : Sig}
    (hc : s.chans k = some c) (hle : x.v.amount ≤ c.settled) (caller : Nat) :
    step cfg s (.settle caller k x) = none := by
  grind [step, hg.bounds]

/-- P3 (guard sanity check): close cannot capture below what is already settled, whatever
  the guards.
  * Why it matters: close never "un-pays" the payee or computes a negative payout.
  * Proof: close requires settled ≤ cap (TIP-1034 CaptureAmountInvalid); no guard flag. -/
theorem P3_close_lower_rejected {k : Key} {c : Chan} {x : Sig} {cap : Nat}
    (hc : s.chans k = some c) (hlt : cap < c.settled) (caller : Nat) :
    step cfg s (.close caller k x cap) = none := by
  grind [step]

/-- P3 (server, guard sanity check, §11.3 step 6, §11.4): a lower voucher is rejected.
  * Why it matters: the server's accepted balance never moves backwards, whatever the guards.
  * Proof: the accept guard requires accepted ≤ cum. -/
theorem P3_server_lower_rejected {k : Key} {x : Sig} (hlt : x.v.amount < s.accepted k) :
    step cfg s (.accept k x) = none := by
  grind [step]

/-- P3 (server, guard sanity check): a replayed voucher (equal amount) is an idempotent no-op.
  * Why it matters: client retries (§11.4) never change server state.
  * Proof: with cum = accepted the accept branch returns the state unchanged. -/
theorem P3_server_replay_noop {k : Key} {x : Sig} (heq : x.v.amount = s.accepted k)
    (h : step cfg s (.accept k x) = some s') : s' = s := by
  grind [step]

/-- P3 (server): acceptedCumulative never decreases, for any action.
  * Why it matters: the server's view of what it can redeem only grows.
  * Proof: case split as in inv_step; only accept writes accepted, and only to a
    cum ≥ accepted. -/
theorem P3_accepted_monotone {a : Act} (h : step cfg s a = some s') (k : Key) :
    s.accepted k ≤ s'.accepted k := by
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;> grind [upd_apply]

/-! ## P4 — after a close request and the grace period, the payer can always reclaim
  deposit − settled. §6.4.5 requestClose, §6.4.6 withdraw, §13.3 forced close. -/

/-- P4: from a reachable state where k has a pending close request whose grace period has
  elapsed, the payer's withdraw succeeds, refunds deposit - settled and finalizes k.
  * Why it matters: liveness for the payer: an unresponsive payee cannot lock funds (§13.3).
    With closeReq_sticky, nobody but the payer can cancel the request in the meantime, so
    this holds whatever else happens on the channel during the grace period.
  * Proof: the only withdraw guard not among the hypotheses is settled ≤ deposit
    (OpenInv.settled_le). -/
theorem P4_withdraw_enabled (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key} {c : Chan} {r : Nat}
    (hc : s.chans k = some c) (hf : c.finalized = false) (hreq : c.closeReq = some r)
    (ht : r + cfg.grace ≤ s.now) :
    ∃ s', step cfg s (.withdraw k.payer k) = some s' ∧
      s'.refunded k = s.refunded k + (c.deposit - c.settled) ∧
      s'.chans k = some { c with finalized := true } := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, OpenInv, step, upd_apply, hg.finalized, hg.request]

/-- P4: a pending close request stays pending: after any step other than the payer's own
  topUp of k, channel k still exists with the same closeReq = some r (a finalized record keeps
  it too).
  * Why it matters: the payee (or anyone else) cannot cancel or restart the payer's forced
    close: a repeat requestClose keeps the first time (#399, TIP-1034), settle, close,
    accept and charge don't touch it, and G3 stops open from replacing the record. So P4a
    holds under any interleaving of other parties' actions.
  * Proof: case split as in inv_step; only topUp writes closeReq := none. -/
theorem closeReq_sticky (hg : cfg.Guarded) {a : Act} (h : step cfg s a = some s') {k : Key}
    {c : Chan} {r : Nat} (hc : s.chans k = some c) (hr : c.closeReq = some r)
    (hnp : ∀ amt, a ≠ .topUp k.payer k amt) :
    ∃ c', s'.chans k = some c' ∧ c'.closeReq = some r := by
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    grind [upd_apply, hg.fresh]

/-- P4 (end to end): from any reachable state with an open channel, the payer alone can run
  requestClose; wait grace; withdraw and receives exactly deposit − settled in total. The
  grace period runs from r: now, or the time of a request that was already pending (r ≤ now).
  * Why it matters: the forced-close path of §13.3 needs no cooperation from the payee.
  * Proof: evaluate the three steps with simp, once per closeReq shape; refunded = 0 before
    (not finalized), settled ≤ deposit, and a pending request's r ≤ now (OpenInv.closeReq_le)
    discharge withdraw's guards. Kept as a simp evaluation: grind does not evaluate run
    through three steps. -/
theorem P4_forced_close_path (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key} {c : Chan}
    (hc : s.chans k = some c) (hf : c.finalized = false) :
    ∃ s' r, run cfg s [.requestClose k.payer k, .tick cfg.grace, .withdraw k.payer k] = some s' ∧
      r ≤ s.now ∧ s'.refunded k = c.deposit - c.settled ∧
      s'.chans k = some { c with closeReq := some r, finalized := true } := by
  have hi := reachable_inv hg hr k
  simp only [ChanInv, hc] at hi
  have h0 : s.refunded k = 0 := by simpa [hf] using hi.refunded_eq
  have hsd := hi.settled_le
  cases hq : c.closeReq with
  -- no request yet: requestClose stores now
  | none => simp [run, step, hc, hf, hq, hg.finalized, hg.request, upd, h0, hsd]
  -- a request at r is pending: requestClose keeps it, and r ≤ now
  | some r =>
    simp [run, step, hc, hf, hq, hg.finalized, hg.request, upd, h0, hsd, hi.closeReq_le r hq]

/-- P4b: once a channel is finalized, the payer has been refunded exactly deposit − settled.
  * Why it matters: however the channel ended (close or withdraw), the payer's share is the
    unsettled rest of the deposit, no more and no less. A top-up or payout after
    finalization breaks it when G2 is off (G2b_violates_P4b).
  * Proof: with finalized = true, OpenInv.refunded_eq reads refunded = deposit - settled. -/
theorem P4_refund_is_deposit_minus_settled (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key}
    {c : Chan} (hc : s.chans k = some c) (hf : c.finalized = true) :
    s.refunded k = c.deposit - c.settled := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, OpenInv]

/-! ## P5 — a voucher for one channel / escrow / chain / signer can't be redeemed elsewhere
  §6.1 channelId binds payer, payee, token, salt, signer, nonce, escrow, chainId; §6.6
  steps 2-3; §10.3 domain; §14.5. All four are guard sanity checks. -/

/-- P5 (settle): a successful settle used a real signature by k's signer, for channel k, in
  this escrow and chain, and was called by k's payee.
  * Why it matters: cross-channel, cross-escrow and cross-chain replay is impossible (§14.5).
  * Proof: these are the caller and ValidSig conjuncts of the settle guard; no flag needed. -/
theorem P5_settle_binding {caller : Nat} {k : Key} {x : Sig}
    (h : step cfg s (.settle caller k x) = some s') :
    x ∈ s.sigs ∧ x.signer = k.signer ∧ x.v.chan = k ∧ x.v.escrow = cfg.escrow ∧
      x.v.chainId = cfg.chainId ∧ caller = k.payee := by
  grind [step, ValidSig]

/-- P5 (close): a successful close that captures more than is already settled used a valid
  voucher for k, was called by the payee, and captured no more than the voucher's cumulative
  amount (§6.4.4, §13.2).
  * Scope: a close at cap = settled pays the payee nothing and, as in TIP-1034, needs no
    signature (P3_close_lower_rejected and P4b cover what it does).
  * Proof: the caller, ValidSig (required when settled < cap) and cap ≤ cum conjuncts of the
    close guard; no flag needed. -/
theorem P5_close_binding {caller cap : Nat} {k : Key} {x : Sig} {c : Chan}
    (hc : s.chans k = some c) (hlt : c.settled < cap)
    (h : step cfg s (.close caller k x cap) = some s') :
    x ∈ s.sigs ∧ x.signer = k.signer ∧ x.v.chan = k ∧ x.v.escrow = cfg.escrow ∧
      x.v.chainId = cfg.chainId ∧ caller = k.payee ∧ cap ≤ x.v.amount := by
  grind [step, ValidSig]

/-- P5 (server accept): the server only accepts vouchers valid for k in this escrow
  (§11.3 steps 2-4).
  * Proof: the ValidSig conjunct of the accept guard. -/
theorem P5_accept_binding {k : Key} {x : Sig} (h : step cfg s (.accept k x) = some s') :
    x ∈ s.sigs ∧ x.signer = k.signer ∧ x.v.chan = k ∧ x.v.escrow = cfg.escrow ∧
      x.v.chainId = cfg.chainId := by
  grind [step, ValidSig]

/-- P5 corollary in SDK terms: a voucher signed for another channel is rejected by settle.
  * Proof: settle's ValidSig guard requires x.v.chan = k. -/
theorem P5_other_channel_rejected {caller : Nat} {k : Key} {x : Sig} (hne : x.v.chan ≠ k) :
    step cfg s (.settle caller k x) = none := by
  grind [step, ValidSig]

/-! ## P6 — a channel finalizes at most once; nothing moves its funds afterwards
  §6.1 finalized, §6.3 lifecycle, §6.4.4, §6.4.6, error ChannelFinalized (Appendix B). -/

/-- P6: in every reachable state a channel has been finalized at most once.
  * Why it matters: a second close/withdraw would pay out the same deposit twice.
  * Proof: OpenInv.finals_eq (finals = 1 or 0); an unopened channel has finals = 0. -/
theorem P6_finalize_at_most_once (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.finals k ≤ 1 := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, Unopened, OpenInv]

/-- P6: once a channel is finalized, no action changes its record or its money counters
  (paid, refunded, deposited, finals).
  * Why it matters: a closed channel is terminal; late settles, top-ups or withdraws cannot
    move funds (Appendix B ChannelFinalized; G2).
  * Proof: case split as in inv_step; every contract action on k is blocked by G2 (open by
    G3), actions on other channels only touch other keys, and server actions never touch
    these fields. -/
theorem P6_finalized_frozen (hg : cfg.Guarded) {a : Act} (h : step cfg s a = some s')
    {k : Key} {c : Chan} (hc : s.chans k = some c) (hf : c.finalized = true) :
    s'.chans k = some c ∧ s'.paid k = s.paid k ∧ s'.refunded k = s.refunded k ∧
      s'.deposited k = s.deposited k ∧ s'.finals k = s.finals k := by
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    grind [upd_apply, hg.finalized, hg.fresh]

/-! ## P7 — top-up preserves P1-P6, and a finalized channel holds no residual funds
  §6.4.3 topUp (cancels a pending close), §9.3.2, §11.2. P1, P2, P6 are consequences of
  SysInv, which topUp preserves (P7_topUp_preserves_inv), so they hold right after any top-up;
  P3, P5, P6-frozen are proved above for every action, topUp included; P4 holds in every
  state. The state half, P7_no_stranded_funds, is what a top-up into a finalized channel
  breaks (G2b_violates_P7). -/

/-- P7: once finalized, every deposited unit went to the payee or the payer.
  * Why it matters: closing or withdrawing leaves no funds stranded in the escrow, and no
    later top-up can add funds nobody can take out.
  * Proof: with finalized = true, refunded = deposit - settled; add paid = settled and
    deposited = deposit. -/
theorem P7_no_stranded_funds (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key} {c : Chan}
    (hc : s.chans k = some c) (hf : c.finalized = true) :
    s.paid k + s.refunded k = s.deposited k := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, OpenInv]

/-- P7: a successful topUp preserves SysInv.
  * Proof: the topUp case of inv_step. -/
theorem P7_topUp_preserves_inv (hg : cfg.Guarded) {caller amt : Nat} {k : Key}
    (hI : SysInv cfg s) (h : step cfg s (.topUp caller k amt) = some s') : SysInv cfg s' :=
  inv_step hg hI h

/-- P7: what a successful topUp does: deposit grows by amt, a pending close is cancelled,
  no money is paid or refunded, deposited grows by amt; and it was called by the payer on a
  non-finalized channel (§6.4.3, §6.5).
  * Why it matters: a top-up cannot be used to move funds out, and it resets the forced-close
    clock, as §6.4.3 says.
  * Proof: split the topUp branch; the guard gives caller = payer and (G2) not finalized.
    (grind [step] alone does not substitute s' here, so the branch is split first.) -/
theorem P7_topUp_effect (hg : cfg.Guarded) {caller amt : Nat} {k : Key} {c : Chan}
    (hc : s.chans k = some c) (h : step cfg s (.topUp caller k amt) = some s') :
    s'.chans k = some { c with deposit := c.deposit + amt, closeReq := none } ∧
      s'.paid = s.paid ∧ s'.refunded = s.refunded ∧ s'.deposited k = s.deposited k + amt ∧
      caller = k.payer ∧ c.finalized = false := by
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> grind [upd_apply, hg.finalized]

/-! ## P8 (extra) — the server never delivers more service than vouchers it can redeem
  §12.1, §12.2, §13.4. -/

/-- P8: in every reachable state, service delivered on k is at most the accepted amount. What
  backs the accepted amount is P8a_accepted_backed.
  * Why it matters: with P8a, every unit delivered is backed by a voucher the payee could
    redeem while the channel is open (P8b_payee_can_settle_accepted). It is NOT a promise that
    the payee still can redeem it later: once the payer withdraws after the grace window the
    channel is finalized and the voucher is void (see Scope). Needs G5 (spent per channel),
    see G5_violates_P8.
  * Scope: a per-state bound. The payee actually collects only if it settles within the grace
    window after a close request (P8b_payee_can_settle_accepted while open); with G7, charge
    refuses to deliver once a close is pending (P8c_no_delivery_while_closing), so no service
    is delivered that the window can't cover (GAPS.md row 11, G7_unpaid_delivery). A payee
    that skips the window still goes unpaid (G7_idle_payee_unpaid).
  * Proof: OpenInv.delivered_eq and spent_le (delivered = spent ≤ accepted). -/
theorem P8_delivered_le_accepted (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.delivered k ≤ s.accepted k := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, Unopened, OpenInv]

/-- P8a: what P8 compares against is real. In every reachable
  state the accepted amount is within the channel's deposit (§11.3 step 7), and either nothing
  was accepted yet (acceptedSig = none, accepted = 0) or the voucher the server persisted
  (acceptedSig, §11.3 step 8) is itself valid for k: signed by k's signer, for k, under this
  escrow's domain (§11.3 steps 2-4), with amount = accepted.
  * Why it matters: the deposit bound is what lets the payee settle the accepted voucher under
    G4's cum ≤ deposit cap (P8b_payee_can_settle_accepted); the backing means the server only
    counts vouchers it can redeem. It names the accepted voucher, not just "some valid voucher
    of that amount", so accepting an invalid voucher would break it even when a valid one of
    the same amount was also signed.
  * Proof: OpenInv.accepted_le and accepted_signed; an unopened channel has accepted = 0,
    acceptedSig = none and no record, so the bound is vacuous. -/
theorem P8a_accepted_backed (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    (∀ c, s.chans k = some c → s.accepted k ≤ c.deposit) ∧
    ((s.acceptedSig k = none ∧ s.accepted k = 0) ∨
      ∃ v, s.acceptedSig k = some v ∧ v ∈ s.sigs ∧ v.signer = k.signer ∧ v.v.chan = k ∧
        v.v.escrow = cfg.escrow ∧ v.v.chainId = cfg.chainId ∧ v.v.amount = s.accepted k) := by
  have hi := reachable_inv hg hr k
  grind [ChanInv, Unopened, OpenInv, ValidSig]

/-- P8c (guard sanity check): with G7 on, a successful charge happens only while no close
  request is pending.
  * Why it matters: everything delivered is covered by a voucher accepted before any close
    request, which the payee can settle during the grace window (§11.3 step 5, §13.3). Without
    G7, the server can deliver after the grace window, when the payer may withdraw before the
    payee can settle (G7_unpaid_delivery).
  * Proof: G7 makes closeReq = none a conjunct of charge's guard. -/
theorem P8c_no_delivery_while_closing (hd : cfg.guardDelivery = true) {k : Key} {c : Chan}
    {cost : Nat} (hc : s.chans k = some c) (h : step cfg s (.charge k cost) = some s') :
    c.closeReq = none := by
  grind [step]

/-! ## P8b (extra) — payee protection: no withdraw without a close request + grace, and the
  payee can always settle the highest accepted voucher while the channel is open.
  §6.4.6, §13.3, §14.6 "Payee protection". -/

/-- P8b (guard sanity check): a successful withdraw implies a close was requested at some
  time r and the grace period since r has elapsed.
  * Why it matters: the payee always gets the grace window to settle before the payer takes
    the rest (§13.3, §14.6). Needs G1, see G1_withdraw_without_request.
  * Proof: G1 makes closeReq.isSome a guard; the grace guard then reads r + grace ≤ now. -/
theorem P8b_withdraw_needs_request (hg : cfg.Guarded) {caller : Nat} {k : Key} {c : Chan}
    (hc : s.chans k = some c) (h : step cfg s (.withdraw caller k) = some s') :
    ∃ r, c.closeReq = some r ∧ r + cfg.grace ≤ s.now := by
  -- one case per closeReq shape, so grind can read closeReq.getD 0
  cases hq : c.closeReq <;> grind [step, hg.request]

/-- P8b: while the channel is open and settled < accepted, the payee can settle on chain and
  then has been paid exactly the accepted amount.
  * Why it matters: the voucher the server accepted is always redeemable, so delivering
    service against it is safe (§12, §14.6).
  * Proof: accepted_signed gives a valid voucher x with amount = accepted; accepted_le gives
    the G4 upper bound; hlt gives settled < amount; paid_eq gives paid = settled, so
    paid + (amount - settled) = accepted. -/
theorem P8b_payee_can_settle_accepted (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key}
    {c : Chan} (hc : s.chans k = some c) (hf : c.finalized = false)
    (hlt : c.settled < s.accepted k) :
    ∃ x s', step cfg s (.settle k.payee k x) = some s' ∧ s'.paid k = s.accepted k := by
  have hi := reachable_inv hg hr k
  simp only [ChanInv, hc] at hi
  -- accepted_signed names the accepted voucher x (accepted ≠ 0, since settled < accepted)
  obtain ⟨-, h0⟩ | ⟨x, -, hv, hx⟩ := hi.accepted_signed
  · omega
  · -- settle's G4 bounds hold: settled < x.amount = accepted ≤ deposit (accepted_le)
    have := hi.accepted_le
    have := hi.paid_eq
    have h1 : c.settled < x.v.amount := by omega
    have h2 : x.v.amount ≤ c.deposit := by omega
    refine ⟨x, ?_⟩
    -- evaluate the settle step; paid' = settled + (amount - settled) = accepted
    simp [step, hc, hf, hg.finalized, hg.bounds, hv, h1, h2, Nat.le_of_lt h1]
    omega

/-! ## P9 (extra) — a server close that follows §13.2 captures at most
  max(settled on chain, service delivered on the channel).
  §13.2: "MUST NOT capture more than the amount actually consumed", v2 captureAmount =
  max(spent, settledOnChain). This is a rule for the server's choice of captureAmount, not a
  contract check: TIP-1034 close accepts any settled ≤ cap ≤ cum, so a v1 close (cap = cum)
  can capture more (G6_violates_P9; #399's lowest-voucher rule keeps v1 within the gap
  between two signed amounts, GAPS.md row 6).
  Scope: this bounds close only. settle (§6.4.2) can first redeem any signed voucher,
  consumed or not, raising 'settled'; then close may capture it in full with nothing
  delivered. So P9 does NOT mean "the payer pays only for consumption" (GAPS.md row 10;
  Counterexamples.Gap10_settle_then_close_unconsumed runs that trace with every guard on). -/

/-- P9: a successful close from a reachable state whose captureAmount follows the §13.2 rule
  (cap ≤ max(settled, spent); the rule picks equality) captures at most max(settled,
  delivered on k), and leaves the payee with at most that much in total.
  * Why it matters: the server's own accounting, not the voucher amount, bounds what close
    takes, and spent is exactly the service delivered (with G5), so close adds no unconsumed
    value beyond what is already settled. It does not stop a prior settle of an unconsumed
    voucher (GAPS.md row 10).
  * Proof: split the close branch; OpenInv.delivered_eq rewrites spent to delivered, and
    after close paid = settled + (cap - settled) = cap (paid_eq). -/
theorem P9_capture_le_consumed (hg : cfg.Guarded) (hr : Reachable cfg s) {caller cap : Nat}
    {k : Key} {x : Sig} {c : Chan} (hc : s.chans k = some c)
    (hrule : cap ≤ max c.settled (s.spent k))
    (h : step cfg s (.close caller k x cap) = some s') :
    cap ≤ max c.settled (s.delivered k) ∧ s'.paid k ≤ max c.settled (s.delivered k) := by
  have hi := reachable_inv hg hr k
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> grind [ChanInv, OpenInv, upd_apply]

end TempoSession
