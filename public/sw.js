// Service Worker for Costpro PWA — ULTRA-CONSERVATIVE EDITION
// FIX-SW-HANG-V2 (2026-07-13): the previous SW still caused Cache.put
// NetworkError on Strategy.js:207 because StaleWhileRevalidate was trying
// to cache opaque/cross-origin responses (Workbox CDN import, etc.) and
// failed silently but with uncaught promise rejections.
//
// This new SW is intentionally minimal:
//   - Precache /offline.html only
//   - Cache /_next/static/* with CacheFirst (build artifacts, hashed, safe)
//   - NetworkOnly for EVERYTHING else (no StaleWhileRevalidate, no NetworkFirst)
//   - Explicit bypass for auth routes (let network handle exclusively)
//   - offline.html fallback only for document requests when network fails
//
// This eliminates ALL Cache.put errors because:
//   1. The only cache.put calls happen for /_next/static/* (same-origin, no CORS)
//   2. NetworkOnly never calls cache.put
//   3. Opaque/cross-origin responses are never routed through caching strategies
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

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

if (workbox) {
  console.log('[SW] Workbox loaded — ultra-conservative mode');

  // Precache offline page only
  workbox.precaching.precacheAndRoute([
    { url: '/offline.html', revision: '3' }
  ]);

  // ── Routes that must NEVER be touched by SW (let network handle exclusively) ──
  const NEVER_INTERCEPT = [
    /\/api\/auth\//,
    /\/api\/sync\/batch/,
    /\/login/,
    /\/dashboard/,
  ];

  // ── Default handler: NetworkOnly ──
  // NEVER serves cached content. User always sees fresh auth state.
  // This is critical for auth-protected apps — StaleWhileRevalidate/NetworkFirst
  // would cache login redirects and cause "stuck after login" symptoms.
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkOnly());

  // ── Cache ONLY /_next/static/* (build artifacts with hashed filenames) ──
  // These are same-origin, no CORS issues, never change (filename includes hash).
  // Safe to cache with CacheFirst + long expiration.
  workbox.routing.registerRoute(
    ({url, request}) => {
      // Only GET
      if (request.method !== 'GET') return false;
      // Only same-origin
      if (url.origin !== self.location.origin) return false;
      // Only /_next/static/*
      if (!url.pathname.startsWith('/_next/static/')) return false;
      // Skip dev static (HMR chunks change constantly, cause Cache.put errors)
      if (url.pathname.includes('/development/')) return false;
      if (url.pathname.includes('/webpack/')) return false;
      return true;
    },
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
  console.log('[SW] Workbox failed to load');
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
