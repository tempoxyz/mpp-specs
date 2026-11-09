import IntentSubscription.Model
import IntentSubscription.Invariant
/-
  Properties P1-P11; README.md lists each with its theorems. State properties hold in every
  reachable state with every guard on (read off Inv); one-step properties unfold step. The
  one-step theorems that only read a guard back are sanity checks that step encodes the rule.
-/
namespace IntentSubscription

variable {cfg : Cfg} {s s' : St}

/-! ## Counting lemmas over the charge log -/

/-- If newer charges of each subscription are for strictly later periods, at most one charge of
  sid is for period p. -/
theorem one_per_period (sid p : Nat) : ∀ l : List Charge,
    l.Pairwise (fun a b => a.sub = b.sub → b.period < a.period) →
    (l.filter (fun c => c.sub == sid && c.period == p)).length ≤ 1
  | [], _ => by simp
  | a :: t, hp => by
    rw [List.pairwise_cons] at hp
    have ih := one_per_period sid p t hp.2
    by_cases ha : a.sub = sid ∧ a.period = p
    · have : t.filter (fun c => c.sub == sid && c.period == p) = [] :=
        List.filter_eq_nil_iff.2 fun c hc => by
          have := hp.1 c hc
          grind
      simp [ha, this]
    · grind

/-- If newer charges are for strictly later periods and every charge of sid is for a period
  below m, sid has at most m charges. -/
theorem count_le (sid : Nat) : ∀ (l : List Charge) (m : Nat),
    l.Pairwise (fun a b => a.sub = b.sub → b.period < a.period) →
    (∀ c ∈ l, c.sub = sid → c.period < m) →
    (l.filter (fun c => c.sub == sid)).length ≤ m
  | [], _, _, _ => by simp
  | a :: t, m, hp, hb => by
    rw [List.pairwise_cons] at hp
    by_cases ha : a.sub = sid
    · have ih := count_le sid t a.period hp.2 fun c hc hs => hp.1 c hc (by rw [ha, hs])
      have := hb a (List.mem_cons_self ..) ha
      simp [ha]
      omega
    · have ih := count_le sid t m hp.2 fun c hc hs => hb c (List.mem_cons_of_mem _ hc) hs
      simp [ha]
      omega

/-- Charges that all have amount a sum to their count times a. -/
theorem sum_amount (a : Nat) : ∀ l : List Charge, (∀ c ∈ l, c.amount = a) →
    (l.map (·.amount)).sum = l.length * a
  | [], _ => by simp
  | c :: t, h => by
    have ih := sum_amount a t fun x hx => h x (List.mem_cons_of_mem _ hx)
    simp [ih, h c (List.mem_cons_self ..), Nat.succ_mul, Nat.add_comm]

/-! ## P1 — at most one charge per billing period (§Renewal, §Duplicate Charge Prevention) -/

/-- P1: of any two charges of one subscription, the newer is for a strictly later period. -/
theorem P1_charges_ordered (hg : cfg.Guarded) (hr : Reachable cfg s) :
    s.charges.Pairwise (fun a b => a.sub = b.sub → b.period < a.period) :=
  (reachable_inv hg hr).ordered

/-- P1: a subscription is charged at most once for any billing period, across activation,
  renewals, retries and concurrent requests. -/
theorem P1_one_charge_per_period (hg : cfg.Guarded) (hr : Reachable cfg s) (sid p : Nat) :
    (s.charges.filter (fun c => c.sub == sid && c.period == p)).length ≤ 1 :=
  one_per_period sid p _ (reachable_inv hg hr).ordered

/-! ## P2 — no charge beyond the authorization (§Definition, §Renewal) -/

/-- P2: a subscription has at most one charge per billing period begun since activation:
  no future period is charged in advance and missed periods do not accumulate. -/
theorem P2_charges_le_elapsed (hg : cfg.Guarded) (hr : Reachable cfg s) {sid : Nat} {t : Sub}
    (ht : s.subs sid = some t) :
    (s.charges.filter (fun c => c.sub == sid)).length ≤ t.cur s.now + 1 := by
  have hI := reachable_inv hg hr
  have hp := (hI.subs sid t ht).paid_le_cur
  refine count_le sid _ _ hI.ordered fun c hc hs => ?_
  obtain ⟨u, hu, hle, -⟩ := hI.charges c hc
  rw [hs, ht] at hu
  cases hu
  omega

/-- P2: the total collected on a subscription is at most amount per billing period begun. -/
theorem P2_collected_le_elapsed (hg : cfg.Guarded) (hr : Reachable cfg s) {sid : Nat} {t : Sub}
    (ht : s.subs sid = some t) :
    ((s.charges.filter (fun c => c.sub == sid)).map (·.amount)).sum ≤
      t.req.amount * (t.cur s.now + 1) := by
  have hI := reachable_inv hg hr
  rw [sum_amount t.req.amount _ fun c hc => ?_]
  · rw [Nat.mul_comm]
    exact Nat.mul_le_mul_left _ (P2_charges_le_elapsed hg hr ht)
  · have ⟨hc, hs⟩ := List.mem_filter.1 hc
    obtain ⟨u, hu, -, -, ha, -⟩ := hI.charges c hc
    simp at hs
    rw [hs, ht] at hu
    cases hu
    exact ha

/-! ## P3 — a Credential only pays the Challenge it answers (core §Challenge Binding) -/

/-- P3: every charge pays exactly the amount, currency and recipient of an issued Challenge's
  request, from the payer who signed a grant for that Challenge, under the subscription that
  Challenge activated. -/
theorem P3_charge_matches_grant (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ c ∈ s.charges, ∃ t cr, s.subs c.sub = some t ∧ cr ∈ s.creds ∧ cr.chal ∈ s.issued ∧
      cr.chal.id = t.chal ∧ cr.payer = c.payer ∧ cr.chal.req.amount = c.amount ∧
      cr.chal.req.currency = c.currency ∧ cr.chal.req.recipient = c.recipient := by
  intro c hc
  have hI := reachable_inv hg hr
  obtain ⟨t, ht, -, hp, ha, hcur, hrec, -⟩ := hI.charges c hc
  obtain ⟨cr, hcr, h1, h2, h3, h4⟩ := (hI.subs _ t ht).authorized
  exact ⟨t, cr, ht, hcr, h4, h3, by rw [h1, hp], by rw [h2, ha], by rw [h2, hcur],
    by rw [h2, hrec]⟩

/-! ## P4 — single use, binding and expiry of Challenges and Credentials
  (§Single-Use, core §Replay Protection, §Challenge Binding, §Status Codes) -/

/-- P4: a Challenge activates at most one subscription. -/
theorem P4_challenge_activates_once (hg : cfg.Guarded) (hr : Reachable cfg s) {i j : Nat}
    {si sj : Sub} (hi : s.subs i = some si) (hj : s.subs j = some sj) (he : si.chal = sj.chal) :
    i = j :=
  (reachable_inv hg hr).chal_inj i j si sj hi hj he

/-- P4 (sanity): a replayed Credential is rejected. -/
theorem P4_replayed_credential_rejected {c : Cred} (hu : c ∈ s.usedCred) :
    step cfg s (.activate c) = none := by
  grind [step]

/-- P4 (sanity): a second Credential for an answered Challenge is rejected (G1). -/
theorem P4_answered_challenge_rejected (hg : cfg.Guarded) {c : Cred} (hu : c.chal.id ∈ s.usedChal) :
    step cfg s (.activate c) = none := by
  grind [step, hg.single]

/-- P4 (sanity): a Credential for an expired Challenge is rejected. -/
theorem P4_expired_challenge_rejected {c : Cred} {e : Nat} (he : c.chal.expires = some e)
    (hle : e ≤ s.now) : step cfg s (.activate c) = none := by
  grind [step, before]

/-- P4 (sanity): a Credential whose echoed Challenge the server never issued (any field
  changed: id, request or expires) is rejected. -/
theorem P4_unbound_rejected {c : Cred} (hn : c.chal ∉ s.issued) :
    step cfg s (.activate c) = none := by
  grind [step]

/-- P4 (sanity): a Credential no payer signed is rejected. -/
theorem P4_unsigned_rejected {c : Cred} (hn : c ∉ s.creds) :
    step cfg s (.activate c) = none := by
  grind [step]

/-! ## P5 — no charge after cancellation (§Cancellation) -/

/-- P5: once the payer cancels during period r, no charge of that subscription is for a
  period after r, whatever happens later. -/
theorem P5_no_charge_after_cancel (hg : cfg.Guarded) (hr : Reachable cfg s) {c : Charge}
    (hc : c ∈ s.charges) {t : Sub} (ht : s.subs c.sub = some t) {r : Nat}
    (hcr : t.cancelReq = some r) : c.period ≤ r := by
  obtain ⟨u, hu, -, -, -, -, -, -, h⟩ := (reachable_inv hg hr).charges c hc
  rw [ht] at hu
  cases hu
  exact h r hcr

/-- P5: a cancellation, once made, is never undone or postponed by any step. -/
theorem P5_cancel_sticky (hg : cfg.Guarded) (hr : Reachable cfg s) {a : Act}
    (h : step cfg s a = some s') {sid : Nat} {t : Sub}
    (ht : s.subs sid = some t) {e : Nat} (he : t.cancelEff = some e) :
    ∃ t', s'.subs sid = some t' ∧ t'.cancelEff = some e ∧ t'.cancelReq = t.cancelReq := by
  have hf := (reachable_inv hg hr).fresh
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    grind [upd_apply]

/-! ## P6 — receipts only after a collected payment (core §Receipt Status Semantics) -/

/-- P6: every Payment-Receipt names a subscription, period and amount actually charged. -/
theorem P6_receipt_backed (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ r ∈ s.receipts, ∃ c ∈ s.charges, c.sub = r.sub ∧ c.period = r.period ∧ c.amount = r.amount :=
  (reachable_inv hg hr).receipts

/-! ## P7 — service only for paid periods, only to the payer (§Renewal, §Subscription Identifier) -/

/-- P7: every delivery went to the subscription's payer, for a period already charged. -/
theorem P7_access_paid (hg : cfg.Guarded) (hr : Reachable cfg s) :
    ∀ a ∈ s.served, ∃ t, s.subs a.sub = some t ∧ a.caller = t.payer ∧
      ∃ c ∈ s.charges, c.sub = a.sub ∧ c.period = a.period :=
  (reachable_inv hg hr).served

/-! ## P8 — no charge once subscriptionExpires is reached (§Optional Fields) -/

/-- P8: every charge happened before the subscription's subscriptionExpires. -/
theorem P8_charge_before_expiry (hg : cfg.Guarded) (hr : Reachable cfg s) {c : Charge}
    (hc : c ∈ s.charges) {t : Sub} (ht : s.subs c.sub = some t) {e : Nat}
    (he : t.req.subExp = some e) : c.time < e := by
  obtain ⟨u, hu, -, -, -, -, -, hb, -⟩ := (reachable_inv hg hr).charges c hc
  rw [ht] at hu
  cases hu
  simpa [before, he] using hb

/-! ## P9 — unique subscriptionId (§Subscription Identifier) -/

/-- P9: activation allocates a subscriptionId no earlier subscription holds. -/
theorem P9_subscription_id_fresh (hg : cfg.Guarded) (hr : Reachable cfg s) {c : Cred}
    (h : step cfg s (.activate c) = some s') :
    s.subs s.nextSub = none ∧ s'.subs s.nextSub ≠ none := by
  refine ⟨(reachable_inv hg hr).fresh _ (Nat.le_refl _), ?_⟩
  simp only [step] at h
  split at h
  · cases h
    simp [upd_same]
  · cases h

/-! ## P10 — unpaid requests have no side effects (core §Idempotency and Side Effects) -/

/-- P10: issuing a Challenge changes no subscription, charge, receipt or delivery. -/
theorem P10_challenge_no_side_effect {req : Req} {ex : Option Nat}
    (h : step cfg s (.issue req ex) = some s') :
    s'.subs = s.subs ∧ s'.charges = s.charges ∧ s'.receipts = s.receipts ∧ s'.served = s.served := by
  grind [step]

/-! ## P11 — idempotent renewal (§Server Accounting and Idempotency, §Renewal) -/

/-- P11: a retried renewal for a period already collected is rejected. -/
theorem P11_renewal_retry_rejected {sid p : Nat} (h : step cfg s (.renew sid p) = some s') :
    step cfg s' (.renew sid p) = none := by
  simp only [step] at h
  split at h
  · cases h
  · split at h
    · cases h
      simp [step, upd_same]
    · cases h

/-- P11 (sanity): a missed period cannot be charged once a later period has begun. -/
theorem P11_missed_period_rejected {sid p : Nat} {t : Sub} (ht : s.subs sid = some t)
    (hp : p < t.cur s.now) : step cfg s (.renew sid p) = none := by
  grind [step]

/-- P11: the last charged period never decreases. -/
theorem P11_lastPaid_monotone (hg : cfg.Guarded) (hr : Reachable cfg s) {a : Act}
    (h : step cfg s a = some s') {sid : Nat} {t : Sub}
    (ht : s.subs sid = some t) : ∃ t', s'.subs sid = some t' ∧ t.lastPaid ≤ t'.lastPaid := by
  have hf := (reachable_inv hg hr).fresh
  cases a <;> simp only [step] at h <;> (repeat' split at h) <;> cases h <;>
    grind [upd_apply]

end IntentSubscription
