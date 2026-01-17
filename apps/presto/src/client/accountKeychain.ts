/**
 * Account Keychain Precompile
 * Manages Access Keys for Tempo accounts
 * @see https://docs.tempo.xyz/protocol/transactions/AccountKeychain
 */

/** Account Keychain precompile address */
export const ACCOUNT_KEYCHAIN_ADDRESS = '0xaAAAaaAA00000000000000000000000000000000' as const

/** Signature types supported by Access Keys */
export enum SignatureType {
	Secp256k1 = 0,
	P256 = 1,
	WebAuthn = 2,
}

/** Token spending limit structure */
export interface TokenLimit {
	token: `0x${string}`
	amount: bigint
}

/** Key information structure */
export interface KeyInfo {
	signatureType: SignatureType
	keyId: `0x${string}`
	expiry: bigint
	enforceLimits: boolean
	isRevoked: boolean
}

/** Account Keychain ABI for wagmi */
export const accountKeychainAbi = [
	// Events
	{
		type: 'event',
		name: 'KeyAuthorized',
		inputs: [
			{ name: 'account', type: 'address', indexed: true },
			{ name: 'publicKey', type: 'address', indexed: true },
			{ name: 'signatureType', type: 'uint8', indexed: false },
			{ name: 'expiry', type: 'uint64', indexed: false },
		],
	},
	{
		type: 'event',
		name: 'KeyRevoked',
		inputs: [
			{ name: 'account', type: 'address', indexed: true },
			{ name: 'publicKey', type: 'address', indexed: true },
		],
	},
	{
		type: 'event',
		name: 'SpendingLimitUpdated',
		inputs: [
			{ name: 'account', type: 'address', indexed: true },
			{ name: 'publicKey', type: 'address', indexed: true },
			{ name: 'token', type: 'address', indexed: true },
			{ name: 'newLimit', type: 'uint256', indexed: false },
		],
	},
	// Errors
	{ type: 'error', name: 'KeyAlreadyExists', inputs: [] },
	{ type: 'error', name: 'KeyNotFound', inputs: [] },
	{ type: 'error', name: 'KeyInactive', inputs: [] },
	{ type: 'error', name: 'KeyExpired', inputs: [] },
	{ type: 'error', name: 'KeyAlreadyRevoked', inputs: [] },
	{ type: 'error', name: 'SpendingLimitExceeded', inputs: [] },
	{ type: 'error', name: 'InvalidSignatureType', inputs: [] },
	{ type: 'error', name: 'ZeroPublicKey', inputs: [] },
	{ type: 'error', name: 'UnauthorizedCaller', inputs: [] },
	// Management Functions
	{
		type: 'function',
		name: 'authorizeKey',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'keyId', type: 'address' },
			{ name: 'signatureType', type: 'uint8' },
			{ name: 'expiry', type: 'uint64' },
			{ name: 'enforceLimits', type: 'bool' },
			{
				name: 'limits',
				type: 'tuple[]',
				components: [
					{ name: 'token', type: 'address' },
					{ name: 'amount', type: 'uint256' },
				],
			},
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'revokeKey',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'keyId', type: 'address' }],
		outputs: [],
	},
	{
		type: 'function',
		name: 'updateSpendingLimit',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'keyId', type: 'address' },
			{ name: 'token', type: 'address' },
			{ name: 'newLimit', type: 'uint256' },
		],
		outputs: [],
	},
	// View Functions
	{
		type: 'function',
		name: 'getKey',
		stateMutability: 'view',
		inputs: [
			{ name: 'account', type: 'address' },
			{ name: 'keyId', type: 'address' },
		],
		outputs: [
			{
				name: '',
				type: 'tuple',
				components: [
					{ name: 'signatureType', type: 'uint8' },
					{ name: 'keyId', type: 'address' },
					{ name: 'expiry', type: 'uint64' },
					{ name: 'enforceLimits', type: 'bool' },
					{ name: 'isRevoked', type: 'bool' },
				],
			},
		],
	},
	{
		type: 'function',
		name: 'getRemainingLimit',
		stateMutability: 'view',
		inputs: [
			{ name: 'account', type: 'address' },
			{ name: 'keyId', type: 'address' },
			{ name: 'token', type: 'address' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'getTransactionKey',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'address' }],
	},
] as const
