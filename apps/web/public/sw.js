const CACHE = 'auleka-v3'
const PRECACHE = ['/isotipo.svg', '/favicon.svg']

// ── Install: pre-cachear iconos (NO el HTML — tiene hashes de Vite que cambian por build) ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

// ── Activate: limpiar caches viejos ──────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/')) return // nunca cachear API

  // Navegación (HTML): network-first → siempre recibe el index.html correcto
  // con los hashes actuales de Vite; cae al cache solo si no hay red.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()))
          return res
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/'))),
    )
    return
  }

  // Assets estáticos (JS/CSS/imágenes con hash): cache-first + cachear al vuelo
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()))
        return res
      })
    }),
  )
})

// ── Push: mostrar notificación ────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Auleka', body: 'Tienes una nueva notificación', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/isotipo.svg',
      badge: '/isotipo.svg',
      vibrate: [200, 100, 200],
      data: { url: data.url },
    }),
  )
})

// ── Notification click: abrir la app en la URL correcta ──────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) => c.url.includes(self.location.origin))
        if (existing) return existing.focus().then((w) => w.navigate(url))
        return clients.openWindow(url)
      }),
  )
})
