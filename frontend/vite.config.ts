/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * MapLibre v6 runs tile parsing in a module worker. Serve its prebuilt worker
 * files as static assets so neither dev transforms nor bundling touch them.
 */
function maplibreWorker(): Plugin {
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'maplibre-worker',
    buildStart() {
      const out = fileURLToPath(new URL('./public/vendor/maplibre', import.meta.url))
      mkdirSync(out, { recursive: true })
      for (const f of files) {
        copyFileSync(fileURLToPath(new URL(`./node_modules/maplibre-gl/dist/${f}`, import.meta.url)), `${out}/${f}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    maplibreWorker(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TruckRoute — Weather-aware truck routing',
        short_name: 'TruckRoute',
        description: 'Pick the safest truck route for the weather, load and departure time.',
        theme_color: '#0d0f11',
        background_color: '#0d0f11',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/radar\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Basemap style, sprites and glyphs: needed for any map (and route layers) to render offline.
            urlPattern: ({ url }) =>
              url.hostname === 'tiles.openfreemap.org' && /\/(styles|sprites|fonts)\//.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'basemap-style', expiration: { maxEntries: 400, maxAgeSeconds: 30 * 86400 } },
          },
          {
            // Vector tiles the driver has already looked at. Kept well under OpenFreeMap's offline caps.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'basemap-tiles',
              expiration: { maxEntries: 1500, maxAgeSeconds: 7 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Last trip's heatmap and alerts, so the slider still works offline.
            urlPattern: ({ url }) => /^\/api\/plans\/[^/]+\/(heatmap|alerts)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'trip-data',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 20, maxAgeSeconds: 2 * 86400 },
            },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/radar': {
        target: 'https://mesonet.agron.iastate.edu',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/radar/, '/cache/tile.py/1.0.0/nexrad-n0q-900913'),
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('maplibre-gl')) return 'maplibre'
          if (id.includes('@deck.gl') || id.includes('@luma.gl') || id.includes('@math.gl')) return 'deck'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
