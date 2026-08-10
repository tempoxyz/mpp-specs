/**
 * MPP Specifications & Schema Definitions
 */

export const MPP_SPEC_CONFIG = {
  version: '1.0.0',
  standardName: 'Machine Payments Protocol RFC Draft',
  coreHeaders: [
    {
      name: 'WWW-Authenticate',
      type: 'Challenge',
      pattern: '^MPP\\s+([a-zA-Z0-9_-]+="[^"]+",?\\s*)+$',
      description: 'Returned on HTTP 402 with realm, invoice, amount, and currency.',
    },
    {
      name: 'Authorization',
      type: 'Credential / Proof',
      pattern: '^MPP-Proof\\s+([a-zA-Z0-9_-]+="[^"]+",?\\s*)+$',
      description: 'Sent by client with invoice proof, payer address, signature, and tx hash.',
    },
    {
      name: 'Payment-Receipt',
      type: 'Receipt',
      pattern: '^MPP-Receipt\\s+([a-zA-Z0-9_-]+="[^"]+",?\\s*)+$',
      description: 'Optional final receipt returned on HTTP 200 with settlement status.',
    },
  ],
  intents: [
    {
      id: 'intent_charge',
      name: 'Charge Intent',
      description: 'One-time immediate payment for a single request or digital asset.',
      requiredFields: ['amount', 'currency', 'recipient'],
    },
    {
      id: 'intent_stream',
      name: 'Streaming Intent',
      description: 'Continuous micropayments per unit of work (e.g. LLM token, video chunk, compute seconds).',
      requiredFields: ['ratePerUnit', 'unit', 'currency', 'channelId'],
    },
    {
      id: 'intent_session',
      name: 'Session Intent',
      description: 'Pre-authorized credit allowance for an interactive multi-step agent session.',
      requiredFields: ['maxBudget', 'currency', 'expiresAt', 'payer'],
    },
  ],
  methods: [
    { id: 'method_tempo', name: 'Tempo Sub-second Stream', network: 'Tempo Moderato (424242)' },
    { id: 'method_stripe', name: 'Stripe Machine Token', network: 'Stripe Connect / SPT' },
    { id: 'method_lightning', name: 'Lightning L402', network: 'Bitcoin Lightning' },
  ],
};
