/**
 * Spec Generator Tests
 */

import { defaultSpecGenerator } from '../src/core/spec-generator.js';

async function runGeneratorTests() {
  console.log('Testing MPP Spec Generator...');

  const rcpt = defaultSpecGenerator.generateReceiptHeader();
  if (!rcpt.startsWith('MPP-Receipt') || !rcpt.includes('status="settled"')) {
    throw new Error('Receipt generation failed');
  }

  console.log('✅ Spec Generator Tests Passed!');
}

runGeneratorTests().catch(e => {
  console.error('❌ Generator Test Failed:', e);
  process.exit(1);
});
