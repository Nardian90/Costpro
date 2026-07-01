import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineStorage } from '@/lib/sync/offline-storage';
import { syncEngine } from '@/lib/sync/sync-engine';
import { syncBatchSchema, syncBatchResponseSchema } from '@/validation/schemas';
import { useAuthStore } from '@/store';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error' | 'conflict';

export function useSync() {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<SyncStatus>('online');
  const [queueSize, setQueueSize] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const updateQueueSize = useCallback(async () => {
    const pending = await offlineStorage.getPendingOperations();
    setQueueSize(pending.length);
    const failed = await offlineStorage.getFailedCount();
    setFailedCount(failed);
  }, []);

  useEffect(() => {
    updateQueueSize();

    const handleOnline = () => {
      setStatus('online');
      processQueue();
    };
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) setStatus('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateQueueSize]);

  const processQueue = useCallback(async () => {
    if (!navigator.onLine || queueSize === 0 || status === 'syncing') return;

    setStatus('syncing');
    const pending = await offlineStorage.getPendingOperations();

    if (pending.length === 0) {
      setStatus('online');
      return;
    }

    const batchSize = 25;
    const batchOps = pending.slice(0, batchSize);
    let hasConflict = false;

    try {
      // Get current session for authentication
      const { supabase } = await import('@/lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          clientInfo: {
            userId: user?.id || 'unknown',
            deviceId: window.navigator.userAgent,
          },
          operations: batchOps,
        }),
      });

      if (!response.ok) throw new Error('Sync failed');

      const data = await response.json();
      const { results } = syncBatchResponseSchema.parse(data);

      for (const result of results) {
        if (result.status === 'ok') {
          await offlineStorage.updateOperationStatus(result.idempotencyKey, 'synced');
        } else if (result.status === 'conflict') {
          await offlineStorage.updateOperation(result.idempotencyKey, {
            status: 'failed',
            lastError: 'Conflict: ' + result.error,
            serverData: result.serverData
          });
          hasConflict = true;
          toast.error(`Conflicto detectado en operación ${result.idempotencyKey}`);
        } else {
          await offlineStorage.updateOperationStatus(result.idempotencyKey, 'failed', result.error);
        }
      }

      await offlineStorage.removeSyncedOperations();
      await updateQueueSize();
      setLastSync(new Date());

      if (hasConflict) {
        setStatus('conflict');
      } else {
        setStatus('online');
      }

      // Success: Reset retry attempt
      setRetryAttempt(0);

      // Continue if there are more items
      if (pending.length > batchSize) {
        // FIX-RCT-110: Clear previous timer before scheduling
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(processQueue, 1000);
      }
    } catch (err) {
      console.error('Sync error:', err);
      setStatus('error');

      // Exponential Backoff with Jitter
      const baseDelay = 2000;
      const maxDelay = 30000;
      const nextAttempt = retryAttempt + 1;
      setRetryAttempt(nextAttempt);

      const delay = Math.min(maxDelay, baseDelay * Math.pow(2, nextAttempt));
      const jitter = Math.random() * 1000;
      const finalDelay = delay + jitter;

      logger.info('DATABASE', `Retrying sync in ${Math.round(finalDelay)}ms (attempt ${nextAttempt})`);
      // FIX-RCT-110: Clear previous timer before scheduling
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(processQueue, finalDelay);
    }
  }, [queueSize, status, user?.id, updateQueueSize, retryAttempt]);

  // FIX-RCT-110: Cleanup timeout on unmount
  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

  const addToQueue = useCallback(async (entity: string, operationType: 'CREATE' | 'UPDATE' | 'DELETE', payload: any) => {
    const op = await offlineStorage.addToQueue({
      entity,
      operationType,
      payload,
      idempotencyKey: uuidv4(),
    });

    await updateQueueSize();

    if (navigator.onLine) {
      processQueue();
    } else {
      toast.info('Operación guardada localmente (offline)');
    }

    return op;
  }, [processQueue, updateQueueSize]);

  return {
    status,
    queueSize,
    failedCount,
    lastSync,
    addToQueue,
    processQueue,
    retryFailed: async () => {
      const count = await syncEngine.retryFailed();
      if (count > 0) {
        toast.success(`${count} operaciones reintentrándose`);
        await updateQueueSize();
      } else {
        toast.info('No hay operaciones fallidas para reintentar');
      }
    },
    discardFailed: async () => {
      const count = await syncEngine.discardFailed();
      if (count > 0) {
        toast.info(`${count} operaciones descartadas`);
        await updateQueueSize();
      }
    },
  };
}
