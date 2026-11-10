import IntentCharge.Model
/-
  Spec gaps as machine-checked counterexamples. Each trace runs on the executable model with
  ONE guard off and shows a property broken; with every guard on (guarded), the same trace is
  rejected at the step the guard blocks: every action before it happens and the credential at
  that step gets a 402 (rejectedAt). All checked by decide (kernel evaluation, no native code).
  Traces are functions of the Cfg, since the challenge a server issues depends on its flags.
  GAPS.md maps each flag to its section.
-/
namespace IntentCharge.Examples
open IntentCharge

-- One server: realm 7, method 3; two routes, one cheap and one dear, both paid in USD to MERCH.
def REALM : Nat := 7
def METHOD : Nat := 3
def USD : Nat := 840
def JUNK : Nat := 999
def MERCH : Nat := 5

/-- A cheap route (price 1) and a dear one (price 100), both GET with an empty body. -/
def CHEAP : Target := ⟨1, 0⟩
def DEAR : Target := ⟨2, 0⟩

/-- The server's route table. -/
def price (t : Target) : Req := if t.route = 2 then ⟨100, USD, MERCH⟩ else ⟨1, USD, MERCH⟩

/-- All guards on (the model the theorems are about), challenges live 300 s. -/
def guarded : Cfg := { realm := REALM, method := METHOD, price := price }

/-- The parameters (= id) the server issues for t at time now with nonce n. -/
def P (cfg : Cfg) (now n : Nat) (t : Target) : Params := (issue cfg now n t).p

/-- Pay r for challenge p. -/
def payFor (p : Params) (r : Req) : Act := .pay p r.amount r.currency r.recipient

/-- The payment record that pay makes as the ref-th payment. -/
def pmt (ref : Nat) (p : Params) (r : Req) : Payment := ⟨ref, p, r.amount, r.currency, r.recipient⟩

/-- A credential for challenge p, echoing it unchanged, in Authorization, sent to t. -/
def cred (p : Params) (proof : Payment) (t : Target) : Cred := ⟨p, p, false, proof, t⟩

-- Bool versions of the properties, for decide.
/-- P5_matches_target_price: every delivery paid its target's price, recipient and currency. -/
def pTarget (cfg : Cfg) (st : St) : Bool := st.deliveries.all fun d =>
  d.pmt.amount == (cfg.price d.target).amount && d.pmt.currency == (cfg.price d.target).currency &&
    d.pmt.recipient == (cfg.price d.target).recipient
/-- P5_matches_request (currency part). -/
def pCurrency (st : St) : Bool := st.deliveries.all fun d => d.pmt.currency == d.id.req.currency
/-- P1_pays_own_challenge. -/
def pBind (st : St) : Bool := st.deliveries.all fun d => d.pmt.chal == d.id
/-- P3_delivered_before_expiry: every delivered challenge had an expiry and was live. -/
def pLive (st : St) : Bool := st.deliveries.all fun d => match d.id.expires with
  | some e => decide (d.time < e)
  | none => false
/-- P8_unique_ids. -/
def pUnique (st : St) : Bool := decide (st.issued.map (·.p)).Nodup

/-- Run tr from St.init and evaluate prop on the final state; none if a step cannot happen. -/
def outcome (cfg : Cfg) (tr : List Act) (prop : St → Bool) : Option Bool :=
  (run cfg St.init tr).map prop

/-- cfg rejects tr exactly at action n: the first n actions happen, action n submits a
  credential, and the server's check refuses it (402, no delivery). -/
def rejectedAt (cfg : Cfg) (tr : List Act) (n : Nat) : Bool :=
  match run cfg St.init (tr.take n), tr[n]? with
  | some st, some (.submit c) => (IntentCharge.check cfg st c).isSome
  | _, _ => false

/-! ### G1 — the binding covers no resource (core §Challenge Binding; charge §Server
  Responsibilities). A challenge for the cheap route, paid 1, is presented on the dear route:
  every listed check passes, since the echoed request matches the payment. -/
def trG1 (cfg : Cfg) : List Act :=
  let c := P cfg 1 0 CHEAP
  [.request CHEAP, payFor c (price CHEAP), .submit (cred c (pmt 0 c (price CHEAP)) DEAR)]
def cfgG1 : Cfg := { guarded with checkTarget := false }
/-- G1: with the guard off, the dear route is delivered for a payment of 1. -/
theorem G1_violates_P5 : outcome cfgG1 (trG1 cfgG1) (pTarget cfgG1) = some false := by decide
/-- G1: with every guard on, the credential on the dear route is rejected. -/
theorem G1_guard_rejects : rejectedAt guarded (trG1 guarded) 2 = true := by decide

/-! ### G2 — the server's checks omit currency (charge §Server Responsibilities lists amount
  and recipient; §Currency Verification binds only clients). 1 unit of a worthless token
  pays a challenge for 1 USD. -/
def trG2 (cfg : Cfg) : List Act :=
  let c := P cfg 1 0 CHEAP
  let junk : Req := ⟨1, JUNK, MERCH⟩
  [.request CHEAP, payFor c junk, .submit (cred c (pmt 0 c junk) CHEAP)]
def cfgG2 : Cfg := { guarded with checkCurrency := false }
/-- G2: with the guard off, the resource is delivered for a payment in the wrong currency. -/
theorem G2_violates_P5 : outcome cfgG2 (trG2 cfgG2) pCurrency = some false := by decide
/-- G2: with every guard on, that credential is rejected. -/
theorem G2_guard_rejects : rejectedAt guarded (trG2 guarded) 2 = true := by decide

/-! ### G3 — the proof need not commit to the challenge (charge §Server Responsibilities
  step 3, core §Replay Protection). Payer A pays for its challenge a; the payment is public
  (a ledger transaction). B obtains its own challenge b for the same route and presents A's
  payment first: B gets the resource, and A's own credential is then refused as spent. -/
def trG3 (cfg : Cfg) : List Act :=
  let a := P cfg 1 0 CHEAP
  let b := P cfg 1 1 CHEAP
  [.request CHEAP, payFor a (price CHEAP), .request CHEAP,
   .submit (cred b (pmt 0 a (price CHEAP)) CHEAP), .submit (cred a (pmt 0 a (price CHEAP)) CHEAP)]
def cfgG3 : Cfg := { guarded with bindProof := false }
/-- G3: with the guard off, B's delivery is paid by a payment made for A's challenge. -/
theorem G3_violates_P1 : outcome cfgG3 (trG3 cfgG3) pBind = some false := by decide
/-- G3: and A, who paid, is refused: one delivery (B's), and A's credential got 402
  verification-failed. -/
theorem G3_payer_locked_out :
    outcome cfgG3 (trG3 cfgG3) (fun st => st.deliveries.length == 1 &&
      st.resps.head?.map (·.problem) == some (some .verificationFailed)) = some true := by decide
/-- G3: with every guard on, B's credential is rejected. -/
theorem G3_guard_rejects : rejectedAt guarded (trG3 guarded) 3 = true := by decide
/-- G3: and with every guard on, A's credential then succeeds. -/
theorem G3_guard_payer_served :
    outcome guarded (trG3 guarded) (fun st => st.deliveries.length == 1 && pBind st) = some true := by
  decide

/-! ### G4 — expires is optional (core §Optional Parameters: SHOULD). A challenge with no
  expires never expires, so charge §Server Responsibilities step 2 checks nothing: a challenge
  is redeemed 10^6 s after it was issued, at its old price. -/
def trG4 (cfg : Cfg) : List Act :=
  let c := P cfg 1 0 CHEAP
  [.request CHEAP, payFor c (price CHEAP), .tick 1000000, .submit (cred c (pmt 0 c (price CHEAP)) CHEAP)]
def cfgG4 : Cfg := { guarded with ttl := none }
/-- G4: with the guard off, a challenge with no expiry is redeemed 10^6 s later. -/
theorem G4_violates_P3 : outcome cfgG4 (trG4 cfgG4) pLive = some false := by decide
/-- G4: with every guard on (300 s lifetime), the late credential is rejected. -/
theorem G4_guard_rejects : rejectedAt guarded (trG4 guarded) 3 = true := by decide

/-! ### G5 — the recommended HMAC id has no nonce (core §HMAC-SHA256 Binding), so two
  challenges with the same parameters share an id, which core §Required Parameters calls
  unique. Two clients ask for the same route in the same second; both pay; the second is
  refused as already used. -/
def trG5 (cfg : Cfg) : List Act :=
  let a := P cfg 1 0 CHEAP
  let b := P cfg 1 1 CHEAP
  [.request CHEAP, .request CHEAP, payFor a (price CHEAP), .submit (cred a (pmt 0 a (price CHEAP)) CHEAP),
   payFor b (price CHEAP), .submit (cred b (pmt 1 b (price CHEAP)) CHEAP)]
def cfgG5 : Cfg := { guarded with uniqueIds := false }
/-- G5: with the guard off, the two challenges share an id. -/
theorem G5_violates_P8 : outcome cfgG5 (trG5 cfgG5) pUnique = some false := by decide
/-- G5: and the second client paid but got nothing: two payments, one delivery, and its
  credential got 402 invalid-challenge. -/
theorem G5_paid_not_served :
    outcome cfgG5 (trG5 cfgG5) (fun st => st.payments.length == 2 && st.deliveries.length == 1 &&
      st.resps.head?.map (·.problem) == some (some .invalidChallenge)) = some true := by decide
/-- G5: with every guard on, both clients are served. -/
theorem G5_guard_serves_both :
    outcome guarded (trG5 guarded) (fun st => st.deliveries.length == 2 && pUnique st) = some true := by
  decide

/-! ### Gap 8 (wording) — the HMAC input is ambiguous when a slot contains "|" (core
  §HMAC-SHA256 Binding). realm is a quoted-string, which may contain "|" (core §Character
  Encoding only asks for ASCII, SHOULD). The model's MAC is injective over the tuple, so it
  does not see this; hmacInput follows the draft's pseudo-code on strings. -/

/-- The draft's HMAC input: six fixed slots, then header when present, then opaque. -/
def hmacInput (realm method intent request expires digest : String) (header opq : Option String) :
    String :=
  String.intercalate "|"
    ([realm, method, intent, request, expires, digest] ++ header.toList ++ [opq.getD ""])

/-- A challenge with header and a challenge without it, whose realm contains "|", have the
  same HMAC input, so the same id. The second has method "charge" and an empty request, so a
  server that parses the echoed parameters strictly still rejects it; the draft does not say
  to, nor that realm excludes "|". -/
theorem Gap8_hmac_input_collision :
    hmacInput "api" "tempo" "charge" "eyJ9" "" "" (some "Payment-Authorization") none =
      hmacInput "api|tempo" "charge" "eyJ9" "" "" "Payment-Authorization" none none := by
  decide

end IntentCharge.Examples

