// Service Worker for Costpro PWA with Workbox Background Sync
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

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

  workbox.routing.registerRoute(
    ({request}) => request.destination === 'script' || request.destination === 'style',
    async (args) => {
      try {
        return await staticStrategy.handle(args);
      } catch (error) {
        console.error('SW: Strategy error, falling back to network', error);
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

// Basic lifecycle
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clear specific caches known to cause issues if corrupted
      caches.delete('static-resources'),
      // Also clear old workbox caches if they are very old
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.includes('workbox-') && !cacheName.includes('7.0.0')) {
               console.log('SW: Cleaning up old Workbox cache:', cacheName);
               return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});
