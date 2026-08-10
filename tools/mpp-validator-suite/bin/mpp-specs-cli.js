#!/usr/bin/env node

/**
 * MPP Specs CLI - Specification & Schema Toolkit
 */

import { defaultSchemaValidator } from '../src/core/schema-validator.js';
import { defaultSpecGenerator } from '../src/core/spec-generator.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command.toLowerCase()) {
    case 'validate': {
      const headerName = args[1] || 'WWW-Authenticate';
      const headerVal = args[2] || defaultSpecGenerator.generateChallengeHeader();
      console.log(`\n🔍 Validating Header '${headerName}':`);
      console.log(`  Value: ${headerVal}`);
      const res = defaultSchemaValidator.validateHeader(headerName, headerVal);
      console.log('  Validation Result:', res);
      console.log('');
      break;
    }

    case 'gen': {
      const type = args[1] || 'challenge';
      console.log(`\n📜 Generating Sample RFC '${type}' Header...`);
      if (type === 'challenge') console.log(`  WWW-Authenticate: ${defaultSpecGenerator.generateChallengeHeader()}\n`);
      else if (type === 'proof') console.log(`  Authorization: ${defaultSpecGenerator.generateProofHeader()}\n`);
      else if (type === 'receipt') console.log(`  Payment-Receipt: ${defaultSpecGenerator.generateReceiptHeader()}\n`);
      break;
    }

    case 'studio': {
      console.log('\n🌐 Launching MPP Specification Inspector Studio on :3408...');
      await import('../src/server/studio.js');
      break;
    }

    default: {
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║               📜 MPP SPECIFICATION & SCHEMA CLI                 ║
║      RFC Header Validator & Intent Schema Inspector Suite        ║
╚══════════════════════════════════════════════════════════════════╝

Commands:
  mpp-specs-cli validate [headerName] [value]  Validate HTTP header against RFC
  mpp-specs-cli gen [challenge|proof|receipt]  Generate sample RFC compliant header
  mpp-specs-cli studio                         Launch Web Studio on :3408
      `);
      break;
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
