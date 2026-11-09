import TempoCharge.Model
import TempoCharge.Invariant
/-
  Properties P1-P9; README.md lists each with its theorems. State properties hold in every
  reachable state with every guard on (Cfg.Guarded) and are read off SysInv (Invariant.lean).
  One-step theorems that only read a rule back (P4 replay/expiry/binding, P6 hash with
  feePayer, P8, P9) are sanity checks that step encodes the rule as the draft states it.
-/
namespace TempoCharge

variable {cfg : Cfg} {s s' : St}

/-! ## Arithmetic: a one-to-one match transfers at least the requested amount -/

/-- Total of a list of transfers in token tok. -/
def sumOn (tok : Nat) : List Transfer → Nat
  | [] => 0
  | c :: cs => (if c.token = tok then c.amount else 0) + sumOn tok cs

/-- Total amount of a list of transfers, whatever the token. -/
def sumAll : List Transfer → Nat
  | [] => 0
  | c :: cs => c.amount + sumAll cs

/-- Taking out a fitting transfer removes exactly r.amount from the total in r.token. -/
theorem takeAll_sum (r : Transfer) : ∀ (l l' : List Transfer), l' ∈ takeAll r l →
    sumOn r.token l = r.amount + sumOn r.token l'
  | [], _, h => by simp [takeAll] at h
  | c :: cs, l', h => by
    simp only [takeAll, List.mem_append, List.mem_map] at h
    rcases h with h | ⟨l'', h', rfl⟩
    · split at h
      · simp only [List.mem_singleton] at h
        subst h
        rename_i hf
        simp only [fits, Bool.and_eq_true, beq_iff_eq] at hf
        simp [sumOn, hf]
      · simp at h
    · have := takeAll_sum r cs l'' h'
      simp only [sumOn]
      omega

/-- If every required transfer is in token tok and they match one-to-one, the calls move at
  least their total in tok. -/
theorem matchOne_sum (tok : Nat) : ∀ (rs calls : List Transfer), (∀ r ∈ rs, r.token = tok) →
    matchOne calls rs = true → sumAll rs ≤ sumOn tok calls
  | [], _, _, _ => by simp [sumAll]
  | r :: rs, calls, ht, h => by
    simp only [matchOne, List.any_eq_true] at h
    obtain ⟨rest, hrest, h⟩ := h
    have hr : r.token = tok := ht r (by simp)
    have h1 := takeAll_sum r calls rest hrest
    have h2 := matchOne_sum tok rs rest (fun q hq => ht q (by simp [hq])) h
    rw [hr] at h1
    simp only [sumAll]
    omega

/-- The split transfers total sumSplits. -/
theorem sumAll_splits (cur : Nat) : ∀ ss : List Split,
    sumAll (ss.map fun s => ({ token := cur, dst := s.recipient, amount := s.amount, memo := s.memo } : Transfer)) =
      sumSplits ss
  | [] => rfl
  | s :: ss => by simp [sumAll, sumSplits, sumAll_splits cur ss]

/-- A valid request's required transfers total exactly amount, all in currency. -/
theorem required_total (r : Request) (chain : Nat) (hv : r.valid chain = true) :
    sumAll r.required = r.amount ∧ ∀ q ∈ r.required, q.token = r.currency := by
  constructor
  · simp only [Request.required, sumAll, sumAll_splits]
    simp only [Request.valid, Bool.and_eq_true, Bool.or_eq_true, List.isEmpty_iff,
      List.all_eq_true, decide_eq_true_eq] at hv
    rcases hv.2 with h | h
    · simp [h, sumSplits]
    · omega
  · intro q hq
    simp only [Request.required, List.mem_cons, List.mem_map] at hq
    rcases hq with rfl | ⟨_, _, rfl⟩ <;> rfl

/-- One-to-one matching against a valid request transfers at least amount in currency. -/
theorem matchOne_amount {r : Request} {chain : Nat} {calls : List Transfer}
    (hv : r.valid chain = true) (hm : matchOne calls r.required = true) :
    r.amount ≤ sumOn r.currency calls := by
  obtain ⟨h1, h2⟩ := required_total r chain hv
  have := matchOne_sum r.currency r.required calls h2 hm
  omega

/-! ## P1 — a receipt means the challenge it names was paid -/

/-- P1: every receipt names an issued challenge of this realm, and
  * a transaction reference: that transaction is on chain, succeeded, matches the request's
    transfers one-to-one and so moved at least amount of currency;
  * a proof reference: the request was free (amount 0) and a version 3 proof signed by its
    account binds this challenge id, realm and chain.
  * Why it matters: core §Receipt Status Semantics and intent §Atomicity: a receipt (and the
    resource) only follows a verified payment for that very challenge.
  * Rests on G2 (pull success), G3 (proof only for 0) and G4 (one-to-one). -/
theorem P1_receipt_paid (hg : cfg.Guarded) (hr : Reachable cfg s) {r : Receipt}
    (hrm : r ∈ s.receipts) :
    ∃ c, s.issued r.cid = some c ∧ c.id = r.cid ∧ c.realm = cfg.realm ∧
      (∀ t, r.ref = .tx t → succeeded s t = true ∧ matchOne t.calls c.request.required = true ∧
        c.request.amount ≤ sumOn c.request.currency t.calls) ∧
      (∀ id, r.ref = .challenge id → id = r.cid ∧ c.request.amount = 0 ∧
        ∃ p ∈ s.proofSigs, p.signer = p.account ∧ p.challengeId = c.id ∧ p.realm = c.realm ∧
          p.chainId = c.request.chainId ∧ p.version = 3) := by
  have hi := reachable_inv hg hr
  obtain ⟨_, c, hc, htx, hpf⟩ := hi.receipts_ok r hrm
  obtain ⟨hid, hrealm, hv⟩ := hi.issued_ok _ c hc
  refine ⟨c, hc, hid, hrealm, fun t ht => ?_, hpf⟩
  obtain ⟨a, _, m⟩ := htx t ht
  exact ⟨a, m, matchOne_amount hv m⟩

/-! ## P2 / P3 — single use: one receipt per challenge, one challenge per transaction -/

/-- P2: no challenge gets two receipts (intent §Single-Use, core §Replay Protection,
  §Concurrent Request Handling: at most one settlement and one delivery). -/
theorem P2_one_receipt_per_challenge (hg : cfg.Guarded) (hr : Reachable cfg s) :
    (s.receipts.map Receipt.cid).Nodup :=
  (reachable_inv hg hr).cids_nodup

/-- P3: no transaction settles two challenges, across pull and push (no double counting of one
  payment; rests on G1). -/
theorem P3_one_challenge_per_tx (hg : cfg.Guarded) (hr : Reachable cfg s) :
    (s.receipts.filterMap fun r => r.ref.txOf).Nodup :=
  (reachable_inv hg hr).txs_nodup

/-! ## P4 — a receipt answers an outstanding, matching, unexpired challenge -/

/-- P4: a step that issues a receipt is the submission of a credential whose echoed challenge
  is the one issued under its id (core §Challenge Binding), unused and not expired (intent
  §Server Responsibilities steps 1-2), and the receipt names that challenge. No other action
  issues a receipt (core §Idempotency and Side Effects), and old receipts stay. -/
theorem P4_receipt_answers_challenge {a : Act} (h : step cfg s a = some s') {r : Receipt}
    (hnew : r ∈ s'.receipts) (hold : r ∉ s.receipts) :
    ∃ cr, a = .submit cr ∧ r.cid = cr.echo.id ∧ s.issued cr.echo.id = some cr.echo ∧
      s.used cr.echo.id = false ∧ s.now < cr.echo.expires := by
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    simp only [settleTx, List.mem_cons] at hnew <;> grind

/-- P4 (sanity): a credential for a used challenge is rejected (replay). -/
theorem P4_replay_rejected {cr : Cred} (hu : s.used cr.echo.id = true) :
    step cfg s (.submit cr) = none := by
  simp [step, hu]

/-- P4 (sanity): a credential for an expired challenge is rejected. -/
theorem P4_expired_rejected {cr : Cred} (he : cr.echo.expires ≤ s.now) :
    step cfg s (.submit cr) = none := by
  simp only [step]
  grind

/-- P4 (sanity): a credential whose echoed challenge differs from the one issued under its id
  (another amount, recipient, realm, expiry) is rejected. -/
theorem P4_unbound_rejected {cr : Cred} (hb : s.issued cr.echo.id ≠ some cr.echo) :
    step cfg s (.submit cr) = none := by
  simp only [step]
  grind

/-! ## P5 — receipts and used challenges are permanent -/

/-- P5: a step never removes a receipt and never frees a used challenge. -/
theorem P5_monotone {a : Act} (h : step cfg s a = some s') :
    (∀ r ∈ s.receipts, r ∈ s'.receipts) ∧ (∀ id, s.used id = true → s'.used id = true) := by
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    simp only [settleTx] <;> grind [upd_apply]

/-! ## P6 — the server pays fees only where it offered to -/

/-- P6: every challenge whose fees the server paid offered feePayer: true (§Fee Payment). -/
theorem P6_sponsor_only_feePayer (hg : cfg.Guarded) (hr : Reachable cfg s) {id : Nat}
    (hs : id ∈ s.sponsored) : ∃ c, s.issued id = some c ∧ c.request.feePayer = true :=
  (reachable_inv hg hr).sponsored_ok id hs

/-- P6 (sanity): a hash credential for a feePayer challenge is rejected (§Hash Settlement). -/
theorem P6_hash_feePayer_rejected {cr : Cred} {t : Tx} (hp : cr.payload = .hash t)
    (hf : cr.echo.request.feePayer = true) : step cfg s (.submit cr) = none := by
  simp only [step, hp]
  grind

/-! ## P7 — validBefore bounds when a signed transaction can land -/

/-- P7: every included transaction landed before its validBefore. -/
theorem P7_included_before_validBefore (hg : cfg.Guarded) (hr : Reachable cfg s) {i : Incl}
    (hi : i ∈ s.included) {vb : Nat} (hv : i.tx.validBefore = some vb) : i.time < vb :=
  (reachable_inv hg hr).validBefore_ok i hi vb hv

/-- P7: a client that follows §Method Details (validBefore no later than expires) is never
  charged by that transaction after the challenge expired. -/
theorem P7_no_charge_after_expiry (hg : cfg.Guarded) (hr : Reachable cfg s) {i : Incl}
    (hi : i ∈ s.included) {c : Challenge} {vb : Nat} (hv : i.tx.validBefore = some vb)
    (hle : vb ≤ c.expires) : i.time < c.expires := by
  have := P7_included_before_validBefore hg hr hi hv
  omega

/-! ## P8 — proof credentials (§Proof Verification) -/

/-- P8 (sanity): a proof without source is rejected (step 1). -/
theorem P8_proof_needs_source {cr : Cred} {p : ProofSig} (hp : cr.payload = .proof p)
    (hs : cr.source = none) : step cfg s (.submit cr) = none := by
  simp only [step, hp, hs]
  grind

/-- P8 (sanity): a proof for another challenge id, realm or chain, by another signer, or under
  domain version "1" or "2" is rejected (steps 2-4). -/
theorem P8_proof_binding {cr : Cred} {p : ProofSig} {ch acct : Nat} (hp : cr.payload = .proof p)
    (hs : cr.source = some (ch, acct))
    (hbad : p.challengeId ≠ cr.echo.id ∨ p.realm ≠ cr.echo.realm ∨
      p.chainId ≠ cr.echo.request.chainId ∨ ch ≠ cr.echo.request.chainId ∨ p.signer ≠ acct ∨
      p.account ≠ acct ∨ p.version ≠ 3) :
    step cfg s (.submit cr) = none := by
  simp only [step, hp, hs]
  grind

/-! ## P9 — submission modes (§Submission Modes) -/

/-- P9 (sanity): a transaction credential is rejected when supportedModes omits pull. -/
theorem P9_pull_needs_pull_mode {cr : Cred} {t : Tx} (hp : cr.payload = .transaction t)
    (hm : cr.echo.request.pull = false) : step cfg s (.submit cr) = none := by
  simp only [step, hp]
  grind

/-- P9 (sanity): a hash credential is rejected when supportedModes omits push. -/
theorem P9_hash_needs_push_mode {cr : Cred} {t : Tx} (hp : cr.payload = .hash t)
    (hm : cr.echo.request.push = false) : step cfg s (.submit cr) = none := by
  simp only [step, hp]
  grind

end TempoCharge
