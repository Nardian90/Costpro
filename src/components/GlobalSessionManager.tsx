'use client';

import { useEffect, useRef } from 'react';
import { useSessionManager } from '@/hooks/logic/useSessionManager';
import { useSessionStore } from '@/store/session-store';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export function GlobalSessionManager() {
  useSessionManager(); // Centralized session and online/offline management
  const { isOnline } = useSessionStore();
  const toastIdRef = useRef<string | number | undefined>(undefined);
  const t = useTranslations('session');

  useEffect(() => {
    if (!isOnline) {
      toastIdRef.current = toast.error(t('disconnected'), {
        duration: Infinity, // Keep the toast open until connection is restored
      });
    } else {
      if (toastIdRef.current) {
        toast.success(t('reconnected'), {
          id: toastIdRef.current,
        });
        toastIdRef.current = undefined;
      }
    }
  }, [isOnline, t]);

  return null; // This component does not render anything
}
