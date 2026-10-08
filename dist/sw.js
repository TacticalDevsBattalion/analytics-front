const CONFIG_URL = '/config/frontend/pwa.json'
let configPromise

function getConfig() {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`PWA config ${response.status}`)
        return response.json()
      })
  }
  return configPromise
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    getConfig().then((config) =>
      caches.open(config.cache.name).then((cache) => cache.addAll(config.cache.app_shell)),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    getConfig().then((config) =>
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== config.cache.name)
            .map((key) => caches.delete(key)),
        ),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    getConfig().then((config) => {
      if (config.cache.bypass_prefixes.some((prefix) => url.pathname.startsWith(prefix))) {
        return fetch(request)
      }

      if (request.mode === 'navigate') {
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(config.cache.name).then((cache) => cache.put('/index.html', copy))
            }
            return response
          })
          .catch(() => caches.match('/index.html'))
      }

      const cacheable =
        config.cache.asset_prefixes.some((prefix) => url.pathname.startsWith(prefix)) ||
        url.pathname === config.cache.manifest_path ||
        url.pathname === CONFIG_URL

      if (!cacheable) return fetch(request)

      return caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(config.cache.name).then((cache) => cache.put(request, copy))
            }
            return response
          })
          .catch(() => cached)

        return cached || network
      })
    }),
  )
})
