import { DurableObject } from 'cloudflare:workers'

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitState {
  count: number
  windowStart: number
}

export class RateLimiter extends DurableObject {
  private config: RateLimitConfig = {
    maxRequests: 100,
    windowMs: 60_000 // 1 minute
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const key = url.searchParams.get('key') ?? 'default'
    
    if (request.method === 'POST') {
      return this.checkLimit(key)
    }
    
    if (request.method === 'GET') {
      return this.getStatus(key)
    }
    
    return new Response('Method not allowed', { status: 405 })
  }
  
  private async checkLimit(key: string): Promise<Response> {
    const now = Date.now()
    const state = await this.ctx.storage.get<RateLimitState>(key)
    
    // Start new window if none exists or window expired
    if (!state || now - state.windowStart >= this.config.windowMs) {
      const newState: RateLimitState = {
        count: 1,
        windowStart: now
      }
      await this.ctx.storage.put(key, newState)
      
      // Set alarm to clean up after window expires
      await this.ctx.storage.setAlarm(now + this.config.windowMs)
      
      return Response.json({
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetAt: new Date(now + this.config.windowMs).toISOString()
      })
    }
    
    // Check if limit exceeded
    if (state.count >= this.config.maxRequests) {
      const resetAt = state.windowStart + this.config.windowMs
      return Response.json({
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetAt).toISOString(),
        retryAfter: Math.ceil((resetAt - now) / 1000)
      }, {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((resetAt - now) / 1000))
        }
      })
    }
    
    // Increment counter
    const updatedState: RateLimitState = {
      count: state.count + 1,
      windowStart: state.windowStart
    }
    await this.ctx.storage.put(key, updatedState)
    
    return Response.json({
      allowed: true,
      remaining: this.config.maxRequests - updatedState.count,
      resetAt: new Date(state.windowStart + this.config.windowMs).toISOString()
    })
  }
  
  private async getStatus(key: string): Promise<Response> {
    const state = await this.ctx.storage.get<RateLimitState>(key)
    
    if (!state) {
      return Response.json({
        count: 0,
        remaining: this.config.maxRequests,
        windowStart: null
      })
    }
    
    return Response.json({
      count: state.count,
      remaining: Math.max(0, this.config.maxRequests - state.count),
      windowStart: new Date(state.windowStart).toISOString(),
      resetAt: new Date(state.windowStart + this.config.windowMs).toISOString()
    })
  }
  
  async alarm(): Promise<void> {
    // Clean up expired rate limit windows
    const keys = await this.ctx.storage.list()
    const now = Date.now()
    
    for (const [key, value] of keys) {
      const state = value as RateLimitState
      if (now - state.windowStart >= this.config.windowMs) {
        await this.ctx.storage.delete(key)
      }
    }
  }
}
