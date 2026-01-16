import { z } from 'zod'

/**
 * Common validation schemas
 */

export const CurrencySchema = z.string().length(3).toUpperCase()

export const AmountSchema = z.number().int().positive()

export const IdSchema = z.string().regex(/^(tx|ak|acct|wh|evt)_[a-f0-9]{24}$/)

export const TransactionIdSchema = z.string().regex(/^tx_[a-f0-9]{24}$/)

export const AccountIdSchema = z.string().regex(/^acct_[a-f0-9]{24}$/)

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional()
})

export const DateRangeSchema = z.object({
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional()
})

export const MetadataSchema = z.record(z.string()).optional()
