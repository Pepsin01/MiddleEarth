import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In development the React app is served by Vite (port 5173) and talks to the
// API server (port 8787) through this proxy. In production the API server
// serves the built app itself, so there is only one port.
const api = `http://127.0.0.1:${process.env.API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/media': api,
      '/thumb': api,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
