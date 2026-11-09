/-
  Subscription intent (draft-payment-intent-subscription-00) on the Payment HTTP
  authentication scheme (draft-httpauth-payment-01). Section names (§) refer to the
  subscription draft unless prefixed "core".

  Abstractions
  * Crypto is perfect. A Credential (Cred) is a grant its payer signed over the echoed
    Challenge; only Act.sign adds to St.creds, so a Cred in creds was signed by Cred.payer.
    Challenge binding (core §Challenge Binding) is perfect: a Cred binds to an issued Challenge
    iff its echoed Chal (id, request, expires) is in St.issued.
  * realm, method, intent, digest, opaque and header are folded into Chal.req/Chal.id: they are
    bound like request and change nothing below.
  * The payment network is a ghost log: St.charges records every collected payment, which a
    method settles atomically with the step that collects it. Network failures are steps that
    do not happen (a failed renewal leaves the state unchanged).
  * Billing periods have a fixed length Req.len = periodCount * unit seconds (day, week).
    Calendar months are abstracted: the proofs only use that the period index
    (now - anchor) / len never decreases as time passes.
  * One server; client authentication for a subscriptionId (§Subscription Identifier) is the
    caller argument of serve and cancel.

  Rules the draft leaves out are Cfg flags. Theorems hold for every Cfg with all flags on
  (Cfg.Guarded); Counterexamples.lean breaks a property with each flag off, and Witnesses.lean
  shows legitimate flows still succeed with them on.
-/
namespace IntentSubscription

/-- Shared request fields (§Shared Fields). periodUnit and periodCount are folded into len. -/
structure Req where
  /-- amount per billing period, in base units -/
  amount : Nat
  currency : Nat
  recipient : Nat
  /-- billing period length in seconds: periodCount * 86400 (day) or * 604800 (week) -/
  len : Nat
  /-- subscriptionExpires, if present (§Optional Fields) -/
  subExp : Option Nat
deriving DecidableEq, Repr

/-- A Challenge (core §Challenge): id, the request it carries and its optional expires. -/
structure Chal where
  id : Nat
  req : Req
  expires : Option Nat
deriving DecidableEq, Repr

/-- A Credential (§Credential Requirements): the echoed Challenge, the payer who signed the
  grant, and a method-specific payload nonce (two grants for one Challenge may differ). -/
structure Cred where
  chal : Chal
  payer : Nat
  nonce : Nat
deriving DecidableEq, Repr

/-- Durable subscription state (§Server Accounting and Idempotency).
  * anchor: activation time (§Shared Fields, billing anchor);
  * lastPaid: last charged billing-period index (activation charges period 0);
  * cancelReq: period index when the payer cancelled (ghost, for the properties);
  * cancelEff: period index at which the cancellation takes effect;
  * revokedAt: lastPaid when the payment method revoked the authorization (§Single-Use). -/
structure Sub where
  payer : Nat
  req : Req
  /-- id of the Challenge whose Credential activated it -/
  chal : Nat
  anchor : Nat
  lastPaid : Nat
  cancelReq : Option Nat
  cancelEff : Option Nat
  revokedAt : Option Nat := none
deriving DecidableEq, Repr

/-- Current billing-period index at time now: (now - anchor) / len. -/
def Sub.cur (s : Sub) (now : Nat) : Nat := (now - s.anchor) / s.req.len

/-- A collected payment (activation or renewal charge) on the payment network. -/
structure Charge where
  sub : Nat
  payer : Nat
  period : Nat
  amount : Nat
  currency : Nat
  recipient : Nat
  time : Nat
deriving DecidableEq, Repr

/-- A Payment-Receipt: the subscriptionId, the period it pays and the amount. -/
structure Receipt where
  sub : Nat
  period : Nat
  amount : Nat
deriving DecidableEq, Repr

/-- Service delivered to caller under subscription sub for one billing period. -/
structure Access where
  caller : Nat
  sub : Nat
  period : Nat
deriving DecidableEq, Repr

/-- Guard flags for rules the draft leaves out; each defaults to true (the guarded reading). -/
structure Cfg where
  /-- A renewal may collect only the current billing period (G1). §Renewal forbids
      accumulating missed periods but not charging future ones in advance. -/
  renewCurrentOnly : Bool := true
  /-- A cancellation takes effect by the end of the current billing period (G2).
      §Cancellation leaves the effective time to the method. -/
  cancelBounded : Bool := true
  /-- Activation is refused once subscriptionExpires is reached (G3). §Optional Fields only
      stops future billing periods. -/
  activateBeforeExpiry : Bool := true
deriving Repr

/-- The guarded reading: every flag on. -/
structure Cfg.Guarded (cfg : Cfg) : Prop where
  current : cfg.renewCurrentOnly = true
  bounded : cfg.cancelBounded = true
  expiry : cfg.activateBeforeExpiry = true

/-- Global state: Challenges, Credentials, subscriptions and ghost logs. -/
structure St where
  now : Nat
  /-- next Challenge id (ids are unique, core §Required Parameters) -/
  nextChal : Nat
  /-- every Challenge the server issued -/
  issued : List Chal
  /-- every Credential a payer signed (only Act.sign adds) -/
  creds : List Cred
  /-- Challenge ids already answered -/
  usedChal : List Nat
  /-- Credentials already accepted (§Single-Use) -/
  usedCred : List Cred
  /-- next subscriptionId (unique, §Subscription Identifier) -/
  nextSub : Nat
  subs : Nat → Option Sub
  /-- ghost: every collected payment, newest first -/
  charges : List Charge
  /-- every Payment-Receipt returned -/
  receipts : List Receipt
  /-- every delivery of service -/
  served : List Access

/-- Nothing issued, signed or activated, at time 1. -/
def St.init : St := ⟨1, 0, [], [], [], [], 0, fun _ => none, [], [], []⟩

/-- Point update of the subscription map. -/
def upd (f : Nat → Option Sub) (k : Nat) (b : Option Sub) : Nat → Option Sub :=
  fun k' => if k' = k then b else f k'

/-- Reading the updated key returns the new value. -/
theorem upd_same (f : Nat → Option Sub) (k : Nat) (b : Option Sub) : upd f k b k = b := by
  simp [upd]

/-- Reading an updated map, as one case split. -/
theorem upd_apply (f : Nat → Option Sub) (k k' : Nat) (b : Option Sub) :
    upd f k b k' = if k' = k then b else f k' := rfl

/-- t is before the optional deadline o (none: no deadline). -/
def before (o : Option Nat) (t : Nat) : Bool :=
  match o with
  | none => true
  | some e => decide (t < e)

/-- Every action of the model. -/
inductive Act where
  /-- time advances by d -/
  | tick (d : Nat)
  /-- the server answers an unpaid request with a 402 Challenge (core §Request Flow) -/
  | issue (req : Req) (expires : Option Nat)
  /-- a payer signs a subscription grant (flow step 3) -/
  | sign (c : Cred)
  /-- the server verifies a Credential, activates and collects period 0 (§Activation) -/
  | activate (c : Cred)
  /-- the server collects a renewal for period p (§Renewal) -/
  | renew (sid p : Nat)
  /-- the payer cancels, effective from period eff (§Cancellation) -/
  | cancel (caller sid eff : Nat)
  /-- the payment method revokes or invalidates the authorization (§Single-Use) -/
  | revoke (sid : Nat)
  /-- the server delivers service for the current period to caller (§Renewal) -/
  | serve (caller sid : Nat)
deriving Repr

/-- The protocol as a computable transition; none = rejected (402). -/
def step (cfg : Cfg) (st : St) : Act → Option St
  | .tick d => some { st with now := st.now + d }
  -- core §Idempotency and Side Effects: an unpaid request records only the Challenge
  | .issue req ex =>
    some { st with nextChal := st.nextChal + 1, issued := ⟨st.nextChal, req, ex⟩ :: st.issued }
  | .sign c => some { st with creds := c :: st.creds }
  -- §Activation steps 1-4; core §Challenge Binding, §Status Codes (expired or already-used id), §Replay
  -- Protection; §Single-Use; §Shared Fields (positive amount and period)
  | .activate c =>
    if c ∈ st.creds ∧ c.chal ∈ st.issued ∧ before c.chal.expires st.now = true ∧
       c ∉ st.usedCred ∧ c.chal.id ∉ st.usedChal ∧
       0 < c.chal.req.amount ∧ 0 < c.chal.req.len ∧
       (cfg.activateBeforeExpiry = true → before c.chal.req.subExp st.now = true) then
      some { st with
        nextSub := st.nextSub + 1
        subs := upd st.subs st.nextSub
          (some ⟨c.payer, c.chal.req, c.chal.id, st.now, 0, none, none, none⟩)
        usedChal := c.chal.id :: st.usedChal
        usedCred := c :: st.usedCred
        charges := ⟨st.nextSub, c.payer, 0, c.chal.req.amount, c.chal.req.currency,
          c.chal.req.recipient, st.now⟩ :: st.charges
        receipts := ⟨st.nextSub, 0, c.chal.req.amount⟩ :: st.receipts }
    else none
  -- §Renewal: one charge per period, no accumulated missed periods, (G1) current period only;
  -- §Optional Fields: not once subscriptionExpires is reached; §Cancellation: no period
  -- after cancellation takes effect; §Single-Use: not once the authorization is revoked
  | .renew sid p =>
    match st.subs sid with
    | none => none
    | some s =>
      if s.lastPaid < p ∧ s.cur st.now ≤ p ∧ (cfg.renewCurrentOnly = true → p = s.cur st.now) ∧
         before s.req.subExp st.now = true ∧ before s.cancelEff p = true ∧
         s.revokedAt = none then
        some { st with
          subs := upd st.subs sid (some { s with lastPaid := p })
          charges := ⟨sid, s.payer, p, s.req.amount, s.req.currency, s.req.recipient, st.now⟩
            :: st.charges
          receipts := ⟨sid, p, s.req.amount⟩ :: st.receipts }
      else none
  -- §Cancellation: the payer cancels once; (G2) effective by the end of the current period
  | .cancel caller sid eff =>
    match st.subs sid with
    | none => none
    | some s =>
      if caller = s.payer ∧ s.cancelEff = none ∧
         (cfg.cancelBounded = true → eff ≤ s.cur st.now + 1) then
        some { st with
          subs := upd st.subs sid
            (some { s with cancelReq := some (s.cur st.now), cancelEff := some eff }) }
      else none
  -- §Single-Use: the payment method revokes the authorization once, at any time; the
  -- period already paid stays paid
  | .revoke sid =>
    match st.subs sid with
    | none => none
    | some s =>
      if s.revokedAt = none then
        some { st with subs := upd st.subs sid (some { s with revokedAt := some s.lastPaid }) }
      else none
  -- §Renewal: service for a period only once its charge is collected; §Subscription
  -- Identifier: only to the authenticated payer
  | .serve caller sid =>
    match st.subs sid with
    | none => none
    | some s =>
      if caller = s.payer ∧ ∃ c ∈ st.charges, c.sub = sid ∧ c.period = s.cur st.now then
        some { st with served := ⟨caller, sid, s.cur st.now⟩ :: st.served }
      else none

/-- Run a list of actions; none if any step is rejected. -/
def run (cfg : Cfg) : St → List Act → Option St
  | st, [] => some st
  | st, a :: as => match step cfg st a with
    | none => none
    | some st' => run cfg st' as

/-- States reachable from St.init. -/
inductive Reachable (cfg : Cfg) : St → Prop where
  | init : Reachable cfg St.init
  | step {s s' : St} (a : Act) : Reachable cfg s → step cfg s a = some s' → Reachable cfg s'

end IntentSubscription
