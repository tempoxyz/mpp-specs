/-
  Charge intent over the Payment HTTP authentication scheme, method-agnostic.
  § references: "core §X" is specs/core/draft-httpauth-payment-01.md, "charge §X" is
  specs/intents/draft-payment-intent-charge-00.md.

  Abstractions
  * The challenge-binding MAC (core §Challenge Binding, HMAC-SHA256) is perfect: the id is the
    bound parameter tuple itself (Params), and a client can only hold ids the server issued, so
    "the id verifies" means "some issued challenge has these parameters". A stateless HMAC server
    and a stateful one are the same model.
  * The payment method is an opaque verifier: a payment (Payment) is a record of what was
    really paid (amount, currency, recipient) and of the challenge the payer paid for (chal).
    Anyone may make any payment (Act.pay); payments are public (core §Threat Model: attackers
    observe all traffic, and ledger proofs are public). The method's own single-use rule (core
    §Replay Protection) is a check that no delivery used the payment's ref yet.
  * Network, TLS, parsing (malformed credentials), 401/403 policy and caching are not modelled.
    Each step is atomic, which is what core §Concurrent Request Handling asks for.
  * Ghost data: each challenge remembers the target and time it was issued for; deliveries and
    responses are logs.

  Rules the drafts leave out are Cfg flags (Cfg.Guarded turns them all on); Counterexamples.lean
  breaks a property with each one off, Witnesses.lean runs legitimate flows with all of them on.
-/
namespace IntentCharge

/-- What a request targets: its route (HTTP method and URI) and its body digest. -/
structure Target where
  route : Nat
  body : Nat
deriving DecidableEq, Repr

/-- The charge request object's shared fields (charge §Request Schema). -/
structure Req where
  amount : Nat
  currency : Nat
  recipient : Nat
deriving DecidableEq, Repr

/-- The challenge parameters the id binds (core §Challenge Binding): realm, method, intent,
  request, and expires, digest, opaque, header when present. description is not bound and
  not modelled. With a perfect MAC this tuple is the id. -/
structure Params where
  realm : Nat
  method : Nat
  intent : Nat
  req : Req
  expires : Option Nat
  digest : Option Nat
  /-- server correlation data; carries the per-challenge nonce when Cfg.uniqueIds is on -/
  opaqueData : Option Nat
  /-- header="Payment-Authorization" present -/
  header : Bool
deriving DecidableEq, Repr

/-- An issued challenge. target and time are ghost: a stateless server does not keep them. -/
structure Challenge where
  p : Params
  target : Target
  time : Nat
deriving DecidableEq, Repr

/-- A payment made through the method's infrastructure: what was paid, and the challenge the
  payer paid for (what a binding method's proof commits to). ref is unique per payment. -/
structure Payment where
  ref : Nat
  chal : Params
  amount : Nat
  currency : Nat
  recipient : Nat
deriving DecidableEq, Repr

/-- A request carrying a Payment credential (core §Credentials):
  * id and echo: the echoed challenge id and parameters;
  * altField: sent in Payment-Authorization rather than Authorization;
  * proof: the payment the payload proves;
  * target: the request the credential arrives with. -/
structure Cred where
  id : Params
  echo : Params
  altField : Bool
  proof : Payment
  target : Target
deriving DecidableEq, Repr

/-- Payment-Receipt (core §Payment-Receipt Header); status is always "success". -/
structure Receipt where
  method : Nat
  ref : Nat
  time : Nat
deriving DecidableEq, Repr

/-- Ghost log entry: a resource was delivered for challenge id, on target, paid by pmt. -/
structure Delivery where
  id : Params
  target : Target
  pmt : Payment
  time : Nat
deriving DecidableEq, Repr

/-- Problem types of core §Status Codes and §Error Codes that the model produces. -/
inductive Problem where
  | paymentRequired
  | invalidChallenge
  | paymentExpired
  | verificationFailed
deriving DecidableEq, Repr

/-- An HTTP response: status, problem type, the challenge in WWW-Authenticate, the receipt. -/
structure Resp where
  status : Nat
  problem : Option Problem
  challenge : Option Params
  receipt : Option Receipt
deriving DecidableEq, Repr

/-- The registered intent identifier "charge". -/
def CHARGE : Nat := 1

/-- One server and its guard flags. Bool flags default to the guarded reading. -/
structure Cfg where
  realm : Nat
  method : Nat
  /-- what the server charges for each target (its route table) -/
  price : Target → Req
  /-- challenge lifetime; none: the server omits expires, which core §Optional Parameters
      allows (SHOULD). Cfg.Guarded asks for some (GAPS.md row 4). -/
  ttl : Option Nat := some 300
  /-- include digest in challenges (core §Request Body Digest Binding, SHOULD) -/
  useDigest : Bool := true
  /-- select Payment-Authorization (core §Credentials) -/
  altHeader : Bool := false
  /-- put a fresh nonce in each challenge (in opaque), so ids are unique (GAPS.md row 5) -/
  uniqueIds : Bool := true
  /-- the echoed request must be what the server charges for the credential's own target
      (GAPS.md row 1) -/
  checkTarget : Bool := true
  /-- the paid currency must match the request (GAPS.md row 2) -/
  checkCurrency : Bool := true
  /-- the proof must be for the challenge it is presented with (GAPS.md row 3) -/
  bindProof : Bool := true

/-- The guarded reading: every rule the drafts leave out is on. -/
structure Cfg.Guarded (cfg : Cfg) : Prop where
  expiry : cfg.ttl.isSome = true
  unique : cfg.uniqueIds = true
  target : cfg.checkTarget = true
  currency : cfg.checkCurrency = true
  bind : cfg.bindProof = true

/-- Global state. used ids and spent payment refs are read off the delivery log. -/
structure St where
  now : Nat
  /-- nonce counter for fresh challenges -/
  next : Nat
  issued : List Challenge
  payments : List Payment
  deliveries : List Delivery
  resps : List Resp

/-- Time 1, nothing issued, paid, delivered or answered. -/
def St.init : St := ⟨1, 0, [], [], [], []⟩

/-- Challenge ids already answered (core §Status Codes "already-used", charge §Replay). -/
def St.used (st : St) : List Params := st.deliveries.map (·.id)
/-- Payment refs already redeemed (core §Replay Protection: a proof is usable once). -/
def St.spent (st : St) : List Nat := st.deliveries.map (·.pmt.ref)

/-- A challenge with this expiry is still live at time now; none never expires. -/
def live : Option Nat → Nat → Bool
  | none, _ => true
  | some e, now => decide (now < e)

/-- A body matches the challenge's digest, if it has one (core §Request Body Digest Binding). -/
def digestOk : Option Nat → Nat → Bool
  | none, _ => true
  | some d, b => d == b

/-- The challenge the server issues for target t at time now with nonce n. -/
def issue (cfg : Cfg) (now n : Nat) (t : Target) : Challenge :=
  ⟨⟨cfg.realm, cfg.method, CHARGE, cfg.price t, cfg.ttl.map (now + ·),
    if cfg.useDigest then some t.body else none, if cfg.uniqueIds then some n else none,
    cfg.altHeader⟩, t, now⟩

/-- The receipt for a delivery. -/
def receiptOf (cfg : Cfg) (d : Delivery) : Receipt := ⟨cfg.method, d.pmt.ref, d.time⟩

/-- Server verification of a credential, in the order of core §Status Codes and charge
  §Server Responsibilities; none = valid.
  1. the echoed parameters verify against the id, and the id was issued (binding);
  2. the id is not already used (single use);
  3. the challenge has not expired;
  4. the credential is in the field the challenge selected (else it is no credential);
  5. the body matches the digest, if bound;
  6. (checkTarget) the request is what the server charges for this target;
  7. the method verifies the proof: a real, unspent payment, (bindProof) made for this
     challenge, with the requested amount and recipient and (checkCurrency) currency. -/
def check (cfg : Cfg) (st : St) (c : Cred) : Option Problem :=
  if ¬ (c.echo = c.id ∧ ∃ ch ∈ st.issued, ch.p = c.id) then some .invalidChallenge
  else if c.id ∈ st.used then some .invalidChallenge
  else if live c.echo.expires st.now = false then some .paymentExpired
  else if c.altField ≠ c.echo.header then some .paymentRequired
  else if digestOk c.echo.digest c.target.body = false then some .verificationFailed
  else if cfg.checkTarget = true ∧ c.echo.req ≠ cfg.price c.target then some .verificationFailed
  else if ¬ (c.proof ∈ st.payments ∧ c.proof.ref ∉ st.spent ∧
      (cfg.bindProof = true → c.proof.chal = c.id) ∧
      c.proof.amount = c.echo.req.amount ∧ c.proof.recipient = c.echo.req.recipient ∧
      (cfg.checkCurrency = true → c.proof.currency = c.echo.req.currency)) then
    some .verificationFailed
  else none

/-- Every action. -/
inductive Act where
  /-- time advances by d -/
  | tick (d : Nat)
  /-- an unpaid request for t: 402 with a fresh challenge (core §Status Codes) -/
  | request (t : Target)
  /-- someone pays through the method, for challenge chal (charge §Flow step 2) -/
  | pay (chal : Params) (amount currency recipient : Nat)
  /-- a request carrying a credential (charge §Flow steps 3-5) -/
  | submit (c : Cred)
  /-- an Idempotency-Key retry served from the cached response r (core §Idempotency) -/
  | retry (c : Cred) (r : Receipt)
deriving Repr

/-- Record a fresh challenge for t and answer 402 with it and problem pr. -/
def reject (cfg : Cfg) (st : St) (t : Target) (pr : Problem) : St :=
  let ch := issue cfg st.now st.next t
  { st with issued := ch :: st.issued, next := st.next + 1,
            resps := ⟨402, some pr, some ch.p, none⟩ :: st.resps }

/-- The protocol as a transition function; none = the action cannot happen. -/
def step (cfg : Cfg) (st : St) : Act → Option St
  | .tick d => some { st with now := st.now + d }
  -- core §Idempotency and Side Effects: an unpaid request records the challenge and nothing else
  | .request t => some (reject cfg st t .paymentRequired)
  | .pay chal amount currency recipient =>
    some { st with payments := ⟨st.payments.length, chal, amount, currency, recipient⟩ :: st.payments }
  -- valid: settle, deliver, answer 200 with a receipt; invalid: 402, fresh challenge, no receipt
  | .submit c =>
    match check cfg st c with
    | none =>
      let d : Delivery := ⟨c.id, c.target, c.proof, st.now⟩
      some { st with deliveries := d :: st.deliveries,
                     resps := ⟨200, none, none, some (receiptOf cfg d)⟩ :: st.resps }
    | some pr => some (reject cfg st c.target pr)
  -- the same credential again with its Idempotency-Key: the original response, no new effect
  | .retry c r =>
    if ∃ d ∈ st.deliveries, d.id = c.id ∧ d.target = c.target ∧ d.pmt = c.proof ∧ r = receiptOf cfg d then
      some { st with resps := ⟨200, none, none, some r⟩ :: st.resps }
    else none

/-- Run a list of actions; none if any step cannot happen. -/
def run (cfg : Cfg) : St → List Act → Option St
  | st, [] => some st
  | st, a :: as => match step cfg st a with
    | none => none
    | some st' => run cfg st' as

/-- States reachable from St.init. -/
inductive Reachable (cfg : Cfg) : St → Prop where
  | init : Reachable cfg St.init
  | step {s s' : St} (a : Act) : Reachable cfg s → step cfg s a = some s' → Reachable cfg s'

end IntentCharge

