import IntentCharge.Model
import IntentCharge.Invariant
/-
  Properties P1-P8; README.md lists each with its theorems. State properties hold in every
  reachable state and are read off Inv (Invariant.lean); those that need a rule the drafts
  leave out take Cfg.Guarded and name the guard (hg.bind, hg.currency, hg.target, hg.expiry,
  hg.unique). One-step theorems check that step and check encode a rule as the drafts state it.
-/
namespace IntentCharge

variable {cfg : Cfg} {s s' : St}

/-! ## P1 — a Credential only pays the Challenge it answers (charge §Server Responsibilities) -/

/-- P1: every delivery was paid by a payment made for that very challenge, so a payment made
  for one challenge never buys another (GAPS.md row 3). -/
theorem P1_pays_own_challenge (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ d ∈ s.deliveries, d.pmt.chal = d.id :=
  fun d hm => ((reachable_inv hr).del d hm).bind hg.bind

/-- P1: every delivery was paid by a payment that really happened (the method verified it). -/
theorem P1_payment_real (hr : Reachable cfg s) : ∀ d ∈ s.deliveries, d.pmt ∈ s.payments :=
  fun d hm => ((reachable_inv hr).del d hm).paid

/-! ## P2 — challenge binding (core §Challenge Binding) -/

/-- P2: every delivery answers a challenge this server issued, with this realm and method and
  the charge intent: a client cannot alter a bound parameter, since echoed parameters must
  verify against the id. -/
theorem P2_binding (hr : Reachable cfg s) :
    ∀ d ∈ s.deliveries, (∃ ch ∈ s.issued, ch.p = d.id) ∧
      d.id.realm = cfg.realm ∧ d.id.method = cfg.method ∧ d.id.intent = CHARGE := by
  intro d hm
  have hi := reachable_inv hr
  obtain ⟨ch, hc, he⟩ := (hi.del d hm).issued
  obtain ⟨now, n, t, -, -, rfl⟩ := hi.chal ch hc
  rw [← he]
  exact ⟨⟨_, hc, rfl⟩, rfl, rfl, rfl⟩

/-- P2 (one step): echoed parameters that differ from the id's are rejected as
  invalid-challenge (core §Challenge Binding: "MUST reject"). -/
theorem P2_tampered_rejected {c : Cred} (h : c.echo ≠ c.id) :
    check cfg s c = some .invalidChallenge := by
  simp [check, h]

/-- P2 (one step): an id the server never issued is rejected as invalid-challenge. -/
theorem P2_unknown_rejected {c : Cred} (h : ∀ ch ∈ s.issued, ch.p ≠ c.id) :
    check cfg s c = some .invalidChallenge := by
  unfold check; grind

/-! ## P3 — expiry (core §Optional Parameters, charge §Server Responsibilities step 2) -/

/-- P3: every delivery happened before its challenge expired, and its challenge had an expiry
  at most ttl after it was issued (GAPS.md row 4). -/
theorem P3_delivered_before_expiry (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ d ∈ s.deliveries, ∃ ttl, cfg.ttl = some ttl ∧
      ∃ ch ∈ s.issued, ch.p = d.id ∧ d.id.expires = some (ch.time + ttl) ∧ d.time < ch.time + ttl := by
  intro d hm
  have hi := reachable_inv hr
  have hdl := hi.del d hm
  obtain ⟨ch, hc, he⟩ := hdl.issued
  obtain ⟨now, n, t, -, -, rfl⟩ := hi.chal ch hc
  have hl := hdl.live
  have hx := hg.expiry
  rw [← he] at hl ⊢
  cases hq : cfg.ttl with
  | none => simp [hq] at hx
  | some ttl =>
    refine ⟨ttl, rfl, _, hc, rfl, by simp [issue, hq], ?_⟩
    simp [issue, hq, live] at hl
    simpa [issue] using hl

/-- P3 (one step): a credential for an expired challenge is rejected as payment-expired
  (core §Status Codes). -/
theorem P3_expired_rejected {c : Cred} {e : Nat} (hb : c.echo = c.id ∧ ∃ ch ∈ s.issued, ch.p = c.id)
    (hu : c.id ∉ s.used) (he : c.echo.expires = some e) (hn : e ≤ s.now) :
    check cfg s c = some .paymentExpired := by
  unfold check; grind [live]

/-! ## P4 — single use, no double spend, no replay (core §Replay Protection, §Concurrent
  Request Handling, charge §Single-Use, §Replay Protection) -/

/-- P4: at most one delivery per challenge id. -/
theorem P4_single_use (hr : Reachable cfg s) : (s.deliveries.map (·.id)).Nodup :=
  (reachable_inv hr).used

/-- P4: at most one delivery per payment: a payment is never redeemed twice. -/
theorem P4_no_double_spend (hr : Reachable cfg s) : (s.deliveries.map (·.pmt.ref)).Nodup :=
  (reachable_inv hr).spent

/-- P4 (one step): a replayed credential (its id already used) delivers nothing and gets 402
  invalid-challenge. -/
theorem P4_replay_rejected {c : Cred} (hb : c.echo = c.id ∧ ∃ ch ∈ s.issued, ch.p = c.id)
    (hu : c.id ∈ s.used) : check cfg s c = some .invalidChallenge := by
  unfold check; grind

/-! ## P5 — amount, recipient and currency match (charge §Server Responsibilities steps 4-5,
  §Currency Verification) -/

/-- P5: every delivery was paid exactly the requested amount, to the requested recipient, in
  the requested currency (GAPS.md row 2). -/
theorem P5_matches_request (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ d ∈ s.deliveries, d.pmt.amount = d.id.req.amount ∧ d.pmt.recipient = d.id.req.recipient ∧
      d.pmt.currency = d.id.req.currency := by
  intro d hm
  have hdl := (reachable_inv hr).del d hm
  exact ⟨hdl.amount, hdl.recipient, hdl.currency hg.currency⟩

/-- P5: every delivery of a target was paid what the server charges for that target, so a
  challenge issued for a cheap resource never buys a dear one (GAPS.md row 1). -/
theorem P5_matches_target_price (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ d ∈ s.deliveries, d.pmt.amount = (cfg.price d.target).amount ∧
      d.pmt.recipient = (cfg.price d.target).recipient ∧
      d.pmt.currency = (cfg.price d.target).currency := by
  intro d hm
  have hdl := (reachable_inv hr).del d hm
  have ht := hdl.target hg.target
  exact ⟨ht ▸ hdl.amount, ht ▸ hdl.recipient, ht ▸ hdl.currency hg.currency⟩

/-- P5: every delivery's body matches its challenge's digest, when one is bound
  (core §Request Body Digest Binding). -/
theorem P5_digest (hr : Reachable cfg s) :
    ∀ d ∈ s.deliveries, digestOk d.id.digest d.target.body = true :=
  fun d hm => ((reachable_inv hr).del d hm).digest

/-- P5 (one step): a credential sent in another field than the one its challenge selected
  does not satisfy it (core §Credentials). -/
theorem P5_wrong_field_rejected {c : Cred} (h : c.altField ≠ c.echo.header) :
    check cfg s c ≠ none := by
  unfold check; grind

/-! ## P6 — receipts only after verified payment (core §Receipt Status Semantics, §Status
  Codes, charge §Atomicity) -/

/-- P6: every receipt is on a 200 and is the receipt of a delivery, which passed verification
  (P1, P2, P3, P5). -/
theorem P6_receipt_only_after_payment (hr : Reachable cfg s) :
    ∀ r ∈ s.resps, ∀ x, r.receipt = some x → r.status = 200 ∧ ∃ d ∈ s.deliveries, x = receiptOf cfg d := by
  intro r hm x hx
  have := (reachable_inv hr).resp r hm
  unfold RespInv at this; grind

/-- P6: every non-200 response is a 402 with a problem type, a challenge the server issued,
  and no receipt (core §Status Codes: "Fresh challenge"). -/
theorem P6_error_is_402_with_challenge (hr : Reachable cfg s) :
    ∀ r ∈ s.resps, r.status ≠ 200 →
      r.status = 402 ∧ r.receipt = none ∧ r.problem.isSome = true ∧ ∃ ch ∈ s.issued, r.challenge = some ch.p := by
  intro r hm hne
  have := (reachable_inv hr).resp r hm
  unfold RespInv at this; grind

/-- P6: a delivery (resource access) only ever comes from a submitted credential that check
  accepted; every other step leaves the deliveries unchanged. -/
theorem P6_delivery_only_after_check {a : Act} (h : step cfg s a = some s') :
    s'.deliveries = s.deliveries ∨
      ∃ c, a = .submit c ∧ check cfg s c = none ∧ s'.deliveries = ⟨c.id, c.target, c.proof, s.now⟩ :: s.deliveries := by
  cases a with
  | submit c =>
    simp only [step] at h
    split at h <;> simp only [Option.some.injEq] at h <;> subst h
    · right; exact ⟨c, rfl, by assumption, rfl⟩
    · left; rfl
  | retry c rc =>
    simp only [step] at h; split at h
    · simp only [Option.some.injEq] at h; subst h; left; rfl
    · cases h
  | _ => simp only [step, Option.some.injEq] at h; subst h; left; rfl

/-! ## P7 — side effects and idempotency (core §Idempotency and Side Effects) -/

/-- P7: an unpaid request records the challenge and its 402, and nothing else: no delivery,
  no payment, no time. -/
theorem P7_unpaid_request_only_records_challenge {t : Target} (h : step cfg s (.request t) = some s') :
    s'.deliveries = s.deliveries ∧ s'.payments = s.payments ∧ s'.now = s.now ∧
      s'.issued = issue cfg s.now s.next t :: s.issued := by
  simp only [step, Option.some.injEq] at h; subst h; simp [reject]

/-- P7: a failed verification records a fresh challenge and its 402, and nothing else
  (charge §Atomicity: no partial access). -/
theorem P7_failed_no_effect {c : Cred} {pr : Problem} (hc : check cfg s c = some pr)
    (h : step cfg s (.submit c) = some s') :
    s'.deliveries = s.deliveries ∧ s'.payments = s.payments ∧
      s'.resps = ⟨402, some pr, some (issue cfg s.now s.next c.target).p, none⟩ :: s.resps := by
  simp only [step, hc, Option.some.injEq] at h; subst h; simp [reject]

/-- P7: an Idempotency-Key retry returns the original receipt and settles and delivers
  nothing new. -/
theorem P7_retry_no_effect {c : Cred} {rc : Receipt} (h : step cfg s (.retry c rc) = some s') :
    s'.deliveries = s.deliveries ∧ s'.payments = s.payments ∧
      ∃ d ∈ s.deliveries, d.id = c.id ∧ rc = receiptOf cfg d := by
  simp only [step] at h; split at h
  · simp only [Option.some.injEq] at h; subst h; grind
  · cases h

/-! ## P8 — unique challenge ids (core §Required Parameters, id) -/

/-- P8: no two issued challenges share an id, so one client's payment can never find its
  challenge already used by another's (GAPS.md row 5). -/
theorem P8_unique_ids (hg : cfg.Guarded) (hr : Reachable cfg s) : (s.issued.map (·.p)).Nodup := by
  unfold List.Nodup
  rw [List.pairwise_map]
  exact (reachable_inv hr).uniq hg.unique

end IntentCharge

