// Service Worker for Costpro PWA
const CACHE_NAME = `costpro-v${new Date().getTime()}`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
  console.log('Costpro Service Worker installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  console.log('Costpro Service Worker activated');
});

self.addEventListener('fetch', (event) => {
  // Basic fetch handler to satisfy PWA requirements
  event.respondWith(fetch(event.request));
});
