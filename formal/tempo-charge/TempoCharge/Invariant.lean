import TempoCharge.Model
/-
  Inductive invariant over all reachable states (every guard on), and the arithmetic lemma that
  turns a one-to-one match into "at least amount was transferred".

  Proof plan
  * SysInv: what the server's records and the chain satisfy together.
  * inv_init / inv_step / reachable_inv: induction on Reachable. inv_step dispatches to one
    lemma per action (inv_pull and inv_settlePull for the two pull steps), each splitting step
    into one goal per guard outcome and letting grind rebuild SysInv in each.
-/
namespace TempoCharge

/-- What a receipt's reference proves about challenge c (the facts P1 reads off).
  * a transaction: it is on chain and succeeded, the server recorded it, and its transfers
    match the request one-to-one;
  * a proof: it names this challenge, the request was free, and a version 3 proof signed by
    its account binds this challenge id, realm and chain. -/
structure RefOk (st : St) (c : Challenge) (r : Receipt) : Prop where
  tx : ∀ t, r.ref = .tx t →
    succeeded st t = true ∧ t ∈ st.consumedTx ∧ matchOne t.calls c.request.required = true
  proof : ∀ id, r.ref = .challenge id →
    id = r.cid ∧ c.request.amount = 0 ∧
    ∃ p ∈ st.proofSigs, p.signer = p.account ∧ p.challengeId = c.id ∧ p.realm = c.realm ∧
      p.chainId = c.request.chainId ∧ p.version = 3

/-- The global invariant. -/
structure SysInv (cfg : Cfg) (st : St) : Prop where
  /-- Every issued challenge sits under its own id, in this realm, with a valid request. -/
  issued_ok : ∀ id c, st.issued id = some c →
    c.id = id ∧ c.realm = cfg.realm ∧ c.request.valid cfg.chainId = true
  /-- Every receipt names a used, issued challenge, and its reference proves the payment. -/
  receipts_ok : ∀ r ∈ st.receipts, st.used r.cid = true ∧
    ∃ c, st.issued r.cid = some c ∧ RefOk st c r
  /-- A transaction-referenced receipt's transaction was recorded. -/
  consumed_ok : ∀ r ∈ st.receipts, ∀ t, r.ref = .tx t → t ∈ st.consumedTx
  /-- At most one receipt per challenge. -/
  cids_nodup : (st.receipts.map Receipt.cid).Nodup
  /-- At most one receipt per transaction. -/
  txs_nodup : (st.receipts.filterMap fun r => r.ref.txOf).Nodup
  /-- The server paid fees only for challenges that offered it. -/
  sponsored_ok : ∀ id ∈ st.sponsored, ∃ c, st.issued id = some c ∧ c.request.feePayer = true
  /-- Every included transaction landed before its validBefore. -/
  validBefore_ok : ∀ i ∈ st.included, ∀ vb, i.tx.validBefore = some vb → i.time < vb
  /-- A pending pull settlement names an unused, issued challenge its transaction matches
    one-to-one; the transaction is on chain with the recorded outcome, recorded as spent (G1),
    and no receipt references it yet (what its receipt's RefOk and P3 need). -/
  pending_ok : ∀ cid t ok, st.pending cid = some (t, ok) →
    st.used cid = false ∧ (∃ c, st.issued cid = some c ∧ matchOne t.calls c.request.required = true) ∧
    (∃ i ∈ st.included, i.tx = t ∧ i.ok = ok) ∧ t ∈ st.consumedTx ∧ ∀ r ∈ st.receipts, r.ref ≠ .tx t
  /-- No transaction is pending for two challenges. -/
  pending_tx : ∀ cid cid' t ok ok', st.pending cid = some (t, ok) → st.pending cid' = some (t, ok') →
    cid = cid'

/-- The empty chain and server satisfy SysInv. -/
theorem inv_init (cfg : Cfg) : SysInv cfg St.init := by
  constructor <;> simp [St.init]

/-- A transaction on chain has a used nonce, so the chain refuses it again. -/
theorem not_nonceFree_of_succeeded {st : St} {t : Tx} (h : succeeded st t = true) :
    nonceFree st t = false := by
  simp only [succeeded, List.any_eq_true, Bool.and_eq_true, beq_iff_eq] at h
  obtain ⟨i, hi, he, _⟩ := h
  simp only [nonceFree, Bool.not_eq_false', List.any_eq_true, Bool.and_eq_true, beq_iff_eq]
  exact ⟨i, hi, by rw [he]; exact ⟨rfl, rfl⟩⟩

/-- A filterMap member came from some element. -/
theorem txOf_mem {l : List Receipt} {t : Tx} (h : t ∈ l.filterMap fun r => r.ref.txOf) :
    ∃ r ∈ l, r.ref = .tx t := by
  simp only [List.mem_filterMap] at h
  obtain ⟨r, hr, he⟩ := h
  refine ⟨r, hr, ?_⟩
  cases hx : r.ref <;> simp_all [Ref.txOf]

/-- RefOk survives any step that keeps successful transactions, recorded transactions and
  signed proofs (all three only grow). -/
theorem RefOk.mono {st st' : St} {c : Challenge} {r : Receipt} (h : RefOk st c r)
    (hs : ∀ t, succeeded st t = true → succeeded st' t = true)
    (hc : ∀ t ∈ st.consumedTx, t ∈ st'.consumedTx)
    (hp : ∀ p ∈ st.proofSigs, p ∈ st'.proofSigs) : RefOk st' c r := by
  obtain ⟨htx, hpf⟩ := h
  constructor
  · intro t ht
    obtain ⟨a, b, d⟩ := htx t ht
    exact ⟨hs t a, hc t b, d⟩
  · intro id hid
    obtain ⟨a, b, p, hp1, hp2⟩ := hpf id hid
    exact ⟨a, b, p, hp p hp1, hp2⟩

/-- RefOk for a transaction reference, from the three facts about it. -/
theorem RefOk.ofTx {st : St} {c : Challenge} {t : Tx} {cid time : Nat}
    (hs : succeeded st t = true) (hc : t ∈ st.consumedTx)
    (hm : matchOne t.calls c.request.required = true) : RefOk st c ⟨cid, .tx t, time⟩ :=
  ⟨fun t' ht => (by cases ht; exact ⟨hs, hc, hm⟩), fun _ ht => (by cases ht)⟩

/-- RefOk for a proof reference, from the amount and a binding proof. -/
theorem RefOk.ofProof {st : St} {c : Challenge} {cid time : Nat} (ha : c.request.amount = 0)
    (hp : ∃ p ∈ st.proofSigs, p.signer = p.account ∧ p.challengeId = c.id ∧ p.realm = c.realm ∧
      p.chainId = c.request.chainId ∧ p.version = 3) : RefOk st c ⟨cid, .challenge cid, time⟩ :=
  ⟨fun _ ht => (by cases ht), fun _ ht => (by cases ht; exact ⟨rfl, ha, hp⟩)⟩

/-- Time advancing preserves SysInv (it issues no receipt). -/
theorem inv_tick {cfg : Cfg} {s s' : St} {d : Nat}
    (hI : SysInv cfg s) (h : step cfg s (.tick d) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf]
  | -- receipts_ok with receipts unchanged: RefOk.mono
    intro r hr
    obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
    exact ⟨hu, c, hc, hrc.mono (by grind [succeeded]) (by grind) (by grind)⟩

/-- Funding an account preserves SysInv (it issues no receipt). -/
theorem inv_fund {cfg : Cfg} {s s' : St} {tok acct amt : Nat}
    (hI : SysInv cfg s) (h : step cfg s (.fund tok acct amt) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf]
  | -- receipts_ok with receipts unchanged: RefOk.mono
    intro r hr
    obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
    exact ⟨hu, c, hc, hrc.mono (by grind [succeeded]) (by grind) (by grind)⟩

/-- Signing a transaction preserves SysInv (it issues no receipt). -/
theorem inv_signTx {cfg : Cfg} {s s' : St} {t : Tx}
    (hI : SysInv cfg s) (h : step cfg s (.signTx t) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf]
  | -- receipts_ok with receipts unchanged: RefOk.mono
    intro r hr
    obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
    exact ⟨hu, c, hc, hrc.mono (by grind [succeeded]) (by grind) (by grind)⟩

/-- Signing a proof preserves SysInv (it issues no receipt). -/
theorem inv_signProof {cfg : Cfg} {s s' : St} {p : ProofSig}
    (hI : SysInv cfg s) (h : step cfg s (.signProof p) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf]
  | -- receipts_ok with receipts unchanged: RefOk.mono
    intro r hr
    obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
    exact ⟨hu, c, hc, hrc.mono (by grind [succeeded]) (by grind) (by grind)⟩

/-- A client broadcast preserves SysInv (it issues no receipt). -/
theorem inv_broadcast {cfg : Cfg} {s s' : St} {t : Tx}
    (hI : SysInv cfg s) (h : step cfg s (.broadcast t) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf]
  | -- receipts_ok with receipts unchanged: RefOk.mono
    intro r hr
    obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
    exact ⟨hu, c, hc, hrc.mono (by grind [succeeded]) (by grind) (by grind)⟩

/-- Issuing a challenge preserves SysInv (it issues no receipt). -/
theorem inv_issue {cfg : Cfg} {s s' : St} {c : Challenge}
    (hI : SysInv cfg s) (h : step cfg s (.issue c) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf]
  | -- receipts_ok with receipts unchanged: RefOk.mono
    intro r hr
    obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
    exact ⟨hu, c, hc, hrc.mono (by grind [succeeded]) (by grind) (by grind)⟩

/-- A pull broadcast (Act.submit with a transaction) preserves SysInv: it issues no receipt and
  leaves a pending settlement whose facts come from its checks. -/
theorem inv_pull {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {cr : Cred} {t : Tx}
    (hI : SysInv cfg s) (hp : cr.payload = .transaction t) (h : step cfg s (.submit cr) = some s') :
    SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step, hp, hg.txSingleUse, ↓reduceIte] at h
  (repeat' split at h) <;> cases h <;> simp only [sponsorFor] <;> constructor <;>
    grind [RefOk, succeeded, upd_apply, chainOk, nonceFree, not_nonceFree_of_succeeded,
      List.mem_cons_self, txOf_mem, RefOk.mono, Ref.txOf, hg.splitsOneToOne, Pays]

/-- Settling a pending pull credential preserves SysInv: the receipt's facts are the pending
  entry's (G2 makes its transaction a successful one). -/
theorem inv_settlePull {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {cid : Nat}
    (hI : SysInv cfg s) (h : step cfg s (.settlePull cid) = some s') : SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step, hg.txSingleUse, hg.pullNeedsSuccess, ↓reduceIte] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, txOf_mem, RefOk.mono, Ref.txOf, List.mem_cons_self]
  | -- receipts_ok: the new receipt's facts are the pending entry's, old receipts keep theirs
    intro r hr
    simp only [List.mem_cons] at hr
    rcases hr with rfl | hr
    · obtain ⟨-, ⟨c, hc, hm⟩, ⟨i, hi, hit, hio⟩, hct, -⟩ := h8 _ _ _ ‹s.pending _ = some _›
      have hok : i.ok = true := by grind
      refine ⟨by grind [upd_apply], c, hc, RefOk.ofTx ?_ hct hm⟩
      simp only [succeeded, List.any_eq_true, Bool.and_eq_true, beq_iff_eq]
      exact ⟨i, hi, hit, hok⟩
    · obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
      refine ⟨by grind [upd_apply], c, hc, hrc.mono ?_ ?_ ?_⟩ <;> grind [succeeded]

/-- A hash credential preserves SysInv: an old receipt keeps its facts (RefOk.mono), the new
  one is built from the branch's checks (RefOk.ofTx); G1 keeps its transaction fresh. -/
theorem inv_hash {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {cr : Cred} {t : Tx}
    (hI : SysInv cfg s) (hp : cr.payload = .hash t) (h : step cfg s (.submit cr) = some s') :
    SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step, hp] at h
  (repeat' split at h) <;> cases h <;> simp only [settleTx] <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, txOf_mem, RefOk.mono, Ref.txOf, hg.txSingleUse,
      hg.splitsOneToOne, Pays]
  | intro r hr
    simp only [List.mem_cons] at hr
    rcases hr with rfl | hr
    · obtain ⟨hiss, -, -⟩ := ‹s.issued _ = some _ ∧ _›
      refine ⟨by grind [upd_apply], _, hiss, ?_⟩
      exact RefOk.ofTx (by grind [succeeded]) (by grind) (by grind [Pays, hg.splitsOneToOne])
    · obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
      refine ⟨by grind [upd_apply], c, hc, hrc.mono ?_ ?_ ?_⟩ <;> grind [succeeded]

/-- A proof credential preserves SysInv: the new receipt is built from the branch's checks
  (RefOk.ofProof); G3 makes the request free. -/
theorem inv_proof {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {cr : Cred} {p : ProofSig}
    (hI : SysInv cfg s) (hp : cr.payload = .proof p) (h : step cfg s (.submit cr) = some s') :
    SysInv cfg s' := by
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := hI
  simp only [step, hp] at h
  (repeat' split at h) <;> cases h <;> constructor <;>
  first
  | grind [RefOk, succeeded, upd_apply, txOf_mem, RefOk.mono, Ref.txOf, hg.proofOnlyZero]
  | intro r hr
    simp only [List.mem_cons] at hr
    rcases hr with rfl | hr
    · obtain ⟨hiss, -, -⟩ := ‹s.issued _ = some _ ∧ _›
      refine ⟨by grind [upd_apply], _, hiss, ?_⟩
      exact RefOk.ofProof (by grind [hg.proofOnlyZero]) (by grind)
    · obtain ⟨hu, c, hc, hrc⟩ := h2 r hr
      refine ⟨by grind [upd_apply], c, hc, hrc.mono ?_ ?_ ?_⟩ <;> grind [succeeded]

/-- Inductive step: with every guard on, every successful step preserves SysInv. -/
theorem inv_step {cfg : Cfg} (hg : cfg.Guarded) {s s' : St} {a : Act}
    (hI : SysInv cfg s) (h : step cfg s a = some s') : SysInv cfg s' := by
  cases a with
  | tick => exact inv_tick hI h
  | fund => exact inv_fund hI h
  | signTx => exact inv_signTx hI h
  | signProof => exact inv_signProof hI h
  | broadcast => exact inv_broadcast hI h
  | issue => exact inv_issue hI h
  | settlePull => exact inv_settlePull hg hI h
  | submit cr =>
    cases hp : cr.payload with
    | transaction t => exact inv_pull hg hI hp h
    | hash t => exact inv_hash hg hI hp h
    | proof p => exact inv_proof hg hI hp h

/-- Every reachable state satisfies SysInv (every guard on). -/
theorem reachable_inv {cfg : Cfg} (hg : cfg.Guarded) {s : St} (h : Reachable cfg s) :
    SysInv cfg s := by
  induction h with
  | init => exact inv_init cfg
  | step a _ hs ih => exact inv_step hg ih hs

end TempoCharge
