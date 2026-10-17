import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { apiConnectionURL, devFrontendPort } from './shared/origins.js';

// Match server/config.js: shared server settings come from .env or the shell,
// not Vite-only mode files, and no server keys are exposed to the browser.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.HOST || '127.0.0.1',
    port: devFrontendPort(process.env),
    strictPort: true,
    proxy: { '/api': apiConnectionURL(process.env) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
