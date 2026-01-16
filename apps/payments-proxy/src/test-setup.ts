// Test setup file for payments-proxy
// This file can be used for global test configuration, mocks, etc.

import { beforeEach } from "vitest";
import { resetAllMocks } from "./mocks.js";

// Reset mocks before each test
beforeEach(() => {
  resetAllMocks();
});
