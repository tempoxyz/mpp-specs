import TempoSession.Model
import TempoSession.Invariant
/-
  Properties P1-P9 (with P4a/P4b and P8a/P8b/P8c); README.md lists each with its theorems.
  "for all reachable states" = proved by induction on Reachable via Inv (Invariant.lean).
  Every theorem assumes cfg.Guarded (all six spec guards on); Counterexamples.lean shows
  which property breaks when each guard is dropped.

  Two proof styles
  * State properties (P1, P2, P4b, P6 at-most-once, P7 no residue, P8, P8a, P9): take
    reachable_inv for the channel,
    unfold ChanInv, and read the property off the relevant conjunct(s).
  * Step properties (P3, P5, P6 frozen, P7 effect): unfold step for one action and case-split
    on its guards; "cases h" closes every reverting branch (none ≠ some s').
  Some step properties (P3 server lemmas, P5 bindings) need no guards at all: the spec's
  own checks suffice, and the theorem states no cfg.Guarded hypothesis.
-/
namespace TempoSession

variable {cfg : Cfg} {s s' : St}

/-! ## P1 — payee never collects more than the highest amount signed for the channel
  §6.4.2 settle, §6.4.4 close, §6.6 signature verification, §13.2 captureAmount <= cum. -/

/-- P1: in every reachable state, what the payee has received from channel k is 0 or is
  covered by a real voucher for k, signed by k's signer, under this escrow's domain.
  * Why it matters: the payer only ever pays what it signed for (§6.6, §14.5).
  * Proof: conjunct 1 (paid = settled) and conjunct 6 (settled backed by a valid voucher). -/
theorem P1_payee_le_signed (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.paid k = 0 ∨
    ∃ v ∈ s.sigs, v.signer = k.signer ∧ v.v.chan = k ∧ v.v.escrow = cfg.escrow ∧
      v.v.chainId = cfg.chainId ∧ s.paid k ≤ v.v.amount := by
  have hi := reachable_inv hg hr k
  unfold ChanInv at hi
  split at hi
  -- channel never opened: paid = 0 is the first conjunct of the "none" shape
  · exact Or.inl hi.1
  · next c hc =>
    -- h1: paid = settled; h6: settled = 0 or a valid voucher ≥ settled
    obtain ⟨h1, _, _, _, _, h6, _⟩ := hi
    rcases h6 with h6 | ⟨w, ⟨m, s1, s2, s3, s4⟩, hw⟩
    -- settled = 0, hence paid = 0 (omega with h1)
    · left; omega
    -- unpack ValidSig into the five facts the statement lists; paid = settled ≤ amount (omega)
    · right; exact ⟨w, m, s1, s2, s3, s4, by omega⟩

/-! ## P2 — conservation: payouts + refunds never exceed deposits (per channel, hence in total)
  §6.4.2, §6.4.4, §6.4.6, §14.6 "cannot be drained". -/

/-- P2: per channel, paid + refunded ≤ deposited in every reachable state.
  * Why it matters: no channel pays out more than was put in, so one channel can never drain
    another's funds held by the same escrow (§14.6).
  * Proof: conjuncts 1-4 (paid = settled ≤ deposit = deposited, refunded = deposit - settled
    or 0). -/
theorem P2_conservation (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.paid k + s.refunded k ≤ s.deposited k := by
  have hi := reachable_inv hg hr k
  unfold ChanInv at hi
  split at hi
  -- channel never opened: 0 + 0 ≤ 0
  · omega
  · next c hc =>
    obtain ⟨h1, h2, h3, h4, _⟩ := hi
    -- finalized: settled + (deposit - settled) = deposit, using settled ≤ deposit (h2);
    -- open: settled + 0 ≤ deposit. Both are linear (omega).
    split at h4 <;> omega

/-! ## P3 — settled never decreases; a lower or replayed voucher never changes it
  §6.4.2 delta = cum - settled, §10.5, §14.1 monotonicity, §11.3 step 6, §11.4. -/

/-- P3: one step never lowers a channel's on-chain settled amount, and an existing channel
  stays in storage.
  * Why it matters: settled is the high-water mark the contract uses to compute each payout
    (delta = cum - settled); if it could go down, a voucher could be paid twice (§14.1).
  * Proof: case per action; only settle and close change settled, and both only raise it. -/
theorem P3_settled_monotone (hg : cfg.Guarded) {a : Act} (h : step cfg s a = some s')
    {k : Key} {c : Chan} (hc : s.chans k = some c) :
    ∃ c', s'.chans k = some c' ∧ c.settled ≤ c'.settled := by
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  cases a with
  -- tick / sign: chans untouched
  | tick d => cases h; exact ⟨c, hc, Nat.le_refl _⟩
  | sign x => cases h; exact ⟨c, hc, Nat.le_refl _⟩
  | openCh caller k0 amt =>
    simp only [step, g2, true_implies] at h
    split at h
    · next hcond =>
      cases h
      by_cases hk : k = k0
      -- open on k itself: G3 says k was absent, contradicting hc
      · subst hk; rw [hcond.2] at hc; cases hc
      -- open on another channel: k's record unchanged
      · exact ⟨c, by simp [upd, hk, hc], Nat.le_refl _⟩
    · cases h
  | topUp caller k0 amt =>
    simp only [step, g1, true_implies] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · cases h
        by_cases hk : k = k0
        -- topUp only changes deposit and closeReq; settled is equal
        · subst hk; rw [hc] at hc0; cases hc0; exact ⟨_, upd_same _ _ _, Nat.le_refl _⟩
        · exact ⟨c, by simp [upd, hk, hc], Nat.le_refl _⟩
      · cases h
  | settle caller k0 x =>
    simp only [step, g1, g3, true_implies] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · next hcond =>
        cases h
        by_cases hk : k = k0
        -- new settled = cum, and the guard requires settled ≤ cum (hcond)
        · subst hk; rw [hc] at hc0; cases hc0
          refine ⟨_, upd_same _ _ _, ?_⟩
          first | omega | (simp; omega) | simp
        · exact ⟨c, by simp [upd, hk, hc], Nat.le_refl _⟩
      · cases h
  | close caller k0 x cap =>
    simp only [step, g1, true_implies] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · next hcond =>
        cases h
        by_cases hk : k = k0
        -- new settled = cap, and the guard requires settled ≤ cap (hcond)
        · subst hk; rw [hc] at hc0; cases hc0
          refine ⟨_, upd_same _ _ _, ?_⟩
          first | omega | (simp; omega) | simp
        · exact ⟨c, by simp [upd, hk, hc], Nat.le_refl _⟩
      · cases h
  | requestClose caller k0 =>
    simp only [step, g1, true_implies] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · cases h
        by_cases hk : k = k0
        -- only closeReq changes
        · subst hk; rw [hc] at hc0; cases hc0; exact ⟨_, upd_same _ _ _, Nat.le_refl _⟩
        · exact ⟨c, by simp [upd, hk, hc], Nat.le_refl _⟩
      · cases h
  | withdraw caller k0 =>
    simp only [step, g1, g4, true_implies] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · cases h
        by_cases hk : k = k0
        -- only finalized changes
        · subst hk; rw [hc] at hc0; cases hc0; exact ⟨_, upd_same _ _ _, Nat.le_refl _⟩
        · exact ⟨c, by simp [upd, hk, hc], Nat.le_refl _⟩
      · cases h
  -- accept / charge / newSession: server-side only, chans untouched in every success branch
  | accept k0 x =>
    simp only [step] at h
    split at h
    · cases h
    · split at h
      · split at h
        · cases h; exact ⟨c, hc, Nat.le_refl _⟩
        · split at h
          · cases h; exact ⟨c, hc, Nat.le_refl _⟩
          · cases h
      · cases h
  | charge k0 cost =>
    simp only [step] at h
    split at h
    · cases h
    · split at h
      · cases h; exact ⟨c, hc, Nat.le_refl _⟩
      · cases h
  | newSession k0 =>
    simp only [step, g5] at h
    cases h; exact ⟨c, hc, Nat.le_refl _⟩

/-- P3: an on-chain settle with a voucher at or below 'settled' (lower or replayed) reverts.
  * Why it matters: replaying an old voucher cannot trigger a second payout (§14.1).
  * Proof: G4 requires settled < cum, which contradicts cum ≤ settled (omega). -/
theorem P3_settle_lower_or_replay_rejected (hg : cfg.Guarded) {k : Key} {c : Chan} {x : Sig}
    (hc : s.chans k = some c) (hle : x.v.amount ≤ c.settled) (caller : Nat) :
    step cfg s (.settle caller k x) = none := by
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  simp only [step, hc, g1, g3, true_implies]
  split
  -- guard holds: it contains settled < cum, impossible with hle
  · next hcond => omega
  -- guard fails: the step already is none
  · rfl

/-- P3: close cannot capture below what is already settled.
  * Why it matters: close never "un-pays" the payee or computes a negative payout.
  * Proof: the checked subtraction cap - settled requires settled ≤ cap; no guard flag needed
    for this part, though hg is destructured for uniformity. -/
theorem P3_close_lower_rejected (hg : cfg.Guarded) {k : Key} {c : Chan} {x : Sig} {cap : Nat}
    (hc : s.chans k = some c) (hlt : cap < c.settled) (caller : Nat) :
    step cfg s (.close caller k x cap) = none := by
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  simp only [step, hc, g1, true_implies]
  split
  -- guard holds: settled ≤ cap contradicts cap < settled
  · next hcond => omega
  · rfl

/-- P3 (server, §11.3 step 6, §11.4): a lower voucher is rejected.
  * Why it matters: the server's accepted balance never moves backwards, whatever the guards.
  * Proof: the accept guard requires accepted ≤ cum. -/
theorem P3_server_lower_rejected {k : Key} {x : Sig} (hlt : x.v.amount < s.accepted k) :
    step cfg s (.accept k x) = none := by
  simp only [step]
  split
  -- unknown channel: rejected
  · rfl
  · split
    -- verification passed: contains accepted ≤ cum, impossible with hlt
    · next hcond => omega
    · rfl

/-- P3 (server): a replayed voucher (equal amount) is an idempotent no-op.
  * Why it matters: client retries (§11.4) never change server state.
  * Proof: every successful branch with cum = accepted returns st itself; the raise branch
    contradicts heq. -/
theorem P3_server_replay_noop {k : Key} {x : Sig} (heq : x.v.amount = s.accepted k)
    (h : step cfg s (.accept k x) = some s') : s' = s := by
  simp only [step] at h
  -- split every match/if; then each branch is: a none (impossible), the replay branch
  -- (some s = some s'), or the raise branch whose condition cum ≠ accepted contradicts heq
  repeat' split at h
  all_goals first | (cases h; rfl) | (exfalso; contradiction) | (cases h; done)

/-- P3 (server): acceptedCumulative never decreases, for any action.
  * Why it matters: the server's view of what it can redeem only grows.
  * Proof: only accept writes accepted, and only to a cum ≥ accepted. -/
theorem P3_accepted_monotone {a : Act} (h : step cfg s a = some s') (k : Key) :
    s.accepted k ≤ s'.accepted k := by
  cases a with
  | accept k0 x =>
    simp only [step] at h
    split at h
    · cases h
    · split at h
      · next hcond =>
        split at h
        -- replay: state unchanged
        · cases h; exact Nat.le_refl _
        · split at h
          -- raise: new accepted = cum ≥ old accepted (from hcond, omega)
          · cases h
            by_cases hk : k = k0
            · subst hk; simp; omega
            -- another channel's accepted: unchanged
            · simp [upd, hk]
          · cases h
      · cases h
  -- every other action leaves accepted untouched: split all guards, close the none
  -- branches, and the success branches give accepted' = accepted
  | _ =>
    simp only [step] at h
    repeat' (first | (split at h) | (cases h; done))
    all_goals (first | (cases h; done) | (cases h; exact Nat.le_refl _))

/-! ## P4 — after a close request and the grace period, the payer can always reclaim
  deposit − settled. §6.4.5 requestClose, §6.4.6 withdraw, §13.3 forced close. -/

/-- P4: from a reachable state where k has a pending close request whose grace period has
  elapsed, the payer's withdraw succeeds, refunds deposit - settled and finalizes k.
  * Why it matters: liveness for the payer: an unresponsive payee cannot lock funds (§13.3).
  * Proof: the only non-trivial withdraw guard is settled ≤ deposit, which is conjunct 2. -/
theorem P4_withdraw_enabled (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key} {c : Chan} {r : Nat}
    (hc : s.chans k = some c) (hf : c.finalized = false) (hreq : c.closeReq = some r)
    (ht : r + cfg.grace ≤ s.now) :
    ∃ s', step cfg s (.withdraw k.payer k) = some s' ∧
      s'.refunded k = s.refunded k + (c.deposit - c.settled) ∧
      s'.chans k = some { c with finalized := true } := by
  have hi := reachable_inv hg hr k
  simp only [ChanInv, hc] at hi
  -- hsd: settled ≤ deposit (conjunct 2), discharging the checked-subtraction guard
  obtain ⟨_, hsd, _⟩ := hi
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  -- compute the step explicitly: every guard is a hypothesis (payer, hf, hreq, ht, hsd)
  have hs : step cfg s (.withdraw k.payer k) =
      some { s with chans := upd s.chans k (some { c with finalized := true }),
                    refunded := upd s.refunded k (s.refunded k + (c.deposit - c.settled)),
                    finals := upd s.finals k (s.finals k + 1) } := by
    simp [step, hc, g1, g4, hf, hreq, ht, hsd]
  -- the two field equations follow from upd_same
  exact ⟨_, hs, by simp, by simp⟩

/-- P4 (end to end): from any reachable state with an open channel, the payer alone can run
  requestClose; wait grace; withdraw and receives exactly deposit − settled in total.
  * Why it matters: the forced-close path of §13.3 needs no cooperation from the payee.
  * Proof: evaluate the three steps with simp; conjunct 4 gives refunded = 0 before (not
    finalized) and conjunct 2 discharges settled ≤ deposit. -/
theorem P4_forced_close_path (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key} {c : Chan}
    (hc : s.chans k = some c) (hf : c.finalized = false) :
    ∃ s', run cfg s [.requestClose k.payer k, .tick cfg.grace, .withdraw k.payer k] = some s' ∧
      s'.refunded k = c.deposit - c.settled ∧
      s'.chans k = some { c with closeReq := some s.now, finalized := true } := by
  have hi := reachable_inv hg hr k
  simp only [ChanInv, hc, hf] at hi
  -- h2: settled ≤ deposit; h4: refunded = 0 (channel not finalized)
  obtain ⟨_, h2, _, h4, _⟩ := hi
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  simp only [Bool.false_eq_true, ite_false] at h4
  -- run the trace symbolically: requestClose sets closeReq = now, tick adds grace so
  -- now + grace ≤ now + grace holds, withdraw then succeeds and refunds 0 + (deposit - settled)
  simp [run, step, hc, hf, g1, g4, upd, h4, h2]

/-- P4b: once a channel is finalized, the payer has been refunded exactly deposit − settled.
  * Why it matters: however the channel ended (close or withdraw), the payer's share is the
    unsettled rest of the deposit, no more and no less. A top-up or payout after
    finalization breaks it when G2 is off (G2b_violates_P4b).
  * Proof: with finalized = true, conjunct 4 of ChanInv reads refunded = deposit - settled. -/
theorem P4_refund_is_deposit_minus_settled (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key}
    {c : Chan} (hc : s.chans k = some c) (hf : c.finalized = true) :
    s.refunded k = c.deposit - c.settled := by
  have hi := reachable_inv hg hr k
  -- select the finalized branch of the if in conjunct 4
  simp only [ChanInv, hc, hf, ite_true] at hi
  obtain ⟨_, _, _, h4, _⟩ := hi
  exact h4

/-! ## P5 — a voucher for one channel / escrow / chain / signer can't be redeemed elsewhere
  §6.1 channelId binds payer, payee, token, salt, signer, escrow, chainId; §6.6 steps 2-3;
  §10.3 domain; §14.5. -/

/-- P5 (settle): a successful settle used a real signature by k's signer, for channel k, in
  this escrow and chain, and was called by k's payee.
  * Why it matters: cross-channel, cross-escrow and cross-chain replay is impossible (§14.5).
  * Proof: these are the caller and ValidSig conjuncts of the settle guard; no flag needed. -/
theorem P5_settle_binding {caller : Nat} {k : Key} {x : Sig}
    (h : step cfg s (.settle caller k x) = some s') :
    x ∈ s.sigs ∧ x.signer = k.signer ∧ x.v.chan = k ∧ x.v.escrow = cfg.escrow ∧
      x.v.chainId = cfg.chainId ∧ caller = k.payee := by
  simp only [step] at h
  split at h
  -- unknown channel: settle reverted
  · cases h
  · split at h
    -- guard held: project caller = payee (.1) and the five ValidSig facts (.2.2.1.*)
    · next hcond => exact ⟨hcond.2.2.1.1, hcond.2.2.1.2.1, hcond.2.2.1.2.2.1,
        hcond.2.2.1.2.2.2.1, hcond.2.2.1.2.2.2.2, hcond.1⟩
    · cases h

/-- P5 (close): a successful close used a valid voucher for k, was called by the payee, and
  captured no more than the voucher's cumulative amount (§6.4.4, §13.2).
  * Proof: projections of the close guard; no flag needed. -/
theorem P5_close_binding {caller cap : Nat} {k : Key} {x : Sig}
    (h : step cfg s (.close caller k x cap) = some s') :
    x ∈ s.sigs ∧ x.signer = k.signer ∧ x.v.chan = k ∧ x.v.escrow = cfg.escrow ∧
      x.v.chainId = cfg.chainId ∧ caller = k.payee ∧ cap ≤ x.v.amount := by
  simp only [step] at h
  split at h
  · cases h
  · split at h
    -- guard held: ValidSig facts, caller = payee, and cap ≤ cum (.2.2.2.1)
    · next hcond => exact ⟨hcond.2.2.1.1, hcond.2.2.1.2.1, hcond.2.2.1.2.2.1,
        hcond.2.2.1.2.2.2.1, hcond.2.2.1.2.2.2.2, hcond.1, hcond.2.2.2.1⟩
    · cases h

/-- P5 (server accept): the server only accepts vouchers valid for k in this escrow
  (§11.3 steps 2-4).
  * Proof: the ValidSig conjunct of the accept guard. -/
theorem P5_accept_binding {k : Key} {x : Sig} (h : step cfg s (.accept k x) = some s') :
    x ∈ s.sigs ∧ x.signer = k.signer ∧ x.v.chan = k ∧ x.v.escrow = cfg.escrow ∧
      x.v.chainId = cfg.chainId := by
  simp only [step] at h
  split at h
  · cases h
  · split at h
    -- the third conjunct of the guard is ValidSig itself (the replay/raise split is irrelevant)
    · next hcond => exact hcond.2.2.1
    · cases h

/-- P5 corollary in SDK terms: a voucher signed for another channel is rejected by settle.
  * Proof: if settle succeeded, P5_settle_binding would give x.v.chan = k. -/
theorem P5_other_channel_rejected {caller : Nat} {k : Key} {x : Sig} (hne : x.v.chan ≠ k) :
    step cfg s (.settle caller k x) = none := by
  cases h : step cfg s (.settle caller k x) with
  | none => rfl
  -- success would bind the voucher to k, contradicting hne
  | some s' => exact absurd (P5_settle_binding h).2.2.1 hne

/-! ## P6 — a channel finalizes at most once; nothing moves its funds afterwards
  §6.1 finalized, §6.3 lifecycle, §6.4.4, §6.4.6, error ChannelFinalized (Appendix B). -/

/-- P6: in every reachable state a channel has been finalized at most once.
  * Why it matters: a second close/withdraw would pay out the same deposit twice.
  * Proof: conjunct 5 (finals = 1 or 0); the "none" shape has finals = 0. -/
theorem P6_finalize_at_most_once (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.finals k ≤ 1 := by
  have hi := reachable_inv hg hr k
  unfold ChanInv at hi
  split at hi
  -- never opened: finals = 0
  · omega
  · obtain ⟨_, _, _, _, h5, _⟩ := hi
    -- finals is 1 or 0 depending on finalized; both ≤ 1
    split at h5 <;> omega

/-- P6: once a channel is finalized, no action changes its record or its money counters
  (paid, refunded, deposited, finals).
  * Why it matters: a closed channel is terminal; late settles, top-ups or withdraws cannot
    move funds (Appendix B ChannelFinalized; G2).
  * Proof: each contract action on k is blocked by the G2 guard; actions on other channels
    only touch other keys; server actions never touch these fields. -/
theorem P6_finalized_frozen (hg : cfg.Guarded) {a : Act} (h : step cfg s a = some s')
    {k : Key} {c : Chan} (hc : s.chans k = some c) (hf : c.finalized = true) :
    s'.chans k = some c ∧ s'.paid k = s.paid k ∧ s'.refunded k = s.refunded k ∧
      s'.deposited k = s.deposited k ∧ s'.finals k = s.finals k := by
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  -- frame lemma: any action whose G2 guard passed for channel k0 cannot be about k,
  -- because k is finalized (hf) and G2 (g1) demands finalized = false
  have frame : ∀ {k0 : Key} {c0 : Chan}, s.chans k0 = some c0 →
      (cfg.guardFinalized = true → c0.finalized = false) → k ≠ k0 := by
    intro k0 c0 hc0 hg0 hk; subst hk; rw [hc] at hc0; cases hc0
    have := hg0 g1; rw [hf] at this; cases this
  cases a with
  -- tick / sign: no per-channel field changes
  | tick d => cases h; exact ⟨hc, rfl, rfl, rfl, rfl⟩
  | sign x => cases h; exact ⟨hc, rfl, rfl, rfl, rfl⟩
  | openCh caller k0 amt =>
    simp only [step, g2, true_implies] at h
    split at h
    · next hcond =>
      cases h
      -- G3: open needs k0 absent, but k exists, so k ≠ k0 and k is untouched
      have hk : k ≠ k0 := by intro hk; subst hk; rw [hcond.2] at hc; cases hc
      simp [upd, hk, hc]
    · cases h
  -- topUp and requestClose share a proof: G2 is the second guard conjunct (hcond.2)
  | topUp caller k0 amt | requestClose caller k0 =>
    simp only [step] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · next hcond =>
        cases h
        have hk := frame hc0 hcond.2
        simp [upd, hk, hc]
      · cases h
  -- settle, close, withdraw: G2 is the second guard conjunct (hcond.2.1), so k0 ≠ k
  | settle caller k0 x =>
    simp only [step] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · next hcond =>
        cases h
        have hk := frame hc0 hcond.2.1
        simp [upd, hk, hc]
      · cases h
  | close caller k0 x cap =>
    simp only [step] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · next hcond =>
        cases h
        have hk := frame hc0 hcond.2.1
        simp [upd, hk, hc]
      · cases h
  | withdraw caller k0 =>
    simp only [step] at h
    split at h
    · cases h
    · next c0 hc0 =>
      split at h
      · next hcond =>
        cases h
        have hk := frame hc0 hcond.2.1
        simp [upd, hk, hc]
      · cases h
  -- accept / charge / newSession: only server fields (accepted, spent, delivered) change
  | accept k0 x =>
    simp only [step] at h
    split at h
    · cases h
    · split at h
      · split at h
        · cases h; exact ⟨hc, rfl, rfl, rfl, rfl⟩
        · split at h
          · cases h; exact ⟨hc, rfl, rfl, rfl, rfl⟩
          · cases h
      · cases h
  | charge k0 cost =>
    simp only [step] at h
    split at h
    · cases h
    · split at h
      · cases h; exact ⟨hc, rfl, rfl, rfl, rfl⟩
      · cases h
  | newSession k0 =>
    simp only [step, g5] at h
    cases h; exact ⟨hc, rfl, rfl, rfl, rfl⟩

/-! ## P7 — top-up preserves P1-P6, and a finalized channel holds no residual funds
  §6.4.3 topUp (cancels a pending close), §9.3.2, §11.2. P1, P2, P6 are consequences of Inv,
  and Inv is preserved by topUp; P3, P5, P6-frozen are proved above for every action,
  topUp included; P4 holds in every state. The state half, P7_no_stranded_funds, is what a
  top-up into a finalized channel breaks
  (G2b_violates_P7). -/

/-- P7: once finalized, every deposited unit went to the payee or the payer.
  * Why it matters: closing or withdrawing leaves no funds stranded in the escrow, and no
    later top-up can add funds nobody can take out.
  * Proof: with finalized = true, conjunct 4 reads refunded = deposit - settled; add
    conjuncts 1-3. -/
theorem P7_no_stranded_funds (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key} {c : Chan}
    (hc : s.chans k = some c) (hf : c.finalized = true) :
    s.paid k + s.refunded k = s.deposited k := by
  have hi := reachable_inv hg hr k
  -- select the finalized branch of the if in conjunct 4
  simp only [ChanInv, hc, hf, ite_true] at hi
  -- settled + (deposit - settled) = deposit, since settled ≤ deposit
  omega

/-- P7: a successful topUp preserves Inv.
  * Proof: the topUp case of inv_step. -/
theorem P7_topUp_preserves_inv (hg : cfg.Guarded) {caller amt : Nat} {k : Key}
    (hI : Inv cfg s) (h : step cfg s (.topUp caller k amt) = some s') : Inv cfg s' :=
  inv_step hg hI h

/-- P7: what a successful topUp does: deposit grows by amt, a pending close is cancelled,
  no money is paid or refunded, deposited grows by amt; and it was called by the payer on a
  non-finalized channel (§6.4.3, §6.5).
  * Why it matters: a top-up cannot be used to move funds out, and it resets the forced-close
    clock, as §6.4.3 says.
  * Proof: unfold the topUp branch; the guard gives caller = payer and (G2) not finalized. -/
theorem P7_topUp_effect (hg : cfg.Guarded) {caller amt : Nat} {k : Key} {c : Chan}
    (hc : s.chans k = some c) (h : step cfg s (.topUp caller k amt) = some s') :
    s'.chans k = some { c with deposit := c.deposit + amt, closeReq := none } ∧
      s'.paid = s.paid ∧ s'.refunded = s.refunded ∧ s'.deposited k = s.deposited k + amt ∧
      caller = k.payer ∧ c.finalized = false := by
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  simp only [step, hc, g1, true_implies] at h
  split at h
  -- success: read off the new record; paid and refunded are not in the update
  · next hcond => cases h; exact ⟨by simp, rfl, rfl, by simp, hcond.1, hcond.2⟩
  · cases h

/-- P7: all of P1, P2, P6 hold in the state right after any top-up of a reachable state.
  * Proof: that state is itself reachable (one more step), so the general theorems apply. -/
theorem P7_topUp_keeps_P1_P2_P6 (hg : cfg.Guarded) (hr : Reachable cfg s) {caller amt : Nat}
    {k : Key} (h : step cfg s (.topUp caller k amt) = some s') (k' : Key) :
    (s'.paid k' = 0 ∨ ∃ v ∈ s'.sigs, v.signer = k'.signer ∧ v.v.chan = k' ∧
      v.v.escrow = cfg.escrow ∧ v.v.chainId = cfg.chainId ∧ s'.paid k' ≤ v.v.amount) ∧
    s'.paid k' + s'.refunded k' ≤ s'.deposited k' ∧ s'.finals k' ≤ 1 := by
  have hr' : Reachable cfg s' := Reachable.step _ hr h
  exact ⟨P1_payee_le_signed hg hr' k', P2_conservation hg hr' k', P6_finalize_at_most_once hg hr' k'⟩

/-! ## P8 (extra) — the server never delivers more service than vouchers it can redeem
  §12.1, §12.2, §13.4. -/

/-- P8: in every reachable state, service delivered on k is at most the accepted amount. What backs the accepted amount is P8a_accepted_backed.
  * Why it matters: with P8a, every unit delivered is backed by a voucher the payee could redeem while
    the channel is open (P8b_payee_can_settle_accepted). It is NOT a promise that the payee
    still can redeem it later: once the payer withdraws after the grace window the channel is
    finalized and the voucher is void (see Scope). Needs G5 (spent per channel), see
    G5_violates_P8.
  * Scope: a per-state bound. The payee actually collects only if it settles within the grace
    window after a close request (P8b_payee_can_settle_accepted while open); with G7, charge
    refuses to deliver once a close is pending (P8c_no_delivery_while_closing), so no service
    is delivered that the window can't cover (GAPS.md row 11, G7_unpaid_delivery). A payee
    that skips the window still goes unpaid (G7_idle_payee_unpaid).
  * Proof: conjuncts 8 and 9 (delivered = spent ≤ accepted). -/
theorem P8_delivered_le_accepted (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    s.delivered k ≤ s.accepted k := by
  have hi := reachable_inv hg hr k
  unfold ChanInv at hi
  split at hi
  -- never opened: delivered = accepted = 0
  · omega
  · obtain ⟨_, _, _, _, _, _, _, h8, h9, _⟩ := hi
    -- delivered = spent (h9) ≤ accepted (h8)
    omega

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
  * Proof: conjunct 7 (accepted ≤ deposit) and conjunct 10 (accepted voucher valid);
    an unopened channel has accepted = 0, acceptedSig = none and no record, so the bound is
    vacuous. -/
theorem P8a_accepted_backed (hg : cfg.Guarded) (hr : Reachable cfg s) (k : Key) :
    (∀ c, s.chans k = some c → s.accepted k ≤ c.deposit) ∧
    ((s.acceptedSig k = none ∧ s.accepted k = 0) ∨
      ∃ v, s.acceptedSig k = some v ∧ v ∈ s.sigs ∧ v.signer = k.signer ∧ v.v.chan = k ∧
        v.v.escrow = cfg.escrow ∧ v.v.chainId = cfg.chainId ∧ v.v.amount = s.accepted k) := by
  have hi := reachable_inv hg hr k
  unfold ChanInv at hi
  split at hi
  -- never opened: no record (so the bound holds vacuously), accepted = 0 (fifth conjunct)
  -- and acceptedSig = none (eighth)
  · next hc =>
    obtain ⟨_, _, _, _, ha, _, _, hn⟩ := hi
    exact ⟨fun c hc' => (by rw [hc] at hc'; cases hc'), Or.inl ⟨hn, ha⟩⟩
  · next c0 hc =>
    obtain ⟨_, _, _, _, _, _, h7, _, _, h10⟩ := hi
    refine ⟨fun c hc' => ?_, ?_⟩
    -- the record asked about is c0 itself; h7 is accepted ≤ c0.deposit
    · rw [hc] at hc'; cases hc'; exact h7
    -- unpack ValidSig of the recorded voucher into the statement's five facts
    · rcases h10 with h10 | ⟨w, hw0, ⟨m, s1, s2, s3, s4⟩, hw⟩
      · exact Or.inl h10
      · exact Or.inr ⟨w, hw0, m, s1, s2, s3, s4, hw⟩

/-- P8c: with G7 on, a successful charge happens only while no close request is pending.
  * Why it matters: everything delivered is covered by a voucher accepted before any close
    request, which the payee can settle during the grace window (§11.3 step 5, §13.3). Without
    G7, the server can deliver after the grace window, when the payer may withdraw before the
    payee can settle (G7_unpaid_delivery).
  * Proof: G7 makes closeReq = none a conjunct of charge's guard. -/
theorem P8c_no_delivery_while_closing (hd : cfg.guardDelivery = true) {k : Key} {c : Chan}
    {cost : Nat} (hc : s.chans k = some c) (h : step cfg s (.charge k cost) = some s') :
    c.closeReq = none := by
  simp only [step, hc, hd, true_implies] at h
  split at h
  -- guard held: its second conjunct is the claim
  · next hcond => exact hcond.2.1
  -- guard failed: charge reverted, contradicting h
  · cases h

/-! ## P8b (extra) — payee protection: no withdraw without a close request + grace, and the
  payee can always settle the highest accepted voucher while the channel is open.
  §6.4.6, §13.3, §14.6 "Payee protection". -/

/-- P8b: a successful withdraw implies a close was requested at some time r and the grace
  period since r has elapsed.
  * Why it matters: the payee always gets the grace window to settle before the payer takes
    the rest (§13.3, §14.6). Needs G1, see G1_withdraw_without_request.
  * Proof: G1 (g4) makes closeReq.isSome a guard; the grace guard then reads r + grace ≤ now. -/
theorem P8b_withdraw_needs_request (hg : cfg.Guarded) {caller : Nat} {k : Key} {c : Chan}
    (hc : s.chans k = some c) (h : step cfg s (.withdraw caller k) = some s') :
    ∃ r, c.closeReq = some r ∧ r + cfg.grace ≤ s.now := by
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  simp only [step, hc, g1, g4, true_implies] at h
  split at h
  · next hcond =>
    -- hs: closeReq.isSome; ht: closeReq.getD 0 + grace ≤ now
    obtain ⟨_, _, hs, _, ht⟩ := hcond
    cases hr : c.closeReq with
    -- no request: isSome is false, contradicting hs
    | none => rw [hr] at hs; cases hs
    -- request at r: getD 0 = r, so ht is the claim
    | some r => exact ⟨r, rfl, by rw [hr] at ht; simpa using ht⟩
  · cases h

/-- P8b: while the channel is open and settled < accepted, the payee can settle on chain and
  then has been paid exactly the accepted amount.
  * Why it matters: the voucher the server accepted is always redeemable, so delivering
    service against it is safe (§12, §14.6).
  * Proof: conjunct 10 gives a valid voucher x with amount = accepted; conjunct 7
    (accepted ≤ deposit) gives the G4 upper bound; hlt gives settled < amount; conjunct 1 gives
    paid = settled, so paid + (amount - settled) = accepted. -/
theorem P8b_payee_can_settle_accepted (hg : cfg.Guarded) (hr : Reachable cfg s) {k : Key}
    {c : Chan} (hc : s.chans k = some c) (hf : c.finalized = false)
    (hlt : c.settled < s.accepted k) :
    ∃ x s', step cfg s (.settle k.payee k x) = some s' ∧ s'.paid k = s.accepted k := by
  have hi := reachable_inv hg hr k
  simp only [ChanInv, hc] at hi
  obtain ⟨h1, _, _, _, _, _, h7, _, _, h10⟩ := hi
  rcases h10 with ⟨_, h10⟩ | ⟨x, _, hv, hx⟩
  -- accepted = 0 contradicts settled < accepted
  · omega
  · obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
    have hs : step cfg s (.settle k.payee k x) =
        some { s with chans := upd s.chans k (some { c with settled := x.v.amount }),
                      paid := upd s.paid k (s.paid k + (x.v.amount - c.settled)) } := by
      -- G4 bounds: settled < amount (hlt, hx) and amount ≤ deposit (h7, hx)
      have h1' : c.settled < x.v.amount := by omega
      have h2' : x.v.amount ≤ c.deposit := by omega
      simp [step, hc, g1, g3, hf, hv, h1', h2', Nat.le_of_lt h1']
    refine ⟨x, _, hs, ?_⟩
    -- paid' = settled + (amount - settled) = amount = accepted
    simp; omega

/-! ## P9 (extra) — a cooperative close captures at most
  max(settled on chain, service delivered on the channel), the §13.2 bound.
  Scope: this bounds close only. settle (§6.4.2) can first redeem any signed voucher,
  consumed or not, raising 'settled'; then close may capture it in full with nothing
  delivered. So P9 does NOT mean "the payer pays only for consumption" (GAPS.md row 10;
  Counterexamples.Gap10_settle_then_close_unconsumed runs that trace with every guard on).
  §13.2 "MUST NOT capture more than the amount actually consumed", captureAmount =
  max(spent, settledOnChain). Holds for every close from any
  reachable state; v1 close (capture = cumulativeAmount, §6.4.4) breaks it, see G6. -/

/-- P9: any successful close from a reachable state captures at most
  max(settled, delivered on k).
  * Why it matters: close itself never adds unconsumed value beyond what is already settled
    (§13.2). It does not stop a prior settle of an unconsumed voucher (GAPS.md row 10).
  * Proof: G6 (g6) bounds cap by max(settled, spent); conjunct 9 rewrites spent to
    delivered. -/
theorem P9_capture_le_consumed (hg : cfg.Guarded) (hr : Reachable cfg s) {caller cap : Nat}
    {k : Key} {x : Sig} {c : Chan} (hc : s.chans k = some c)
    (h : step cfg s (.close caller k x cap) = some s') :
    cap ≤ max c.settled (s.delivered k) := by
  have hi := reachable_inv hg hr k
  simp only [ChanInv, hc] at hi
  -- h9: delivered = spent
  obtain ⟨_, _, _, _, _, _, _, _, h9, _⟩ := hi
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  simp only [step, hc, g6, true_implies] at h
  split at h
  -- the last guard conjunct is cap ≤ max settled spent
  · next hcond => rw [h9]; exact hcond.2.2.2.2.2.2
  · cases h

end TempoSession
