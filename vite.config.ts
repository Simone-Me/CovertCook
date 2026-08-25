import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * What version is running, decided at build time.
 *
 * NOT a commit count. `git rev-list --count HEAD` is the obvious idea and it
 * lies on every CI: Netlify clones shallow, so the count is the clone depth
 * rather than the history, and it can go *down* between builds. A semver from
 * package.json plus the commit that produced the build is stable everywhere
 * and answers the only question a version in a footer is ever asked — "is what
 * I am looking at the build with the fix in it?".
 *
 * The sha comes from Netlify's COMMIT_REF when it is there, and from the local
 * repository otherwise. Neither is required: a build with no git and no CI
 * still ships, with just the number.
 */
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const fromCi = process.env.COMMIT_REF
  let sha = fromCi ? fromCi.slice(0, 7) : ''
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      sha = ''
    }
  }
  return sha ? `v${pkg.version} · ${sha}` : `v${pkg.version}`
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
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
        // The allergen and diet tiles are 25 files and ~294 KB — a third of
        // the app, for two screens somebody sees once when they sign up and
        // rarely again. Precaching is for what has to work on bad wifi at the
        // flat: the recipe card, the shopping list, the dietary panel. These
        // are fetched when the grid opens and then cached at runtime (src/sw.ts),
        // which costs one load and nothing afterwards.
        globIgnores: ['**/allergy/*', '**/diet/*'],
      },
    }),
  ],
})
