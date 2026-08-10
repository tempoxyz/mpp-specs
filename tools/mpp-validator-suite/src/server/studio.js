/**
 * MPP Specification Inspector & Schema Validator Web Server
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MPP_SPEC_CONFIG } from '../config.js';
import { defaultSchemaValidator } from '../core/schema-validator.js';
import { defaultSpecGenerator } from '../core/spec-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.join(__dirname, '../../web');

const app = express();
const PORT = process.env.PORT || 3408;

app.use(cors());
app.use(express.json());
app.use(express.static(WEB_ROOT));

// 1. Get Specifications
app.get('/api/specs', (req, res) => {
  res.json(MPP_SPEC_CONFIG);
});

// 2. Validate Header
app.post('/api/validate/header', (req, res) => {
  const { headerName, headerValue } = req.body;
  const result = defaultSchemaValidator.validateHeader(headerName, headerValue);
  res.json(result);
});

// 3. Validate Intent Payload
app.post('/api/validate/intent', (req, res) => {
  const { intentType, payload } = req.body;
  const result = defaultSchemaValidator.validateIntent(intentType, payload);
  res.json(result);
});

// 4. Generate Sample Header
app.post('/api/generate/header', (req, res) => {
  const { type, realm, amount, currency } = req.body;
  let header;
  if (type === 'challenge') header = defaultSpecGenerator.generateChallengeHeader(realm, amount, currency);
  else if (type === 'proof') header = defaultSpecGenerator.generateProofHeader();
  else if (type === 'receipt') header = defaultSpecGenerator.generateReceiptHeader();
  else header = defaultSpecGenerator.generateChallengeHeader();

  res.json({ success: true, header });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`📜 MPP Specification Validator Studio Running!`);
    console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
    console.log(`📑 Standards: Machine Payments Protocol RFC Drafts`);
    console.log(`======================================================\n`);
  });
}

export default app;
