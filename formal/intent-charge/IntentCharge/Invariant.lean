import IntentCharge.Model
/-
  Inductive invariant over all reachable states.

  Proof plan
  * Inv cfg st: every issued challenge is one the server built (issue), ids are unique (with
    uniqueIds), every delivery passed verification (DelInv), used ids and spent payments are
    duplicate-free, and every response is a 200 with a receipt for a delivery or a 402 with a
    fresh challenge and no receipt.
  * inv_init, inv_step, reachable_inv: induction on Reachable. Most fields need no guard; the
    guard-dependent ones are implications from the flag, so Inv holds for every Cfg and the
    properties take Cfg.Guarded only to discharge them.
-/
namespace IntentCharge

/-- What every delivery satisfied when it was made (check returned none), kept as the state
  grows. Its fields are the properties of Properties.lean, before the guard flags discharge
  their premises. -/
structure DelInv (cfg : Cfg) (st : St) (d : Delivery) : Prop where
  issued : ∃ ch ∈ st.issued, ch.p = d.id
  paid : d.pmt ∈ st.payments
  time_le : d.time ≤ st.now
  live : live d.id.expires d.time = true
  digest : digestOk d.id.digest d.target.body = true
  amount : d.pmt.amount = d.id.req.amount
  recipient : d.pmt.recipient = d.id.req.recipient
  bind : cfg.bindProof = true → d.pmt.chal = d.id
  currency : cfg.checkCurrency = true → d.pmt.currency = d.id.req.currency
  target : cfg.checkTarget = true → d.id.req = cfg.price d.target

/-- Every response is a 200 carrying the receipt of a delivery, or a 402 carrying a problem
  and a challenge the server issued, and no receipt (core §Receipt Status Semantics). -/
def RespInv (cfg : Cfg) (st : St) (r : Resp) : Prop :=
  (r.status = 200 ∧ r.problem = none ∧ ∃ d ∈ st.deliveries, r.receipt = some (receiptOf cfg d)) ∨
  (r.status = 402 ∧ r.receipt = none ∧ r.problem.isSome = true ∧
    ∃ ch ∈ st.issued, r.challenge = some ch.p)

/-- The global invariant. -/
structure Inv (cfg : Cfg) (st : St) : Prop where
  chal : ∀ ch ∈ st.issued, ∃ now n t, now ≤ st.now ∧ n < st.next ∧ ch = issue cfg now n t
  uniq : cfg.uniqueIds = true → st.issued.Pairwise (fun a b => a.p ≠ b.p)
  del : ∀ d ∈ st.deliveries, DelInv cfg st d
  used : st.used.Nodup
  spent : st.spent.Nodup
  resp : ∀ r ∈ st.resps, RespInv cfg st r

/-- Base case: nothing issued, delivered or answered. -/
theorem inv_init (cfg : Cfg) : Inv cfg St.init :=
  ⟨by simp [St.init], by simp [St.init], by simp [St.init], by simp [St.init, St.used],
   by simp [St.init, St.spent], by simp [St.init]⟩

/-- What a valid credential satisfies: check returned none. -/
theorem check_none {cfg : Cfg} {st : St} {c : Cred} (h : check cfg st c = none) :
    c.echo = c.id ∧ (∃ ch ∈ st.issued, ch.p = c.id) ∧ c.id ∉ st.used ∧
    live c.echo.expires st.now = true ∧ c.altField = c.echo.header ∧
    digestOk c.echo.digest c.target.body = true ∧
    (cfg.checkTarget = true → c.echo.req = cfg.price c.target) ∧
    c.proof ∈ st.payments ∧ c.proof.ref ∉ st.spent ∧
    (cfg.bindProof = true → c.proof.chal = c.id) ∧
    c.proof.amount = c.echo.req.amount ∧ c.proof.recipient = c.echo.req.recipient ∧
    (cfg.checkCurrency = true → c.proof.currency = c.echo.req.currency) := by
  unfold check at h
  (repeat' split at h) <;> grind

/-- DelInv survives any step that only adds challenges and payments and moves time forward. -/
theorem DelInv.mono {cfg : Cfg} {s s' : St} {d : Delivery} (h : DelInv cfg s d)
    (hi : ∀ x ∈ s.issued, x ∈ s'.issued) (hp : ∀ x ∈ s.payments, x ∈ s'.payments)
    (hn : s.now ≤ s'.now) : DelInv cfg s' d := by
  obtain ⟨⟨ch, hm, he⟩, h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := h
  exact ⟨⟨ch, hi ch hm, he⟩, hp _ h1, by omega, h3, h4, h5, h6, h7, h8, h9⟩

/-- RespInv survives any step that only adds challenges and deliveries. -/
theorem RespInv.mono {cfg : Cfg} {s s' : St} {r : Resp} (h : RespInv cfg s r)
    (hi : ∀ x ∈ s.issued, x ∈ s'.issued) (hd : ∀ x ∈ s.deliveries, x ∈ s'.deliveries) :
    RespInv cfg s' r := by
  unfold RespInv at *; grind

/-- A rejection (or an unpaid request) preserves Inv: it adds one fresh challenge, built by
  issue with nonce next, and a 402 that carries it. -/
theorem inv_reject {cfg : Cfg} {s : St} (t : Target) (pr : Problem) (hI : Inv cfg s) :
    Inv cfg (reject cfg s t pr) := by
  obtain ⟨hc, hu, hd, hus, hsp, hr⟩ := hI
  refine ⟨?_, ?_, ?_, hus, hsp, ?_⟩
  · intro ch hm
    simp only [reject, List.mem_cons] at hm
    rcases hm with rfl | hm
    · exact ⟨s.now, s.next, t, by simp [reject], by simp [reject], rfl⟩
    · obtain ⟨now, n, t', h1, h2, h3⟩ := hc ch hm
      exact ⟨now, n, t', by simp [reject]; omega, by simp [reject]; omega, h3⟩
  · intro hq
    simp only [reject, List.pairwise_cons]
    refine ⟨?_, hu hq⟩
    intro b hb
    obtain ⟨now, n, t', _, h2, rfl⟩ := hc b hb
    simp [issue, hq]; omega
  · intro d hm
    exact (hd d hm).mono (by simp [reject]; grind) (by simp [reject]) (by simp [reject])
  · intro r hm
    simp only [reject, List.mem_cons] at hm
    rcases hm with rfl | hm
    · right; simp [reject]
    · exact (hr r hm).mono (by simp [reject]; grind) (by simp [reject])

/-- Inductive step: every step preserves Inv, for every Cfg. -/
theorem inv_step {cfg : Cfg} {s s' : St} {a : Act} (hI : Inv cfg s) (h : step cfg s a = some s') :
    Inv cfg s' := by
  obtain ⟨hc, hu, hd, hus, hsp, hr⟩ := hI
  cases a with
  | tick dt =>
    simp only [step, Option.some.injEq] at h; subst h
    exact ⟨fun ch hm => by grind, hu, fun d hm => (hd d hm).mono (by simp) (by simp) (by simp),
      hus, hsp, fun r hm => (hr r hm).mono (by simp) (by simp)⟩
  | request t =>
    simp only [step, Option.some.injEq] at h; subst h
    exact inv_reject t _ ⟨hc, hu, hd, hus, hsp, hr⟩
  | pay chal am cu re =>
    simp only [step, Option.some.injEq] at h; subst h
    exact ⟨hc, hu, fun d hm => (hd d hm).mono (by simp) (by simp; grind) (by simp),
      hus, hsp, fun r hm => (hr r hm).mono (by simp) (by simp)⟩
  | submit c =>
    simp only [step] at h
    split at h
    · rename_i hck
      simp only [Option.some.injEq] at h; subst h
      obtain ⟨he, ⟨ch, hm, hp⟩, hnu, hl, _, hdg, htg, hpm, hns, hb, ham, hre, hcu⟩ := check_none hck
      refine ⟨hc, hu, ?_, ?_, ?_, ?_⟩
      · intro d hm'
        simp only [List.mem_cons] at hm'
        rcases hm' with rfl | hm'
        · exact ⟨⟨ch, hm, hp⟩, hpm, Nat.le_refl _, he ▸ hl, he ▸ hdg, he ▸ ham, he ▸ hre, hb,
            fun hq => he ▸ hcu hq, fun hq => he ▸ htg hq⟩
        · exact (hd d hm').mono (by simp) (by simp) (by simp)
      · simp only [St.used, List.map_cons, List.nodup_cons]
        exact ⟨hnu, hus⟩
      · simp only [St.spent, List.map_cons, List.nodup_cons]
        exact ⟨hns, hsp⟩
      · intro r hm'
        simp only [List.mem_cons] at hm'
        rcases hm' with rfl | hm'
        · left; simp
        · exact (hr r hm').mono (by simp) (by simp; grind)
    · simp only [Option.some.injEq] at h; subst h
      exact inv_reject _ _ ⟨hc, hu, hd, hus, hsp, hr⟩
  | retry c rc =>
    simp only [step] at h
    split at h
    · rename_i hx
      simp only [Option.some.injEq] at h; subst h
      refine ⟨hc, hu, fun d hm => (hd d hm).mono (by simp) (by simp) (by simp), hus, hsp, ?_⟩
      intro r hm
      simp only [List.mem_cons] at hm
      rcases hm with rfl | hm
      · left; grind
      · exact (hr r hm).mono (by simp) (by simp)
    · cases h

/-- Every reachable state satisfies Inv. -/
theorem reachable_inv {cfg : Cfg} {s : St} (h : Reachable cfg s) : Inv cfg s := by
  induction h with
  | init => exact inv_init cfg
  | step a _ hs ih => exact inv_step ih hs

end IntentCharge

