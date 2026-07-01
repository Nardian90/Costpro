'use client';
import { logger } from '@/lib/logger';

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Check if sw.js exists before attempting registration
      fetch('/sw.js', { method: 'HEAD' })
        .then((res) => {
          if (res.ok) {
            import('workbox-window').then(({ Workbox }) => {
              const wb = new Workbox('/sw.js');
              wb.addEventListener('activated', () => {
                logger.info('DATABASE', 'SERVICEWORKER_ACTIVATED')
              });
              wb.register().catch((err: Error) => {
                logger.warn('DATABASE', 'SERVICEWORKER_REGISTRATION_FAILED:', { data: err.message })
              });
            });
          }
        })
        .catch(() => {
          // sw.js not available, skip registration silently
        });
    }
  }, []);

  return null;
}
