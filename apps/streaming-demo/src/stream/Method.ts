import { Method } from 'mpay'
import { tempoStreamIntent } from './Intents.js'

/**
 * Tempo method with stream intent for use with Method.toClient() and Method.toServer().
 */
export const tempoMethod = Method.from({
	name: 'tempo',
	intents: {
		stream: tempoStreamIntent,
	},
})
