---
title: Passkey-Rooted Delegated Signers for the Solana Session Intent
abbrev: Solana Session Passkey
docname: draft-solana-session-passkey-00
version: 00
category: info
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: Branch Manager
    ins: B. Manager
    email: branch@dexter.cash
    org: Dexter Intelligence DAO LLC

normative:
  RFC2119:
  RFC8174:
  RFC4648:
  WEBAUTHN:
    target: https://www.w3.org/TR/webauthn-3/
    title: Web Authentication, Level 3
  SIMD-0075:
    target: https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0075-precompile-for-secp256r1-sigverify.md
    title: "SIMD-0075: Precompile for secp256r1 sigverify"
  draft-solana-session-00:
    target: https://github.com/tempoxyz/mpp-specs/pull/201
    title: Solana Session Intent for HTTP Payment Authentication
  draft-ryan-httpauth-payment-01:
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/01/
    title: Payment HTTP Authentication

informative:
  SEC1:
    target: https://www.secg.org/sec1-v2.pdf
    title: "SEC 1: Elliptic Curve Cryptography"
  TIP-1053:
    target: https://tips.sh/1053
    title: "TIP-1053: Witnesses in Key Authorizations"
  ANCHOR:
    target: https://www.anchor-lang.com
    title: Anchor Framework

--- abstract

This document specifies a delegated-signer extension to the Solana Session
Intent ({{draft-solana-session-00}}) that uses Solana's native
`secp256r1` signature verification precompile ({{SIMD-0075}}) to authorize
voucher signers via WebAuthn passkeys ({{WEBAUTHN}}).

The base session intent invites such extensions at its Authorized Signer
section, requiring any extension to define a distinct `signatureType`
value, an exact signed message format, an exact Solana verification
program, and a binding between the delegated signer and the channel's PDA
derivation. This document supplies all four.

A reference implementation is live on Solana mainnet. The
`dexter-vault` program (account
`Hg3wRaydFtJhYrdvYrKECacpJYDsC9Px7yKmpncj2fhc`) verifies secp256r1
signatures over a fixed canonical message via the SIMD-0075 precompile,
records the active session key on the vault account, and exposes a
read-only `prove_passkey` instruction for off-chain liveness attestation.
A live reference vault (account
`7FE9VUeabi3sF8wUABV7F3eyvEi1ekDbER9k5JBYrWAi`) demonstrates the full
lifecycle on Solana mainnet.

--- middle

# Introduction

## Background

The Solana Session Intent ({{draft-solana-session-00}}) defines an
on-chain channel primitive and an off-chain voucher format for streaming
HTTP payments on Solana. Its default authority model has the payer sign
vouchers directly with an Ed25519 keypair. Its Authorized Signer section
optionally permits the payer to delegate voucher signing to a separate
keypair (for example, a browser session key) under the same Ed25519
signature scheme.

That section additionally invites extensions that permit delegated
signers on other curves verifiable by Solana's native precompiles,
naming `secp256r1` for passkeys as an example. Such extensions MUST
define a distinct `signatureType` value, the exact signed message format,
the exact Solana verification program used on-chain, and how the
delegated signer is bound into the channel's PDA derivation and open
transaction.

This document specifies one such extension.

## Why passkey-rooted delegation

A passkey (WebAuthn credential, {{WEBAUTHN}}) is bound to a user's
device or password manager and authorized by a biometric or PIN gesture.
The credential's keypair is on the `secp256r1` curve (also known as
NIST P-256). Solana's
`Secp256r1SigVerify1111111111111111111111111` precompile (introduced in
{{SIMD-0075}}) verifies these signatures natively, with the verification
result available to subsequent instructions in the same transaction via
the instructions sysvar.

Passkey-rooted delegation has three properties that matter for the
session intent:

1. **No third-party custody.** The user holds the credential. No
   service operator holds a key that can move funds. The session intent's
   non-custodial property is preserved.
2. **Bounded blast radius.** The credential is not the security
   boundary; the on-chain program is. A compromised passkey can authorize
   at most what the program permits: a fixed cap, a specific
   counterparty, an expiry window. Raising the cap requires a fresh
   credential ceremony.
3. **No persistent server-side secret.** The session key the credential
   authorizes is an ephemeral Ed25519 keypair the client holds for the
   life of the session. The server never holds key material that can
   compromise the user.

Implementations of this extension MUST place the authority boundary on
the verifying program, not on the credential. Implementations that treat
the passkey as the sole security boundary do not conform to this
specification.

## Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
{{RFC2119}} and {{RFC8174}}.

**Passkey.** A WebAuthn credential as defined by {{WEBAUTHN}}, whose
public key is a `secp256r1` (NIST P-256) point.

**Compressed pubkey form.** The 33-byte SEC1 compressed encoding
({{SEC1}}) of an elliptic curve point: a 1-byte prefix (`0x02` or
`0x03`) followed by the 32-byte X coordinate.

**Vault account.** A program-owned account that records the passkey's
33-byte compressed public key, the active session key (if any), and the
active scope parameters. The vault account is the on-chain anchor of the
authority relationship.

**Authority program.** The Solana program that owns the vault account
and enforces the on-chain rules. This document uses `dexter-vault` as
the reference implementation but does not require any specific program
identity for conforming implementations.

**Session key.** An Ed25519 keypair the client holds, authorized by the
passkey to sign vouchers within scope. The session key's public key
is the `authorizedSigner` recorded in the session intent's channel
state.

**Scope.** The on-chain parameters that bound what the session key may
authorize: spending cap (`max_amount`), allowed counterparty
(`allowed_counterparty`), expiry timestamp (`expires_at`).

# Extension Identification

Implementations of this extension MUST set the voucher's `signatureType`
field to:

~~~
passkey-p256-session-v1
~~~

This value is distinct from the base specification's `ed25519` value and
MUST NOT be used by implementations that have not implemented this
extension's verification flow.

The trailing `-v1` permits future revisions of this extension to use a
distinct `signatureType` value if the wire format changes
incompatibly.

# Channel Open with Passkey Authority

## authorizedSigner field

Per the base specification, the channel state's `authorizedSigner` field
records the public key that signs vouchers. Under this extension,
`authorizedSigner` is the Ed25519 public key of the session key, NOT the
passkey itself. The passkey authorizes the session key; the session key
signs vouchers. The verifier checks each voucher's signature against the
session key.

This indirection is intentional. The session key signs many vouchers
per second without user interaction; the passkey performs a single
biometric gesture per session.

## Vault account binding

The channel's PDA derivation, as defined by the base specification,
binds the channel to `authorizedSigner`. Under this extension,
`authorizedSigner` is the session key. The session key, in turn, is
bound to the passkey via the vault account.

A conforming implementation MUST ensure that:

1. The vault account is initialized before any channel `open`
   transaction that uses an `authorizedSigner` derived from a passkey
   session.
2. The session key recorded in the vault account's active session field
   matches the `authorizedSigner` field in the channel state at open
   time.
3. The vault account's owner is the conforming authority program.

A verifier MAY accept a voucher only if all three conditions hold for
the channel and vault at the time of verification.

## Vault address derivation

The vault account address is a Solana Program-Derived Address (PDA)
derived from operator-defined identity bytes, NOT directly from the
passkey public key. The reference implementation uses the following
seed schema, which conforming implementations SHOULD adopt:

~~~
seeds      = [b"vault", identity_claim[0..16]]
program_id = authority_program
~~~

Where `identity_claim` is a 32-byte opaque value supplied at vault
initialization. The authority program does not interpret these bytes;
they are operator-defined. The reference implementation writes a
Supabase UUID into the first 16 bytes and zeros the remaining 16. Other
operators MAY use any 16-byte identifier suitable to their identity
substrate.

The vault account stores the passkey's 33-byte compressed pubkey in its
state. The PDA address does not depend on the passkey. This separation
permits passkey rotation (replacing the stored pubkey with a fresh one)
without changing the vault address. The existing balance, swig
binding, and identity claim remain stable across credential rotation.

Conforming implementations that use a different seed schema MUST
document it in implementation notes so verifiers and clients can
independently recompute the address.

# Register Session Key Message Format

## Wire format

To authorize a session key, the client constructs a fixed 180-byte
registration message, signs it with the passkey via WebAuthn, and
submits the signature and message to the authority program.

The registration message is laid out as follows. All multi-byte integers
are little-endian.

| Offset | Length | Field | Encoding |
|--------|--------|-------|----------|
| 0 | 32 | `domain` | ASCII `"OTS_SESSION_REGISTER_V1"` (23 bytes) padded with 9 zero bytes |
| 32 | 32 | `program_id` | Authority program ID (raw Solana address bytes) |
| 64 | 32 | `vault_pda` | Vault PDA address (raw) |
| 96 | 32 | `session_pubkey` | Session key Ed25519 public key (raw) |
| 128 | 8 | `max_amount` | u64 LE; cumulative spending cap in token base units; MUST be > 0 |
| 136 | 8 | `expires_at` | i64 LE; Unix timestamp in seconds; MUST be strictly greater than current on-chain time |
| 144 | 32 | `allowed_counterparty` | Recipient public key (raw); zero MAY be permitted only if implementation supports an unbounded counterparty (the reference implementation does not) |
| 176 | 4 | `nonce` | u32 LE; per-session value chosen by the client |

Total: 180 bytes.

The `domain` field's hex representation is:

~~~
4f54535f53455353494f4e5f52454749535445525f5631000000000000000000
~~~

(That is the ASCII bytes of `OTS_SESSION_REGISTER_V1` followed by 9 NUL
bytes.) The 23-byte label distinguishes this message from other
operations the same passkey might sign. Conforming implementations MUST
use this exact 32-byte sequence.

The combination of `program_id`, `vault_pda`, `session_pubkey`,
`expires_at`, and `nonce` makes the message uniquely identifying across
all program deployments, all vaults, all sessions, and all time.

## Passkey signing ceremony

The client signs the registration message using the passkey via the
WebAuthn assertion ceremony:

1. The relying party (the authority program's client SDK) constructs the
   180-byte registration message above.
2. The client computes `challenge = sha256(registration_message)` and
   passes it as the WebAuthn `challenge` parameter for
   `navigator.credentials.get()`.
3. The user authorizes the gesture (biometric, PIN, or hardware-key
   touch).
4. The browser returns the WebAuthn assertion, containing
   `authenticatorData`, `clientDataJSON`, and the `signature`.
5. The client submits all three plus the registration arguments to the
   authority program's `register_session_key` instruction, preceded by a
   SIMD-0075 `secp256r1_verify` instruction in the same transaction
   covering the WebAuthn signed payload.

## SIMD-0075 signed payload

Per the WebAuthn specification, the authenticator signs:

~~~
signed_payload = authenticator_data || sha256(client_data_json)
~~~

This is the payload the client submits to the SIMD-0075 precompile
along with the 33-byte compressed pubkey and the signature.

The authority program verifies the precompile result by:

1. Reading the previous instruction from the instructions sysvar.
2. Asserting that the previous instruction's program ID is
   `Secp256r1SigVerify1111111111111111111111111`.
3. Parsing the precompile's instruction data (offset structure defined
   by {{SIMD-0075}}) to extract the verified message bytes and pubkey
   bytes.
4. Asserting the pubkey bytes equal the 33-byte
   `passkey_pubkey` stored on the vault.
5. Asserting the message bytes equal
   `authenticator_data || sha256(client_data_json)` computed from the
   instruction arguments.

The authority program then parses `client_data_json` to extract the
`challenge` field (a JSON string value containing URL-safe base64 per
{{RFC4648}} Section 5, conventionally without padding), base64url-decodes
it, and asserts:

~~~
decoded_challenge == sha256(registration_message)
~~~

If any check fails, the program MUST reject the transaction.

The `clientDataJSON` parser MAY be a minimal-footprint scanner that
locates the `"challenge":"<value>"` field; the WebAuthn specification
guarantees the challenge is base64url-encoded and therefore contains
only `[A-Za-z0-9_-]` characters, so the parser does not need to handle
JSON-escape sequences inside the value.

## Application-layer challenge binding (informative)

Implementations that wish to bind the registration to an application
layer challenge (for example, to satisfy a single-sign-on flow that
issues a server-side nonce, as discussed in {{TIP-1053}} for a different
substrate) MAY encode such a challenge into `identity_claim` or
`allowed_counterparty`. The protocol does not interpret these fields
beyond what is specified in Section 5; an off-chain verifier that
needs challenge-binding can recover and check it from the same wire
bytes the program signed.

This extension does not include a separate `witness` field in v1. A
future revision MAY add one if implementer demand emerges.

# On-Chain Verification Program

## Required instructions

A conforming authority program MUST implement at minimum the following
instructions. Instruction names are guidance; conforming implementations
MAY use different names provided the semantics are preserved.

| Instruction | Purpose |
|-------------|---------|
| `initialize_vault` | Initialize a vault PDA, recording the passkey's 33-byte compressed pubkey, the bound session authority key, the operator's identity claim, and any withdrawal cooling-off parameters. |
| `register_session_key` | Authorize a session key with scope, gated by a passkey signature over the 180-byte registration message defined in Section 4. |
| `revoke_session_key` | Revoke the active session key, gated by a passkey signature over a 128-byte revocation message (Section 5.2). |
| `prove_passkey` | Verify a passkey signature over an arbitrary 32-byte challenge for off-chain liveness attestation. Read-only; mutates no state. |

The reference implementation provides additional instructions for
withdrawal flow, swig binding, and authority rotation. Those are out of
scope for this extension specification but documented in Section 8.

## Revocation message format

To revoke the active session key, the client signs a 128-byte
revocation message:

| Offset | Length | Field | Encoding |
|--------|--------|-------|----------|
| 0 | 32 | `domain` | ASCII `"OTS_SESSION_REVOKE_V1"` (21 bytes) padded with 11 zero bytes |
| 32 | 32 | `program_id` | Authority program ID |
| 64 | 32 | `vault_pda` | Vault PDA |
| 96 | 32 | `session_pubkey` | The session pubkey currently recorded on the vault |

Total: 128 bytes.

The `domain` field's hex representation is:

~~~
4f54535f53455353494f4e5f5245564f4b455f56310000000000000000000000
~~~

The revocation domain separator is distinct from the registration
domain separator so a registration signature cannot be reinterpreted as
a revocation or vice versa.

The signing ceremony and verification flow are identical to the
registration flow (Sections 4.2 and 4.3) except for the message bytes
themselves.

## prove_passkey for off-chain liveness

The `prove_passkey` instruction verifies that the holder of the passkey
can produce a fresh signature over an application challenge. It does not
mutate state. Verifiers MAY use `prove_passkey` via
`simulateTransaction` RPC calls to confirm liveness without consuming
compute units or paying fees.

The signed operation message is:

~~~
op_msg = b"siwx_login" || challenge
~~~

Where `challenge` is a 32-byte value supplied by the off-chain verifier
(for example, a server-issued login nonce). The literal `siwx_login` is
the domain prefix for this operation; conforming implementations MUST
use this exact ASCII string.

This instruction is the canonical mechanism for application-level
authentication in flows that do not register a new session key.

## SIMD-0075 precompile

All passkey signature verification under this extension MUST flow
through the `Secp256r1SigVerify1111111111111111111111111` precompile
({{SIMD-0075}}). Implementations MUST NOT verify secp256r1 signatures
through alternative means (for example, in-program ECDSA verification).
The precompile's verification semantics are normative for this
extension.

# Voucher Format Compatibility

This extension does NOT modify the voucher format defined in the base
specification ({{draft-solana-session-00}}). The 48-byte fixed Borsh
layout (`channelId`, `cumulativeAmount`, `expiresAt`) remains
canonical, and `signature` remains a base58-encoded Ed25519 signature.

A voucher signed under this extension is signed with the session key
(Ed25519), not the passkey. The `signatureType` field distinguishes
channels that use this extension (`passkey-p256-session-v1`) from
channels using the default Ed25519 authority (`ed25519`).

A seller verifying a voucher under this extension MUST:

1. Parse the voucher and signature as defined in the base specification.
2. Verify the Ed25519 signature against the session key recorded as the
   channel's `authorizedSigner`.
3. Independently verify, via on-chain account read, that:
   - The session key recorded on the vault's active session field
     equals the voucher's signer pubkey.
   - The active session's `expires_at` is strictly greater than the
     current Unix time.
   - The active session's `max_amount` is greater than or equal to the
     voucher's `cumulativeAmount`.
   - The active session's `allowed_counterparty` equals the seller's
     receiving address for this channel.

The third check is what enforces the security boundary. The session-key
signature is necessary but not sufficient; the on-chain scope is
authoritative.

# Off-Chain Verifier Flow

## Voucher verification sequence

A seller (verifier) receives a voucher from a buyer (payer). The
verifier's sequence is:

1. Parse the HTTP request and extract the voucher object.
2. Confirm `signatureType == "passkey-p256-session-v1"`. If not, this
   extension does not apply; fall back to the base specification or
   reject.
3. Verify the Ed25519 signature on the voucher against the `signer`
   field.
4. Resolve the channel state from the on-chain channel PDA. Read
   `authorizedSigner` and assert it equals the voucher's `signer`.
5. Resolve the vault state by deserializing the vault account (the
   account layout is defined by the authority program). Confirm that
   the vault's active session matches the constraints listed in
   Section 6.
6. If all checks pass, accept the voucher.

Verifiers SHOULD cache the vault state for short intervals (on the
order of a few seconds) to amortize RPC reads across many vouchers from
the same channel, evicting the cache entry when the active session's
expiry approaches.

## Liveness for application authentication

For flows that authenticate a user to an application without opening a
payment channel (for example, single sign-on or session bootstrapping),
the verifier issues a 32-byte random challenge, the client signs
`b"siwx_login" || challenge` with the passkey via WebAuthn, and the
verifier confirms by submitting a `prove_passkey` instruction to the
authority program via `simulateTransaction`. The transaction is never
broadcast; the simulation result attests liveness.

This permits "passkey once, web2 session thereafter" UX without coupling
authentication to payment-channel state.

# Security Considerations

## The passkey is not a hardware wallet

Phone-resident passkeys, particularly those synced through device
manufacturer keychains, may store and operate key material in ways that
do not match the security guarantees of dedicated hardware wallets.
Implementations of this extension MUST NOT treat the passkey as the
sole security boundary for the funds the vault controls.

The security boundary is the authority program. The passkey authorizes
within bounds the program enforces. Compromise of the passkey limits an
attacker to actions permitted by the active session's scope. Raising the
scope requires a fresh passkey ceremony, which an attacker can perform
only if they retain the passkey at the time of the new ceremony. The
user can close that window by re-enrolling on a fresh credential.

Hardware-grade authenticators (for example, FIDO2 security keys with
non-exportable keys) MAY be used as passkeys under this extension with
no protocol change. The signature scheme is the same; only the storage
of the credential differs.

## Replay protection

Within a single vault, the program enforces at most one active session
at a time. A registration whose message specifies a session whose
expiry has not yet passed is rejected if any unexpired session already
exists. An expired session is silently overwritten.

The 180-byte registration message embeds `program_id`, `vault_pda`,
`session_pubkey`, `expires_at`, and `nonce`. A signature over this
message cannot be replayed against a different program, vault, session,
or moment in time. The `nonce` field is operator-controlled and not
enforced for monotonicity by the program; clients SHOULD generate it
fresh per session to prevent confusing collisions across their own
sessions.

Voucher replay is bounded by the base specification's monotonic
cumulative-amount semantics: a voucher with cumulative amount N is
useless once a voucher with cumulative amount M > N has been accepted
for the same channel.

## Session key compromise

A compromised session key authorizes spending up to the current
session's cap, against the specific counterparty, before the specific
expiry. Implementations SHOULD set conservative caps and short expiries
by default. Implementations MUST provide a `revoke_session_key` path
callable by the passkey holder without requiring the compromised
session key to participate.

## Program upgrade authority

If the authority program is upgradeable, the program's upgrade authority
is itself a trust assumption beyond the passkey. A malicious or
compromised upgrade authority could deploy a modified program that
bypasses signature verification or relaxes scope enforcement.
Implementations SHOULD document the upgrade authority and its
governance. Reference implementations are encouraged to burn the upgrade
authority once the program is considered stable.

## clientDataJSON parsing

The reference implementation parses `clientDataJSON` with a
minimal-footprint scanner that does not handle JSON-escape sequences.
This is sound because the WebAuthn specification guarantees the
`challenge` field's value is base64url-encoded and therefore contains
only `[A-Za-z0-9_-]` characters. Conforming implementations that use
full JSON parsing MUST handle escape sequences safely; implementations
that scan MUST verify the assumption holds for the operating
environment. A non-conforming relying party that emits non-base64url
challenges would otherwise mis-parse.

## Origin pinning (relying-party responsibility)

The authority program verifies the WebAuthn challenge binding but does
NOT inspect the `origin` field of `clientDataJSON`. Origin pinning is
the relying party's responsibility and is enforced by the browser's
WebAuthn API based on the registered credential's relying party ID.
Verifiers operating outside a browser context (server-side
verification, native applications) MUST themselves verify that
`clientDataJSON.origin` matches an expected value.

# Backward Compatibility

This extension is additive to the base specification. Channels opened
under the default Ed25519 authority continue to operate without
modification.

A channel opened under this extension is distinguished by its
`signatureType` value. Verifiers that do not implement this extension
will reject vouchers with
`signatureType == "passkey-p256-session-v1"`, which is the correct
fail-safe.

The 180-byte registration message format and 128-byte revocation message
format defined in this document are version `v1`. Future revisions of
this extension that change either layout MUST use a distinct
`signatureType` value (for example,
`passkey-p256-session-v2`) and a distinct domain separator (for example,
`OTS_SESSION_REGISTER_V2`).

# Reference Implementation

The `dexter-vault` Solana program is the reference implementation of
this extension. Source:

- Authority program: `https://github.com/Dexter-DAO/dexter-vault`
- Client SDK: `https://github.com/Dexter-DAO/dexter-x402-sdk`
- MCP server: `https://github.com/Dexter-DAO/dexter-mcp`

Deployed instances on Solana mainnet:

- Authority program ID:
  `Hg3wRaydFtJhYrdvYrKECacpJYDsC9Px7yKmpncj2fhc`
- Reference vault account:
  `7FE9VUeabi3sF8wUABV7F3eyvEi1ekDbER9k5JBYrWAi`

The reference implementation includes additional instructions beyond
the minimum required by this extension: `set_swig` (one-time binding of
a Solana smart wallet to the vault), `request_withdrawal` /
`finalize_withdrawal` (gated buyer withdrawal flow), `force_release`
(stuck-voucher recovery), `rotate_passkey` (credential rotation),
`rotate_dexter_authority` (operator key rotation), and `settle_voucher`
(operator-initiated session settlement). These instructions are part of
the Open Tabs Standard described in the reference repository but are
out of scope for the session-intent extension specified here.

## Verification that the reference implementation matches the deployed program

The deployed mainnet program at
`Hg3wRaydFtJhYrdvYrKECacpJYDsC9Px7yKmpncj2fhc` has been verified
bit-for-bit against the source-on-disk build at the time of this
document.

Section hashes (SHA-256) of the on-chain bytecode (obtained via
`solana program dump`) and the local Anchor build
(`target/deploy/dexter_vault.so`):

| Section | Size (bytes) | SHA-256 |
|---------|-------------:|---------|
| `.text` (executable code) | 230,920 | `26381d21f25a272ac2964ce229bb0708db15313e0e4acfa85f20f6a4033b6197` |
| `.rodata` (read-only data, includes domain separators) | 16,488 | `6d398fe8ead3cbb97c6b011b1dc9f564c4980c2a4c4d74f459d10120bee0c5db` |
| `.data.rel.ro` (read-only relocations) | 6,152 | `be7a95d2a266cda44c0d03ceac5a030f5d77039086a0b0a57f68d9becfc4ea14` |

All three loaded sections are byte-identical between the on-chain
program and the source build. The file-level size difference (deployed:
279,696 bytes; local: 277,320 bytes) is in non-loaded metadata
(`.dynamic`, `.dynsym`, `.dynstr`, ELF padding) and does not affect
execution semantics.

Reproducibility of the verification:

~~~
solana program dump Hg3wRaydFtJhYrdvYrKECacpJYDsC9Px7yKmpncj2fhc \
  deployed.so --url https://api.mainnet-beta.solana.com
cd /path/to/dexter-vault
anchor build
python3 -c "
import hashlib
sections = [('.text', 0x120, 0x38608),
            ('.rodata', 0x38728, 0x4068),
            ('.data.rel.ro', 0x3c790, 0x1808)]
for label, path in [('deployed', 'deployed.so'),
                    ('local',    'target/deploy/dexter_vault.so')]:
    buf = open(path, 'rb').read()
    for name, off, sz in sections:
        h = hashlib.sha256(buf[off:off+sz]).hexdigest()
        print(f'{label:8s} {name:14s} {h}')
"
~~~

Implementers building their own reference are encouraged to perform the
same comparison whenever they deploy a new program version, to make
the spec's normative claims auditable on-chain.

# Test Vectors

The following test vector exercises the 180-byte registration message
serialization with placeholder values. The placeholder bytes are chosen
for visual distinguishability and do not correspond to a real on-chain
deployment.

Inputs:

- `program_id`: 32 bytes of `0xff`
- `vault_pda`: 32 bytes of `0xee`
- `session_pubkey`: 32 bytes of `0x11`
- `max_amount`: `1_000_000` (decimal) = `0x40420f0000000000` (LE u64)
- `expires_at`: `1735000000` (decimal) = `0xc0ff696700000000` (LE i64)
- `allowed_counterparty`: 32 bytes of `0x22`
- `nonce`: `1` = `0x01000000` (LE u32)

Serialized registration message (180 bytes, hex):

~~~
4f54535f53455353494f4e5f52454749535445525f5631000000000000000000
ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
1111111111111111111111111111111111111111111111111111111111111111
40420f0000000000
c0ff696700000000
2222222222222222222222222222222222222222222222222222222222222222
01000000
~~~

SHA-256 of the serialized message:

~~~
acaf34c904b60f1e3dccd30a9543eab7325e06982582d5852c3405beb620e6ad
~~~

This SHA-256 value is what the client passes as the WebAuthn
`challenge` parameter. The WebAuthn assertion's
`clientDataJSON.challenge` field, base64url-decoded, MUST equal this
value.

# IANA Considerations

This document defines a new value (`passkey-p256-session-v1`) for the
`signatureType` field of the Solana Session Intent voucher payload
({{draft-solana-session-00}}). The base specification's namespace
governs registration of this value; this document does not request
independent IANA action.

--- back

# Acknowledgments

The Authorized Signer section of {{draft-solana-session-00}}
(Ludo Galabru, Jo Desormeaux, Solana Foundation; Michael Assaf, Moonsong
Labs) defines the extension surface this document populates.
{{SIMD-0075}} (Solana Foundation contributors) provides the on-chain
verification primitive on which the extension depends. The broader
Payment HTTP Authentication framework
({{draft-ryan-httpauth-payment-01}}; Brendan Ryan, Jake Moxey, Tom
Meagher, Tempo Labs; Jeff Weinstein, Steve Kaliski, Stripe) provides
the authentication framework above which the session intent operates.

The WebAuthn specification ({{WEBAUTHN}}; W3C Web Authentication
Working Group) and the SEC1 elliptic curve encoding ({{SEC1}}; SECG)
provide the credential and signature substrate.

The Anchor framework ({{ANCHOR}}) and the Solana protocol team provide
the on-chain runtime and tooling on which the reference implementation
is built. The dexter-vault reference implementation is the work of
Dexter Intelligence DAO LLC.

{{TIP-1053}} (Jake Moxey, Tempo Labs) presents a complementary
challenge-binding mechanism at the L1 protocol layer on a different
substrate; that work informed the application-layer challenge-binding
considerations discussed in Section 4.4.
