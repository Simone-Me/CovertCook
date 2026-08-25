/// <reference lib="webworker" />
//
// The service worker, now written by hand.
//
// It used to be generated: `generateSW` produced the whole thing from the
// options in vite.config.ts, which is the right choice right up until the app
// needs a `push` listener — and a generated worker has nowhere to put one.
// Everything that mode did is reproduced here on purpose, so switching to
// `injectManifest` did not quietly drop it:
//
//   * precaching of the built assets (`self.__WB_MANIFEST`, injected at build)
//   * `registerType: 'autoUpdate'` — skipWaiting + clientsClaim below
//   * the runtime cache for `/rest/v1/` GETs, NetworkFirst, 200 entries,
//     seven days: recipe cards and shopping lists have to survive bad wifi at
//     the flat, and POST/RPC calls must still fail loudly rather than serve
//     stale game state.
//
// What is new is the bottom half: showing a notification, and deciding what a
// tap on it opens.

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, type PrecacheEntry } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// `__WB_MANIFEST` is a build-time placeholder the plugin replaces with the
// precache list, not part of ServiceWorkerGlobalScope. It type-checks today
// through ambient types, which is a thing to depend on rather than to state —
// so it is stated.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[]
}

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url, request }) => url.pathname.startsWith('/rest/v1/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'covertcook-api-get',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  }),
)

// The allergen and diet tiles, kept out of the precache (vite.config.ts) because
// they are a third of the app for a screen seen at sign-up. CacheFirst rather
// than NetworkFirst: an icon of a peanut does not change, so once it is on the
// device there is no reason to ask about it again.
registerRoute(
  ({ url }) => url.pathname.startsWith('/allergy/') || url.pathname.startsWith('/diet/'),
  new CacheFirst({
    cacheName: 'covertcook-food-icons',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 })],
  }),
)

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  // A push with an unreadable body still has to become a notification: on
  // every browser that implements the API, `userVisibleOnly` is not a
  // suggestion — showing nothing is what gets a site's push permission
  // revoked wholesale. So a parse failure falls back to a generic line rather
  // than returning early.
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = {}
  }

  const title = payload.title ?? 'CovertCook'
  const options: NotificationOptions = {
    body: payload.body ?? '',
    icon: '/pwa-192x192.png',
    badge: '/favicon-192.png',
    // One tag per round-and-kind, so a second push about the same moment
    // replaces the first instead of stacking. Nobody needs to be told twice
    // that voting opened.
    tag: payload.tag ?? 'covertcook',
    data: { url: payload.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  // Focus the tab that is already open before opening another. Somebody with
  // the dinner already on screen should be taken to it, not given a second
  // copy of the app.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
