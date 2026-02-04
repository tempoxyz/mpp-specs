import type { PartnerConfig } from '../config.js'
import { anthropic } from './anthropic.js'
import { browserbase } from './browserbase.js'
import { exa } from './exa.js'
import { fal } from './fal.js'
import { firecrawl } from './firecrawl.js'
import { modal } from './modal.js'
import { openai } from './openai.js'
import { openrouter } from './openrouter.js'
import { storage } from './storage.js'
import { temporpc } from './tempo-rpc.js'
import { twitter } from './twitter.js'

export const partners: PartnerConfig[] = [
	anthropic,
	browserbase,
	exa,
	fal,
	firecrawl,
	modal,
	openai,
	openrouter,
	storage,
	temporpc,
	twitter,
]

/**
 * Get a partner by slug or alias.
 */
export function getPartner(slug: string): PartnerConfig | undefined {
	return partners.find((p) => p.slug === slug || p.aliases?.includes(slug))
}
