import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Forward REST calls to the AeroGrid Node server
        '/api': {
          target: `http://localhost:${env.SERVER_PORT || '4000'}`,
          changeOrigin: true,
        },
        // Forward WebSocket upgrades — clients connect to /ws on the same host
        '/ws': {
          target: `ws://localhost:${env.SERVER_PORT || '4000'}`,
          ws: true,
        },
      },
    },
  };
});
