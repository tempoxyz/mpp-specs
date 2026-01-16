import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

interface Env {
  DB: D1Database
  WEBHOOK_QUEUE: Queue
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Env }>()

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'payments' }))

// Process a transaction
app.post('/process/:id', async (c) => {
  const txId = c.req.param('id')
  
  // Get transaction
  const tx = await c.env.DB.prepare(`
    SELECT * FROM transactions WHERE id = ? AND status = 'pending'
  `).bind(txId).first()
  
  if (!tx) {
    throw new HTTPException(404, { message: 'Transaction not found or not pending' })
  }
  
  try {
    // Update to processing
    await c.env.DB.prepare(`
      UPDATE transactions SET status = 'processing', updated_at = datetime('now')
      WHERE id = ?
    `).bind(txId).run()
    
    // Simulate payment processing
    // In production, this would call actual payment rails
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Complete transaction
    const now = new Date().toISOString()
    await c.env.DB.prepare(`
      UPDATE transactions 
      SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, now, txId).run()
    
    // Queue webhook event
    await c.env.WEBHOOK_QUEUE.send({
      type: 'transaction.completed',
      transactionId: txId,
      timestamp: now
    })
    
    return c.json({ success: true, status: 'completed' })
  } catch (error) {
    // Mark as failed
    const now = new Date().toISOString()
    const reason = error instanceof Error ? error.message : 'Unknown error'
    
    await c.env.DB.prepare(`
      UPDATE transactions 
      SET status = 'failed', failed_at = ?, failure_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, reason, now, txId).run()
    
    // Queue failure webhook
    await c.env.WEBHOOK_QUEUE.send({
      type: 'transaction.failed',
      transactionId: txId,
      reason,
      timestamp: now
    })
    
    throw new HTTPException(500, { message: 'Payment processing failed' })
  }
})

// Cancel a transaction
app.post('/cancel/:id', async (c) => {
  const txId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const reason = (body as { reason?: string }).reason ?? 'Cancelled by request'
  
  const tx = await c.env.DB.prepare(`
    SELECT * FROM transactions WHERE id = ? AND status IN ('pending', 'processing')
  `).bind(txId).first()
  
  if (!tx) {
    throw new HTTPException(404, { message: 'Transaction not found or cannot be cancelled' })
  }
  
  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    UPDATE transactions 
    SET status = 'cancelled', failure_reason = ?, updated_at = ?
    WHERE id = ?
  `).bind(reason, now, txId).run()
  
  await c.env.WEBHOOK_QUEUE.send({
    type: 'transaction.cancelled',
    transactionId: txId,
    reason,
    timestamp: now
  })
  
  return c.json({ success: true, status: 'cancelled' })
})

export default app
