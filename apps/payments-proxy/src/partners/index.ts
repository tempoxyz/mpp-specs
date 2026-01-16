import type { PartnerConfig } from '../config.js'
import { browserbase } from './browserbase.js'
import { exa } from './exa.js'
import { openrouter } from './openrouter.js'
import { twitter } from './twitter.js'

export const partners: PartnerConfig[] = [browserbase, exa, openrouter, twitter]

export function getPartner(slug: string): PartnerConfig | undefined {
	return partners.find((p) => p.slug === slug)
}
