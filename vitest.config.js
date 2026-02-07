import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use Node environment for main-process module tests
    environment: 'node',
    // Test file patterns
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
    // Timeout per test (ms)
    testTimeout: 10000,
    // Reporter
    reporters: ['verbose'],
  },
});
