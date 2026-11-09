import MppCore
/-
  Tempo charge payment method (draft-tempo-charge-00): one server, its challenges and
  credentials, and the Tempo chain the payments land on. Section names (§) refer to
  specs/methods/tempo/draft-tempo-charge-00.md; "core" is draft-httpauth-payment-01 and
  "intent" is draft-payment-intent-charge-00.

  Abstractions
  * Hashes are injective: a transaction *is* its hash, and the challenge binding (core
    §Challenge Binding, HMAC or a lookup) is modelled as equality between the echoed challenge
    and the one issued under its id.
  * Signatures are unforgeable: St.signed holds exactly the transactions their senders signed,
    St.proofSigs the EIP-712 proofs their signers signed; only Act.signTx / Act.signProof add.
  * The chain: one chain (Cfg.chainId), TIP-20 balances per token and account, 2D nonces as one
    (sender, nonce) pair, validBefore, and atomic execution (all transfers or none). A reverted
    transaction is still included and consumes its nonce (fees are paid). Finality is immediate.
  * A transaction's calls are its transfer / transferWithMemo calls; their Transfer events are
    the calls themselves when it succeeds. Other call shapes (swaps, smart wallets) are omitted.
  * Server handling of a pull credential takes two steps: Act.submit verifies it and
    broadcasts the transaction (eth_sendRawTxSync, so it is on chain when the step ends) and
    leaves the settlement pending (St.pending); Act.settlePull later settles and delivers.
    Other credentials interleave between the two, since core §Concurrent Request Handling only
    serializes identical credentials. Hash and proof credentials verify, settle and deliver in
    one step. A receipt in St.receipts stands for "200 + Payment-Receipt + resource
    delivered".
  * Access-key proof signers (§Proof Verification step 5), ERC-1271, fee token choice and fee
    amounts, Idempotency-Key replays, digest/opaque/header parameters are not modelled.

  Rules the draft leaves out are Cfg flags (all on in Cfg.Guarded); Counterexamples.lean breaks
  a property with each one off, Witnesses.lean shows legitimate flows succeed with all on.
-/
namespace TempoCharge

export MppCore (upd upd_same upd_other upd_apply)

/-- One TIP-20 transfer call, or the Transfer / TransferWithMemo event it emits.
  The sender is the transaction's sender. memo = none is transfer, some m transferWithMemo. -/
structure Transfer where
  token : Nat
  dst : Nat
  amount : Nat
  memo : Option Nat := none
deriving DecidableEq, Repr

/-- A Tempo Transaction (type 0x76, §Terminology), as far as the charge rules read it.
  * sponsor: signed with the fee_payer_signature placeholder (feePayer: true, §Fee Payment),
    so it needs a fee payer's 0x78 signature before the chain accepts it. -/
structure Tx where
  sender : Nat
  chainId : Nat
  nonce : Nat
  validBefore : Option Nat := none
  calls : List Transfer
  sponsor : Bool := false
deriving DecidableEq, Repr

/-- One methodDetails.splits entry (§Split Payments). -/
structure Split where
  recipient : Nat
  amount : Nat
  memo : Option Nat := none
deriving DecidableEq, Repr

/-- The charge request (§Request Schema). splits = [] means absent; pull / push say which
  non-zero modes supportedModes allows (both when omitted). -/
structure Request where
  amount : Nat
  currency : Nat
  recipient : Nat
  chainId : Nat
  memo : Option Nat := none
  splits : List Split := []
  feePayer : Bool := false
  pull : Bool := true
  push : Bool := true
deriving DecidableEq, Repr

/-- A challenge as issued (core §WWW-Authenticate): id, realm, request, expires.
  * client: ghost, who asked for it (no protocol field; used only to state Gap 5). -/
structure Challenge where
  id : Nat
  realm : Nat
  request : Request
  expires : Nat
  client : Nat := 0
deriving DecidableEq, Repr

/-- EIP-712 Proof message with its domain (§Proof Payload) and who signed it. -/
structure ProofSig where
  signer : Nat
  account : Nat
  challengeId : Nat
  realm : Nat
  chainId : Nat
  version : Nat
deriving DecidableEq, Repr

/-- Credential payloads (§Credential Schema): pull, push and zero-amount proof. -/
inductive Payload where
  | transaction (t : Tx)
  | hash (t : Tx)
  | proof (p : ProofSig)
deriving DecidableEq, Repr

/-- A credential: the echoed challenge, the payload and source as (chainId, address). -/
structure Cred where
  echo : Challenge
  payload : Payload
  source : Option (Nat × Nat) := none
deriving DecidableEq, Repr

/-- A receipt's reference (§Receipt Generation, §Proof Receipt): a transaction hash or, for a
  proof, the challenge id. -/
inductive Ref where
  | tx (t : Tx)
  | challenge (id : Nat)
deriving DecidableEq, Repr

/-- The transaction a reference names, if any. -/
def Ref.txOf : Ref → Option Tx
  | .tx t => some t
  | .challenge _ => none

/-- A Payment-Receipt with status "success" for challenge cid, issued at time `time`. -/
structure Receipt where
  cid : Nat
  ref : Ref
  time : Nat
deriving DecidableEq, Repr

/-- A transaction included on chain: ok is the receipt status, time the block time. -/
structure Incl where
  tx : Tx
  ok : Bool
  time : Nat
deriving DecidableEq, Repr

/-- The server and chain configuration and the guard flags (default on). -/
structure Cfg where
  /-- this server's realm -/
  realm : Nat
  /-- the Tempo chain the server settles on -/
  chainId : Nat
  /-- G1: the server records a pull transaction when it broadcasts it, before settlement, and
      a hash transaction when it settles it, and rejects a hash credential naming any recorded
      transaction (§Hash Verification is silent). Recording a pull transaction only at
      settlement leaves a window, after broadcast, in which a hash credential for another
      challenge can claim it. With the guard off the server records at settlement and refuses
      nothing. -/
  txSingleUse : Bool := true
  /-- G2: a pull credential settles only when the broadcast transaction succeeded
      (§Settlement Procedure says so only for hash credentials). -/
  pullNeedsSuccess : Bool := true
  /-- G3: a proof credential is accepted only for amount "0" (§Proof Verification has no
      amount check; only clients are told not to use it otherwise). -/
  proofOnlyZero : Bool := true
  /-- G4: each required transfer (primary and every split) is matched by a distinct transfer
      (§Ordering, §Transaction Verification step 6 don't say one-to-one). -/
  splitsOneToOne : Bool := true
deriving Repr

/-- The guarded reading: every flag on. -/
structure Cfg.Guarded (cfg : Cfg) : Prop where
  txSingleUse : cfg.txSingleUse = true
  pullNeedsSuccess : cfg.pullNeedsSuccess = true
  proofOnlyZero : cfg.proofOnlyZero = true
  splitsOneToOne : cfg.splitsOneToOne = true

/-- Sum of the split amounts. -/
def sumSplits : List Split → Nat
  | [] => 0
  | s :: ss => s.amount + sumSplits ss

/-- A request the server may issue (§Split Payments Constraints, §Submission Modes): on the
  server's chain, at least one mode, and splits absent or each > 0 with sum < amount. -/
def Request.valid (r : Request) (chain : Nat) : Bool :=
  r.chainId == chain && (r.pull || r.push) &&
    (r.splits.isEmpty || (r.splits.all (fun s => decide (0 < s.amount)) &&
      decide (sumSplits r.splits < r.amount)))

/-- The transfers a request requires (§Split Payments Client Behavior): the primary recipient
  gets amount - sum(splits) with the top-level memo, each split recipient its amount and memo,
  all in currency. -/
def Request.required (r : Request) : List Transfer :=
  { token := r.currency, dst := r.recipient, amount := r.amount - sumSplits r.splits, memo := r.memo } ::
    r.splits.map fun s => { token := r.currency, dst := s.recipient, amount := s.amount, memo := s.memo }

/-- Transfer c satisfies required transfer r (§Transaction Verification steps 2-6): same token,
  recipient and amount, and the memo when one is required. -/
def fits (r c : Transfer) : Bool :=
  c.token == r.token && c.dst == r.dst && c.amount == r.amount && (r.memo.isNone || c.memo == r.memo)

/-- Every way to remove one transfer that fits r (empty when none does). -/
def takeAll (r : Transfer) : List Transfer → List (List Transfer)
  | [] => []
  | c :: cs => (if fits r c then [cs] else []) ++ (takeAll r cs).map (c :: ·)

/-- One-to-one matching: some assignment gives every required transfer its own distinct
  transfer, whatever the order of the calls (§Ordering). -/
def matchOne : List Transfer → List Transfer → Bool
  | _, [] => true
  | calls, r :: rs => (takeAll r calls).any fun rest => matchOne rest rs

/-- The payment check of §Transaction Verification / §Hash Verification. With G4 off it is the
  literal "each required effect is present", which one transfer can satisfy twice. -/
def Pays (cfg : Cfg) (r : Request) (calls : List Transfer) : Bool :=
  if cfg.splitsOneToOne then matchOne calls r.required
  else r.required.all fun q => calls.any (fits q)

/-- One TIP-20 transfer of amt of token tok from src to dst (caller checks the balance). -/
def move (bal : Nat → Nat → Nat) (tok src dst amt : Nat) : Nat → Nat → Nat :=
  fun t a => if t = tok then (if a = src then bal t a - amt else bal t a) + (if a = dst then amt else 0)
    else bal t a

/-- Execute a transaction's transfers atomically; none (revert) if any lacks balance. -/
def exec (bal : Nat → Nat → Nat) (sender : Nat) : List Transfer → Option (Nat → Nat → Nat)
  | [] => some bal
  | c :: cs => if c.amount ≤ bal c.token sender then exec (move bal c.token sender c.dst c.amount) sender cs
    else none

/-- Global state: chain, signatures and server records. -/
structure St where
  /-- block time -/
  now : Nat
  /-- TIP-20 balances: token → account → amount -/
  bal : Nat → Nat → Nat
  /-- transactions their senders signed -/
  signed : List Tx
  /-- proofs their signers signed -/
  proofSigs : List ProofSig
  /-- transactions on chain, newest first -/
  included : List Incl
  /-- server: challenges issued, by id -/
  issued : Nat → Option Challenge
  /-- server: challenge ids already used (core §Replay Protection) -/
  used : Nat → Bool
  /-- server: receipts issued (and resources delivered), newest first -/
  receipts : List Receipt
  /-- server: transactions recorded as spent (used by G1): broadcast pull transactions (G1) or
      settled ones -/
  consumedTx : List Tx
  /-- server: pull settlements broadcast but not yet settled, by challenge id: the transaction
      and whether it succeeded -/
  pending : Nat → Option (Tx × Bool)
  /-- ghost: challenge ids whose transaction fees the server paid -/
  sponsored : List Nat

/-- Empty chain and server at time 1. -/
def St.init : St :=
  ⟨1, fun _ _ => 0, [], [], [], fun _ => none, fun _ => false, [], [], fun _ => none, []⟩

/-- No included transaction used t's (sender, nonce) (2D nonce consumption). -/
def nonceFree (st : St) (t : Tx) : Bool :=
  !st.included.any fun i => i.tx.sender == t.sender && i.tx.nonce == t.nonce

/-- The chain accepts t now: right chain, nonce unused, before validBefore. -/
def chainOk (cfg : Cfg) (st : St) (t : Tx) : Bool :=
  t.chainId == cfg.chainId && nonceFree st t && (t.validBefore.all fun vb => decide (st.now < vb))

/-- t was included and succeeded (§Hash Verification: receipt indicates success). -/
def succeeded (st : St) (t : Tx) : Bool :=
  st.included.any fun i => i.tx == t && i.ok

/-- Record a hash settlement: mark the challenge used, issue the receipt, remember the
  transaction. -/
def settleTx (st : St) (cid : Nat) (t : Tx) : St :=
  { st with used := upd st.used cid true, receipts := ⟨cid, .tx t, st.now⟩ :: st.receipts,
            consumedTx := t :: st.consumedTx }

/-- The server pays fees for challenge cid when its request says feePayer (§Server-Paid Fees). -/
def sponsorFor (st : St) (r : Request) (cid : Nat) : List Nat :=
  if r.feePayer then cid :: st.sponsored else st.sponsored

/-- Every action. -/
inductive Act where
  /-- block time advances -/
  | tick (d : Nat)
  /-- tokens arrive at an account (outside the model) -/
  | fund (tok acct amt : Nat)
  /-- t.sender signs t -/
  | signTx (t : Tx)
  /-- p.signer signs a proof -/
  | signProof (p : ProofSig)
  /-- anyone broadcasts a signed transaction paying its own fees (push mode, §Hash Settlement) -/
  | broadcast (t : Tx)
  /-- the server issues a challenge (402) -/
  | issue (c : Challenge)
  /-- the server receives a credential -/
  | submit (cr : Cred)
  /-- the server settles the pull credential it broadcast for challenge cid -/
  | settlePull (cid : Nat)
deriving Repr

/-- The protocol as a computable transition function; none = reverted or rejected. -/
def step (cfg : Cfg) (st : St) : Act → Option St
  | .tick d => some { st with now := st.now + d }
  | .fund tok acct amt => some { st with bal := fun t a => if t = tok ∧ a = acct then st.bal t a + amt else st.bal t a }
  | .signTx t => some { st with signed := t :: st.signed }
  | .signProof p => some { st with proofSigs := p :: st.proofSigs }
  -- the client pays its own fees (sponsor = false); a revert still consumes the nonce
  | .broadcast t =>
    if t ∈ st.signed ∧ chainOk cfg st t = true ∧ t.sponsor = false then
      match exec st.bal t.sender t.calls with
      | some b => some { st with bal := b, included := ⟨t, true, st.now⟩ :: st.included }
      | none => some { st with included := ⟨t, false, st.now⟩ :: st.included }
    else none
  -- a fresh id, this realm, a valid request (§Split Payments Constraints: servers MUST NOT
  -- generate a request whose splits sum to amount or more)
  | .issue c =>
    if st.issued c.id = none ∧ c.realm = cfg.realm ∧ c.request.valid cfg.chainId = true then
      some { st with issued := upd st.issued c.id (some c) }
    else none
  -- intent §Server Responsibilities: an outstanding (issued, unused, not pending) challenge
  -- whose echo matches the binding (core §Challenge Binding), not expired; then the method's
  -- checks
  | .submit cr =>
    if st.issued cr.echo.id = some cr.echo ∧ st.used cr.echo.id = false ∧ st.pending cr.echo.id = none ∧
       st.now < cr.echo.expires then
      match cr.payload with
      -- §Transaction Verification steps 2-7, then broadcast (adding the fee payer signature
      -- when feePayer, §Server-Paid Fees); settlement is left pending (Act.settlePull). G1
      -- records the transaction now.
      | .transaction t =>
        if cr.echo.request.pull = true ∧ t ∈ st.signed ∧ Pays cfg cr.echo.request t.calls = true ∧
           chainOk cfg st t = true ∧ (t.sponsor = false ∨ cr.echo.request.feePayer = true) then
          match exec st.bal t.sender t.calls with
          | some b => some { st with bal := b, included := ⟨t, true, st.now⟩ :: st.included,
                                     sponsored := sponsorFor st cr.echo.request cr.echo.id,
                                     pending := upd st.pending cr.echo.id (some (t, true)),
                                     consumedTx := if cfg.txSingleUse then t :: st.consumedTx else st.consumedTx }
          | none => some { st with included := ⟨t, false, st.now⟩ :: st.included,
                                   sponsored := sponsorFor st cr.echo.request cr.echo.id,
                                   pending := upd st.pending cr.echo.id (some (t, false)),
                                   consumedTx := if cfg.txSingleUse then t :: st.consumedTx else st.consumedTx }
        else none
      -- §Hash Settlement Limitations (no feePayer, push allowed), §Hash Verification
      -- (successful receipt, matching Transfer events); G1 refuses an already settled hash
      | .hash t =>
        if cr.echo.request.push = true ∧ cr.echo.request.feePayer = false ∧ succeeded st t = true ∧
           Pays cfg cr.echo.request t.calls = true ∧ (cfg.txSingleUse = true → t ∉ st.consumedTx) then
          some (settleTx st cr.echo.id t)
        else none
      -- §Proof Verification steps 1-4 with domain version "3"; G3 asks for amount 0
      | .proof p =>
        match cr.source with
        | none => none
        | some (ch, acct) =>
          if ch = cr.echo.request.chainId ∧ p ∈ st.proofSigs ∧ p.signer = acct ∧ p.account = acct ∧
             p.challengeId = cr.echo.id ∧ p.realm = cr.echo.realm ∧ p.chainId = cr.echo.request.chainId ∧
             p.version = 3 ∧ (cfg.proofOnlyZero = true → cr.echo.request.amount = 0) then
            some { st with used := upd st.used cr.echo.id true,
                           receipts := ⟨cr.echo.id, .challenge cr.echo.id, st.now⟩ :: st.receipts }
          else none
    else none
  -- §Settlement Procedure: settle a pending pull credential and deliver; G2 asks for success
  -- first (otherwise the challenge reopens without a receipt). Without G1 the transaction is
  -- recorded only now.
  | .settlePull cid =>
    match st.pending cid with
    | none => none
    | some (t, ok) =>
      if ok = true ∨ cfg.pullNeedsSuccess = false then
        some { st with pending := upd st.pending cid none, used := upd st.used cid true,
                       receipts := ⟨cid, .tx t, st.now⟩ :: st.receipts,
                       consumedTx := if cfg.txSingleUse then st.consumedTx else t :: st.consumedTx }
      else some { st with pending := upd st.pending cid none }

/-- Run a list of actions; none if any step fails. -/
abbrev run (cfg : Cfg) : St → List Act → Option St := MppCore.run (step cfg)

/-- States reachable from St.init. -/
abbrev Reachable (cfg : Cfg) : St → Prop := MppCore.Reachable (step cfg) St.init

end TempoCharge

