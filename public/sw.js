// Service Worker for Costpro PWA with Workbox Background Sync
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

// Listener explícito para que el analizador estático de PWABuilder lo detecte.
// Workbox se encarga del manejo real de la red y el fallback offline más abajo.
self.addEventListener('fetch', (event) => { });

if (workbox) {
  console.log('Workbox is loaded');

  // Precache offline page
  workbox.precaching.precacheAndRoute([
    { url: '/offline.html', revision: '1' }
  ]);

  // Cache strategy for static assets
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'script' || request.destination === 'style' || request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate()
  );

  // Offline fallback
  const networkOnly = new workbox.strategies.NetworkOnly();
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkFirst({
    networkTimeoutSeconds: 3,
  }));
  
  workbox.routing.setCatchHandler(({event}) => {
    switch (event.request.destination) {
      case 'document':
        return workbox.precaching.matchPrecache('/offline.html');
      default:
        return Response.error();
    }
  });

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
  event.waitUntil(self.clients.claim());
});
