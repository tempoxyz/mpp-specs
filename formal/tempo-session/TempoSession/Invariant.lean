import TempoSession.Model
/-
  Inductive invariant over all reachable states (for any Cfg with all guards on).

  Proof plan
  * ChanInv cfg st k: what must hold for one channel k; Inv = ChanInv for every k.
  * inv_init: the empty escrow satisfies it.
  * inv_step: every successful step preserves it (one case per action).
  * reachable_inv: induction on Reachable; every property in Properties.lean is then read off Inv.

  Shape of each inv_step case
  * "split at h" on the step's match/if; branches that return none are closed by "cases h"
    (none = some s' is impossible): a reverting call cannot break anything.
  * For the touched channel (k' = k): unpack the 10 conjuncts h1..h10 of the old ChanInv, then
    rebuild the new one, reusing unchanged conjuncts and closing arithmetic ones with omega.
  * For every other channel (k' ≠ k): upd leaves its fields unchanged, so simp [upd, hk] turns
    the goal into the old ChanInv.
-/
namespace TempoSession

/-- Per-channel invariant. Two shapes:
  * channel never opened (none): every ghost and server counter is still 0
    (nothing was paid, refunded, deposited, finalized, accepted, spent or delivered) and no
    voucher has been accepted;
  * channel exists (some c), ten conjuncts, numbered as the proofs unpack them (h1..h10):
    1. paid = settled: the payee has received exactly the on-chain settled amount;
    2. settled ≤ deposit: the channel never owes more than it holds;
    3. deposited = deposit: the ghost inflow matches the on-chain deposit;
    4. refunded = deposit - settled once finalized, else 0: the payer got the rest only at the end;
    5. finals = 1 once finalized, else 0: at most one finalization;
    6. settled = 0, or some valid voucher for k has amount ≥ settled (payout backed by a signature);
    7. accepted ≤ deposit: the server never accepts more than is locked;
    8. spent ≤ accepted: the server never charges past accepted vouchers;
    9. delivered = spent: with G5 on, spent is never reset, so it equals the service delivered;
    10. no voucher accepted yet (acceptedSig = none, accepted = 0), or the accepted voucher itself
        (acceptedSig = some s) is valid for k and has amount = accepted (server holds a redeemable voucher).
  Conjuncts 1-6 are contract facts (P1, P2, P4b, P6, P7); 7-10 are server facts (P8, P8a, P8b,
  P9). -/
def ChanInv (cfg : Cfg) (st : St) (k : Key) : Prop :=
  match st.chans k with
  | none => st.paid k = 0 ∧ st.refunded k = 0 ∧ st.deposited k = 0 ∧ st.finals k = 0 ∧
            st.accepted k = 0 ∧ st.spent k = 0 ∧ st.delivered k = 0 ∧ st.acceptedSig k = none
  | some c => st.paid k = c.settled ∧ c.settled ≤ c.deposit ∧ st.deposited k = c.deposit ∧
      st.refunded k = (if c.finalized then c.deposit - c.settled else 0) ∧
      st.finals k = (if c.finalized then 1 else 0) ∧
      (c.settled = 0 ∨ ∃ s, ValidSig cfg st.sigs k s ∧ c.settled ≤ s.v.amount) ∧
      st.accepted k ≤ c.deposit ∧ st.spent k ≤ st.accepted k ∧ st.delivered k = st.spent k ∧
      ((st.acceptedSig k = none ∧ st.accepted k = 0) ∨
        ∃ s, st.acceptedSig k = some s ∧ ValidSig cfg st.sigs k s ∧ s.v.amount = st.accepted k)

/-- The global invariant: ChanInv holds for every channel key. -/
def Inv (cfg : Cfg) (st : St) : Prop := ∀ k, ChanInv cfg st k

/-- Base case: the empty escrow satisfies Inv.
  * No channel exists and every counter is 0, so the "none" shape holds by simp. -/
theorem inv_init (cfg : Cfg) : Inv cfg St.init := by
  intro k; simp [ChanInv, St.init]

/-- Adding a signature keeps a valid signature valid (sigs only grows).
  * Used by the sign case: witnesses for conjuncts 6 and 10 survive new signatures. -/
theorem validSig_cons {cfg sigs k s} (x : Sig) (h : ValidSig cfg sigs k s) :
    ValidSig cfg (x :: sigs) k s := by
  -- membership moves to the longer list; the other four conjuncts don't mention sigs
  obtain ⟨h1, h2⟩ := h; exact ⟨List.mem_cons_of_mem _ h1, h2⟩

/-- Inductive step: with all guards on, every successful step preserves Inv.
  * One case per action of step (§6.4.1-§6.4.6, §10.4, §11.3, §12.2, §13.4).
  * This is the heart of the development: every per-state property P1, P2, P6, P8, P8b, P9
    rests on it. -/
theorem inv_step {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {a : Act}
    (hI : Inv cfg s) (h : step cfg s a = some s') : Inv cfg s' := by
  -- g1 = guardFinalized, g2 = guardExists, g3 = guardBounds, g4 = withdrawNeedsRequest,
  -- g5 = spentPerChannel, g6 = guardCapture (g6 is not needed: capture bounds suffice here)
  obtain ⟨g1, g2, g3, g4, g5, g6⟩ := hg
  intro k'
  cases a with
  -- | tick: only 'now' changes, and ChanInv does not mention 'now'
  | tick d => cases h; exact hI k'
  -- | sign: only sigs grows; signature witnesses in conjuncts 6 and 10 stay valid
  | sign x =>
    cases h
    have hi := hI k'
    unfold ChanInv at hi ⊢
    split at hi
    -- channel absent: the "none" shape mentions no signatures
    · next hc => simp only [hc]; exact hi
    -- channel present: everything carries over except the two ∃-witness conjuncts
    · next c hc =>
      simp only [hc]
      obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
      refine ⟨h1, h2, h3, h4, h5, ?_, h7, h8, h9, ?_⟩
      -- conjunct 6: keep the same witness, lifted to x :: sigs
      · rcases h6 with h6 | ⟨w, hw, hw'⟩
        · exact Or.inl h6
        · exact Or.inr ⟨w, validSig_cons x hw, hw'⟩
      -- conjunct 10: same argument for the accepted voucher (acceptedSig is unchanged)
      · rcases h10 with h10 | ⟨w, hw0, hw, hw'⟩
        · exact Or.inl h10
        · exact Or.inr ⟨w, hw0, validSig_cons x hw, hw'⟩
  -- | openCh: creates channel k (G3 guarantees it did not exist before)
  | openCh caller k amt =>
    simp only [step, g2, true_implies] at h
    split at h
    · next hcond =>
      cases h
      by_cases hk : k' = k
      -- the opened channel: by G3 it was absent, so the old "none" shape gives all counters 0;
      -- the fresh record (deposit amt, settled 0) with deposited = 0 + amt satisfies ChanInv
      · subst hk
        have hi := hI k'
        simp only [ChanInv, hcond.2] at hi
        simp [ChanInv, hi]
      -- other channels: untouched (frame via upd)
      · have hi := hI k'
        simpa [ChanInv, upd, hk] using hi
    -- open reverted: nothing to prove
    · cases h
  -- | topUp: deposit and deposited both grow by amt, closeReq cleared
  | topUp caller k amt =>
    simp only [step, g1, true_implies] at h
    split at h
    -- unknown channel: topUp reverts
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        cases h
        by_cases hk : k' = k
        · subst hk
          have hi := hI k'
          simp only [ChanInv, hc] at hi
          -- G2: the channel is not finalized, so refunded = 0 and finals = 0 before and after
          have hf := hcond.2
          obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
          simp only [ChanInv, upd_same]
          simp only [hf] at h4 h5 ⊢
          -- settled ≤ deposit + amt, deposited + amt = deposit + amt and
          -- accepted ≤ deposit + amt all follow linearly from h2, h3, h7 (omega)
          refine ⟨h1, by omega, by omega, h4, h5, h6, by omega, h8, h9, h10⟩
        · have hi := hI k'
          simpa [ChanInv, upd, hk] using hi
      -- guard failed: topUp reverts
      · cases h
  -- | settle: settled := cum, paid grows by cum - settled
  | settle caller k x =>
    simp only [step, g1, g3, true_implies] at h
    split at h
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        cases h
        -- hf: not finalized (G2); hv: valid signature; hlt, hle: settled < cum ≤ deposit (G4)
        obtain ⟨_, hf, hv, _, hlt, hle⟩ := hcond
        by_cases hk : k' = k
        · subst hk
          have hi := hI k'
          simp only [ChanInv, hc] at hi
          obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
          simp only [ChanInv, upd_same]
          simp only [hf] at h4 h5 ⊢
          -- 1: paid + (cum - settled) = cum, since paid = settled (h1) and settled < cum (omega)
          -- 2: cum ≤ deposit is the G4 bound hle
          -- 6: the settled voucher x itself is the witness
          refine ⟨by omega, hle, h3, h4, h5, Or.inr ⟨x, hv, Nat.le_refl _⟩, h7, h8, h9, h10⟩
        · have hi := hI k'
          simpa [ChanInv, upd, hk] using hi
      · cases h
  -- | close: settled := cap, payee gets cap - settled, payer gets deposit - cap, finalized
  | close caller k x cap =>
    simp only [step, g1, true_implies] at h
    split at h
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        cases h
        -- hf: not finalized (G2); hv: valid sig; hcap: cap ≤ cum; hlo, hhi: settled ≤ cap ≤ deposit
        obtain ⟨_, hf, hv, hcap, hlo, hhi, _⟩ := hcond
        by_cases hk : k' = k
        · subst hk
          have hi := hI k'
          simp only [ChanInv, hc] at hi
          obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
          simp only [ChanInv, upd_same]
          -- before: not finalized, so refunded = 0 and finals = 0
          simp [hf] at h4 h5
          -- after: finalized = true, so the "if" picks the finalized branch
          simp only [ite_true]
          -- 1: settled + (cap - settled) = cap (needs settled ≤ cap, hlo)
          -- 4: 0 + (deposit - cap) = deposit - cap; 5: 0 + 1 = 1 (omega)
          -- 6: x witnesses cap ≤ cum
          refine ⟨by omega, hhi, h3, by omega, by omega, Or.inr ⟨x, hv, hcap⟩, h7, h8, h9, h10⟩
        · have hi := hI k'
          simpa [ChanInv, upd, hk] using hi
      · cases h
  -- | requestClose: only closeReq changes, which ChanInv does not mention
  | requestClose caller k =>
    simp only [step, g1, true_implies] at h
    split at h
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        cases h
        by_cases hk : k' = k
        · subst hk
          have hi := hI k'
          simp only [ChanInv, hc] at hi
          simpa [ChanInv] using hi
        · have hi := hI k'
          simpa [ChanInv, upd, hk] using hi
      · cases h
  -- | withdraw: payer refunded deposit - settled, channel finalized
  | withdraw caller k =>
    simp only [step, g1, g4, true_implies] at h
    split at h
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        cases h
        -- hf: not finalized (G2), so this is the first finalization
        obtain ⟨_, hf, _, _⟩ := hcond
        by_cases hk : k' = k
        · subst hk
          have hi := hI k'
          simp only [ChanInv, hc] at hi
          obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
          simp only [ChanInv, upd_same]
          simp [hf] at h4 h5
          simp only [ite_true]
          -- settled is unchanged, so only 4 (refunded 0 → deposit - settled) and
          -- 5 (finals 0 → 1) change; both are linear (omega)
          refine ⟨h1, h2, h3, by omega, by omega, h6, h7, h8, h9, h10⟩
        · have hi := hI k'
          simpa [ChanInv, upd, hk] using hi
      · cases h
  -- | accept: server raises accepted to cum (or replays, a no-op)
  | accept k x =>
    simp only [step] at h
    split at h
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        -- hv: valid sig; hge: accepted ≤ cum; hle: cum ≤ deposit
        obtain ⟨_, _, hv, hge, hle⟩ := hcond
        split at h
        -- idempotent retry (cum = accepted): the state is unchanged
        · cases h; exact hI k'
        · split at h
          -- raise by ≥ minDelta: accepted := cum
          · cases h
            by_cases hk : k' = k
            · subst hk
              have hi := hI k'
              simp only [ChanInv, hc] at hi
              obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
              simp only [ChanInv, upd_same, hc]
              -- 7: cum ≤ deposit (hle); 8: spent ≤ old accepted ≤ cum (h8, hge, omega);
              -- 10: x is now the recorded voucher (acceptedSig = some x), valid (hv), amount = accepted
              exact ⟨h1, h2, h3, h4, h5, h6, hle, by omega, h9, Or.inr ⟨x, rfl, hv, rfl⟩⟩
            · have hi := hI k'
              simpa [ChanInv, upd, hk] using hi
          -- raise below minDelta: rejected
          · cases h
      -- verification failed (§11.3): rejected
      · cases h
  -- | charge: spent and delivered both grow by cost; the channel record is untouched
  | charge k cost =>
    simp only [step] at h
    split at h
    · cases h
    · next c hc =>
      split at h
      · next hcond =>
        -- hle: spent + cost ≤ accepted (the §12.2 balance check)
        obtain ⟨_, _, hle⟩ := hcond
        cases h
        by_cases hk : k' = k
        · subst hk
          have hi := hI k'
          simp only [ChanInv, hc] at hi
          simp only [ChanInv, hc, upd_same]
          obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9, h10⟩ := hi
          -- 8: new spent ≤ accepted is exactly hle;
          -- 9: delivered + cost = spent + cost from h9 (omega)
          exact ⟨h1, h2, h3, h4, h5, h6, h7, hle, by omega, h10⟩
        · have hi := hI k'
          simpa [ChanInv, upd, hk] using hi
      -- balance check failed or channel finalized: rejected
      · cases h
  -- | newSession: with G5 on (g5) the step is a no-op, so Inv carries over unchanged.
  --   (With G5 off, spent resets and conjunct 9 delivered = spent breaks: see G5.)
  | newSession k =>
    simp only [step, g5] at h
    cases h; exact hI k'

/-- Every reachable state satisfies Inv (all guards on).
  * Induction on Reachable: inv_init for the base, inv_step for each successful step. -/
theorem reachable_inv {cfg : Cfg} (hg : cfg.Guarded) {s : St} (h : Reachable cfg s) : Inv cfg s := by
  induction h with
  | init => exact inv_init cfg
  | step a _ hs ih => exact inv_step hg ih hs

end TempoSession
