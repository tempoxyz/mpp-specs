/-
  Tempo session payment method (draft-tempo-session-00), on-chain escrow + server accounting.
  Section numbers (§) refer to specs/methods/tempo/draft-tempo-session-00.md.

  Abstractions
  * keccak256 is injective: a v1 channelId (§6.1) *is* its preimage tuple (Key); the escrow
    address and chainId of the preimage are the model instance's Cfg.escrow / Cfg.chainId.
  * Signatures are unforgeable: St.sigs is exactly the set of (signer, voucher) pairs that key
    holders have signed (only Act.sign adds to it). EIP-712 domain = (chainId, verifyingContract) (§10.3).
  * Token transfers are ghost counters: paid (to payee), refunded (to payer), deposited (in).
    The escrow's total token balance is not tracked, so the model alone does not revert a
    transfer the escrow could not cover; counterexamples that overpay a channel fund a second
    channel first and check the escrow stays solvent (Counterexamples.escrowSolvent).
  * One escrow deployment per model instance; vouchers for other escrows/chains may exist in sigs.
  * Server accounting (§12) is keyed per channel and reads chain state with no lag (§14.12 ignored).

  Spec guards that the contract-function sections (§6.4.x) do NOT state, but that other sections
  imply, are Cfg flags. Theorems hold for every Cfg with all flags on (Cfg.Guarded); see
  Counterexamples.lean for a machine-checked violation with each flag off.

  File map
  * Key / Voucher / Sig / Chan: the data the contract and the server see.
  * Cfg: one escrow deployment plus seven guard flags: G1-G6 (all on in Cfg.Guarded) and
    guardDelivery (G7, assumed only by P8c).
  * St: chain state, signed vouchers, ghost money counters and server accounting.
  * step: one transition; none means the call reverts (contract) or is rejected (server).
  * run / Reachable: traces and the set of states reachable from the empty escrow.
-/
namespace TempoSession

/-- v1 channelId preimage (§6.1): payer, payee, token, salt, authorizedSigner (0 = payer).
  Because keccak256 is modelled as injective, two channels are equal iff their Keys are. -/
structure Key where
  payer : Nat
  payee : Nat
  token : Nat
  salt : Nat
  authSigner : Nat
deriving DecidableEq, Repr

/-- Expected voucher signer (§6.6 step 2, §11.3).
  * authorizedSigner = 0 means "the payer signs";
  * any other value delegates signing to that key. -/
def Key.signer (k : Key) : Nat := if k.authSigner = 0 then k.payer else k.authSigner

/-- EIP-712 Voucher(bytes32 channelId, uint128 cumulativeAmount) with its domain (§10.2, §10.3).
  * chainId / escrow: the EIP-712 domain (chainId, verifyingContract);
  * chan: the channelId, kept as its preimage;
  * amount: the cumulative amount (monotone over a channel's life, §10.5). -/
structure Voucher where
  chainId : Nat
  escrow : Nat
  chan : Key
  amount : Nat
deriving DecidableEq, Repr

/-- A signature: who signed which voucher. Unforgeable by construction (see St.sigs). -/
structure Sig where
  signer : Nat
  v : Voucher
deriving DecidableEq, Repr

/-- On-chain channel record (§6.1). closeRequestedAt = 0 is modelled as none.
  * deposit: total locked by open + topUp;
  * settled: cumulative amount already paid to the payee;
  * closeReq: block time of a pending requestClose, if any;
  * finalized: set by close or withdraw; the channel is then terminal. -/
structure Chan where
  deposit : Nat
  settled : Nat
  closeReq : Option Nat
  finalized : Bool
deriving DecidableEq, Repr

/-- One escrow deployment and the guard flags.
  Each Bool flag defaults to true (the guarded reading); Counterexamples.lean turns one off at a
  time to reproduce the literal reading of §6.4.x. -/
structure Cfg where
  /-- verifyingContract of this escrow deployment (§10.3). -/
  escrow : Nat
  /-- chainId of the deployment (§10.3). -/
  chainId : Nat
  /-- CLOSE_GRACE_PERIOD, "at least 15 minutes" (§6.4.5, §13.3, §14.13). -/
  grace : Nat
  /-- methodDetails.minVoucherDelta (§7.2, §11.3 step 6). -/
  minDelta : Nat
  /-- settle/close/topUp/requestClose/withdraw revert on a finalized channel (G2). -/
  guardFinalized : Bool := true
  /-- open reverts when channelId already exists, finalized or not (G3). -/
  guardExists : Bool := true
  /-- settle: settled < cum <= deposit (§14.1, G4). Underflow checks (cum >= settled for settle;
      settled <= capture <= deposit for close) are unconditional: Solidity's checked uint256
      subtraction reverts, unlike Lean's saturating Nat subtraction. -/
  guardBounds : Bool := true
  /-- withdraw requires a pending close request (G1). -/
  withdrawNeedsRequest : Bool := true
  /-- server 'spent' is per channel, not reset per session (G5). -/
  spentPerChannel : Bool := true
  /-- close captures at most max(settled, spent): §13.2 "MUST NOT capture more than the amount
      actually consumed", captureAmount = max(spent, settledOnChain) (G6; off = v1 close). -/
  guardCapture : Bool := true
  /-- charge refuses to deliver while a close request is pending, as accept does (§11.3 step 5);
      §12.2 as written has no such check (G7, GAPS.md row 11). Not part of Guarded: P1-P9
      hold without it; P8c_no_delivery_while_closing states what it adds. -/
  guardDelivery : Bool := true
deriving Repr

/-- All six guards on, in order G2, G3, G4, G1, G5, G6.
  Every safety theorem in Invariant.lean / Properties.lean assumes this; proofs destructure it
  as ⟨g1, g2, g3, g4, g5, g6⟩ (so g1 = guardFinalized, ..., g6 = guardCapture). -/
def Cfg.Guarded (cfg : Cfg) : Prop :=
  cfg.guardFinalized = true ∧ cfg.guardExists = true ∧ cfg.guardBounds = true ∧
  cfg.withdrawNeedsRequest = true ∧ cfg.spentPerChannel = true ∧ cfg.guardCapture = true

/-- Global state: chain, signatures, ghost counters and server accounting.
  All per-channel fields are functions of the channel Key. -/
structure St where
  /-- block timestamp -/
  now : Nat
  /-- escrow storage: channelId -> record (none = never opened) -/
  chans : Key → Option Chan
  /-- every signature ever produced by a key holder (only Act.sign adds) -/
  sigs : List Sig
  /-- ghost: total transferred to k.payee from channel k -/
  paid : Key → Nat
  /-- ghost: total refunded to k.payer from channel k -/
  refunded : Key → Nat
  /-- ghost: total deposited into channel k (open + topUp) -/
  deposited : Key → Nat
  /-- ghost: number of finalizations of channel k -/
  finals : Key → Nat
  /-- server: acceptedCumulative / highestVoucherAmount (§12.1) -/
  accepted : Key → Nat
  /-- server: the voucher persisted when accepted was last raised (§11.3 step 8); none until
      the first raise. P8a states that this voucher itself is valid, not just its amount. -/
  acceptedSig : Key → Option Sig
  /-- server: spent (§12.1) -/
  spent : Key → Nat
  /-- ghost: total metered service delivered on channel k, across sessions -/
  delivered : Key → Nat

/-- Empty escrow at time 1: no channels, no signatures, every counter 0.
  Time starts at 1 because a real block timestamp is never 0: the
  contract encodes "no close request" as closeRequestedAt = 0, so a request stored at time 0
  would be indistinguishable from none. Time only grows (tick), so every reachable
  closeReq = some r has r ≥ 1 and matches that encoding. -/
def St.init : St :=
  ⟨1, fun _ => none, [], fun _ => 0, fun _ => 0, fun _ => 0, fun _ => 0, fun _ => 0, fun _ => none,
   fun _ => 0, fun _ => 0⟩

/-- Point update of a per-channel map: k gets b, every other key is unchanged. -/
def upd {β : Type} (f : Key → β) (k : Key) (b : β) : Key → β :=
  fun k' => if k' = k then b else f k'

/-- Reading the updated key returns the new value (used by simp throughout the proofs). -/
@[simp] theorem upd_same {β} (f : Key → β) (k : Key) (b : β) : upd f k b k = b := by simp [upd]
/-- Reading any other key returns the old value: the frame rule that keeps the proofs per-channel. -/
@[simp] theorem upd_other {β} (f : Key → β) (k k' : Key) (b : β) (h : k' ≠ k) :
    upd f k b k' = f k' := by simp [upd, h]

/-- Every action of the model. caller is the msg.sender of a contract call. -/
inductive Act where
  /-- block time advances by d -/
  | tick (d : Nat)
  /-- a key holder signs a voucher off-chain (§10.4) -/
  | sign (s : Sig)
  /-- contract open (§6.4.1) -/
  | openCh (caller : Nat) (k : Key) (amt : Nat)
  /-- contract topUp (§6.4.3) -/
  | topUp (caller : Nat) (k : Key) (amt : Nat)
  /-- contract settle (§6.4.2) -/
  | settle (caller : Nat) (k : Key) (s : Sig)
  /-- contract close with a captureAmount (§6.4.4, §13.2) -/
  | close (caller : Nat) (k : Key) (s : Sig) (capture : Nat)
  /-- contract requestClose (§6.4.5) -/
  | requestClose (caller : Nat) (k : Key)
  /-- contract withdraw (§6.4.6) -/
  | withdraw (caller : Nat) (k : Key)
  /-- server accepts a voucher (§11.3) -/
  | accept (k : Key) (s : Sig)
  /-- server charges and delivers metered service (§12.2) -/
  | charge (k : Key) (cost : Nat)
  /-- a new session starts on the channel (§13.4) -/
  | newSession (k : Key)
deriving Repr

/-- A voucher signature valid for channel k in this escrow (§6.6, §10.3, §11.3 steps 2-4):
  * really signed (in sigs);
  * by the channel's expected signer;
  * for this channelId;
  * under this escrow's EIP-712 domain (verifyingContract and chainId). -/
def ValidSig (cfg : Cfg) (sigs : List Sig) (k : Key) (s : Sig) : Prop :=
  s ∈ sigs ∧ s.signer = k.signer ∧ s.v.chan = k ∧ s.v.escrow = cfg.escrow ∧ s.v.chainId = cfg.chainId

/-- ValidSig is a conjunction of decidable facts, so step stays computable (needed by decide). -/
instance (cfg : Cfg) (sigs : List Sig) (k : Key) (s : Sig) : Decidable (ValidSig cfg sigs k s) := by
  unfold ValidSig; infer_instance

/-- The protocol as a computable transition function; none = the call reverts / is rejected.
  Each contract branch: look up the channel (unknown channel reverts), check the guards, then
  update the record and the ghost counters together. Guards behind a Cfg flag are written
  "flag = true → condition", so they vanish when the flag is off. -/
def step (cfg : Cfg) (st : St) : Act → Option St
  -- block time advances; always succeeds
  | .tick d => some { st with now := st.now + d }
  -- a key holder signs a voucher (off-chain, §10.4); always succeeds, only grows sigs
  | .sign s => some { st with sigs := s :: st.sigs }
  -- §6.4.1 open; §6.5 caller becomes payer; G3 guard
  -- guards: caller is the payer; (G3) the channelId is unused
  -- effect: fresh record (deposit amt, settled 0, no close request, not finalized)
  | .openCh caller k amt =>
    if caller = k.payer ∧ (cfg.guardExists = true → st.chans k = none) then
      some { st with chans := upd st.chans k (some ⟨amt, 0, none, false⟩),
                     deposited := upd st.deposited k (st.deposited k + amt) }
    else none
  -- §6.4.3 topUp: payer only (§6.5), cancels pending close
  -- guards: channel exists; caller is the payer; (G2) not finalized
  -- effect: deposit += amt, closeReq cleared
  | .topUp caller k amt =>
    match st.chans k with
    | none => none
    | some c =>
      if caller = k.payer ∧ (cfg.guardFinalized = true → c.finalized = false) then
        some { st with chans := upd st.chans k (some { c with deposit := c.deposit + amt, closeReq := none }),
                       deposited := upd st.deposited k (st.deposited k + amt) }
      else none
  -- §6.4.2 settle: payee only, delta = cum - settled (checked uint: reverts if cum < settled);
  -- bounds from §14.1
  -- guards: channel exists; caller is the payee; (G2) not finalized; valid signature;
  --   settled <= cum (checked subtraction); (G4) settled < cum <= deposit
  -- effect: settled := cum, payee receives cum - settled
  | .settle caller k s =>
    match st.chans k with
    | none => none
    | some c =>
      if caller = k.payee ∧ (cfg.guardFinalized = true → c.finalized = false) ∧ ValidSig cfg st.sigs k s ∧
         c.settled ≤ s.v.amount ∧ (cfg.guardBounds = true → c.settled < s.v.amount ∧ s.v.amount ≤ c.deposit) then
        some { st with chans := upd st.chans k (some { c with settled := s.v.amount }),
                       paid := upd st.paid k (st.paid k + (s.v.amount - c.settled)) }
      else none
  -- §6.4.4 close (v1: capture = cum) generalised by §13.2 v2 captureAmount <= cum.
  -- capture - settled and deposit - capture are checked uint subtractions: both always revert
  -- on underflow. §13.2 capture <= max(spent, settled) is the guardCapture flag.
  -- guards: channel exists; caller is the payee; (G2) not finalized; valid signature;
  --   cap <= cum; settled <= cap <= deposit; (G6) cap <= max(settled, spent)
  -- effect: payee gets cap - settled, payer gets deposit - cap, channel finalized
  | .close caller k s cap =>
    match st.chans k with
    | none => none
    | some c =>
      if caller = k.payee ∧ (cfg.guardFinalized = true → c.finalized = false) ∧ ValidSig cfg st.sigs k s ∧
         cap ≤ s.v.amount ∧ c.settled ≤ cap ∧ cap ≤ c.deposit ∧
         (cfg.guardCapture = true → cap ≤ max c.settled (st.spent k)) then
        some { st with chans := upd st.chans k (some { c with settled := cap, finalized := true }),
                       paid := upd st.paid k (st.paid k + (cap - c.settled)),
                       refunded := upd st.refunded k (st.refunded k + (c.deposit - cap)),
                       finals := upd st.finals k (st.finals k + 1) }
      else none
  -- §6.4.5 requestClose: payer only, closeRequestedAt := now
  -- guards: channel exists; caller is the payer; (G2) not finalized
  -- effect: only closeReq changes; no money moves
  | .requestClose caller k =>
    match st.chans k with
    | none => none
    | some c =>
      if caller = k.payer ∧ (cfg.guardFinalized = true → c.finalized = false) then
        some { st with chans := upd st.chans k (some { c with closeReq := some st.now }) }
      else none
  -- §6.4.6 withdraw: payer only, now >= closeRequestedAt + grace, refund deposit - settled
  -- (checked uint: reverts if settled > deposit)
  -- guards: channel exists; caller is the payer; (G2) not finalized; (G1) a close is pending;
  --   settled <= deposit; grace elapsed (closeReq.getD 0 reads "no request" as time 0, as the
  --   contract's closeRequestedAt = 0 does)
  -- effect: payer refunded deposit - settled, channel finalized
  | .withdraw caller k =>
    match st.chans k with
    | none => none
    | some c =>
      if caller = k.payer ∧ (cfg.guardFinalized = true → c.finalized = false) ∧
         (cfg.withdrawNeedsRequest = true → c.closeReq.isSome = true) ∧
         c.settled ≤ c.deposit ∧ c.closeReq.getD 0 + cfg.grace ≤ st.now then
        some { st with chans := upd st.chans k (some { c with finalized := true }),
                       refunded := upd st.refunded k (st.refunded k + (c.deposit - c.settled)),
                       finals := upd st.finals k (st.finals k + 1) }
      else none
  -- §11.3 server voucher verification (steps 2-9), §11.4 idempotent retry
  -- guards (always on, server side): channel exists, not finalized, no close pending,
  --   valid signature, accepted <= cum <= deposit
  -- then: equal amount = idempotent retry (state unchanged, step 6); a raise must be >= minDelta
  --   and persists the voucher with the new amount (steps 8-9)
  | .accept k s =>
    match st.chans k with
    | none => none
    | some c =>
      if c.finalized = false ∧ c.closeReq = none ∧ ValidSig cfg st.sigs k s ∧
         st.accepted k ≤ s.v.amount ∧ s.v.amount ≤ c.deposit then
        if s.v.amount = st.accepted k then some st
        else if cfg.minDelta ≤ s.v.amount - st.accepted k then
          some { st with accepted := upd st.accepted k s.v.amount,
                         acceptedSig := upd st.acceptedSig k (some s) }
        else none
      else none
  -- §12.2 balance check + charge-and-deliver: available = accepted - spent >= cost
  -- Delivery needs an open, non-finalized channel; (G7) also no close pending, as accept
  --   requires (§11.3 step 5). Without G7 the server can deliver after requestClose, even past
  --   the grace window, when the payer can withdraw at once and the payee has no settle window
  --   for that service; §12.2 does not say this (GAPS.md row 11).
  -- effect: spent and delivered both grow by cost (delivered is never reset)
  | .charge k cost =>
    match st.chans k with
    | none => none
    | some c =>
    if c.finalized = false ∧ (cfg.guardDelivery = true → c.closeReq = none) ∧
       st.spent k + cost ≤ st.accepted k then
      some { st with spent := upd st.spent k (st.spent k + cost),
                     delivered := upd st.delivered k (st.delivered k + cost) }
    else none
  -- §13.4 a new session on the channel; G5 literal reading resets 'spent'
  -- with G5 on it is a no-op; with it off spent := 0 while accepted is kept
  | .newSession k =>
    if cfg.spentPerChannel = true then some st else some { st with spent := upd st.spent k 0 }

/-- Run a list of actions; none if any step reverts. Used by the counterexample traces and P4. -/
def run (cfg : Cfg) : St → List Act → Option St
  | st, [] => some st
  | st, a :: as => match step cfg st a with
    | none => none
    | some st' => run cfg st' as

/-- Reachable states from the empty escrow: St.init, closed under successful steps.
  "Holds in every reachable state" is proved by induction on this predicate. -/
inductive Reachable (cfg : Cfg) : St → Prop where
  | init : Reachable cfg St.init
  | step {s s' : St} (a : Act) : Reachable cfg s → step cfg s a = some s' → Reachable cfg s'

end TempoSession
