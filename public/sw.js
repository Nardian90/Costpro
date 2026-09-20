// Service Worker for Costpro PWA — ULTRA-CONSERVATIVE + LOCAL-VENDOR EDITION
//
// FIX-SW-VENDOR (2026-09-20): Workbox ahora se carga desde /workbox/ (mismo
// origen, archivos vendidos en public/workbox/). El importScripts anterior
// apuntaba al CDN de Google (storage.googleapis.com) y en entornos sin acceso
// externo (preview embedido) la evaluación del SW fallaba POR COMPLETO:
// sin offline, sin background sync, y unhandledRejection en cada carga.
// Además se añade un fallback vanilla por si algún día los archivos locales
// no pudieran cargarse: el SW sigue ofreciendo offline.html + caché estático.
//
// FIX-SW-HANG-V2 (2026-07-13): (histórico) el SW anterior causaba Cache.put
// NetworkError porque StaleWhileRevalidate intentaba cachear respuestas
// opaque/cross-origin. Este SW es deliberadamente mínimo:
//   - Precache /offline.html only
//   - Cache /_next/static/* con CacheFirst (artefactos con hash, seguros)
//   - NetworkOnly para TODO lo demás (sin StaleWhileRevalidate ni NetworkFirst)
//   - Bypass explícito para rutas de auth (solo red)
//   - offline.html como fallback solo para documentos cuando la red falla

// ── Carga de Workbox vendido localmente (mismo origen, sin CDN externo) ──
// Orden obligatorio: core primero, el resto depende de él en runtime.
// Nombres según el loader oficial: workbox-<pkg>.prod.js
let workboxAvailable = false;
try {
  importScripts(
    '/workbox/workbox-core.prod.js',
    '/workbox/workbox-precaching.prod.js',
    '/workbox/workbox-routing.prod.js',
    '/workbox/workbox-strategies.prod.js',
    '/workbox/workbox-expiration.prod.js',
    '/workbox/workbox-cacheable-response.prod.js',
    '/workbox/workbox-background-sync.prod.js'
  );
  workboxAvailable = typeof self.workbox !== 'undefined';
} catch (err) {
  console.warn('[SW] Workbox local no pudo cargarse, usando fallback vanilla:', err);
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(Promise.resolve());
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('CostPro', { body: 'New update' })
  );
});

// ── Rutas que el SW NUNCA debe interceptar (solo red, sin caché) ──
const NEVER_INTERCEPT = [
  /\/api\/auth\//,
  /\/api\/sync\/batch/,
  /\/login/,
  /\/dashboard/,
];

const isCacheableStaticAsset = (url, request) => {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/_next/static/')) return false;
  // Dev static (chunks HMR cambian constantemente → errores de Cache.put)
  if (url.pathname.includes('/development/')) return false;
  if (url.pathname.includes('/webpack/')) return false;
  return true;
};

if (workboxAvailable) {
  console.log('[SW] Workbox local cargado — ultra-conservative mode');

  // Precache offline page only
  workbox.precaching.precacheAndRoute([
    { url: '/offline.html', revision: '3' }
  ]);

  // ── Default handler: NetworkOnly ──
  // NEVER serves cached content. User always sees fresh auth state.
  // This is critical for auth-protected apps — StaleWhileRevalidate/NetworkFirst
  // would cache login redirects and cause "stuck after login" symptoms.
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkOnly());

  // ── Cache ONLY /_next/static/* (build artifacts with hashed filenames) ──
  // These are same-origin, no CORS issues, never change (filename includes hash).
  // Safe to cache with CacheFirst + long expiration.
  workbox.routing.registerRoute(
    ({url, request}) => isCacheableStaticAsset(url, request),
    new workbox.strategies.CacheFirst({
      cacheName: 'costpro-next-static-v3',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days (shorter to be safe)
        }),
        new workbox.cacheable.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  // ── Offline fallback for documents only ──
  workbox.routing.setCatchHandler(({event}) => {
    if (event.request.destination === 'document') {
      return workbox.precaching.matchPrecache('/offline.html');
    }
    return Response.error();
  });

  // Background Sync for /api/sync/batch (POST, never cached)
  const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('syncQueue', {
    maxRetentionTime: 24 * 60,
    onSync: async ({queue}) => {
      console.log('[SW] Background Sync: regaining connectivity...');
      let entry;
      while (entry = await queue.shiftRequest()) {
        try {
          await fetch(entry.request);
        } catch (error) {
          await queue.unshiftRequest(entry);
          throw error;
        }
      }
    }
  });

  workbox.routing.registerRoute(
    /\/api\/sync\/batch/,
    new workbox.strategies.NetworkOnly({
      plugins: [bgSyncPlugin]
    }),
    'POST'
  );

} else {
  // ─────────────────────────────────────────────────────────────
  // FALLBACK VANILLA (solo si Workbox no pudo cargarse).
  // Preserva lo esencial: offline.html para documentos + caché de
  // /_next/static/* + passthrough de red para todo lo demás.
  // En este modo degradado NO hay cola de background sync (la app
  // mantiene su propio pending-sync en IndexedDB/localStorage).
  // ─────────────────────────────────────────────────────────────
  console.warn('[SW] Modo fallback vanilla activo (sin Workbox)');

  const STATIC_CACHE = 'costpro-next-static-v3';

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(STATIC_CACHE)
        .then(cache => cache.add('/offline.html').catch(() => {}))
    );
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return; // POST (incl. sync/batch) → red directa

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (NEVER_INTERCEPT.some(re => re.test(url.pathname))) return; // bypass total

    if (isCacheableStaticAsset(url, request)) {
      // Cache-first manual para estáticos con hash
      event.respondWith(
        caches.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response && (response.status === 200 || response.status === 0)) {
              const clone = response.clone();
              caches.open(STATIC_CACHE)
                .then(cache => cache.put(request, clone))
                .catch(() => {}); // nunca romper por un fallo de caché
            }
            return response;
          });
        })
      );
      return;
    }

    if (request.destination === 'document') {
      // Network-first para documentos, offline.html si la red falla
      event.respondWith(
        fetch(request).catch(() =>
          caches.match('/offline.html').then(r => r || Response.error())
        )
      );
    }
    // Resto → sin respondWith (red directa por defecto)
  });
}

// Lifecycle
self.addEventListener('install', (event) => {
  // skipWaiting: new SW takes over immediately on next reload
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // claim: control all clients immediately
  // Delete ALL old caches (v1, v2, workbox-precache-v2-costpro-, etc.)
  // so stale auth-protected pages don't linger
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== 'costpro-next-static-v3')
            .map(name => {
              console.log('[SW] deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
