// Service Worker for Costpro PWA
const CACHE_NAME = 'costpro-v1';

self.addEventListener('install', (event) => {
  console.log('Costpro Service Worker installed');
});

self.addEventListener('activate', (event) => {
  console.log('Costpro Service Worker activated');
});

self.addEventListener('fetch', (event) => {
  // Basic fetch handler to satisfy PWA requirements
  event.respondWith(fetch(event.request));
});
