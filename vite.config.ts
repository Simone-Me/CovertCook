import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * What version is running, decided at build time.
 *
 * The number is `<major>.<commits since the 2.0 baseline>`: the major comes from
 * package.json and the second part is the commit count minus BASELINE, so every
 * commit on main is a new, ordered version and the footer answers "is this the
 * build with the fix in it?" at a glance. Plus the commit that produced it.
 *
 * THE COUNT HAS TO COME FROM FULL HISTORY. A shallow clone reports its own
 * depth instead, and the number would then go *down* between builds — so a
 * shallow checkout is deepened first, and if that is not possible the version
 * falls back to package.json's own semver rather than printing a wrong count.
 *
 * The sha comes from Netlify's COMMIT_REF when it is there, and from the local
 * repository otherwise. Neither is required: a build with no git and no CI
 * still ships, with just the number.
 */
const BASELINE = 167

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const fromCi = process.env.COMMIT_REF
  let sha = fromCi ? fromCi.slice(0, 7) : ''
  let version = `v${pkg.version}`
  try {
    if (git('rev-parse --is-shallow-repository') === 'true') {
      try {
        git('fetch --unshallow --quiet')
      } catch {
        // No remote to deepen from: keep the package version.
      }
    }
    if (git('rev-parse --is-shallow-repository') !== 'true') {
      const commits = Number(git('rev-list --count HEAD'))
      const major = String(pkg.version).split('.')[0]
      if (Number.isInteger(commits) && commits > BASELINE) version = `v${major}.${commits - BASELINE}`
    }
    if (!sha) sha = git('rev-parse --short HEAD')
  } catch {
    // Not a git checkout.
  }
  return sha ? `${version} · ${sha}` : version
}


/**
 * The install dialog's screenshots, discovered rather than listed.
 *
 * Every PNG in public/screenshots/ becomes a manifest entry, in filename order
 * (01-table.png, 02-brief.png, ...), with its real size read from the PNG
 * header. A hand-written list would name files that are not there yet and turn
 * the manifest into a warning; this one can only ever describe what ships.
 * Portrait shots are `narrow` (phones), landscape ones `wide` (desktop).
 */
function manifestScreenshots() {
  const dir = new URL('./public/screenshots/', import.meta.url)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
    .map((f) => {
      const head = readFileSync(new URL(f, dir))
      const w = head.readUInt32BE(16)
      const h = head.readUInt32BE(20)
      return {
        src: `screenshots/${f}`,
        sizes: `${w}x${h}`,
        type: 'image/png',
        form_factor: (h >= w ? 'narrow' : 'wide') as 'narrow' | 'wide',
        label: f.replace(/^\d+-/, '').replace(/\.png$/i, '').replace(/[-_]+/g, ' '),
      }
    })
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
      includeAssets: ['favicons/favicon-32.png', 'favicons/favicon-192.png', 'favicons/apple-touch-icon.png'],
      manifest: {
        // THE IDENTITY OF THE INSTALLED APP, and the one field here that is
        // expensive to add late. Without `id`, a browser derives the app's
        // identity from `start_url` — so the day `start_url` changes, every
        // phone that installed this treats the new manifest as a *different*
        // app: a second icon, an empty storage, and no way to migrate the
        // first. Pinned to '/' now, while it costs nothing, and never touched
        // again. It is deliberately not the same string as `start_url`
        // conceptually: `start_url` is where to open, `id` is who this is.
        id: '/',
        name: 'CovertCook',
        short_name: 'CovertCook',
        description: 'Secret recipe briefs for your next dinner.',
        // The app's accent (--accent in tokens.css). This had drifted to an
        // orange nothing in the product uses.
        theme_color: '#C6202C',
        background_color: '#FFFCF6',
        display: 'standalone',
        start_url: '/',
        // Everything on this origin belongs to the app. The SPA has no
        // external area to hand back to the browser, and `/legal/*` and
        // `/help` are pages a store reviewer opens *from inside the app*.
        scope: '/',
        // The default language of the listing, not of the user: i18next still
        // detects the browser and switches to French on its own.
        lang: 'en',
        dir: 'ltr',
        // Not 'portrait'. The album is photographs of a table, and the shared
        // menu is an image people turn the phone sideways to read — locking
        // the shell to portrait would fight the two screens most likely to be
        // passed around at the dinner itself.
        orientation: 'any',
        // From the W3C-registered set, not free text: anything outside it is
        // ignored rather than shown.
        categories: ['food', 'lifestyle', 'social'],
        // Held-icon shortcuts. A manifest shortcut is a fixed URL, so none can
        // name a dish or a dinner: /go/* picks the next dinner when tapped, and
        // the recipe book opens with its search box focused.
        shortcuts: [
          {
            name: 'Recipe to cook',
            short_name: 'My recipe',
            description: 'The recipe you were sent for the next dinner',
            url: '/go/recipe',
            icons: [{ src: 'pwa/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Dinner messages',
            short_name: 'Messages',
            description: 'The messages of the next dinner',
            url: '/go/messages',
            icons: [{ src: 'pwa/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Recipe book',
            short_name: 'Recipes',
            description: 'Search the recipes you kept',
            url: '/profile/recipes?search=1',
            icons: [{ src: 'pwa/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        screenshots: manifestScreenshots(),
        icons: [
          { src: 'pwa/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
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
        globIgnores: ['**/icons/allergy/*', '**/icons/diet/*', '**/screenshots/*'],
      },
    }),
  ],
})
