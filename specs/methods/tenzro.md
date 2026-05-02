# Tenzro MPP Method Specification

| Field | Value |
| :--- | :--- |
| Method name | `tenzro` |
| Status | Draft (staging — for upstream submission to `tempoxyz/mpp-specs`) |
| Settlement chain | `tenzro` (Tenzro Ledger L1) |
| Reference implementation | [`crates/tenzro-payments/src/mpp/`](https://github.com/tenzro/tenzro-network/tree/main/crates/tenzro-payments/src/mpp) |
| Maintainer | Tenzro Network — `eng@tenzro.com` |

This document is the staging draft. Once approved internally, it is copied
verbatim to `specs/methods/tenzro.md` in the
`tempoxyz/mpp-specs` fork at branch `add-tenzro-method`.

---

## 1. Overview

The `tenzro` MPP method settles MPP payments natively on the Tenzro Ledger
L1, in **TNZO** or in any Tenzro-Ledger-resident wrapped asset (notably
`wTNZO` ERC-20 / SPL pointer contracts and `TNZO` CIP-56 holdings under the
Sei V2 pointer model — see [Tenzro Network architecture overview][arch]).

The method follows the standard MPP four-phase flow defined by the parent
specification:

1. **Challenge** — server emits HTTP 402 with an `MppChallenge` body.
2. **Credential** — client constructs an `MppCredential`, signs, and
   resubmits to the same resource.
3. **Verify** — server verifies the credential cryptographically and against
   on-chain state.
4. **Receipt** — server settles on Tenzro Ledger and returns an `MppReceipt`
   referencing the settlement transaction.

Streaming (per-token / per-call billing) is supported via MPP **sessions**
backed by Tenzro's micropayment-channel primitive in
`crates/tenzro-settlement` (`MicropaymentChannelManager`), with hybrid
classical + post-quantum signatures over each voucher.

[arch]: https://github.com/tenzro/tenzro-network/blob/main/README.md

---

## 2. Identifiers

### 2.1 Method identifier

The method is identified in the MPP `Method` header and in the
`MppChallenge.chain` field (and corresponding `MppCredential.chain` /
`MppReceipt.chain`) by the literal string:

```
tenzro
```

### 2.2 Asset identifier

Asset names follow the `MppChallenge.asset` convention (case-insensitive
ASCII string). The `tenzro` method recognises the following asset codes:

| Asset code | Meaning | Settlement form |
| :--- | :--- | :--- |
| `TNZO` | Native Tenzro Ledger gas/governance token | Native L1 balance |
| `wTNZO` | Wrapped TNZO ERC-20 pointer | EVM ERC-20 (pointer to L1 balance) |
| `wTNZO-SPL` | Wrapped TNZO SPL pointer | SVM SPL Token (pointer to L1 balance) |
| `USDC`, `USDT`, `ETH`, `SOL`, `BTC` | Bridged or native-multi-chain assets | As-is |

When a non-native asset is selected, settlement happens by routing through
the Tenzro Ledger's multi-VM execution layer; the receipt's
`settlement_tx` is the L1 transaction hash regardless of which VM
processed the transfer.

### 2.3 Recipient address format

Recipients in `MppChallenge.recipient` and payers in
`MppCredential.payer_address` are encoded as one of:

- A **32-byte hex address** prefixed with `0x` (canonical Tenzro form).
- A **base58btc** string (43–44 chars, Bitcoin/Solana alphabet).
- A **`did:tenzro:*` DID URI**, in which case the receiving server MUST
  resolve the DID to a wallet address via the TDIP registry before
  settlement.

The `did:` form is RECOMMENDED for agent-to-agent commerce, since it lets
the recipient rotate the underlying address without re-issuing challenges.

---

## 3. Challenge format

A `tenzro`-method challenge is the standard `MppChallenge` JSON body, with
`chain: "tenzro"`. Example:

```json
{
  "challenge_id": "8f5c5e3a-2c5f-4b7c-9c5d-1f3a4b5c6d7e",
  "resource": "https://api.example.com/v1/inference",
  "amount": "10000",
  "asset": "TNZO",
  "recipient": "0x7a4bcb13a6b2b384c284b5caa6e5ef3126527f9300000000000000000000000a",
  "chain": "tenzro",
  "expires_at": "2026-05-02T18:30:00Z",
  "supports_sessions": true,
  "extensions": {
    "tenzro": {
      "min_kyc_tier": 0,
      "settlement_target": "block_finality",
      "tdip_required": true
    }
  }
}
```

Notes:

- `amount` is a stringified `u128` denominating the smallest unit of the
  asset (18 decimals for `TNZO`; asset-specific otherwise).
- `extensions.tenzro.min_kyc_tier` is OPTIONAL and accepts `0` (Unverified)
  through `3` (Full) per `tenzro-identity::KycTier`.
- `extensions.tenzro.settlement_target` is OPTIONAL. Permitted values:
  `block_inclusion` (single-block, ~2s) or `block_finality` (HotStuff-2
  finality, ~6–12s). Default is `block_inclusion`.
- `extensions.tenzro.tdip_required` (default `true`) requires the credential
  to bind a TDIP DID; if `false`, an unbound wallet address is sufficient.

---

## 4. Credential format

A `tenzro`-method credential is the standard `MppCredential` JSON body.
Example:

```json
{
  "credential_id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
  "challenge_id": "8f5c5e3a-2c5f-4b7c-9c5d-1f3a4b5c6d7e",
  "payer_did": "did:tenzro:human:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "payer_address": "0x...64-hex...",
  "amount": "10000",
  "asset": "TNZO",
  "chain": "tenzro",
  "signature": "<base64 — see §4.1>",
  "created_at": "2026-05-02T18:25:30Z",
  "extensions": {
    "tenzro": {
      "public_key": "<base64 32-byte Ed25519>",
      "pq_signature": "<base64 ML-DSA-65 sig>",
      "pq_public_key": "<base64 ML-DSA-65 vk>"
    }
  }
}
```

### 4.1 Signature

The `signature` field is the **Ed25519** signature over the canonical
preimage:

```
preimage = challenge_id_bytes
        || amount_le_bytes_u128
        || asset_bytes
        || recipient_bytes
        || payer_address_bytes
        || created_at_unix_micros_le_bytes_u128
```

Each `*_bytes` segment is the UTF-8 encoding of the corresponding
challenge/credential field. `*_le_bytes_*` segments are little-endian
binary encodings.

### 4.2 Hybrid post-quantum signature (REQUIRED)

To meet Tenzro's pre-launch post-quantum hardening, every credential MUST
ALSO carry an **ML-DSA-65** signature in `extensions.tenzro.pq_signature`
with the corresponding verifying key in `extensions.tenzro.pq_public_key`,
both signing the same preimage as §4.1. Verification fails closed if either
signature is missing or invalid (composite scheme — see
`tenzro-crypto::composite::StandardHybridVerifier`).

---

## 5. Verification

A receiving server performs the following checks before settling:

1. **Challenge lookup.** `credential.challenge_id` MUST match a stored,
   unexpired challenge.
2. **Field equality.** `credential.amount`, `credential.asset`,
   `credential.chain` MUST equal the challenge's values.
3. **Hybrid signature verification.** Both Ed25519 and ML-DSA-65 signatures
   MUST validate over the canonical preimage of §4.1, against the keys in
   `extensions.tenzro.public_key` and `.pq_public_key` respectively.
4. **Address binding.** `credential.payer_address` MUST equal the address
   derived from `extensions.tenzro.public_key` (Ed25519 → 32-byte address
   per Tenzro CAIP-10 rules).
5. **TDIP binding** (if `tdip_required`).
   `credential.payer_did` MUST resolve to a TDIP identity whose controller
   key matches `extensions.tenzro.public_key`. KYC tier of that identity
   MUST be ≥ `extensions.tenzro.min_kyc_tier` from the challenge.
6. **Delegation check** (machine DIDs only). If `payer_did` is a
   `did:tenzro:machine:*`, its `DelegationScope` MUST permit the payment
   per `tenzro-identity::DelegationScope::enforce_operation`. The runtime
   `SpendingPolicy` (where bound) MUST also pass per
   `SpendingPolicySnapshot::check`.
7. **Balance check.** `payer_address` MUST hold at least `amount` of the
   indicated `asset` on Tenzro Ledger at the latest finalized state.

---

## 6. Settlement and receipts

Once verification succeeds, the server SHOULD broadcast a Tenzro Ledger
transaction transferring `amount` of `asset` from `payer_address` to
`recipient` and SHOULD return the `MppReceipt` once that transaction
reaches the requested `settlement_target`.

```json
{
  "receipt_id": "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
  "credential_id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
  "challenge_id": "8f5c5e3a-2c5f-4b7c-9c5d-1f3a4b5c6d7e",
  "amount": "10000",
  "asset": "TNZO",
  "settlement_tx": "0x<32-byte tx hash>",
  "chain": "tenzro",
  "settled_at": "2026-05-02T18:25:38Z"
}
```

The `settlement_tx` is the canonical Tenzro Ledger transaction hash and
can be verified against the public RPC at `rpc.tenzro.network` via
`eth_getTransactionReceipt` or `tenzro_getTransaction`.

---

## 7. Sessions (streaming)

When `MppChallenge.supports_sessions == true`, the credential MAY open a
session by including:

```json
"extensions": {
  "tenzro": {
    "open_session": true,
    "deposit": "1000000",
    "expires_at": "2026-05-02T19:25:30Z"
  }
}
```

The server creates an MPP session backed by a Tenzro micropayment channel
(`MicropaymentChannelManager`). Subsequent per-call billing is settled via
**signed vouchers** in the form:

```json
{
  "session_id": "...",
  "cumulative_amount": "12500",
  "nonce": 17,
  "signature": "<base64 Ed25519 over message_bytes()>",
  "public_key": "<base64 32-byte Ed25519>",
  "pq_signature": "<base64 ML-DSA-65 sig>",
  "pq_public_key": "<base64 ML-DSA-65 vk>"
}
```

where:

```
message_bytes = session_id_bytes
             || cumulative_amount_le_bytes_u128
             || nonce_le_bytes_u64
```

Each voucher is an **incremental authorization to spend up to
`cumulative_amount`**, not an incremental delta. The latest voucher
supersedes all prior ones from the same `session_id`. Session settlement
broadcasts a single L1 transaction for `cumulative_amount` at session
close, slashing only the channel deposit on dispute.

Hybrid signing rules (§4.2) apply to every voucher.

---

## 8. Revocation

A `tenzro`-method credential or session is implicitly revoked if **any** of
the following becomes true:

1. The TDIP identity bound to `payer_did` is revoked
   (`IdentityRegistry::revoke_identity` cascades to controlled machines).
2. The `DelegationScope` of a machine DID is updated such that the
   in-flight payment would no longer pass `enforce_operation`.
3. The runtime `SpendingPolicy` is updated such that
   `SpendingPolicySnapshot::check` would now fail.

Receiving servers MUST re-verify §5.5 and §5.6 at session-close time before
broadcasting the final settlement transaction.

---

## 9. Error codes

Method-specific errors extend the parent MPP error registry. The
`tenzro` method defines:

| Code | Name | Meaning |
| :--- | :--- | :--- |
| `tenzro/invalid_address` | InvalidAddress | `payer_address` or `recipient` is not a valid 32-byte hex / base58btc / `did:tenzro:` form |
| `tenzro/did_resolution_failed` | DidResolutionFailed | TDIP DID could not be resolved (network or registry error) |
| `tenzro/kyc_tier_insufficient` | KycTierInsufficient | Resolved identity's KYC tier is below `min_kyc_tier` |
| `tenzro/delegation_denied` | DelegationDenied | Machine DID's `DelegationScope` rejected the operation |
| `tenzro/spending_policy_denied` | SpendingPolicyDenied | Runtime `SpendingPolicy` rejected the operation |
| `tenzro/insufficient_balance` | InsufficientBalance | Payer balance below `amount` at settlement time |
| `tenzro/pq_signature_required` | PqSignatureRequired | `pq_signature` / `pq_public_key` missing or invalid |
| `tenzro/settlement_failed` | SettlementFailed | L1 transaction reverted or did not finalize within timeout |

All other failures fall back to parent-spec generic codes
(`mpp/expired_challenge`, `mpp/signature_invalid`, etc.).

---

## 10. Security considerations

- **Address forgery** is prevented by §5.4: `payer_address` MUST equal the
  derivation of `extensions.tenzro.public_key`, so the signature binds
  identity ↔ address ↔ payment.
- **Replay across challenges** is prevented by `challenge_id` inclusion in
  the canonical preimage of §4.1.
- **Replay within a session** is prevented by the monotonic `nonce` in
  voucher `message_bytes()`; older nonces MUST be rejected.
- **PQ resilience** is provided by the mandatory ML-DSA-65 leg of every
  credential and voucher signature (§4.2). Even a future cryptanalytic
  break of Ed25519 does not allow forging a credential, since both legs
  must validate.
- **Delegation bypass** is prevented by §5.5 + §5.6, which apply both at
  challenge-time and at session-close-time.
- **DID rotation race** — if a TDIP identity rotates keys mid-session, the
  in-flight session's vouchers (signed with the old key) remain valid
  until session close, but new credentials must use the new key. Servers
  MUST treat the binding as fixed at challenge-issue time.
- **Front-running / mempool sniping** — settlement transactions submit the
  payer's signed transfer; standard EVM mempool protections apply. The
  `tenzro` method does not require additional MEV protection beyond
  what Tenzro Ledger provides.

---

## 11. Interoperability

The `tenzro` method is fully compatible with the parent MPP spec's
session-management, retry, and error-propagation rules. A client that
speaks generic MPP (no `tenzro`-specific extensions) can pay a `tenzro`
challenge by simply meeting the §5 verification rules, with the caveat
that `tdip_required: true` challenges MUST carry the
`extensions.tenzro.public_key` field — a generic client without it is
rejected at §5.4.

Servers SHOULD prefer hybrid PQ signing on all credentials (not only
`tenzro`-method ones) once their client base is upgraded.

---

## 12. References

- Tenzro Ledger architecture: <https://github.com/tenzro/tenzro-network>
- Tenzro `tdip` identity protocol: see `crates/tenzro-identity` README
- TDIP DID method (`did:tenzro`): <https://github.com/tenzro/did-method-tenzro/blob/main/spec.md>
- CAIP-2 Tenzro namespace registration: <https://github.com/ChainAgnostic/namespaces/pull/184>
- SLIP-44 TNZO coin type `1414421071`: <https://github.com/satoshilabs/slips/pull/2015>
- W3C `did:tenzro` registration: <https://github.com/w3c/did-extensions/pull/705>
- Reference implementation: `crates/tenzro-payments/src/mpp/`
- ML-DSA-65 (FIPS 204): <https://csrc.nist.gov/pubs/fips/204/final>
