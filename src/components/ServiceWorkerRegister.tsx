'use client'

import { useEffect } from 'react'
import { Workbox } from 'workbox-window'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            // Check if Cache API is broken in the main thread
      if ('caches' in window) {
        caches.keys().catch(err => {
          console.warn('Cache API is broken in the main thread:', err);
          // If Cache API is broken, we might want to unregister the SW to recover
          navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
              registration.unregister();
            }
          });
        });
      }

      const wb = new Workbox('/sw.js');

      wb.addEventListener('activated', (event) => {
        console.log('ServiceWorker activated');
      });

      wb.addEventListener('waiting', (event) => {
        // New version available
        if (confirm('Una nueva versión de CostPro está disponible. ¿Deseas actualizar?')) {
          wb.addEventListener('controlling', () => {
            window.location.reload();
          });
          wb.messageSkipWaiting();
        }
      });

      wb.register().catch(err => {
        console.error('ServiceWorker registration failed:', err);
      });
    }
  }, []);

  return null;
}
