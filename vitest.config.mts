import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    // Route handlers and lib code run on the server, not in a browser.
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
