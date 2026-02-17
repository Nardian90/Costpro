// Service Worker for Costpro PWA with Workbox Background Sync
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

let isCacheBroken = false;

if (workbox) {
  console.log('Workbox is loaded');

  // Cache strategy for static assets
  const staticStrategy = new workbox.strategies.StaleWhileRevalidate({
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
      }),
    ],
  });

  // Global catch handler for any failures
  workbox.routing.setCatchHandler(({ event }) => {
    console.error('SW: Catch handler triggered - potential cache or network failure', event);
    if (event.request.destination === 'script' || event.request.destination === 'style' || event.request.mode === 'navigate') {
       return fetch(event.request);
    }
    return Response.error();
  });

  workbox.routing.registerRoute(
    ({request}) => request.destination === 'script' || request.destination === 'style',
    async (args) => {
      if (isCacheBroken) return fetch(args.request);

      try {
        // Defensive check: if caches object is completely broken, fallback immediately
        if (typeof caches === 'undefined') return fetch(args.request);

        const response = await staticStrategy.handle(args);
        if (response) return response;

        console.warn('SW: Strategy returned no response, falling back to network', args.request.url);
        return fetch(args.request);
      } catch (error) {
        console.error('SW: Strategy error, falling back to network', error);

        // If it is a critical CacheStorage error, we mark it as broken to avoid future attempts
        if (error.name === 'DOMException' && (error.message.includes('internal error') || error.message.includes('Unexpected'))) {
          isCacheBroken = true;
          console.error('SW: Critical CacheStorage error detected. Disabling cache for this session.');
        }

        return fetch(args.request);
      }
    }
  );

  // Background Sync for the batch sync endpoint
  const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('syncQueue', {
    maxRetentionTime: 24 * 60, // Retry for max 24 Hours
    onSync: async ({queue}) => {
      // This is called when the browser regains connectivity
      console.log('Workbox Background Sync: regains connectivity, triggering sync...');
      // We could manually trigger the sync here, but our useSync hook
      // already listens for 'online' events.
      // Workbox will retry failed requests automatically.
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

// Error reporting
self.addEventListener('error', (event) => {
  console.error('SW: Global error', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('SW: Unhandled rejection', event.reason);
});

// Basic lifecycle
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.clients.claim();

        // Defensive cache cleanup
        if (typeof caches !== 'undefined') {
          // Wrap each cache operation in its own try-catch to prevent a single failure
          // from blocking the entire activation process.
          try {
            await caches.delete('static-resources');
          } catch (e) {
            console.warn('SW: Failed to delete static-resources cache', e);
          }

          try {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames.map(async (cacheName) => {
                if (cacheName.includes('workbox-') && !cacheName.includes('7.0.0')) {
                  console.log('SW: Cleaning up old Workbox cache:', cacheName);
                  try {
                    await caches.delete(cacheName);
                  } catch (e) {
                    console.warn(`SW: Failed to delete old cache ${cacheName}`, e);
                  }
                }
              })
            );
          } catch (e) {
            console.warn('SW: Failed to get cache keys or cleanup old caches', e);
          }
        }
      } catch (err) {
        console.error('SW: Activation logic failed', err);
      }
    })()
  );
});
