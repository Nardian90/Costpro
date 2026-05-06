'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useSync, type SyncStatus } from '@/hooks/useSync';
import { syncEngine } from '@/lib/sync/sync-engine';

interface SyncContextType {
  status: SyncStatus;
  queueSize: number;
  lastSync: Date | null;
  addToQueue: (entity: string, operationType: 'CREATE' | 'UPDATE' | 'DELETE', payload: any) => Promise<any>;
  processQueue: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const sync = useSync();

  // BUG-001 FIX: Pass auth token to SyncEngine so offline sync requests include Authorization header
  useEffect(() => {
    async function syncToken() {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        syncEngine.setToken(session?.access_token ?? null);
      } catch {
        // Session not available yet — will retry on next auth change
      }
    }
    syncToken();

    // Listen for auth state changes to keep token fresh
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const { supabase } = await import('@/lib/supabaseClient');
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        syncEngine.setToken(session?.access_token ?? null);
      });
      unsubscribe = data.subscription.unsubscribe;
    })();

    return () => {
      unsubscribe?.();
      syncEngine.setToken(null);
    };
  }, []);

  // Activate the background sync engine (processes offline queue every 30s)
  useEffect(() => {
    syncEngine.start(30_000);
    return () => syncEngine.stop();
  }, []);

  return (
    <SyncContext.Provider value={sync}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return context;
}
