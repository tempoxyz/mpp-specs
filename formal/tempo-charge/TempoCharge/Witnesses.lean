import TempoCharge.Model
import TempoCharge.Counterexamples
/-
  Witnesses: the guarded model is not vacuous. Each theorem runs the guarded model on one fixed
  trace and checks by 'decide' that its legitimate calls succeed, so a guard that rejects one of
  them breaks the build. Also checked: the boundary calls just outside the rules are rejected.
-/
namespace TempoCharge.Witnesses
open TempoCharge TempoCharge.Examples

/-- The configuration the counterexamples use satisfies every guard. -/
theorem guarded_ok : guarded.Guarded := ⟨rfl, rfl, rfl, rfl⟩

/-- Pull with server-paid fees (§Server-Paid Fees): the merchant gets 100, the server pays the
  fee, the receipt references the transaction. -/
theorem W_pull_sponsored :
    check guarded [.fund TOKEN PAYER 100, .issue chF, .signTx txF,
      .submit { echo := chF, payload := .transaction txF }]
      (fun st => st.bal TOKEN MERCHANT == 100 && st.sponsored == [1] &&
        st.receipts == [⟨1, .tx txF, 1⟩]) = some true := by decide

/-- A split request (platform fee and an affiliate with a memo), paid by transfers in another
  order (§Ordering): 85 / 10 / 5. -/
def reqSplit : Request :=
  { req with splits := [{ recipient := PLATFORM, amount := 10 }, { recipient := 12, amount := 5, memo := some 7 }] }
def chSplit : Challenge := { chA with request := reqSplit }
def txSplit : Tx := { tx1 with calls := [{ pay with dst := 12, amount := 5, memo := some 7 },
  { pay with amount := 85 }, { pay with dst := PLATFORM, amount := 10 }] }
theorem W_pull_splits :
    check guarded [.fund TOKEN PAYER 100, .issue chSplit, .signTx txSplit,
      .submit { echo := chSplit, payload := .transaction txSplit }]
      (fun st => st.bal TOKEN MERCHANT == 85 && st.bal TOKEN PLATFORM == 10 && st.bal TOKEN 12 == 5 &&
        st.receipts.length == 1) = some true := by decide

/-- The split payment without the affiliate's memo is rejected (§Transaction Verification). -/
theorem W_split_memo_required :
    rejectedAt guarded [.fund TOKEN PAYER 100, .issue chSplit,
      .signTx { txSplit with calls := [{ pay with dst := 12, amount := 5 }, { pay with amount := 85 },
        { pay with dst := PLATFORM, amount := 10 }] },
      .submit { echo := chSplit, payload := .transaction { txSplit with calls := [{ pay with dst := 12, amount := 5 },
        { pay with amount := 85 }, { pay with dst := PLATFORM, amount := 10 }] } }] 3 = true := by decide

/-- Order does not matter (§Ordering): with a primary transfer needing no memo and a split of
  the same recipient and amount needing memo 7, the calls settle in either order. -/
def reqSameDst : Request :=
  { req with amount := 10, splits := [{ recipient := MERCHANT, amount := 5, memo := some 7 }] }
def chSameDst : Challenge := { chA with request := reqSameDst }
def txMemoFirst : Tx := { tx1 with calls := [{ pay with amount := 5, memo := some 7 }, { pay with amount := 5 }] }
def txMemoLast : Tx := { tx1 with calls := [{ pay with amount := 5 }, { pay with amount := 5, memo := some 7 }] }
theorem W_split_order_memo_first :
    check guarded [.fund TOKEN PAYER 10, .issue chSameDst, .signTx txMemoFirst,
      .submit { echo := chSameDst, payload := .transaction txMemoFirst }]
      (fun st => st.bal TOKEN MERCHANT == 10 && st.receipts.length == 1) = some true := by decide
theorem W_split_order_memo_last :
    check guarded [.fund TOKEN PAYER 10, .issue chSameDst, .signTx txMemoLast,
      .submit { echo := chSameDst, payload := .transaction txMemoLast }]
      (fun st => st.bal TOKEN MERCHANT == 10 && st.receipts.length == 1) = some true := by decide

/-- Push (§Hash Settlement): the client broadcasts, then submits the hash. -/
theorem W_push :
    check guarded [.fund TOKEN PAYER 100, .issue chA, .signTx tx1, .broadcast tx1,
      .submit { echo := chA, payload := .hash tx1 }]
      (fun st => st.bal TOKEN MERCHANT == 100 && st.receipts == [⟨1, .tx tx1, 1⟩]) = some true := by
  decide

/-- A zero-amount charge settles with a proof; the receipt references the challenge id
  (§Proof Receipt). -/
def chZero : Challenge := { chA with request := { req with amount := 0 } }
theorem W_proof :
    check guarded [.issue chZero, .signProof proofA,
      .submit { echo := chZero, payload := .proof proofA, source := some (CHAIN, PAYER) }]
      (fun st => st.receipts == [⟨1, .challenge 1, 1⟩]) = some true := by decide

/-- A proof under domain version "2" is rejected (§Proof Contract Versions). -/
theorem W_proof_v2_rejected :
    rejectedAt guarded [.issue chZero, .signProof { proofA with version := 2 },
      .submit { echo := chZero, payload := .proof { proofA with version := 2 }, source := some (CHAIN, PAYER) }] 2 = true := by
  decide

/-- The pull credential, replayed after it settled, is rejected (intent §Single-Use). -/
def trPull : List Act :=
  [.fund TOKEN PAYER 100, .issue chA, .signTx tx1, .submit { echo := chA, payload := .transaction tx1 }]
theorem W_pull : (run guarded St.init trPull).isSome = true := by decide
theorem W_replay_rejected :
    rejectedAt guarded (trPull ++ [.submit { echo := chA, payload := .transaction tx1 }]) 4 = true := by decide

/-- At expires the credential is rejected; one second earlier it settles. -/
theorem W_expired_rejected :
    rejectedAt guarded [.fund TOKEN PAYER 100, .issue chA, .signTx tx1, .tick 99,
      .submit { echo := chA, payload := .transaction tx1 }] 4 = true := by decide
theorem W_before_expiry :
    (run guarded St.init [.fund TOKEN PAYER 100, .issue chA, .signTx tx1, .tick 98,
      .submit { echo := chA, payload := .transaction tx1 }]).isSome = true := by decide

/-- An echoed challenge with a lower amount than the one issued is rejected (binding). -/
theorem W_tampered_rejected :
    rejectedAt guarded [.fund TOKEN PAYER 100, .issue chA, .signTx tx1,
      .submit { echo := { chA with request := { req with amount := 1 } }, payload := .transaction tx1 }] 3 = true := by
  decide

/-- A transaction past its validBefore never lands (§Transaction Replay). -/
theorem W_validBefore_rejected :
    rejectedAt guarded [.fund TOKEN PAYER 100, .signTx { tx1 with validBefore := some 50 }, .tick 49,
      .broadcast { tx1 with validBefore := some 50 }] 3 = true := by decide

end TempoCharge.Witnesses
