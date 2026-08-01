import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { devApi } from './scripts/dev-api.js';

export default defineConfig(({ mode }) => {
  // Third arg '' loads every var, not just VITE_ prefixed ones. These are handed
  // to the dev API plugin and nothing else - they are never passed to `define`,
  // so AZURE_KEY cannot end up in the client bundle.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), devApi(env)],
    server: {
      // host:true so bootcamp devices on the same wifi can open the dev server by LAN IP
      host: true,
      port: 5173,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
    },
  };
});
