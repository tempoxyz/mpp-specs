import IntentCharge.Model
import IntentCharge.Counterexamples
/-
  Witnesses: the guarded model is not vacuous. Each theorem runs the guarded model on one
  fixed trace and checks by decide that its legitimate requests succeed, so a guard written
  too strictly (rejecting what the drafts allow) breaks the build. They cover only these
  traces. Also checked: the configurations satisfy Cfg.Guarded, and the boundary cases just
  outside the rules (one second late, the wrong field, the wrong body, a replay) are refused.
-/
namespace IntentCharge.Witnesses
open IntentCharge IntentCharge.Examples

/-- The configuration the counterexamples use satisfies every guard. -/
theorem guarded_ok : guarded.Guarded := ⟨rfl, rfl, rfl, rfl, rfl⟩

/-- A guarded server that selects Payment-Authorization (core §Credentials). -/
def alt : Cfg := { guarded with altHeader := true }
/-- alt satisfies every guard. -/
theorem alt_ok : alt.Guarded := ⟨rfl, rfl, rfl, rfl, rfl⟩

/-- The challenge the first request at time 1 gets. -/
def c0 : Params := P guarded 1 0 CHEAP
/-- Its payment, the first one made. -/
def p0 : Payment := pmt 0 c0 (price CHEAP)
/-- The one-time charge of core §Examples: 402 with a challenge, payment, credential, 200. -/
def flow : List Act := [.request CHEAP, payFor c0 (price CHEAP), .submit (cred c0 p0 CHEAP)]

/-- The charge flow succeeds: one delivery, and the last response is a 200 with the receipt
  for payment 0, the first a 402 payment-required carrying c0. -/
theorem W_charge_flow :
    outcome guarded flow (fun st => st.deliveries.length == 1 &&
      st.resps == [⟨200, none, none, some ⟨METHOD, 0, 1⟩⟩, ⟨402, some .paymentRequired, some c0, none⟩])
      = some true := by decide

/-- The dear route, paid 100 on its own challenge, is served. -/
theorem W_dear_route :
    let c := P guarded 1 0 DEAR
    outcome guarded [.request DEAR, payFor c (price DEAR), .submit (cred c (pmt 0 c (price DEAR)) DEAR)]
      (fun st => st.deliveries.length == 1) = some true := by decide

/-- An Idempotency-Key retry gets the original receipt and no new delivery. -/
theorem W_retry :
    outcome guarded (flow ++ [.retry (cred c0 p0 CHEAP) ⟨METHOD, 0, 1⟩])
      (fun st => st.deliveries.length == 1 && st.resps.head? == some ⟨200, none, none, some ⟨METHOD, 0, 1⟩⟩)
      = some true := by decide

/-- Replaying the credential is refused with invalid-challenge (charge §Single-Use). -/
theorem W_replay_rejected :
    rejectedAt guarded (flow ++ [.submit (cred c0 p0 CHEAP)]) 3 = true ∧
    outcome guarded (flow ++ [.submit (cred c0 p0 CHEAP)])
      (fun st => st.resps.head?.map (·.problem) == some (some .invalidChallenge)) = some true := by
  decide

/-- A credential at the last second of the challenge's 300 s life is served (issued at 1,
  expires at 301, submitted at 300). -/
theorem W_last_second :
    outcome guarded [.request CHEAP, payFor c0 (price CHEAP), .tick 299, .submit (cred c0 p0 CHEAP)]
      (fun st => st.deliveries.length == 1) = some true := by decide

/-- One second later (at 301) it is refused with payment-expired. -/
theorem W_expired :
    outcome guarded [.request CHEAP, payFor c0 (price CHEAP), .tick 300, .submit (cred c0 p0 CHEAP)]
      (fun st => st.deliveries.length == 0 &&
        st.resps.head?.map (·.problem) == some (some .paymentExpired)) = some true := by decide

/-- After a failed verification, the client pays the fresh challenge from the 402 and is
  served (core §Failed Payment Verification). -/
theorem W_fresh_challenge_after_failure :
    let junk : Req := ⟨1, JUNK, MERCH⟩
    let c1 := P guarded 1 1 CHEAP
    outcome guarded [.request CHEAP, payFor c0 junk, .submit (cred c0 (pmt 0 c0 junk) CHEAP),
        payFor c1 (price CHEAP), .submit (cred c1 (pmt 1 c1 (price CHEAP)) CHEAP)]
      (fun st => st.deliveries.length == 1 && st.issued.length == 2) = some true := by decide

/-- With Payment-Authorization selected, a credential in that field is served. -/
theorem W_alt_header :
    let c := P alt 1 0 CHEAP
    outcome alt [.request CHEAP, payFor c (price CHEAP), .submit ⟨c, c, true, pmt 0 c (price CHEAP), CHEAP⟩]
      (fun st => st.deliveries.length == 1) = some true := by decide

/-- The same credential in Authorization is refused (core §Credentials). -/
theorem W_wrong_field :
    let c := P alt 1 0 CHEAP
    rejectedAt alt [.request CHEAP, payFor c (price CHEAP), .submit (cred c (pmt 0 c (price CHEAP)) CHEAP)] 2
      = true := by decide

/-- A credential sent with another body than the challenge's digest is refused (core
  §Request Body Digest Binding). -/
theorem W_wrong_body :
    rejectedAt guarded [.request CHEAP, payFor c0 (price CHEAP), .submit (cred c0 p0 ⟨1, 9⟩)] 2 = true := by
  decide

/-- An underpayment (0 instead of 1) is refused (charge §Server Responsibilities step 4). -/
theorem W_underpaid :
    let low : Req := ⟨0, USD, MERCH⟩
    rejectedAt guarded [.request CHEAP, payFor c0 low, .submit (cred c0 (pmt 0 c0 low) CHEAP)] 2 = true := by
  decide

/-- A payment to another recipient is refused (charge §Server Responsibilities step 5). -/
theorem W_wrong_recipient :
    let other : Req := ⟨1, USD, 6⟩
    rejectedAt guarded [.request CHEAP, payFor c0 other, .submit (cred c0 (pmt 0 c0 other) CHEAP)] 2 = true := by
  decide

/-- A credential that alters the echoed request (amount 0) under c0's id is refused. -/
theorem W_tampered :
    let forged : Params := { c0 with req := ⟨0, USD, MERCH⟩ }
    rejectedAt guarded [.request CHEAP, .pay c0 0 USD MERCH, .submit ⟨c0, forged, false, ⟨0, c0, 0, USD, MERCH⟩, CHEAP⟩] 2
      = true := by decide

/-- hmacInput reproduces the three HMAC inputs of core §HMAC-SHA256 Test Vectors, so the
  collision in Gap8_hmac_input_collision uses the draft's own layout. -/
theorem W_hmac_test_vector_inputs :
    hmacInput "api.example.com" "tempo" "charge" "eyJhbW91bnQiOiIxMDAwMDAwIn0" "" "" none none =
      "api.example.com|tempo|charge|eyJhbW91bnQiOiIxMDAwMDAwIn0|||" ∧
    hmacInput "api.example.com" "tempo" "charge" "eyJhbW91bnQiOiIxMDAwMDAwIn0" "" ""
      (some "Payment-Authorization") none =
      "api.example.com|tempo|charge|eyJhbW91bnQiOiIxMDAwMDAwIn0|||Payment-Authorization|" ∧
    hmacInput "api.example.com" "tempo" "charge" "eyJhbW91bnQiOiIxMDAwMDAwIn0" "" ""
      (some "Payment-Authorization") (some "eyJwaSI6InBpXzEyMyJ9") =
      "api.example.com|tempo|charge|eyJhbW91bnQiOiIxMDAwMDAwIn0|||Payment-Authorization|eyJwaSI6InBpXzEyMyJ9" := by
  decide

end IntentCharge.Witnesses

