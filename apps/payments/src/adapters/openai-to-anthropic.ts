/**
 * Adapter to convert OpenAI chat completions format to Anthropic Messages API format.
 * Allows clients using OpenAI-compatible API to use Anthropic models directly.
 */

interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant'
	content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

interface OpenAITool {
	type: 'function'
	function: {
		name: string
		description?: string
		parameters?: Record<string, unknown>
	}
}

interface OpenAIRequest {
	model: string
	messages: OpenAIMessage[]
	max_tokens?: number
	temperature?: number
	top_p?: number
	stream?: boolean
	stop?: string | string[]
	tools?: OpenAITool[]
	tool_choice?: string | { type: string; function?: { name: string } }
}

interface AnthropicMessage {
	role: 'user' | 'assistant'
	content: string | Array<{ type: string; text?: string; source?: unknown }>
}

interface AnthropicTool {
	name: string
	description?: string
	input_schema: Record<string, unknown>
}

interface AnthropicRequest {
	model: string
	messages: AnthropicMessage[]
	max_tokens: number
	system?: string
	temperature?: number
	top_p?: number
	stream?: boolean
	stop_sequences?: string[]
	tools?: AnthropicTool[]
	tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string }
}

interface AnthropicContentBlock {
	type: 'text' | 'tool_use'
	text?: string
	id?: string
	name?: string
	input?: Record<string, unknown>
}

interface AnthropicResponse {
	id: string
	type: string
	role: string
	content: AnthropicContentBlock[]
	model: string
	stop_reason: string | null
	usage: {
		input_tokens: number
		output_tokens: number
	}
}

interface OpenAIResponse {
	id: string
	object: string
	created: number
	model: string
	choices: Array<{
		index: number
		message: {
			role: string
			content: string | null
			tool_calls?: Array<{
				id: string
				type: 'function'
				function: {
					name: string
					arguments: string
				}
			}>
		}
		finish_reason: string | null
	}>
	usage: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}

/**
 * Map OpenAI model names to Anthropic model names.
 */
function mapModelName(openaiModel: string): string {
	// If already an Anthropic model name, use it directly
	if (openaiModel.startsWith('claude-')) {
		return openaiModel
	}

	// Map anthropic/xxx format (from OpenRouter-style naming)
	if (openaiModel.startsWith('anthropic/')) {
		const name = openaiModel.replace('anthropic/', '')
		// Map common names
		const modelMap: Record<string, string> = {
			'claude-sonnet-4': 'claude-sonnet-4-20250514',
			'claude-opus-4': 'claude-opus-4-20250514',
			'claude-opus-4.5': 'claude-opus-4-20250514',
			'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
			'claude-3-opus': 'claude-3-opus-20240229',
			'claude-3-sonnet': 'claude-3-sonnet-20240229',
			'claude-3-haiku': 'claude-3-haiku-20240307',
		}
		return modelMap[name] || name
	}

	// Default mapping for bare model names
	const modelMap: Record<string, string> = {
		'claude-sonnet-4': 'claude-sonnet-4-20250514',
		'claude-opus-4': 'claude-opus-4-20250514',
	}
	return modelMap[openaiModel] || openaiModel
}

/**
 * Convert OpenAI chat completions request to Anthropic Messages API request.
 */
export function convertRequestToAnthropic(openaiReq: OpenAIRequest): AnthropicRequest {
	const messages: AnthropicMessage[] = []
	let systemPrompt: string | undefined

	for (const msg of openaiReq.messages) {
		if (msg.role === 'system') {
			// Anthropic uses a separate system field
			if (typeof msg.content === 'string') {
				systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content}` : msg.content
			}
		} else {
			// Convert content format
			let content: string | Array<{ type: string; text?: string; source?: unknown }>
			if (typeof msg.content === 'string') {
				content = msg.content
			} else {
				// Convert OpenAI content blocks to Anthropic format
				content = msg.content.map((block) => {
					if (block.type === 'text') {
						return { type: 'text', text: block.text }
					}
					if (block.type === 'image_url' && block.image_url) {
						// Anthropic uses base64 or URL format
						const url = block.image_url.url
						if (url.startsWith('data:')) {
							// Parse data URL
							const match = url.match(/^data:([^;]+);base64,(.+)$/)
							if (match) {
								return {
									type: 'image',
									source: {
										type: 'base64',
										media_type: match[1],
										data: match[2],
									},
								}
							}
						}
						return {
							type: 'image',
							source: {
								type: 'url',
								url,
							},
						}
					}
					return block
				})
			}
			messages.push({
				role: msg.role as 'user' | 'assistant',
				content,
			})
		}
	}

	const anthropicReq: AnthropicRequest = {
		model: mapModelName(openaiReq.model),
		messages,
		max_tokens: openaiReq.max_tokens || 4096,
	}

	if (systemPrompt) {
		anthropicReq.system = systemPrompt
	}
	if (openaiReq.temperature !== undefined) {
		anthropicReq.temperature = openaiReq.temperature
	}
	if (openaiReq.top_p !== undefined) {
		anthropicReq.top_p = openaiReq.top_p
	}
	if (openaiReq.stream !== undefined) {
		anthropicReq.stream = openaiReq.stream
	}
	if (openaiReq.stop) {
		anthropicReq.stop_sequences = Array.isArray(openaiReq.stop) ? openaiReq.stop : [openaiReq.stop]
	}

	// Convert tools from OpenAI format to Anthropic format
	if (openaiReq.tools && openaiReq.tools.length > 0) {
		anthropicReq.tools = openaiReq.tools.map((tool) => ({
			name: tool.function.name,
			description: tool.function.description,
			input_schema: tool.function.parameters || { type: 'object', properties: {} },
		}))
	}

	// Convert tool_choice from OpenAI format to Anthropic format
	if (openaiReq.tool_choice !== undefined) {
		if (typeof openaiReq.tool_choice === 'string') {
			// OpenAI: "auto", "none", "required"
			// Anthropic: { type: "auto" | "any" | "tool" }
			switch (openaiReq.tool_choice) {
				case 'auto':
					anthropicReq.tool_choice = { type: 'auto' }
					break
				case 'required':
					anthropicReq.tool_choice = { type: 'any' }
					break
				case 'none':
					// Anthropic doesn't have "none" - just don't include tool_choice
					break
			}
		} else if (typeof openaiReq.tool_choice === 'object') {
			// OpenAI: { type: "function", function: { name: "xxx" } }
			// Anthropic: { type: "tool", name: "xxx" }
			if (openaiReq.tool_choice.type === 'function' && openaiReq.tool_choice.function?.name) {
				anthropicReq.tool_choice = {
					type: 'tool',
					name: openaiReq.tool_choice.function.name,
				}
			}
		}
	}

	return anthropicReq
}

interface OpenAIToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}

/**
 * Convert Anthropic Messages API response to OpenAI chat completions response.
 */
export function convertResponseToOpenAI(anthropicResp: AnthropicResponse): OpenAIResponse {
	// Extract text content from Anthropic response
	const textContent = anthropicResp.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text || '')
		.join('')

	// Extract tool calls from Anthropic response
	const toolCalls: OpenAIToolCall[] = anthropicResp.content
		.filter((block) => block.type === 'tool_use')
		.map((block) => ({
			id: block.id || `call_${Math.random().toString(36).slice(2)}`,
			type: 'function' as const,
			function: {
				name: block.name || '',
				arguments: JSON.stringify(block.input || {}),
			},
		}))

	// Map stop reason
	let finishReason: string | null = null
	switch (anthropicResp.stop_reason) {
		case 'end_turn':
			finishReason = 'stop'
			break
		case 'max_tokens':
			finishReason = 'length'
			break
		case 'stop_sequence':
			finishReason = 'stop'
			break
		case 'tool_use':
			finishReason = 'tool_calls'
			break
		default:
			finishReason = anthropicResp.stop_reason
	}

	// Build message object
	const message: {
		role: string
		content: string | null
		tool_calls?: OpenAIToolCall[]
	} = {
		role: 'assistant',
		content: textContent || null,
	}

	// Add tool_calls if present
	if (toolCalls.length > 0) {
		message.tool_calls = toolCalls
	}

	return {
		id: `chatcmpl-${anthropicResp.id}`,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		model: anthropicResp.model,
		choices: [
			{
				index: 0,
				message,
				finish_reason: finishReason,
			},
		],
		usage: {
			prompt_tokens: anthropicResp.usage.input_tokens,
			completion_tokens: anthropicResp.usage.output_tokens,
			total_tokens: anthropicResp.usage.input_tokens + anthropicResp.usage.output_tokens,
		},
	}
}

/**
 * Check if request is using OpenAI chat completions format.
 */
export function isOpenAIChatCompletionsPath(path: string): boolean {
	return path === '/v1/chat/completions' || path.endsWith('/v1/chat/completions')
}

/**
 * Convert Anthropic SSE stream to OpenAI SSE stream format.
 * Anthropic events: message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
 * OpenAI events: data: {"choices":[{"delta":{"content":"..."}}]}
 */
export function createStreamingTransformer(): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder()
	const decoder = new TextDecoder()
	let buffer = ''
	let messageId = ''
	let model = ''
	let currentToolCallIndex = -1
	let currentToolCallId = ''
	let currentToolCallName = ''
	let hasReceivedData = false

	return new TransformStream({
		transform(chunk, controller) {
			if (!hasReceivedData) {
				console.log('[streaming-transformer] First chunk received, size:', chunk.length)
			}
			hasReceivedData = true
			buffer += decoder.decode(chunk, { stream: true })

			// Process complete lines
			const lines = buffer.split('\n')
			buffer = lines.pop() || '' // Keep incomplete line in buffer

			for (const line of lines) {
				// Forward SSE comments as keepalives
				if (line.startsWith(':')) {
					controller.enqueue(encoder.encode(':\n\n'))
					continue
				}
				if (!line.startsWith('data: ')) continue
				const data = line.slice(6).trim()
				if (data === '[DONE]') {
					controller.enqueue(encoder.encode('data: [DONE]\n\n'))
					continue
				}

				try {
					const event = JSON.parse(data)

					// Handle different Anthropic event types
					switch (event.type) {
						case 'message_start': {
							messageId = event.message?.id || ''
							model = event.message?.model || ''
							// Send initial chunk
							const openaiChunk = {
								id: `chatcmpl-${messageId}`,
								object: 'chat.completion.chunk',
								created: Math.floor(Date.now() / 1000),
								model,
								choices: [
									{
										index: 0,
										delta: { role: 'assistant', content: '' },
										finish_reason: null,
									},
								],
							}
							controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`))
							break
						}

						case 'content_block_start': {
							if (event.content_block?.type === 'tool_use') {
								currentToolCallIndex++
								currentToolCallId = event.content_block.id || `call_${currentToolCallIndex}`
								currentToolCallName = event.content_block.name || ''
								// Send tool call start
								const toolChunk = {
									id: `chatcmpl-${messageId}`,
									object: 'chat.completion.chunk',
									created: Math.floor(Date.now() / 1000),
									model,
									choices: [
										{
											index: 0,
											delta: {
												tool_calls: [
													{
														index: currentToolCallIndex,
														id: currentToolCallId,
														type: 'function',
														function: { name: currentToolCallName, arguments: '' },
													},
												],
											},
											finish_reason: null,
										},
									],
								}
								controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`))
							}
							break
						}

						case 'content_block_delta': {
							if (event.delta?.type === 'text_delta') {
								const openaiChunk = {
									id: `chatcmpl-${messageId}`,
									object: 'chat.completion.chunk',
									created: Math.floor(Date.now() / 1000),
									model,
									choices: [
										{
											index: 0,
											delta: { content: event.delta.text || '' },
											finish_reason: null,
										},
									],
								}
								controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`))
							} else if (event.delta?.type === 'input_json_delta') {
								// Tool call argument streaming
								const toolChunk = {
									id: `chatcmpl-${messageId}`,
									object: 'chat.completion.chunk',
									created: Math.floor(Date.now() / 1000),
									model,
									choices: [
										{
											index: 0,
											delta: {
												tool_calls: [
													{
														index: currentToolCallIndex,
														function: { arguments: event.delta.partial_json || '' },
													},
												],
											},
											finish_reason: null,
										},
									],
								}
								controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`))
							}
							break
						}

						case 'message_delta': {
							// Map stop reason
							let finishReason: string | null = null
							switch (event.delta?.stop_reason) {
								case 'end_turn':
									finishReason = 'stop'
									break
								case 'max_tokens':
									finishReason = 'length'
									break
								case 'tool_use':
									finishReason = 'tool_calls'
									break
								default:
									finishReason = event.delta?.stop_reason || null
							}
							if (finishReason) {
								const openaiChunk = {
									id: `chatcmpl-${messageId}`,
									object: 'chat.completion.chunk',
									created: Math.floor(Date.now() / 1000),
									model,
									choices: [
										{
											index: 0,
											delta: {},
											finish_reason: finishReason,
										},
									],
								}
								controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`))
							}
							break
						}

						case 'message_stop': {
							controller.enqueue(encoder.encode('data: [DONE]\n\n'))
							break
						}

						case 'ping': {
							controller.enqueue(encoder.encode(':\n\n'))
							break
						}

						default: {
							controller.enqueue(encoder.encode(':\n\n'))
							break
						}
					}
				} catch (e) {
					console.error('[streaming-transformer] Parse error:', e, 'data:', data.slice(0, 200))
				}
			}
		},

		flush(_controller) {
			// Process any remaining buffer
			if (buffer.trim()) {
				// Ignore incomplete data
			}
		},
	})
}

/**
 * Check if the request body indicates streaming.
 */
export function isStreamingRequest(body: ArrayBuffer): boolean {
	try {
		const text = new TextDecoder().decode(body)
		const json = JSON.parse(text)
		return json.stream === true
	} catch {
		return false
	}
}
