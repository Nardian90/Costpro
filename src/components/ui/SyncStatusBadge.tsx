'use client';

import React, { useSyncExternalStore, useState } from 'react';
import { useSyncContext } from '@/components/providers/SyncProvider';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const subscribeOnline = (callback: () => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

export function SyncStatusBadge() {
  const { status, queueSize, failedCount, processQueue, retryFailed, discardFailed } = useSyncContext();
  const isOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [showFailedPanel, setShowFailedPanel] = useState(false);

  const getStatusConfig = () => {
    switch (status) {
      case 'syncing':
        return {
          icon: RefreshCw,
          text: `Sincronizando (${queueSize})`,
          className: 'bg-primary/10 text-primary animate-pulse',
          iconClassName: 'animate-spin',
        };
      case 'offline':
        return {
          icon: WifiOff,
          text: queueSize > 0 ? `Offline (${queueSize})` : 'Offline',
          className: 'bg-muted text-muted-foreground',
          iconClassName: '',
        };
      case 'conflict':
        return {
          icon: AlertTriangle,
          text: 'Conflicto',
          className: 'bg-danger/10 text-danger',
          iconClassName: '',
        };
      case 'error':
        return {
          icon: AlertTriangle,
          text: 'Error de Sync',
          className: 'bg-amber-500/10 text-amber-500',
          iconClassName: '',
        };
      default:
        return queueSize > 0
          ? {
              icon: RefreshCw,
              text: `Pendiente (${queueSize})`,
              className: 'bg-primary/10 text-primary',
              iconClassName: '',
            }
          : {
              icon: CheckCircle,
              text: 'Sincronizado',
              className: 'bg-success/10 text-success',
              iconClassName: '',
            };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (failedCount > 0) {
            setShowFailedPanel(!showFailedPanel);
          } else {
            processQueue();
          }
        }}
        disabled={status === 'syncing' || !isOnline}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-black uppercase tracking-widest transition-all",
          config.className,
          "hover:opacity-80 active:scale-95"
        )}
      >
        <Icon className={cn("w-3.5 h-3.5", config.iconClassName)} />
        <span>{config.text}</span>
        {failedCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-black">
            {failedCount} fallidas
          </span>
        )}
      </button>

      {/* Panel de operaciones fallidas */}
      {showFailedPanel && failedCount > 0 && (
        <div className="absolute top-full right-0 mt-2 w-80 rounded-xl border-2 border-destructive/40 bg-card shadow-xl z-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-black text-foreground uppercase tracking-widest">
                {failedCount} operación{failedCount !== 1 ? 'es' : ''} fallida{failedCount !== 1 ? 's' : ''}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Estas operaciones no se pudieron sincronizar tras 3 intentos.
                Puedes reintentarlas o descartarlas.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                await retryFailed();
                setShowFailedPanel(false);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reintentar
            </button>
            <button
              onClick={async () => {
                await discardFailed();
                setShowFailedPanel(false);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg bg-muted text-muted-foreground text-xs font-black uppercase tracking-widest hover:bg-muted/80 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
