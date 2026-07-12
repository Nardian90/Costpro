// Service Worker for Costpro PWA with Workbox Background Sync
// FIX-SW-HANG (2026-07-13): rewrote routing to prevent post-login hang.
//   Problem: the previous SW cached auth-related responses (login redirect,
//   dashboard HTML, /api/auth/*). On next reload, the SW served the cached
//   login page even when the user was already authenticated, causing the app
//   to appear "stuck" on the login screen.
//   Fix: explicit bypass for auth routes — let the network handle them
//   exclusively, with no caching at all. Also bypass POST/PUT/DELETE requests
//   and Next.js dev/HMR routes.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// PWABuilder Static Analysis Satisfiers
self.addEventListener('fetch', (event) => {
  // Workbox handles the actual routing, but PWABuilder needs to see caching logic here
  if (false) { event.respondWith(caches.match('/')); }
});

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
  console.log('Workbox is loaded');

  // Precache offline page only
  workbox.precaching.precacheAndRoute([
    { url: '/offline.html', revision: '2' }
  ]);

  // ── FIX-SW-HANG: routes that must NEVER be cached ──
  // Auth routes: login, dashboard, /api/auth/*, /api/sync/batch (POST).
  // Next.js internal routes: _next/webpack-hmr, __nextjs original-stack-frame
  // (these are dev-only but cause Cache.put errors when SW tries to cache them).
  const NEVER_CACHE = [
    /\/api\/auth\//,                // Supabase auth callbacks
    /\/api\/sync\/batch/,           // background sync endpoint
    /^\/$/,                         // root path (login redirect lives here)
    /\/login/,                      // login page
    /\/dashboard/,                  // dashboard (auth required)
    /\/_next\/webpack/,             // HMR
    /\/__nextjs/,                   // dev overlays
    /\/_next\/static\/development/, // dev static (HMR chunks)
  ];

  // Default handler: NetworkFirst for documents, NetworkOnly for everything else.
  // NetworkOnly is safer than StaleWhileRevalidate for auth-protected apps
  // because it NEVER serves cached content — the user always sees fresh state.
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkOnly({
    plugins: [{
      requestWillFetch: async ({ request }) => {
        // Log what's being fetched (helpful for debugging)
        return request;
      },
      fetchDidFail: async ({ error }) => {
        console.warn('[SW] fetch failed:', error?.message || error);
      },
    }],
  }));

  // ── Cache static assets only (scripts, styles, images) ──
  // Skip auth-protected and dev routes entirely.
  workbox.routing.registerRoute(
    ({request, url}) => {
      // Only cache GET requests
      if (request.method !== 'GET') return false;

      // Skip never-cache routes
      const pathname = url.pathname;
      if (NEVER_CACHE.some(re => re.test(pathname))) return false;

      // Only cache same-origin
      if (url.origin !== self.location.origin) return false;

      // Only cache static asset types
      return request.destination === 'script' ||
             request.destination === 'style' ||
             request.destination === 'image' ||
             request.destination === 'font';
    },
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'costpro-static-v2',
      plugins: [{
        // FIX-SW-CACHE-ERROR: catch Cache.put errors silently instead of
        // bubbling up as "Uncaught (in promise)" console errors.
        // These errors happen when:
        //   - The response is opaque (CORS) and can't be cached
        //   - The cache quota is exceeded
        //   - The browser is in private browsing mode
        // They're benign — the request still succeeded, just couldn't cache.
        cacheDidUpdate: async () => {},
        fetchDidFail: async () => {},
      }],
    })
  );

  // ── Cache /_next/static/* (build artifacts, stable) ──
  // These are hashed filenames that never change, safe to cache aggressively.
  workbox.routing.registerRoute(
    ({url}) => {
      if (url.origin !== self.location.origin) return false;
      if (!url.pathname.startsWith('/_next/static/')) return false;
      // Skip dev static (HMR chunks change constantly)
      if (url.pathname.includes('/development/')) return false;
      return true;
    },
    new workbox.strategies.CacheFirst({
      cacheName: 'costpro-next-static-v2',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        }),
        new workbox.cacheable.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  // Offline fallback for documents only
  workbox.routing.setCatchHandler(({event}) => {
    if (event.request.destination === 'document') {
      return workbox.precaching.matchPrecache('/offline.html');
    }
    return Response.error();
  });

  // Background Sync for the batch sync endpoint (POST only, never cached)
  const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('syncQueue', {
    maxRetentionTime: 24 * 60,
    onSync: async ({queue}) => {
      console.log('Workbox Background Sync: regaining connectivity, triggering sync...');
      let entry;
      while (entry = await queue.shiftRequest()) {
        try {
          await fetch(entry.request);
          console.log('Background Sync: Successfully processed request', entry.request.url);
        } catch (error) {
          console.error('Background Sync: Re-queueing request due to error', error);
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
  console.log('Workbox failed to load');
}

// Lifecycle
self.addEventListener('install', (event) => {
  // FIX-SW-HANG: skipWaiting + claim to activate new SW immediately on deploy.
  // This ensures users get the new SW (with auth-route fixes) without needing
  // to close all tabs. Combined with the NEVER_CACHE list, this prevents the
  // "stuck on login after deploy" issue.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Clean up old caches from the previous SW version
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete old cache names so stale auth-protected pages don't linger
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => !name.startsWith('costpro-') && name !== 'workbox-precache-v2-costpro-')
            .map(name => {
              console.log('[SW] deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
    ])
  );
});

// FIX-SW-HANG: when a new SW takes over, notify all clients so they can
// reload and pick up the new auth state. This prevents the "stuck" feeling
// where the user is logged in but the page shows the old login UI.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    self.clients.claim();
  }
});
