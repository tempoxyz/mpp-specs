---
name: tempo-developer
description: Expert in low-level EVM development for Tempo blockchain. Use when working on Tempo node internals, EVM modifications, precompiles, transaction types, consensus, or protocol-level changes. Covers tempo_* crates architecture.
metadata:
  id: SKILL-89260
---

# Tempo Low-Level EVM Developer

Deep knowledge of the Tempo blockchain node implementation for advanced EVM and protocol-level development.

**Repository**: https://github.com/tempoxyz/tempo  
**Reference Commit**: `1642cbf8c058194f6e00a65cffecf44696bd8477`  
**Local Path**: `~/tempo/tempo`

---

## What is Tempo?

Tempo is a **payments-focused EVM blockchain** designed for high-throughput stablecoin transactions. Unlike general-purpose EVM chains, Tempo makes deliberate protocol-level trade-offs optimized for payment use cases:

### Design Philosophy

1. **Stablecoins as First-Class Citizens**: Gas is paid in USD stablecoins, not a volatile native token. The protocol includes an enshrined AMM to convert between user and validator fee preferences.

2. **Enshrined Token Standard**: TIP-20 tokens are implemented as precompiles, not smart contracts. This provides consistent behavior, lower gas costs, and enables deep protocol integration (payment lanes, fee tokens).

3. **Native Account Abstraction**: The Tempo Transaction type (0x76) provides WebAuthn/passkey authentication, batched calls, gas sponsorship, and scheduled payments without external bundlers or paymasters.

4. **Guaranteed Payment Throughput**: Dedicated "payment lanes" reserve blockspace for TIP-20 transfers. Payment transactions cannot be crowded out by DeFi activity or NFT mints.

5. **Sub-second Finality**: Simplex consensus (via Commonware) provides ~500ms block times with immediate finality. No reorgs, no confirmations to wait for.

### How Tempo Differs from Standard EVM

| Aspect | Ethereum/Standard EVM | Tempo |
|--------|----------------------|-------|
| Gas token | Native ETH | Any USD TIP-20 stablecoin |
| Token standard | ERC-20 contracts | TIP-20 precompiles |
| Account abstraction | ERC-4337 (external) | Native tx type 0x76 |
| Nonces | Single sequence | 2D nonces (parallelizable) |
| Block finality | ~12 min (probabilistic) | ~500ms (immediate) |
| Blockspace | Single gas pool | Payment lanes + general |
| Timestamps | Seconds | Milliseconds |

### Architecture Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      Simplex Consensus                       │
│                     (Commonware, ~500ms)                     │
├─────────────────────────────────────────────────────────────┤
│                      tempo-consensus                         │
│           (Gas limits, system tx validation)                 │
├─────────────────────────────────────────────────────────────┤
│                        tempo-evm                             │
│    (Block execution, payment lanes, sub-block assembly)      │
├─────────────────────────────────────────────────────────────┤
│                       tempo-revm                             │
│      (Modified EVM: fee tokens, batch calls, AA handler)     │
├─────────────────────────────────────────────────────────────┤
│                    tempo-precompiles                         │
│        (TIP-20, TIP-403, Fee Manager, Stablecoin DEX)        │
├─────────────────────────────────────────────────────────────┤
│                    tempo-primitives                          │
│     (Transaction types, headers, signatures, sub-blocks)     │
├─────────────────────────────────────────────────────────────┤
│                        Reth SDK                              │
│              (Networking, storage, RPC, sync)                │
└─────────────────────────────────────────────────────────────┘
```

### Transaction Lifecycle

1. **Submission**: User submits Tempo Transaction (0x76) with calls, fee token preference
2. **Pool Validation**: `tempo-transaction-pool` validates signatures (secp256k1/P256/WebAuthn), checks 2D nonces, verifies fee token balance and AMM liquidity
3. **Block Building**: Proposer orders transactions into lanes (proposer → sub-blocks → gas incentive → system)
4. **Fee Collection**: Pre-execution deducts max fee in user's token, reserves AMM liquidity
5. **Execution**: `tempo-revm` executes batched calls atomically, enforces TIP-403 policies
6. **Fee Settlement**: Post-execution refunds unused gas, swaps to validator's preferred token
7. **Finalization**: Simplex consensus finalizes block in ~500ms

---

# Tempo Protocol Specifications

## System Contract Addresses

| Contract | Address | Purpose |
|----------|---------|---------|
| **TIP-20 Factory** | `0x20fc000000000000000000000000000000000000` | Create new TIP-20 tokens |
| **pathUSD** | `0x20c0000000000000000000000000000000000000` | First stablecoin (token_id=0) |
| **TIP-20 Tokens** | `0x20c0000000000000000000000000000000{id}` | ERC-20 tokens at vanity addresses |
| **TIP-403 Registry** | `0x403c000000000000000000000000000000000000` | Transfer policy registry |
| **Fee Manager** | `0xfeec000000000000000000000000000000000000` | Fee payments and AMM |
| **Stablecoin DEX** | `0xdec0000000000000000000000000000000000000` | Enshrined orderbook exchange |
| **Account Keychain** | `0xAAAAAAAA00000000000000000000000000000000` | Access key management |
| **Nonce Manager** | `0x9099000000000000000000000000000000000000` | 2D nonce tracking |

---

## Tempo Transaction Specification (Type 0x76)

### Overview

The Tempo Transaction is a new EIP-2718 transaction type (`0x76` = 118) that replaces the need for external account abstraction infrastructure. It provides:

- **Multi-signature support**: secp256k1, P256 (NIST), and WebAuthn for passkey-based accounts
- **2D Nonces**: Each account has multiple independent nonce sequences, enabling parallel transaction submission
- **Batched Calls**: Multiple contract calls execute atomically in a single transaction
- **Gas Sponsorship**: Third parties can pay transaction fees with cryptographic commitment
- **Scheduled Execution**: Transactions specify validity windows (`valid_after`, `valid_before`)
- **Access Keys**: Scoped sub-keys with spending limits and expiration

### Transaction Fields

| Field | Type | Description |
|-------|------|-------------|
| `chain_id` | u64 | Network identifier |
| `nonce_key` | U256 | 2D nonce lane (0 = default, 1+ = parallel lanes) |
| `nonce` | u64 | Sequence number within lane |
| `max_priority_fee_per_gas` | u128 | Tip to validator |
| `max_fee_per_gas` | u128 | Maximum gas price (in USD per 10^18 gas) |
| `gas_limit` | u64 | Maximum gas for entire batch |
| `calls` | Vec<Call> | Ordered list of calls to execute |
| `access_list` | AccessList | EIP-2930 storage pre-warming |
| `fee_token` | Option<Address> | Override fee token preference |
| `fee_payer_signature` | Option<Signature> | Sponsor's secp256k1 signature |
| `valid_before` | Option<u64> | Transaction expires after (ms timestamp) |
| `valid_after` | Option<u64> | Transaction valid starting (ms timestamp) |
| `key_authorization` | Option<SignedKeyAuthorization> | Provision new access key |
| `tempo_authorization_list` | Vec<TempoSignedAuthorization> | EIP-7702 style delegations |

### Call Structure

Each call in the batch specifies:
- `call_type`: `Call` (0), `Create` (1), or `Create2` (2)
- `to`: Target address (None for Create)
- `value`: ETH to send (always 0 on Tempo)
- `input`: Calldata bytes

All calls execute atomically—if any reverts, the entire batch reverts.

### Signature Types

The protocol supports four signature schemes, detected by length and type prefix:

**secp256k1** (65 bytes, no prefix)
- Standard Ethereum ECDSA signature
- Used for EOAs and fee payer signatures
- Recovery: `ecrecover(hash, v, r, s)`

**P256** (130 bytes, prefix `0x01`)
- NIST P-256 curve for passkey compatibility
- Format: `0x01 || pre_hash_flag || r (32) || s (32) || pubkey_x (32) || pubkey_y (32)`
- If `pre_hash_flag` set, digest is `sha256(digest)` before verification

**WebAuthn** (129-2049 bytes, prefix `0x02`)
- Full WebAuthn assertion for browser passkeys
- Format: `0x02 || authenticatorData || clientDataJSON || r || s || pubkey_x || pubkey_y`
- Validates challenge matches tx hash, type is "webauthn.get"

**Keychain** (21+ bytes, prefix `0x03`)
- Delegated signature via AccountKeychain precompile
- Format: `0x03 || user_address (20) || inner_signature`
- Inner signature can be any primitive type

### 2D Nonce System

Traditional Ethereum uses a single nonce per account, forcing sequential transaction submission. Tempo introduces 2D nonces:

```
Account Nonce State:
├── Key 0: nonce = 5    (default lane)
├── Key 1: nonce = 12   (parallel lane)
├── Key 2: nonce = 3    (parallel lane)
└── Key N: nonce = 0    (unused)
```

- `nonce_key = 0`: Default lane, compatible with standard tooling
- `nonce_key > 0`: Parallel lanes for concurrent transaction submission
- Each lane maintains independent sequence; transactions in different lanes don't block each other
- Validators reserve `nonce_key` space with prefix `0x5b` for sub-block transactions

### Gas Sponsorship Protocol

Fee sponsorship uses dual signature domains to prevent replay attacks:

1. **Sender prepares transaction**: Sets `fee_payer_signature` to placeholder (`0x00`), leaves `fee_token` empty
2. **Sender signs with `0x76`**: Signs RLP without fee_token field
3. **Fee payer receives**: Verifies sender signature, chooses fee_token
4. **Fee payer signs with `0x78`**: Signs RLP with fee_token and sender_address
5. **Broadcast**: Transaction includes both signatures

The magic byte difference (`0x76` vs `0x78`) ensures sender and fee payer signatures cannot be swapped.

### RLP Encoding

```
Signed Transaction:
0x76 || rlp([
    chain_id,                    // u64
    nonce_key,                   // U256
    nonce,                       // u64
    max_priority_fee_per_gas,    // u128
    max_fee_per_gas,             // u128
    gas_limit,                   // u64
    [                            // calls
        [call_type, to, value, input],
        ...
    ],
    [                            // access_list
        [address, [storage_keys...]],
        ...
    ],
    fee_token,                   // address or 0x80 if None/sponsored
    fee_payer_signature,         // signature or 0x80/0x00
    valid_before,                // u64 or 0x80 if None
    valid_after,                 // u64 or 0x80 if None
    [                            // tempo_authorization_list
        [chain_id, address, nonce, address, signature],
        ...
    ],
    key_authorization,           // optional trailing field
    sender_signature             // TempoSignature bytes
])
```

### Access Keys (via AccountKeychain)

Access keys allow a root account to delegate limited signing authority:

```
KeyAuthorization {
    key_id: Address,           // Public key address
    expiry: Option<u64>,       // Expiration timestamp (ms)
    limits: Option<Vec<SpendingLimit>>,  // Per-token limits
}

SpendingLimit {
    token: Address,            // TIP-20 token
    amount: U256,              // Maximum spend
    period: u32,               // Reset period (seconds)
}
```

When a transaction is signed by an access key:
1. Protocol verifies key is authorized in AccountKeychain precompile
2. Spending limits are checked and decremented
3. If limits exceeded or key expired, transaction fails

### Implementation References

| Component | File |
|-----------|------|
| Transaction struct | [`crates/primitives/src/transaction/tempo_transaction.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives/src/transaction/tempo_transaction.rs) |
| Signature types | [`crates/primitives/src/transaction/signature.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives/src/transaction/signature.rs) |
| Call types | [`crates/primitives/src/transaction/call.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives/src/transaction/call.rs) |
| Nonce Manager | [`crates/precompiles/src/nonce_manager/`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/nonce_manager) |
| Account Keychain | [`crates/precompiles/src/account_keychain/`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/account_keychain) |

---

## TIP-20 Token Standard

### Overview

TIP-20 is Tempo's enshrined token standard, implemented as precompiles rather than smart contracts. This architectural choice provides:

- **Consistent behavior**: All TIP-20 tokens have identical semantics
- **Lower gas costs**: Precompile execution is cheaper than contract calls
- **Deep protocol integration**: Fee payments, payment lanes, DEX routing
- **Compliance infrastructure**: Built-in TIP-403 policy enforcement

### Key Differences from ERC-20

| Feature | ERC-20 | TIP-20 |
|---------|--------|--------|
| Implementation | Smart contract | Precompile |
| Decimals | Variable (usually 18) | Always 6 |
| Memo support | No | 32-byte memo on transfers |
| Transfer policies | Per-contract | Shared TIP-403 registry |
| Reward distribution | External | Built-in streaming |
| Quote token | N/A | Required for DEX pairing |
| Invalid recipient | Optional | Enforced (no TIP-20 addresses) |

### Token Address Derivation

TIP-20 tokens are deployed at deterministic vanity addresses:

```
Address = 0x20c0000000000000000000000000 || token_id (8 bytes)

Examples:
- pathUSD (id=0): 0x20c0000000000000000000000000000000000000
- Token 1:       0x20c0000000000000000000000000000000000001
- Token 255:     0x20c00000000000000000000000000000000000ff
```

The factory maintains a monotonic counter; each `createToken` call increments it.

### Token Creation

The factory's `createToken` function takes name, symbol, currency (e.g., "USD"), quote token address, and admin address. Returns the new token address and ID.

See [`crates/precompiles/src/tip20/factory.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/factory.rs) for the full interface.

Requirements:
- `quoteToken` must be existing TIP-20
- If `currency == "USD"`, `quoteToken` must also be USD-denominated
- No circular quote token chains

Defaults on creation:
- `transferPolicyId = 1` (always-allow)
- `supplyCap = type(uint128).max`
- `paused = false`
- `totalSupply = 0`

### Core Functions

TIP-20 implements the full ERC-20 interface (`balanceOf`, `transfer`, `transferFrom`, `approve`, `allowance`) plus Tempo extensions:

- **Memo variants**: `transferWithMemo`, `transferFromWithMemo`, `mintWithMemo`, `burnWithMemo` — attach 32-byte memo emitted in events
- **Admin functions**: `mint`, `burn`, `burnBlocked`, `pause`, `unpause`, `setSupplyCap`, `changeTransferPolicyId`
- **Reward functions**: `startReward`, `setRewardRecipient`, `claimRewards`

See [`crates/precompiles/src/tip20/token.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/token.rs) for the complete interface.

### Role System

TIP-20 uses a hierarchical role-based access control:

| Role | Permissions |
|------|-------------|
| `DEFAULT_ADMIN_ROLE` | Grant/revoke all roles, change policy, set supply cap |
| `ISSUER_ROLE` | Mint and burn tokens |
| `PAUSE_ROLE` | Pause token (halt all transfers) |
| `UNPAUSE_ROLE` | Unpause token |
| `BURN_BLOCKED_ROLE` | Burn from addresses blocked by TIP-403 policy |

Role management functions: `grantRole`, `revokeRole`, `renounceRole`, `setRoleAdmin`. See [`crates/precompiles/src/tip20/token.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/token.rs).

### Transfer Policy Enforcement

Every token operation that moves funds checks TIP-403 authorization for both sender and recipient via `TIP403_REGISTRY.isAuthorized(transferPolicyId, address)`. If either check fails, the transfer reverts with `PolicyForbids`.

Applied to: `transfer`, `transferFrom`, `transferWithMemo`, `transferFromWithMemo`, `mint`, `burn`, `mintWithMemo`, `burnWithMemo`, reward operations.

See [`crates/precompiles/src/tip20/token.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/token.rs) for the `transferAuthorized` modifier implementation.

### Invalid Recipient Protection

TIP-20 tokens cannot be sent to other TIP-20 contract addresses (those with `0x20c0...` prefix) or the zero address. This prevents accidental token loss by sending to token contracts. See the `validRecipient` modifier in [`crates/precompiles/src/tip20/token.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/token.rs).

### System Functions

Protocol-only functions for fee collection (callable only by `address(0)`):

- `systemTransferFrom(address from, address to, uint256 amount)` — Internal transfers
- `transferFeePreTx(address from, uint256 amount)` — Collect max fee before execution
- `transferFeePostTx(address to, uint256 amount)` — Refund after execution (works even when paused)

### Reward Distribution

TIP-20 includes built-in reward streaming for token holders:

- `startReward(uint256 amount, uint32 duration)` — Begin distributing `amount` over `duration` seconds
- `setRewardRecipient(address recipient)` — Redirect rewards to another address
- `claimRewards()` — Claim accumulated rewards
- `rewardInfo(address account) → (pendingRewards, rewardRecipient)`

Rewards are distributed proportionally to balance, with opt-in via `setRewardRecipient`.

### Invariants

1. `totalSupply()` always equals sum of all `balanceOf()`
2. `totalSupply() <= supplyCap`
3. When paused, no transfers succeed (except `transferFeePostTx` for refunds)
4. Tokens cannot be transferred to TIP-20 addresses
5. `systemTransferFrom`, `transferFeePreTx`, `transferFeePostTx` never change `totalSupply()`

### Implementation References

| Component | File |
|-----------|------|
| TIP-20 Token | [`crates/precompiles/src/tip20/token.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/token.rs) |
| TIP-20 Factory | [`crates/precompiles/src/tip20/factory.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/factory.rs) |
| Rewards | [`crates/precompiles/src/tip20/rewards.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/rewards.rs) |

---

## TIP-403 Policy Registry

### Overview

TIP-403 provides a **shared compliance infrastructure** for TIP-20 tokens. Instead of each token implementing its own access control, issuers create policies in a central registry that can be shared across multiple tokens.

This design enables:
- **Consistent enforcement**: Same policy applies to all tokens that reference it
- **Efficient updates**: Change one policy, all tokens immediately reflect it
- **Regulatory compliance**: Whitelist/blacklist for KYC/AML requirements

### Policy Types

**Whitelist Policy**
- Only addresses in the set can send/receive tokens
- Use case: KYC-verified users only

**Blacklist Policy**
- Addresses in the set are blocked; all others can transact
- Use case: OFAC sanctions list

### Built-in Policies

| Policy ID | Type | Behavior |
|-----------|------|----------|
| `0` | always-reject | All authorization checks return `false` |
| `1` | always-allow | All authorization checks return `true` (default) |
| `2+` | custom | User-created whitelist or blacklist |

New tokens default to policy ID 1 (always-allow).

### Policy Creation

Create policies via `createWhitelistPolicy(addresses[])` or `createBlacklistPolicy(addresses[])`. The caller becomes the policy admin. Returns the new `policyId`.

### Policy Management

Only the policy admin can modify policies:
- `modifyWhitelist(policyId, account, allowed)` — Add/remove from whitelist
- `modifyBlacklist(policyId, account, restricted)` — Add/remove from blacklist
- `setAdmin(policyId, newAdmin)` — Transfer admin rights

See [`crates/precompiles/src/tip403_registry/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip403_registry/mod.rs) for the full interface.

### Authorization Logic

The `isAuthorized(policyId, account)` function implements:
- Policy 0: Always returns `false` (reject all)
- Policy 1: Always returns `true` (allow all)
- Whitelist: Returns `true` if account is in the set
- Blacklist: Returns `true` if account is NOT in the set

See [`crates/precompiles/src/tip403_registry/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip403_registry/mod.rs) for implementation.

### Token Integration

Each TIP-20 token stores a `transferPolicyId` and checks authorization on every transfer. Token admins can change the policy via `changeTransferPolicyId(newPolicyId)`. See [`crates/precompiles/src/tip20/token.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip20/token.rs).

### DEX Integration

The Stablecoin DEX also checks TIP-403:
- Makers must be authorized for both base and quote tokens
- The DEX contract itself must be authorized (allows issuers to prevent DEX trading)
- `cancelStaleOrder` allows anyone to remove orders from blacklisted makers

### Implementation References

| Component | File |
|-----------|------|
| Registry | [`crates/precompiles/src/tip403_registry/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip403_registry/mod.rs) |

---

## Fee System

### Overview

Tempo eliminates the need for a volatile native token by allowing gas payments in any USD-denominated TIP-20 stablecoin. The protocol includes:

- **Fee token preferences**: Hierarchical system to determine which token a user pays in
- **Fee AMM**: Enshrined AMM to convert between user and validator preferred tokens
- **Fixed-rate swaps**: Eliminates MEV from fee conversion

### Fee Units

Gas prices are specified in **USD per 10^18 gas** to provide sufficient precision:

```
fee_in_tokens = ceil(base_fee_per_gas * gas_used / 10^12)
```

Since TIP-20 uses 6 decimals (not 18), dividing by 10^12 converts to token units.

### Fee Token Preference Hierarchy

The protocol checks preferences in order, using the first match:

1. **Transaction level**: `fee_token` field explicitly set in transaction
2. **Account level**: User called `FeeManager.setUserToken(token)`
3. **TIP-20 contract**: If tx calls `transfer`/`transferWithMemo`/`startReward` on a TIP-20, use that token
4. **DEX contract**: If tx calls `swapExactAmountIn`/`swapExactAmountOut`, use `tokenIn`
5. **Fallback**: pathUSD (`0x20c0000000000000000000000000000000000000`)

Validation at each level:
- Token must be TIP-20 with `currency == "USD"`
- User must have sufficient balance for `gas_limit * gas_price`
- Fee AMM must have sufficient liquidity for conversion

### Fee Payment Flow

**Pre-execution:**
1. Determine `fee_payer` (sender, or recovered from `fee_payer_signature`)
2. Determine `fee_token` via hierarchy
3. Calculate `max_fee = gas_limit * max_fee_per_gas`
4. Deduct `max_fee` from `fee_payer` via `transferFeePreTx`
5. If `fee_token != validator_token`, reserve AMM liquidity

**Post-execution:**
1. Calculate `actual_fee = gas_used * effective_gas_price`
2. Calculate `refund = max_fee - actual_fee`
3. Credit `refund` to `fee_payer` via `transferFeePostTx`
4. If tokens differ, execute fee swap immediately
5. Accumulate validator's fees for later distribution

### Fee AMM

The Fee AMM handles conversion between user and validator preferred tokens using two fixed-rate swap mechanisms:

**Fee Swap** (protocol only):
- Rate: 0.9970 (validator receives 0.997 tokens per 1 user token)
- Direction: user_token → validator_token
- Executes immediately during transaction settlement

**Rebalance Swap** (anyone):
- Rate: 0.9985 (swapper receives 1 user token per 0.9985 validator tokens)
- Direction: validator_token → user_token
- Arbitrageurs keep pools balanced

The 0.15bp spread between rates (0.9985 - 0.9970 = 0.0015) incentivizes liquidity provision.

### Liquidity Provision

Liquidity providers can:
- `mint(userToken, validatorToken, validatorAmount, to)` — Provide both tokens
- `mintSingle(userToken, validatorToken, validatorAmount, to)` — Single-sided with virtual rebalance
- `burn(userToken, validatorToken, liquidity, to)` — Remove liquidity

See [`crates/precompiles/src/tip_fee_manager/amm.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip_fee_manager/amm.rs) for the full AMM interface.

### Validator Preferences

Validators set their preferred fee token via `setValidatorToken(token)`. Query with `getValidatorToken(validator)`. Validators cannot change preference in blocks they propose (prevents manipulation).

### Fee Distribution

Fees accumulate in the FeeManager. Anyone can trigger distribution via `distributeFees(validator, token)`. Query pending fees with `pendingFees(validator, token)`.

See [`crates/precompiles/src/tip_fee_manager/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip_fee_manager/mod.rs) for the complete interface.

### MEV Resistance

The Fee AMM design minimizes MEV:
- **No probabilistic MEV**: Fixed rates prevent profitable backrunning
- **No sandwich attacks**: Fee swaps execute at known prices
- **Top-of-block auction**: Rebalance MEV is a single race, not ongoing spam

### Implementation References

| Component | File |
|-----------|------|
| Fee Manager | [`crates/precompiles/src/tip_fee_manager/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip_fee_manager/mod.rs) |
| Fee AMM | [`crates/precompiles/src/tip_fee_manager/amm.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/tip_fee_manager/amm.rs) |

---

## Stablecoin DEX

### Overview

Tempo includes an **enshrined orderbook exchange** for trading between stablecoins. Key design goals:

- **Price-time priority**: Fair ordering at each price level
- **Single routing path**: Each token pairs with exactly one quote token
- **Minimal MEV surface**: Deterministic execution, no AMM curves to manipulate
- **Flip orders**: Market-making with automatic order replacement

### Tick System

Prices are discretized into ticks for efficient orderbook management:

```
PRICE_SCALE = 100,000
TICK_SPACING = 10        // Orders must be on 10-tick grid (1 bp)
MIN_TICK = -2000         // -2% from par
MAX_TICK = 2000          // +2% from par

price = PRICE_SCALE + tick
```

Examples:
- `tick = 0` → price = 100,000 (1.00000, par)
- `tick = 100` → price = 100,100 (1.00100, +10 bps)
- `tick = -50` → price = 99,950 (0.99950, -5 bps)

### Quote Token Structure

Each TIP-20 token declares a `quoteToken` in its metadata. This enforces:

1. **Single pairing**: Token A only trades against its quote token
2. **Tree structure**: No circular dependencies
3. **Unique routing**: Exactly one path between any two tokens

```
pathUSD (no quote)
├── USDC (quotes pathUSD)
│   └── TokenX (quotes USDC)
├── USDT (quotes pathUSD)
└── EURC (quotes pathUSD, different currency)
```

To trade USDC ↔ USDT: USDC → pathUSD → USDT (2 hops)

### Order Types

**Limit Order**: `place(token, tick, amount, isBid)` — Places resting order at specified tick. Escrows funds from internal balance (or transfers shortfall). Bids escrow quote token; asks escrow base token. Returns `orderId`.

**Flip Order**: `placeFlip(token, tick, flipTick, amount, isBid)` — Like limit order, but when fully filled, creates new order on opposite side at `flipTick`. Uses only internal balance for the flip (no external transfer). If insufficient balance or policy forbids, flip silently fails. Constraints: `flipTick > tick` for bids, `flipTick < tick` for asks.

### Internal Balances

The DEX maintains per-user, per-token internal balances via `balance(token, account)` and `withdraw(token, amount)`. Order placement draws from internal balance first. Fills credit to internal balance. Users withdraw to receive TIP-20 tokens.

### Swap Execution

- `swapExactAmountIn(tokenIn, tokenOut, amountIn, minAmountOut)` — Sell exact input
- `swapExactAmountOut(tokenIn, tokenOut, amountOut, maxAmountIn)` — Buy exact output

Execution walks the orderbook FIFO at each tick. Multi-hop swaps through quote token graph execute atomically. The DEX permits crossed books (best bid > best ask) to support flip orders.

### Order Cancellation

- `cancel(orderId)` — Cancel own order
- `cancelStaleOrder(orderId)` — Cancel order from policy-blocked maker (anyone can call)

### Quoting

`quoteExactAmountIn` and `quoteExactAmountOut` simulate swaps without state changes.

See [`crates/precompiles/src/stablecoin_exchange/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/stablecoin_exchange/mod.rs) for the complete interface.

### TIP-403 Integration

- **Order placement**: Maker must be authorized for both base and quote tokens
- **DEX authorization**: The DEX contract address must be authorized (allows issuers to prevent trading)
- **Flip execution**: If maker becomes unauthorized, flip silently fails
- **Stale order removal**: `cancelStaleOrder` removes orders from blocked makers

### Implementation References

| Component | File |
|-----------|------|
| Exchange | [`crates/precompiles/src/stablecoin_exchange/mod.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/stablecoin_exchange/mod.rs) |
| Orderbook | [`crates/precompiles/src/stablecoin_exchange/orderbook.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/stablecoin_exchange/orderbook.rs) |

---

## Blockspace & Payment Lanes

### Overview

Tempo partitions blockspace to guarantee throughput for payment transactions. Unlike traditional blockchains where all transactions compete for the same gas pool, Tempo reserves capacity specifically for TIP-20 transfers.

### Gas Limit Structure

```
G = gas_limit                    // Total block gas (from header)
shared_gas_limit = G / 10        // 10% reserved for sub-blocks
general_gas_limit = (G - shared_gas_limit) / 2  // Non-payment cap in proposer lane
```

The `general_gas_limit` only constrains non-payment transactions in the proposer's section. Payment transactions can fill remaining capacity.

### Payment Transaction Classification

A transaction is classified as a "payment" if:

1. It's a Tempo Transaction (0x76) or legacy/EIP-1559
2. Contains exactly one call
3. Call is to a TIP-20 token address
4. Call is `transfer` or `transferWithMemo`
5. No contract creation

The `is_payment(tx)` function makes this determination statically (no state access needed).

### Block Validity Rules

A block is valid if:

```
Σ(gas_used for all txs) ≤ gas_limit

Σ(gas_used for non-payment txs in proposer section) ≤ general_gas_limit
```

Payment transactions in the proposer section don't count against `general_gas_limit`, ensuring they always have available capacity.

### Block Sections

| Section | Gas Budget | Content |
|---------|-----------|---------|
| Proposer | `f * G` (configurable) | Proposer's transactions |
| Sub-blocks | `(1-f) * G / n` per validator | Validator-contributed transactions |
| Gas Incentive | `Σ unreservedGas` from sub-blocks | Additional proposer transactions |
| System | N/A | Fee distribution, sub-block signatures |

### Implications for Users

- **Payment transactions**: Always have guaranteed capacity, predictable fees
- **Non-payment transactions**: May be delayed during congestion
- **No "noisy neighbor" problem**: DeFi spikes don't affect payment throughput

### Implementation References

| Component | File |
|-----------|------|
| Payment classification | [`crates/evm/src/is_payment.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/evm/src/is_payment.rs) |
| Block execution | [`crates/evm/src/block.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/evm/src/block.rs) |

---

## Sub-block Specification

### Overview

Sub-blocks allow **non-proposing validators** to contribute transactions to every block. This provides:

- **Low-latency inclusion**: Validators don't wait for their turn as proposer
- **Guaranteed blockspace**: Each validator has reserved capacity
- **Controlled ordering**: Validators order transactions within their sub-block

### Sub-block Structure

```
SubBlock {
    version: u8,                    // Currently 1
    parent_hash: B256,              // Links to parent block
    fee_recipient: Address,         // Where fees go
    transactions: Vec<Transaction>, // Ordered transaction list
    signature: Signature,           // Validator's signature
}
```

Signature covers: `keccak256(0x78 || rlp([version, parent_hash, fee_recipient, transactions]))`

### Validator Nonce Reservation

To prevent nonce conflicts, each validator has a reserved nonce key space:

```
nonce_key = (0x5b << 248) | (validatorPubKey120 << 128) | x
```

Where:
- `0x5b`: Magic prefix byte
- `validatorPubKey120`: Most significant 120 bits of validator's public key
- `x`: 128-bit counter (allows 2^128 parallel nonces per validator)

Transactions in sub-blocks MUST use this reserved nonce key space.

### Block Assembly

1. **Proposer section**: Proposer's own transactions using `f * G` gas
2. **Sub-block section**: Each validator's sub-block transactions, contiguous
3. **Gas incentive section**: Additional proposer transactions using unused sub-block gas
4. **System transaction**: Contains sub-block metadata (pubkeys, fee recipients, signatures)

### Gas Incentive Mechanism

Proposers are incentivized to include sub-blocks:

```
unreservedGas[i] = (1-f) * G / n - Σ(gasLimit of txs in sub-block[i])
gasIncentiveLimit = Σ unreservedGas[i] for all included sub-blocks
```

If a sub-block uses less than its allocation, the proposer can use the remainder.

### Sub-block Transaction Validity

Sub-block transactions have special validity rules:

- **Nonce key**: Must use validator's reserved prefix
- **Signature**: Must be root EOA key (no access keys)
- **Fee failure**: If fee payment fails (insufficient balance, AMM liquidity), transaction is valid but skipped (nonce still increments)

### Fee Accounting

- **Proposer section**: Fees to proposer's `fee_recipient`
- **Sub-block section**: Fees to sub-block's `fee_recipient`
- **Gas incentive section**: Fees to proposer's `fee_recipient`

All fees use the respective recipient's preferred token.

### Implementation References

| Component | File |
|-----------|------|
| SubBlock struct | [`crates/primitives/src/sub_block.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives/src/sub_block.rs) |
| Block assembly | [`crates/evm/src/block.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/evm/src/block.rs) |
| System transaction | [`crates/primitives/src/system_tx.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives/src/system_tx.rs) |

---

## Core Crates

| Crate | Path | Purpose |
|-------|------|---------|
| **tempo-node** | [`crates/node`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/node) | Node entry point, RPC extensions |
| **tempo-evm** | [`crates/evm`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/evm) | Block execution, EVM config |
| **tempo-revm** | [`crates/revm`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/revm) | Modified revm with fee token handler |
| **tempo-primitives** | [`crates/primitives`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives) | Core types (transactions, headers) |
| **tempo-consensus** | [`crates/consensus`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/consensus) | Consensus validation |
| **tempo-precompiles** | [`crates/precompiles`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles) | TIP-20, TIP-403, Fee Manager, DEX |
| **tempo-chainspec** | [`crates/chainspec`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/chainspec) | Chain config, hardforks |
| **tempo-transaction-pool** | [`crates/transaction-pool`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/transaction-pool) | Custom mempool with 2D nonces |

### Key Files

| Component | File |
|-----------|------|
| Node entry | [`crates/node/src/node.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/node/src/node.rs) |
| EVM config | [`crates/evm/src/lib.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/evm/src/lib.rs) |
| Block executor | [`crates/evm/src/block.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/evm/src/block.rs) |
| Handler | [`crates/revm/src/handler.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/revm/src/handler.rs) |
| Transaction types | [`crates/primitives/src/transaction/`](https://github.com/tempoxyz/tempo/tree/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/primitives/src/transaction) |
| Consensus | [`crates/consensus/src/lib.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/consensus/src/lib.rs) |
| Hardforks | [`crates/chainspec/src/hardfork.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/chainspec/src/hardfork.rs) |

### Hardforks

| Hardfork | Description |
|----------|-------------|
| **Adagio** | Baseline functionality |
| **Moderato** | Testnet features |
| **Allegretto** | AccountKeychain, fee changes |
| **AllegroModerato** | CreateX upgrade, system tx cleanup |

See [`crates/chainspec/src/hardfork.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/chainspec/src/hardfork.rs) for definitions.

---

## Development Commands

```bash
# Build
just build-all
cargo build --bin tempo

# Test
cargo nextest run
cargo nextest run -p tempo-precompiles

# Local network
just localnet

# Type check
cargo check --all-features

# Format
cargo fmt

# Lint
cargo clippy --all-features
```

## Adding a New Hardfork

1. Add variant to `TempoHardfork` enum in [`crates/chainspec/src/hardfork.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/chainspec/src/hardfork.rs)
2. Add `is_<name>()` method to `TempoHardfork`
3. Add `is_<name>_active_at_timestamp()` to `TempoHardforks` trait
4. Update `tempo_hardfork_at()` (check newest first)
5. Add field to `TempoGenesisInfo` in [`crates/chainspec/src/spec.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/chainspec/src/spec.rs)
6. Update genesis files

## Adding a New Precompile

1. Create module in `crates/precompiles/src/<name>/`
2. Define storage struct with `#[contract]` macro
3. Implement `Precompile` trait with `call` method
4. Register in `extend_tempo_precompiles()` in [`crates/precompiles/src/lib.rs`](https://github.com/tempoxyz/tempo/blob/1642cbf8c058194f6e00a65cffecf44696bd8477/crates/precompiles/src/lib.rs)
5. Add address constant to `tempo-contracts`
