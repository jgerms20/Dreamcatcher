// DreamCatcher service worker — cache-first for built static assets so a
// repeat open is near-instant (and works offline). Deliberately simple:
// bump CACHE_VERSION whenever a deploy should invalidate old assets.
const CACHE_VERSION = 'dreamcatcher-v1'

// Hosts we must never cache — live AI calls have to hit the network.
const NEVER_CACHE_HOSTS = ['api.anthropic.com', 'fal.run', 'rest.alpha.fal.ai', 'queue.fal.run']

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Never intercept cross-origin API traffic (Anthropic / fal.ai) — those
  // must always be live, and must never end up in a cache.
  if (NEVER_CACHE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return
  }
  // Only handle same-origin requests (the app shell + its built assets).
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION)
      const cached = await cache.match(request)
      if (cached) return cached

      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    })(),
  )
})
