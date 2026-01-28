'use client'

import { useEffect } from 'react'
import { Workbox } from 'workbox-window'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
