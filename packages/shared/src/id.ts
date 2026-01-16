export type IdPrefix =
	| 'tx' // Transaction
	| 'ak' // Access Key
	| 'acct' // Account
	| 'wh' // Webhook
	| 'evt' // Event

/**
 * Generate a prefixed ID
 */
export function generateId(prefix: IdPrefix): string {
	const uuid = crypto.randomUUID().replace(/-/g, '')
	return `${prefix}_${uuid.slice(0, 24)}`
}

/**
 * Parse a prefixed ID
 */
export function parseId(id: string): { prefix: IdPrefix; value: string } | null {
	const match = id.match(/^(tx|ak|acct|wh|evt)_([a-f0-9]{24})$/)
	if (!match) return null

	const prefix = match[1]
	const value = match[2]

	if (prefix === undefined || value === undefined) return null

	return {
		prefix: prefix as IdPrefix,
		value,
	}
}

/**
 * Validate ID format
 */
export function isValidId(id: string, expectedPrefix?: IdPrefix): boolean {
	const parsed = parseId(id)
	if (!parsed) return false
	if (expectedPrefix && parsed.prefix !== expectedPrefix) return false
	return true
}
