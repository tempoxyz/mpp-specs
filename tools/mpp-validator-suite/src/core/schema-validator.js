/**
 * MPP Schema & RFC Header Validator
 */

import { MPP_SPEC_CONFIG } from '../config.js';

export class MppSchemaValidator {
  /**
   * Validate an HTTP Header against MPP RFC specification
   */
  validateHeader(headerName, headerValue) {
    const spec = MPP_SPEC_CONFIG.coreHeaders.find(h => h.name.toLowerCase() === headerName.toLowerCase());
    if (!spec) {
      return { valid: false, error: `Unknown MPP header: ${headerName}` };
    }

    if (!headerValue || typeof headerValue !== 'string') {
      return { valid: false, error: 'Header value must be a non-empty string' };
    }

    const regex = new RegExp(spec.pattern);
    const matchesPattern = regex.test(headerValue.trim());

    if (!matchesPattern) {
      return {
        valid: false,
        error: `Header value does not conform to RFC pattern for ${spec.name}`,
        expectedFormat: spec.pattern,
      };
    }

    // Extract key-value parameters
    const params = {};
    const paramRegex = /([a-zA-Z0-9_-]+)="([^"]+)"/g;
    let match;
    while ((match = paramRegex.exec(headerValue)) !== null) {
      params[match[1]] = match[2];
    }

    return {
      valid: true,
      headerName: spec.name,
      type: spec.type,
      parameters: params,
    };
  }

  /**
   * Validate Intent Payload
   */
  validateIntent(intentType, payload) {
    const intentSpec = MPP_SPEC_CONFIG.intents.find(i => i.id === intentType);
    if (!intentSpec) {
      return { valid: false, error: `Unknown intent: ${intentType}` };
    }

    const missing = intentSpec.requiredFields.filter(f => !payload || payload[f] === undefined);
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required fields for ${intentSpec.name}: ${missing.join(', ')}`,
      };
    }

    return {
      valid: true,
      intentName: intentSpec.name,
      payload,
    };
  }
}

export const defaultSchemaValidator = new MppSchemaValidator();
