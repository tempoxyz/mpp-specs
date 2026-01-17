/**
 * Durable Objects for Cloudflare-native payment channel management.
 *
 * Architecture:
 * - PaymentChannel DO: One instance per channelId, maintains atomic state
 * - Worker routes voucher verification to the correct DO instance
 * - D1 provides queryable index of channels
 * - Queue handles async settlement batching
 */

export { PaymentChannel } from './PaymentChannel.js'
