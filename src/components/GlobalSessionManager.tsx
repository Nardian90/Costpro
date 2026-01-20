'use client';

import { useEffect, useRef } from 'react';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useSessionStore } from '@/store/session-store';
import { toast } from 'sonner';

export function GlobalSessionManager() {
  useSessionManager(); // Centralized session and online/offline management
  const { isOnline } = useSessionStore();
  const toastIdRef = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    if (!isOnline) {
      toastIdRef.current = toast.error('Estás desconectado. Algunas funciones pueden no estar disponibles.', {
        duration: Infinity, // Keep the toast open until connection is restored
      });
    } else {
      if (toastIdRef.current) {
        toast.success('Conexión restablecida.', {
          id: toastIdRef.current,
        });
        toastIdRef.current = undefined;
      }
    }
  }, [isOnline]);

  return null; // This component does not render anything
}
