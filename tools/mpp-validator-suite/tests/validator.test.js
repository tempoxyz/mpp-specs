/**
 * MPP Schema Validator Tests
 */

import { defaultSchemaValidator } from '../src/core/schema-validator.js';
import { defaultSpecGenerator } from '../src/core/spec-generator.js';

async function runValidatorTests() {
  console.log('Testing MPP Header & Intent Validator...');

  // 1. Challenge header
  const ch = defaultSpecGenerator.generateChallengeHeader();
  const chRes = defaultSchemaValidator.validateHeader('WWW-Authenticate', ch);
  if (!chRes.valid || !chRes.parameters.invoice) {
    throw new Error('Challenge validation failed');
  }

  // 2. Proof header
  const proof = defaultSpecGenerator.generateProofHeader();
  const proofRes = defaultSchemaValidator.validateHeader('Authorization', proof);
  if (!proofRes.valid || !proofRes.parameters.sig) {
    throw new Error('Proof validation failed');
  }

  // 3. Intent validation
  const intentRes = defaultSchemaValidator.validateIntent('intent_charge', {
    amount: '0.005',
    currency: 'USD',
    recipient: '0x123',
  });
  if (!intentRes.valid) {
    throw new Error('Intent validation failed');
  }

  console.log('✅ MPP Header & Intent Validator Tests Passed!');
}

runValidatorTests().catch(e => {
  console.error('❌ Validator Test Failed:', e);
  process.exit(1);
});
