import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, normalizePath} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';

const cesiumSource = normalizePath(path.join(__dirname, 'node_modules/cesium/Build/Cesium'));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {src: `${cesiumSource}/Workers/**/*`, dest: 'cesiumStatic/Workers', rename: {stripBase: 5}},
          {src: `${cesiumSource}/ThirdParty/**/*`, dest: 'cesiumStatic/ThirdParty', rename: {stripBase: 5}},
          {src: `${cesiumSource}/Assets/**/*`, dest: 'cesiumStatic/Assets', rename: {stripBase: 5}},
          {src: `${cesiumSource}/Widgets/**/*`, dest: 'cesiumStatic/Widgets', rename: {stripBase: 5}},
        ],
      }),
    ],
    define: {
      CESIUM_BASE_URL: JSON.stringify('/cesiumStatic'),
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
        '/api': {
          target: `http://localhost:${env.SERVER_PORT || '4000'}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('cesium') || id.includes('@cesium')) return 'cesium';
            if (id.includes('deck.gl') || id.includes('@deck.gl')) return 'deckgl';
            if (id.includes('maplibre-gl') || id.includes('react-map-gl')) return 'map';
            return 'vendor';
          },
        },
      },
    },
  };
});
