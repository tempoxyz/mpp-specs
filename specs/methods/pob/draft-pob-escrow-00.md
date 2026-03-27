---
title: PoB Escrow Intent for HTTP Payment Authentication
abbrev: PoB Escrow
docname: draft-pob-escrow-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Ryuji Ishiguro
    ins: R. Ishiguro
    email: r2ishiguro@gmail.com

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-escrow:
    title: "'Escrow' Intent for HTTP Payment Authentication"
    target: https://github.com/tempoxyz/mpp-specs
    author:
      - name: Ryuji Ishiguro
    date: 2026-03

informative:
  EIP-20:
    title: "Token Standard"
    target: https://eips.ethereum.org/EIPS/eip-20
    author:
      - name: Fabian Vogelsteller
      - name: Vitalik Buterin
    date: 2015-11
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
    author:
      - name: Vitalik Buterin
    date: 2016-01
  EIP-155:
    title: "Simple replay attack protection"
    target: https://eips.ethereum.org/EIPS/eip-155
    author:
      - name: Vitalik Buterin
    date: 2016-11
---

--- abstract

This document specifies the "escrow" intent for the "pob" payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It enables gating access to HTTP resources
behind escrow-based payments using PoBERC20 tokens on a
Proof-of-Balance (PoB) blockchain.

The client places a hold on funds through an on-chain escrow contract
and presents the confirmed transaction hash as proof. The server
verifies the hold on-chain and grants access. The merchant later
settles or releases the held funds when the final amount is known.
This pattern maps to preauthorization and capture in traditional
payment systems and is intended for autonomous machine-to-machine
payments where the final cost is not known at authorization time.

--- middle

# Introduction

The "charge" intent covers one-time payments where the final amount
is known at authorization time. Many real-world services cannot
determine the final price when access is first requested. A parking
session depends on departure time. A fueling transaction depends on
the amount dispensed. A metered compute job depends on resources
consumed.

The "escrow" intent {{I-D.payment-intent-escrow}} addresses those
cases by splitting payment into a hold phase and a settlement phase.
This document specifies how to implement the escrow intent using
PoBERC20 tokens and the MerchantBase escrow contract on a PoB chain.

## Escrow Flow

The PoB escrow flow proceeds in two stages.

**Hold stage** (within the 402 exchange):

1. Client requests a resource without credentials.
2. Server responds with 402 and a Payment challenge containing the
   hold amount, merchant contract, and merchant wallet.
3. Client calls `approve()` on the PoBERC20Escrow token to grant
   the merchant contract a spending allowance.
4. Client calls `hold()` on the MerchantBase contract to create
   the escrow.
5. Client resubmits the request with a Payment credential
   containing proof of the hold.
6. Server verifies the hold on-chain via `getHeldBalance()` and
   returns 200 with a Payment-Receipt.

**Settlement stage** (out of band, after service delivery):

7. Merchant calls `settle(txId, finalAmount)` on the MerchantBase
   contract to capture the actual charge and refund the remainder.
   Alternatively, the merchant calls `release(txId)` to return all
   held funds to the customer.

## Relationship to the Escrow Intent

This document is a method-specific binding of the abstract escrow
intent defined in {{I-D.payment-intent-escrow}}. It inherits the
intent semantics, flow, and security requirements from that
specification and adds PoB-specific request schemas, credential
payloads, verification procedures, and settlement mechanics.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

PoBERC20
: An ERC-20 compatible token {{EIP-20}} on a PoB chain. Each token
  transfer is accompanied by a zero-knowledge Proof of Balance that
  proves the sender has sufficient funds without revealing the
  actual balance.

PoBERC20Escrow
: A PoBERC20 token contract extended with escrow capabilities. It
  provides `hold`, `settle`, and `release` operations and maintains
  a mapping from transaction identifiers to held balances.

MerchantBase
: An abstract smart contract deployed by a merchant that wraps
  PoBERC20Escrow calls. It generates transaction identifiers,
  enforces settlement authorization, and applies merchant-specific
  reward and fee calculations.

Transaction Identifier (txId)
: A `bytes32` value derived from `keccak256(abi.encodePacked(
  msg.sender, block.timestamp, block.number))` at hold time. It
  uniquely identifies a held balance for later settlement or
  release.

Hold
: An on-chain escrow operation that transfers tokens from the
  customer to the escrow contract and records the held balance,
  merchant wallet, merchant owner, and customer address.

Settle
: An on-chain operation where the merchant wallet captures a final
  amount less than or equal to the held amount. The contract
  distributes funds to the merchant wallet, merchant owner (reward),
  and fee wallet, and refunds any remainder to the customer.

Release
: An on-chain operation where the merchant owner returns all held
  funds to the customer without settlement.

# Request Schema

The `request` auth-param in the Payment challenge MUST contain a
JCS-canonicalized {{RFC8785}}, base64url-encoded {{RFC4648}} JSON
object {{RFC8259}} with the following fields.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | Yes | Maximum hold amount in base units |
| `currency` | string | Yes | EIP-55 {{EIP-55}} address of the PoBERC20Escrow token |
| `recipient` | string | Yes | EIP-55 address of the merchant wallet that will receive settled funds |
| `description` | string | No | Human-readable purpose (max 256 UTF-8 bytes) |
| `externalId` | string | No | Merchant reference such as a session or order identifier (max 566 bytes) |

The `amount` field represents the maximum hold, not the final
charge. The `currency` field MUST be a checksummed Ethereum address
pointing to a contract that implements both PoBERC20 and
PoBERC20Escrow interfaces.

## Method Details

The `methodDetails` sub-object contains PoB-specific fields.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chainId` | number | Yes | PoB chain identifier, used for EIP-155 {{EIP-155}} replay protection |
| `merchantContract` | string | Yes | EIP-55 address of the MerchantBase contract |
| `merchantOwner` | string | Yes | EIP-55 address of the merchant owner (authorized to release) |
| `decimals` | number | Yes | Token decimal places (MUST match the token contract) |
| `tokenName` | string | No | Human-readable token name for display |
| `holdExpiry` | string | No | RFC 3339 {{RFC3339}} timestamp after which the hold MAY be reclaimed by the payer (see {{hold-expiry}}) |

Servers MUST include `chainId`, `merchantContract`, `merchantOwner`,
and `decimals`. Clients MUST verify `chainId` matches their expected
network before signing any transaction.

## Example

~~~json
{
  "amount": "5000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "description": "Parking hold — up to $5.00",
  "externalId": "parking_session_42",
  "methodDetails": {
    "chainId": 42431,
    "merchantContract":
      "0x1111111111111111111111111111111111111111",
    "merchantOwner":
      "0x5555555555555555555555555555555555555555",
    "decimals": 6,
    "tokenName": "PoBUSD",
    "holdExpiry": "2026-03-26T18:00:00Z"
  }
}
~~~

# Credential Schema

## Credential Structure

The Authorization header carries a base64url-encoded JSON object
with the structure defined by {{I-D.httpauth-payment}}.

~~~json
{
  "challenge": { ... },
  "source": "did:pkh:eip155:42431:0xAbC123...",
  "payload": {
    "holdTxHash": "0x<transaction hash>"
  }
}
~~~

The `challenge` object echoes all challenge parameters from the
server. The `source` field is RECOMMENDED and SHOULD use the
`did:pkh` format with the PoB chain namespace.

## Payload

The client broadcasts `approve()` and `hold()` transactions
independently and presents the confirmed hold transaction hash
for server-side verification.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `holdTxHash` | string | Yes | Hex-encoded transaction hash of the confirmed `hold()` call |

The `approve()` transaction hash is not needed in the payload
because the server verifies the hold state on-chain, not the
approval. If the hold succeeded, the approval necessarily
preceded it.

# Verification Procedure {#verification}

Upon receiving a credential, the server MUST:

1. Verify `holdTxHash` has not been previously consumed.

2. Fetch the transaction receipt via `eth_getTransactionReceipt`.

3. Verify `status == 1` (successful execution).

4. Locate the `TransactionHeld` event in the receipt and extract
   `txId`:

   ~~~
   event TransactionHeld(
     bytes32 indexed txId,
     address indexed customer,
     uint256 holdAmount,
     uint256 maxSettleableAmount
   )
   ~~~

5. Call `getHeldBalance(txId)` on PoBERC20Escrow and verify:
   - `customer` matches the `source` in the credential.
   - `merchantContract` matches the challenge `merchantContract`.
   - `merchantWallet` matches the challenge `recipient`.
   - `amount` >= the challenge `amount`.

6. Record `txId` as consumed. Reject any future credential
   referencing the same `txId`.

7. Return 200 with the resource and a `Payment-Receipt` header.

## Error Responses

When verification fails, the server MUST respond with 402 and a
fresh challenge. The response body SHOULD contain a Problem Details
object {{RFC9457}} with one of the following `type` values:

| type suffix | Condition |
|-------------|-----------|
| `malformed-credential` | Payload cannot be decoded or is missing required fields |
| `invalid-challenge` | Challenge ID is unknown, expired, or already consumed |
| `verification-failed` | On-chain hold verification failed (wrong amount, recipient, signer, or transaction not found) |

## Receipt Generation

The `Payment-Receipt` header contains a base64url-encoded JSON
object:

~~~json
{
  "method": "pob",
  "intent": "escrow",
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
  "status": "success",
  "timestamp": "2026-03-26T14:00:58Z",
  "reference": "0xabc123...def456",
  "txId": "0x<bytes32 hold transaction ID>",
  "holdAmount": "5000000",
  "merchantContract":
    "0x1111111111111111111111111111111111111111"
}
~~~

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"pob"` |
| `intent` | string | `"escrow"` |
| `challengeId` | string | The challenge `id` that was fulfilled |
| `status` | string | `"success"` |
| `timestamp` | string | RFC 3339 settlement timestamp |
| `reference` | string | The `hold()` transaction hash |
| `txId` | string | The `bytes32` hold transaction identifier for later settlement |
| `holdAmount` | string | The amount actually held (in base units) |
| `merchantContract` | string | The MerchantBase contract address |

The `txId` and `merchantContract` fields are provided so the
merchant backend can settle or release the hold without additional
lookups.

# Settlement Procedure

Settlement occurs outside the HTTP 402 flow. The merchant backend
calls the MerchantBase contract directly.

## Settle

The merchant wallet calls `settle(txId, finalAmount)` on the
MerchantBase contract. The PoBERC20Escrow contract:

1. Verifies `msg.sender` is the `merchantWallet` recorded in the
   held balance.
2. Verifies `finalAmount` <= held `amount`.
3. Calculates and distributes:
   - `rewardAmount` to `merchantOwner` based on the merchant's
     configured reward percentage.
   - `feeAmount` to the `feeWallet` based on the token-level
     transaction fee percentage.
   - `finalAmount - rewardAmount - feeAmount` to `merchantWallet`.
   - `heldAmount - finalAmount` refunded to `customer`.
4. Deletes the held balance record.
5. Emits `TransactionSettled(txId, finalAmount)`.

## Release

The merchant owner calls `release(txId)` on the MerchantBase
contract. The PoBERC20Escrow contract:

1. Verifies `msg.sender` is the contract owner (the merchant
   owner).
2. Refunds the full held `amount` to `customer`.
3. Deletes the held balance record.
4. Emits `TransactionReleased(txId)`.

## Idempotency

Both `settle` and `release` delete the held balance record
atomically. A second call with the same `txId` will revert because
the held balance no longer exists. Callers SHOULD treat a revert
on a previously settled or released `txId` as a success
(idempotent).

## Settlement and Release Are Mutually Exclusive

The held balance is deleted upon either settle or release. It is
not possible for both operations to succeed for the same `txId`.
This satisfies the atomicity requirement of
{{I-D.payment-intent-escrow}}.

# Hold Expiry {#hold-expiry}

The current MerchantBase contract does not enforce an on-chain
hold expiration. The `holdExpiry` field in `methodDetails` is
advisory: it communicates the server's expected service window.

Implementations SHOULD add on-chain expiry enforcement so that
customers can reclaim funds from stale holds without merchant
cooperation. A future version of this specification will mandate
on-chain expiry once the contract interface stabilizes.

Until on-chain expiry is available, clients SHOULD set a local
policy to reject holds where `holdExpiry` exceeds an acceptable
duration (for example, 24 hours).

# Security Considerations

## Transaction Replay

PoB transactions include EIP-155 {{EIP-155}} chain ID binding and
nonce-based replay protection. Each `hold()` call produces a unique
`txId` derived from the sender, block timestamp, and block number.
Servers MUST track consumed `txId` values and reject duplicates.

## Amount Verification

Clients MUST parse the `request` payload and verify:

- The `amount` is reasonable for the expected service.
- The `currency` points to a known and trusted PoBERC20Escrow
  token contract.
- The `recipient` and `merchantContract` are expected addresses.
- The `chainId` matches the intended network.

Clients SHOULD reject challenges where the hold amount
significantly exceeds the expected service cost.

## Approval Scope

The client calls `approve()` on the token contract before calling
`hold()`. Clients MUST set the allowance to exactly the hold
`amount`, not an unlimited value. Unlimited approvals risk loss of
all token balance if the merchant contract has a vulnerability.

## Settlement Authorization

Only the `merchantWallet` recorded in the held balance can call
`settle()`. Only the merchant owner can call `release()`. Servers
MUST protect their merchant wallet private key. Compromise of this
key allows unauthorized settlement of all active holds.

## Hold Duration and Fund Locking

An adversarial server could issue challenges with excessively long
or missing `holdExpiry` to lock customer funds indefinitely.
Clients MUST enforce a maximum acceptable hold duration. Agents
acting on behalf of users SHOULD be configured with policy limits
on per-hold amounts and aggregate exposure.

## Contract Registry Trust

The `merchantContract` is an arbitrary address provided by the
server. Clients MUST verify that the contract at that address
implements the expected MerchantBase interface and is associated
with a trusted token. Clients SHOULD maintain an allowlist of
known merchant contracts or validate against an on-chain registry
such as UserIdRegistry.

## Proof of Balance Privacy

PoBERC20 transfers include zero-knowledge proofs that the sender
has sufficient balance without revealing the actual balance. The
hold operation itself does not leak the customer's total balance
to the merchant. However, the hold `amount` is visible on-chain.
Merchants can observe the maximum hold but not the customer's
remaining balance after the hold.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP
Payment Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `pob` | Proof-of-Balance blockchain PoBERC20 token escrow | This document |

Contact: Ryuji Ishiguro (<r2ishiguro@gmail.com>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `escrow` | `pob` | Hold-then-settle escrow payment | This document, {{I-D.payment-intent-escrow}} |

--- back

# ABNF Collected

~~~abnf
pob-escrow-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "pob" DQUOTE ","
  "intent=" DQUOTE "escrow" DQUOTE ","
  "request=" base64url-nopad
  [ "," "expires=" quoted-string ]
  [ "," "digest=" quoted-string ]

pob-escrow-credential = "Payment" 1*SP base64url-nopad

; Credential payload
pob-escrow-payload = "{" DQUOTE "holdTxHash" DQUOTE ":"
  DQUOTE eth-tx-hash DQUOTE "}"

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )

; Ethereum hex-encoded values
eth-address = "0x" 40HEXDIG
eth-bytes32 = "0x" 64HEXDIG
eth-tx-hash = "0x" 64HEXDIG
~~~

# Example

## Challenge (Server to Client)

~~~
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
    realm="api.parkco.example.com",
    method="pob",
    intent="escrow",
    expires="2026-03-26T14:05:00Z",
    request="eyJhbW91bnQiOiI1MDAwMDAwIiwiY3VycmVuY3kiOiIwe
    DIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw
    MCIsInJlY2lwaWVudCI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM
    2I4NDRCYzllNzU5NWY4ZkUwMCIsImRlc2NyaXB0aW9uIjoiUGFya2
    luZyBob2xkIOKAlCB1cCB0byAkNS4wMCIsIm1ldGhvZERldGFpbHM
    iOnsiY2hhaW5JZCI6NDI0MzEsIm1lcmNoYW50Q29udHJhY3QiOiIw
    eDExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE
    iLCJtZXJjaGFudE93bmVyIjoiMHg1NTU1NTU1NTU1NTU1NTU1NTU1
    NTU1NTU1NTU1NTU1NTU1NTU1NTU1IiwiZGVjaW1hbHMiOjYsInRva
    2VuTmFtZSI6IlBvQlVTRCJ9fQ"
Cache-Control: no-store
Content-Type: application/problem+json

{
  "type": "about:blank",
  "title": "Payment Required",
  "status": 402
}
~~~

## Credential (Client to Server)

The client has already broadcast `approve()` and `hold()`
transactions on-chain and received a confirmed hold receipt.

~~~
POST /api/parking/book HTTP/1.1
Host: api.parkco.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHF
    XdlQybkpySHNZNGFEZkViIiwicmVhbG0iOiJhcGkucGFya2NvLmV4
    YW1wbGUuY29tIiwibWV0aG9kIjoicG9iIiwiaW50ZW50IjoiZXNjcm
    93In0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjQyNDMxOjB4QWJ
    DMTIzLi4uIiwicGF5bG9hZCI6eyJob2xkVHhIYXNoIjoiMHhhYmMxM
    jMuLi5kZWY0NTYifX0
Content-Type: application/json

{"lotId": "A", "vehicleId": "ABC-1234", "durationMinutes": 120}
~~~

## Receipt (Server to Client)

~~~
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJwb2IiLCJpbnRlbnQiOiJlc2Ny
    b3ciLCJjaGFsbGVuZ2VJZCI6ImtNOXhQcVd2VDJuSnJIc1k0YURmRW
    IiLCJzdGF0dXMiOiJzdWNjZXNzIiwidGltZXN0YW1wIjoiMjAyNi0w
    My0yNlQxNDowMDo1OFoiLCJyZWZlcmVuY2UiOiIweGFiYzEyMy4uL
    mRlZjQ1NiIsInR4SWQiOiIweDAwMTEuLi4iLCJob2xkQW1vdW50Ijoi
    NTAwMDAwMCIsIm1lcmNoYW50Q29udHJhY3QiOiIweDExMTEuLi4ifQ
Cache-Control: private
Content-Type: application/json

{
  "reservationId": "R-789",
  "expiresAt": "2026-03-26T16:00:00Z",
  "lot": "A",
  "vehicle": "ABC-1234"
}
~~~

# Contract Interface Reference

The following Solidity interfaces are referenced by this
specification. They are provided for implementer convenience and
are not normative.

## PoBERC20Escrow

~~~solidity
interface IPoBERC20Escrow {
    struct HeldBalance {
        address merchantContract;
        address merchantWallet;
        address feeWallet;
        address merchantOwner;
        address customer;
        uint256 amount;
        uint256 timestamp;
    }

    function hold(
        address sender,
        address merchantOwner,
        address merchantWallet,
        bytes32 txId,
        uint256 amount
    ) external;

    function settle(
        bytes32 txId,
        uint256 finalAmount,
        uint256 rewardAmount
    ) external returns (bool);

    function release(bytes32 txId) external;

    function getHeldBalance(bytes32 txId)
        external
        view
        returns (
            address merchantContract,
            address merchantWallet,
            address feeWallet,
            address merchantOwner,
            address customer,
            uint256 amount,
            uint256 timestamp
        );

    event BalanceHeld(
        bytes32 indexed txId,
        address indexed merchant,
        address indexed customer,
        uint256 amount
    );

    event BalanceSettled(
        bytes32 indexed txId,
        address indexed merchantWallet,
        address indexed merchantOwner,
        uint256 totalDistributed
    );

    event BalanceReleased(
        bytes32 indexed txId,
        address indexed customer,
        uint256 amount
    );
}
~~~

## MerchantBase

~~~solidity
interface IMerchantBase {
    function hold(
        uint256 holdAmount,
        address merchantWallet
    ) external returns (bytes32 txId);

    function settle(
        bytes32 txId,
        uint256 finalAmount
    ) external;

    function release(bytes32 txId) external;

    event TransactionHeld(
        bytes32 indexed txId,
        address indexed customer,
        uint256 holdAmount,
        uint256 maxSettleableAmount
    );

    event TransactionSettled(
        bytes32 indexed txId,
        uint256 finalAmount
    );

    event TransactionReleased(bytes32 indexed txId);
}
~~~

# Acknowledgements

The HTTP Payment Authentication Scheme and the intent-method
layering model are defined by the MPP specifications at
paymentauth.org. The escrow pattern draws from EMV
preauthorization and capture semantics used in traditional payment
card networks.
