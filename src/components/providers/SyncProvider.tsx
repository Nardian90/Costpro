'use client';

import React, { createContext, useContext } from 'react';
import { useSync, type SyncStatus } from '@/hooks/useSync';

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
