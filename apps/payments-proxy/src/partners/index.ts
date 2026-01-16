import type { PartnerConfig } from '../config.js'
import { browserbase } from './browserbase.js'
import { openrouter } from './openrouter.js'

/**
 * All configured partners.
 * Add new partners here to make them available through the proxy.
 */
export const partners: PartnerConfig[] = [browserbase, openrouter]

/**
 * Get a partner by slug.
 */
export function getPartner(slug: string): PartnerConfig | undefined {
	return partners.find((p) => p.slug === slug)
}
