import type { PartnerConfig } from '../config.js'
import { browserbase } from './browserbase.js'
import { exa } from './exa.js'
import { firecrawl } from './firecrawl.js'
import { openrouter } from './openrouter.js'
import { twitter } from './twitter.js'

export const partners: PartnerConfig[] = [browserbase, exa, firecrawl, openrouter, twitter]

/**
 * Get a partner by slug or alias.
 */
export function getPartner(slug: string): PartnerConfig | undefined {
	return partners.find((p) => p.slug === slug || p.aliases?.includes(slug))
}
