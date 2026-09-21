'use client';
import { logger } from '@/lib/logger';

import { useEffect } from 'react'

/**
 * GATE 1.3R.1 FIX-SW-DEV (2026-09-21): registro del SW SOLO en producción.
 *
 * ROOT CAUSE verificado en navegador real (audit-evidence/GATE1.3R/):
 * en desarrollo con hostname no-localhost (p.ej. preview-*.space-z.ai) este
 * componente registraba el SW, cuya rama de producción aplica CacheFirst sobre
 * /_next/static/* con costpro-next-static-v4. Los chunks de Turbopack dev NO
 * son inmutables (mismo URL, contenido distinto tras recompile — probado
 * byte-level: 84.013 B en cache vs 84.041 B en server, mismo URL) y los URLs
 * con hash de sesión quedan huérfanos tras cada reinicio. Resultado: el SW
 * servía chunks viejos/muertos → "module factory is not available"
 * (p.ej. lucide-react ListFilter exigido por sidebar.structure.ts).
 *
 * El guard IS_DEV_HOST del sw.js solo cubre localhost/127.0.0.1/0.0.0.0 —
 * no cubre hosts de preview. FIX-STALE-DEV (2026-09-20) arregló localhost,
 * no el caso preview. Este cambio alinea este componente con layout.tsx
 * (FIX-ENTRY: registro inline solo en producción) y además limpia cualquier
 * registro/religión preexistente en dev para sanear navegadores ya afectados.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const isProd = process.env.NODE_ENV === 'production';

    if (!isProd) {
      // Desarrollo: NO registrar y sanear restos de registros anteriores
      // (cache costpro-* con chunks dev stale). Silencioso y best-effort.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then((unregistered) => {
          if (unregistered.some(Boolean)) {
            logger.warn('DATABASE', 'SERVICEWORKER_DEV_CLEANUP: registros SW eliminados en desarrollo', { data: { count: unregistered.filter(Boolean).length } });
          }
        })
        .catch(() => {});
      if ('caches' in window) {
        caches.keys()
          .then((names) => Promise.all(names.filter((n) => n.startsWith('costpro-')).map((n) => caches.delete(n))))
          .catch(() => {});
      }
      return;
    }

    // Producción: registro vía Workbox (comportamiento previo intacto)
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
  }, []);

  return null;
}
