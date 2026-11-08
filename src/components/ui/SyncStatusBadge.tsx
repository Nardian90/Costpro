'use client';

import React, { useSyncExternalStore, useState } from 'react';
import { useSyncContext } from '@/components/providers/SyncProvider';
// CP-POS-002 (D4/D7): contador de ventas por resolver + estados legibles.
import { useUnresolvedSales } from '@/hooks/useUnresolvedSales';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle, RotateCcw, Clock } from 'lucide-react';
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
  const { status, queueSize, failedCount, processQueue, retryFailed } = useSyncContext();
  const isOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [showFailedPanel, setShowFailedPanel] = useState(false);
  // CP-POS-002 (D4): ventas en conflicto/agotadas que requieren resolución.
  const { unresolvedCount, snapshotAge } = useUnresolvedSales();

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
          if (failedCount > 0 || unresolvedCount > 0) {
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
        {/* CP-POS-002 (D4): insignia de ventas que requieren resolución. */}
        {unresolvedCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-danger text-white text-[10px] font-black" role="status">
            {`${unresolvedCount} por resolver`}
          </span>
        )}
        {/* CP-POS-002 (D5): aviso de snapshot desactualizado (no bloquea). */}
        {snapshotAge.state === 'warn' && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 text-[10px] font-black" title="Inventario local desactualizado">
            <Clock className="inline w-3 h-3 mr-0.5" />
            {`hace ${snapshotAge.hours ?? '?'} h`}
          </span>
        )}
      </button>

      {/* Panel de operaciones fallidas / por resolver */}
      {showFailedPanel && (failedCount > 0 || unresolvedCount > 0) && (
        <div className="absolute top-full right-0 mt-2 w-80 rounded-xl border-2 border-destructive/40 bg-card shadow-xl z-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-black text-foreground uppercase tracking-widest">
                {failedCount + unresolvedCount} operación{failedCount + unresolvedCount !== 1 ? 'es' : ''} sin sincronizar
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Las ventas en conflicto o con reintentos agotados se conservan con
                su llave y contenido íntegros. Revísalas en el panel de conflictos:
                ninguna se pierde ni se descarta sin autorización registrada.
              </p>
              {snapshotAge.state === 'warn' && (
                <p className="text-xs text-amber-600 font-bold mt-1" role="status">
                  {`Inventario local desactualizado (hace ${snapshotAge.hours ?? '?'} h).`}
                </p>
              )}
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
            {/* CP-POS-002 (D4): el descate directo sin auditoría fue retirado —
                el descarte de ventas vive SOLO en el panel de conflictos
                (rol verificado en servidor + auditoría previa). */}
            <button
              onClick={() => {
                setShowFailedPanel(false);
                window.dispatchEvent(new CustomEvent('cp-pos-002:open-conflicts'));
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg bg-muted text-muted-foreground text-xs font-black uppercase tracking-widest hover:bg-muted/80 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Ver por resolver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
