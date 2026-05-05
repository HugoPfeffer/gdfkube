import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Playwright e2e specs are owned by `npm run e2e`; vitest must not
    // try to load them — they call `test()` outside a Playwright runner.
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
});
