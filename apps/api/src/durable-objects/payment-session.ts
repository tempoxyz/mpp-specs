import { DurableObject } from 'cloudflare:workers'

interface SessionState {
  transactionId: string
  status: 'pending' | 'authorized' | 'completed' | 'failed'
  amount: number
  currency: string
  createdAt: string
  expiresAt: string
}

export class PaymentSession extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    switch (request.method) {
      case 'POST':
        return this.createSession(request)
      case 'GET':
        return this.getSession()
      case 'PUT':
        return this.updateSession(request)
      case 'DELETE':
        return this.deleteSession()
      default:
        return new Response('Method not allowed', { status: 405 })
    }
  }
  
  private async createSession(request: Request): Promise<Response> {
    const body = await request.json() as Partial<SessionState>
    
    const session: SessionState = {
      transactionId: body.transactionId ?? crypto.randomUUID(),
      status: 'pending',
      amount: body.amount ?? 0,
      currency: body.currency ?? 'USD',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
    }
    
    await this.ctx.storage.put('session', session)
    
    // Set alarm to expire session
    await this.ctx.storage.setAlarm(Date.now() + 30 * 60 * 1000)
    
    return Response.json(session, { status: 201 })
  }
  
  private async getSession(): Promise<Response> {
    const session = await this.ctx.storage.get<SessionState>('session')
    
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }
    
    return Response.json(session)
  }
  
  private async updateSession(request: Request): Promise<Response> {
    const session = await this.ctx.storage.get<SessionState>('session')
    
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }
    
    const updates = await request.json() as Partial<SessionState>
    const updatedSession = { ...session, ...updates }
    
    await this.ctx.storage.put('session', updatedSession)
    
    return Response.json(updatedSession)
  }
  
  private async deleteSession(): Promise<Response> {
    await this.ctx.storage.deleteAll()
    return new Response(null, { status: 204 })
  }
  
  async alarm(): Promise<void> {
    // Clean up expired session
    await this.ctx.storage.deleteAll()
  }
}
