/**
 * Format currency amount from smallest unit to display string
 */
export function formatCurrency(amount: number, currency: string, locale = 'en-US'): string {
	const decimals = getCurrencyDecimals(currency)
	const displayAmount = amount / 10 ** decimals

	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: currency.toUpperCase(),
	}).format(displayAmount)
}

/**
 * Parse display amount to smallest unit
 */
export function parseCurrency(displayAmount: number, currency: string): number {
	const decimals = getCurrencyDecimals(currency)
	return Math.round(displayAmount * 10 ** decimals)
}

/**
 * Get decimal places for a currency
 */
function getCurrencyDecimals(currency: string): number {
	const upperCurrency = currency.toUpperCase()

	// Zero-decimal currencies
	const zeroDecimal = [
		'BIF',
		'CLP',
		'DJF',
		'GNF',
		'JPY',
		'KMF',
		'KRW',
		'MGA',
		'PYG',
		'RWF',
		'UGX',
		'VND',
		'VUV',
		'XAF',
		'XOF',
		'XPF',
	]

	if (zeroDecimal.includes(upperCurrency)) {
		return 0
	}

	// Three-decimal currencies
	const threeDecimal = ['BHD', 'JOD', 'KWD', 'OMR', 'TND']

	if (threeDecimal.includes(upperCurrency)) {
		return 3
	}

	// Default to 2 decimals
	return 2
}
