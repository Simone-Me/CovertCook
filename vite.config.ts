import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CovertCook',
        short_name: 'CovertCook',
        description: 'Secret recipe briefs for your next dinner.',
        theme_color: '#E4572E',
        background_color: '#111111',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Recipe cards, shopping lists, and the dietary panel must work on
        // bad wifi at the flat (§10) — cache the API's GET responses so a
        // round already loaded once keeps rendering offline. Never cache
        // POST/RPC calls: those must fail loudly rather than serve stale
        // game state.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/rest/v1/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'covertcook-api-get',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
