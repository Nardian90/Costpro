'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * usePWAUpdate — Hook que detecta cuando el Service Worker tiene una nueva versión.
 *
 * Muestra un banner "Nueva versión disponible — Actualizar" cuando:
 *   1. El SW detecta cambios en checkForUpdates()
 *   2. El SW se reinstala (nuevo hash de sw.js)
 *
 * El usuario puede:
 *   - Aceptar: recarga la página con cache busting
 *   - Posponer: el banner vuelve a aparecer en 24h
 *
 * Uso:
 *   const { updateAvailable, applyUpdate } = usePWAUpdate();
 *   {updateAvailable && <UpdateBanner onApply={applyUpdate} />}
 */

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Listener para mensajes del SW
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED' || event.data?.type === 'UPDATE_AVAILABLE') {
        setUpdateAvailable(true);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Registrar el SW
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        // Detectar nuevo SW esperando
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }

        // Detectar nuevo SW en el futuro
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Hay un nuevo SW esperando
                setWaitingWorker(newWorker);
                setUpdateAvailable(true);
              }
            });
          }
        });

        // Check periódico cada 24h
        setInterval(() => {
          registration.update().catch(() => {});
        }, 24 * 60 * 60 * 1000);
      })
      .catch((err) => {
        // SW falló al registrar — no crítico
        console.warn('[PWA] SW registration failed:', err.message);
      });

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    // Recargar con cache busting
    window.location.reload();
  }, [waitingWorker]);

  return { updateAvailable, applyUpdate };
}

