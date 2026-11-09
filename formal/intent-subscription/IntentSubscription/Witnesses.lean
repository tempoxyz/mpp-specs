import IntentSubscription.Model
import IntentSubscription.Counterexamples
/-
  Witnesses: the guarded model is not vacuous. Each theorem runs the guarded model on a fixed
  trace and checks by 'decide' that the legitimate calls succeed, so a guard that rejects one
  of them breaks the build. The boundary calls just outside the rules are rejected.
-/
namespace IntentSubscription.Witnesses
open IntentSubscription IntentSubscription.Examples

/-- The configuration the traces use satisfies every guard, so the theorems apply to it. -/
theorem guarded_ok : guarded.Guarded := ⟨rfl, rfl, rfl⟩

/-- Activation, then service in period 0. -/
def trAct : List Act := [.issue req none, .sign (cred 0), .activate (cred 0), .serve PAYER 0]

/-- The §Illustrative Lifecycle flow: activate and serve, renew period 1 and serve, miss
  period 2, renew period 3, cancel in period 3 effective at its end, keep serving period 3. -/
def trLife : List Act :=
  trAct ++ [.tick DAY, .renew 0 1, .serve PAYER 0, .tick (2 * DAY), .renew 0 3,
    .serve PAYER 0, .cancel PAYER 0 4, .serve PAYER 0]

/-- Every step of trLife succeeds: three charges of 100 (periods 0, 1, 3) and three receipts. -/
theorem W_lifecycle :
    check guarded trLife (fun st => (chargesOf st 0).map (·.period) == [3, 1, 0] &&
      (st.charges.map (·.amount)).sum == 300 && st.receipts.length == 3) = some true := by
  decide

/-- After the cancellation takes effect, period 4 is not renewed (§Cancellation). -/
theorem W_no_renewal_after_cancel :
    rejectedAt guarded (trLife ++ [.tick DAY, .renew 0 4]) (trLife.length + 1) = true := by
  decide

/-- A retried renewal for period 1 is rejected (§Renewal, one charge per period). -/
theorem W_renewal_retry_rejected :
    rejectedAt guarded (trAct ++ [.tick DAY, .renew 0 1, .renew 0 1]) (trAct.length + 2) = true := by
  decide

/-- The missed period 2 cannot be charged once period 3 has begun (§Renewal). -/
theorem W_missed_period_rejected :
    rejectedAt guarded (trAct ++ [.tick (3 * DAY), .renew 0 2]) (trAct.length + 1) = true := by
  decide

/-- Service in period 1 before its renewal is refused (§Renewal, 402). -/
theorem W_unpaid_period_refused :
    rejectedAt guarded (trAct ++ [.tick DAY, .serve PAYER 0]) (trAct.length + 1) = true := by
  decide

/-- Someone other than the payer is refused service, holding the subscriptionId alone
  (§Subscription Identifier). -/
theorem W_other_caller_refused : rejectedAt guarded (trAct ++ [.serve 9 0]) trAct.length = true := by
  decide

/-- A replayed Credential is rejected (§Single-Use). -/
theorem W_replay_rejected : rejectedAt guarded (trAct ++ [.activate (cred 0)]) trAct.length = true := by
  decide

/-- A second grant for the same Challenge, with a different payload, is rejected (core §Status
  Codes: already-used challenge id), so one 402 activates one subscription. -/
theorem W_second_grant_rejected :
    rejectedAt guarded [.issue req none, .sign (cred 0), .sign (cred 1), .activate (cred 0),
      .activate (cred 1)] 4 = true := by
  decide

/-- One payer holds two subscriptions from two Challenges. -/
theorem W_two_subscriptions :
    check guarded (trAct ++ [.issue req none, .sign ⟨⟨1, req, none⟩, PAYER, 0⟩,
      .activate ⟨⟨1, req, none⟩, PAYER, 0⟩]) (fun st => st.nextSub == 2) = some true := by
  decide

/-- A Credential answering an unexpired Challenge activates; after expires it is rejected. -/
def chalX : Chal := ⟨0, req, some 100⟩
theorem W_challenge_expiry :
    (run guarded St.init [.issue req (some 100), .sign ⟨chalX, PAYER, 0⟩, .tick 50,
      .activate ⟨chalX, PAYER, 0⟩]).isSome = true ∧
    rejectedAt guarded [.issue req (some 100), .sign ⟨chalX, PAYER, 0⟩, .tick 99,
      .activate ⟨chalX, PAYER, 0⟩] 3 = true := by
  decide

/-- A Credential whose echoed request differs from the issued one (amount 1) is rejected. -/
theorem W_tampered_request_rejected :
    rejectedAt guarded [.issue req none, .sign ⟨⟨0, { req with amount := 1 }, none⟩, PAYER, 0⟩,
      .activate ⟨⟨0, { req with amount := 1 }, none⟩, PAYER, 0⟩] 2 = true := by
  decide

/-- With subscriptionExpires at the start of period 2, period 1 renews and period 2 does not. -/
def reqX : Req := { req with subExp := some (1 + 2 * DAY) }
def credX : Cred := ⟨⟨0, reqX, none⟩, PAYER, 0⟩
theorem W_subscription_expiry :
    (run guarded St.init [.issue reqX none, .sign credX, .activate credX, .tick DAY,
      .renew 0 1]).isSome = true ∧
    rejectedAt guarded [.issue reqX none, .sign credX, .activate credX, .tick DAY, .renew 0 1,
      .tick DAY, .renew 0 2] 6 = true := by
  decide

/-- After the payment method revokes the authorization, period 0 is still served and the
  period 1 renewal is rejected. -/
theorem W_revocation :
    (run guarded St.init [.issue req none, .sign (cred 0), .activate (cred 0), .revoke 0,
      .serve PAYER 0]).isSome = true ∧
    rejectedAt guarded [.issue req none, .sign (cred 0), .activate (cred 0), .revoke 0,
      .tick DAY, .renew 0 1] 5 = true := by
  decide

end IntentSubscription.Witnesses
