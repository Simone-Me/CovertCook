import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest, not generateSW: the worker needs a `push` listener and
      // a generated one has nowhere to put it. src/sw.ts reproduces everything
      // this config used to declare — precaching, skipWaiting/clientsClaim, and
      // the /rest/v1/ GET cache whose reasoning now lives beside the code that
      // implements it.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'CovertCook',
        short_name: 'CovertCook',
        description: 'Secret recipe briefs for your next dinner.',
        // The app's accent (--accent in tokens.css). This had drifted to an
        // orange nothing in the product uses.
        theme_color: '#C6202C',
        background_color: '#FFFCF6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,webp,svg,woff2}'],
      },
    }),
  ],
})
