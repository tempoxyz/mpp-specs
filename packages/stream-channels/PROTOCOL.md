# Tempo Stream Channel Protocol

Unidirectional payment channels for streaming micropayments on Tempo.

## Overview

Stream channels enable high-frequency, low-cost payments by batching many off-chain voucher signatures into periodic on-chain settlements. Users deposit funds into an escrow contract, sign cumulative vouchers as they consume services, and servers settle when economically optimal.

## Concepts

### Channel

A payment channel between a **payer** (client) and **payee** (server):

- **payer**: User who deposits funds
- **payee**: Server authorized to withdraw via vouchers
- **deposit**: Total escrowed amount
- **settled**: Cumulative amount already withdrawn on-chain
- **authorizedSigner**: Optional delegate for signing vouchers (default: payer)

Channels have no expiry—they remain open until explicitly closed.

### Voucher

An off-chain signed message authorizing cumulative payment:

```
Voucher(bytes32 channelId, uint128 cumulativeAmount)
```

Vouchers are:
- **Cumulative**: Each voucher specifies a cumulative amount paid, superseding previous vouchers
- **Non-expiring**: Valid until the channel closes
- **EIP-712 signed**: For security and wallet compatibility

### Settlement

Converting vouchers to on-chain token transfers. The server can:
- **settle()**: Claim funds without closing the channel
- **close()**: Claim funds and finalize the channel

## Channel Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                         CHANNEL OPEN                            │
│  Client deposits tokens, channel created with unique ID         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STREAMING PAYMENTS                         │
│  Client signs vouchers, server provides service                 │
│  Server may periodically settle() to claim funds                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│    COOPERATIVE CLOSE    │     │        FORCED CLOSE             │
│  Server calls close()   │     │  1. Client calls requestClose() │
│  with final voucher     │     │  2. Wait 15 min grace period    │
│                         │     │  3. Client calls withdraw()     │
└─────────────────────────┘     └─────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CHANNEL CLOSED                            │
│  Funds distributed, channel finalized                           │
│  Events: ChannelClosed (always)                                 │
│          ChannelExpired (if forced close - server liveness failure)
└─────────────────────────────────────────────────────────────────┘
```

## Off-Chain Protocol

The off-chain protocol defines how clients and servers communicate outside of on-chain transactions. Servers MUST expose an HTTP endpoint for receiving messages from clients.

### Message Format

All messages are JSON objects with a `type` field and either a signed voucher
(`action: "open"` / `action: "voucher"`) or a signed close request
(`action: "close"`).

#### Voucher Payload (EIP-712)

```typescript
interface VoucherPayload {
  domain: {
    name: "Tempo Stream Channel"
    version: "1"
    chainId: number
    verifyingContract: Address  // Escrow contract
  }
  types: {
    Voucher: [
      { name: "channelId", type: "bytes32" },
      { name: "cumulativeAmount", type: "uint128" }
    ]
  }
  message: {
    channelId: Hex
    cumulativeAmount: string  // Decimal string
  }
}

interface SignedVoucher {
  payload: VoucherPayload
  signature: Hex
}
```

#### Close Request Payload (EIP-712)

```typescript
interface CloseRequestPayload {
  domain: {
    name: "Tempo Stream Channel"
    version: "1"
    chainId: number
    verifyingContract: Address  // Escrow contract
  }
  types: {
    CloseRequest: [
      { name: "channelId", type: "bytes32" }
    ]
  }
  message: {
    channelId: Hex
  }
}

interface SignedCloseRequest {
  payload: CloseRequestPayload
  signature: Hex
}
```

### Voucher Submission

Clients submit vouchers to the server's voucher endpoint (provided in the 402 challenge as `voucherEndpoint`). Vouchers can be submitted either:
- As the body of a POST request to the voucher endpoint
- In the `Authorization: Payment` header of paid requests

### 402 Payment Required Flow

When a client accesses a paid resource without payment:

```
Client                              Server
   │                                   │
   │─────── GET /api/resource ────────▶│
   │                                   │
   │◀────── 402 Payment Required ──────│
   │        WWW-Authenticate: Payment  │
   │          escrowContract="0x..."   │
   │          asset="0x..."            │
   │          destination="0x..."      │
   │          deposit="1000000"        │
   │          salt="0x..."             │
   │          voucherEndpoint="/..."   │
   │          minVoucherDelta="10000"  │
   │                                   │
   │  (Client opens channel on-chain)  │
   │                                   │
   │─────── GET /api/resource ────────▶│
   │        Authorization: Payment ... │
   │        (includes signed voucher)  │
   │                                   │
   │◀────── 200 OK ────────────────────│
   │        Payment-Receipt: ...       │
```

### Server Endpoint Requirements

Servers MUST:

1. Expose a voucher endpoint URL (provided in 402 challenge)
2. Accept `POST` requests with JSON body
3. Respond within 30 seconds
4. Return appropriate HTTP status codes

Servers SHOULD:

1. Support the `Authorization: Payment` header for inline voucher submission
2. Return `Payment-Receipt` header on successful paid requests
3. Close channels promptly when clients request

## Close Flows

### Happy Path: Cooperative Close

The client requests closure via an off-chain signed close request (HTTP `POST` to the voucher endpoint). The server SHOULD respond by calling `close()` immediately with its latest voucher.

```
Client                          Server                      Contract
   │                               │                            │
   │──── signed CloseRequest ─────▶│                            │
   │                               │                            │
   │                               │────── close(voucher) ─────▶│
   │                               │                            │
   │                               │◀───── ChannelClosed ───────│
   │                               │                            │
   │◀──── "closed, here's tx" ─────│                            │
```

**Why servers SHOULD close promptly:**
- Economic incentive: Claim their earned funds
- Reputation: Good behavior builds trust
- Protocol compliance: Expected behavior

### Unhappy Path: Forced Close

If the server doesn't respond to close requests, the client can force-close:

```
Client                          Server                      Contract
   │                               │                            │
   │──── "please close" ──────────▶│                            │
   │                               │ (no response)              │
   │                               │                            │
   │─────────────────── requestClose() ────────────────────────▶│
   │                               │                            │
   │◀──────────────────── CloseRequested ───────────────────────│
   │                               │                            │
   │        ⏳ 15 minute grace period                           │
   │                               │                            │
   │─────────────────── withdraw() ────────────────────────────▶│
   │                               │                            │
   │◀───────────────── ChannelExpired + ChannelClosed ──────────│
```

**During the grace period:**
- Server can still `settle()` or `close()` with the latest voucher
- This protects against clients force-closing to avoid paying

**ChannelExpired event** indicates:
- Server failed to close cooperatively
- May indicate server liveness failure or unavailability
- Useful for monitoring server reliability

## Contract Functions

### Opening

```solidity
function open(
    address payee,
    address token,
    uint128 deposit,
    bytes32 salt,
    address authorizedSigner
) returns (bytes32 channelId)
```

### Payments

```solidity
// Claim funds without closing
function settle(
    bytes32 channelId,
    uint128 cumulativeAmount,
    bytes signature
)

// Add more funds to channel
function topUp(
    bytes32 channelId,
    uint128 additionalDeposit
)
```

### Closing

```solidity
// Server-initiated (cooperative)
function close(
    bytes32 channelId,
    uint128 cumulativeAmount,  // 0 if no payments
    bytes signature            // empty if no payments
)

// Client-initiated (forced)
function requestClose(bytes32 channelId)
function withdraw(bytes32 channelId)  // after grace period
```

## Events

All events include indexed `payer` and `payee` addresses for efficient filtering.

| Event | When | Indexed Fields | Data |
|-------|------|----------------|------|
| `ChannelOpened` | `open()` | channelId, payer, payee | token, authorizedSigner, deposit |
| `Settled` | `settle()` | channelId, payer, payee | cumulativeAmount, deltaPaid, newSettled |
| `ToppedUp` | `topUp()` | channelId, payer, payee | additionalDeposit, newDeposit |
| `CloseRequested` | `requestClose()` | channelId, payer, payee | closeGraceEnd |
| `ChannelClosed` | `close()` or `withdraw()` | channelId, payer, payee | settledToPayee, refundedToPayer |
| `ChannelExpired` | `withdraw()` only | channelId, payer, payee | — |

## Server Responsibilities

Servers **SHOULD**:

1. **Monitor the chain** for `CloseRequested` events where they are the payee
2. **Call `close()`** upon seeing `CloseRequested` to claim earned funds before the grace period ends
3. **Respond promptly** to off-chain close requests from clients
4. **Periodically `settle()`** to reduce exposure if clients disappear with unsettled vouchers

Servers **MUST**:

1. Validate voucher signatures before providing service
2. Reject vouchers with `cumulativeAmount <= highestVoucherAmount` (replay protection)
3. Reject vouchers with `cumulativeAmount > deposit`

## Client Responsibilities

Clients **SHOULD**:

1. **Request close off-chain first** (e.g., HTTP request to the voucher endpoint)
2. **Only call `requestClose()` on-chain** if the server doesn't respond within a reasonable time
3. **Wait for `ChannelClosed` event** or the grace period before calling `withdraw()`

Clients **MAY**:

1. Call `topUp()` to add more funds to an existing channel
2. Use an `authorizedSigner` delegate for signing vouchers (e.g., a hot wallet)

## Security Considerations

### For Clients

- Only deposit what you intend to spend
- Monitor for `CloseRequested` to ensure closure completes
- Use `requestClose()` if server becomes unresponsive

### For Servers

- Validate voucher signatures before providing service
- Settle periodically to reduce risk of client disappearing
- Always close promptly when clients request—it's good business

### Voucher Security

- Vouchers are cumulative: newer vouchers with higher amounts supersede older ones
- Vouchers cannot exceed the channel deposit
- Vouchers cannot be replayed on other channels (channelId is signed)

## Version

This document describes **TempoStreamChannel v1**.
