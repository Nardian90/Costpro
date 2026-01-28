'use client';

import React from 'react';
import { useSyncContext } from '@/components/providers/SyncProvider';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SyncStatusBadge() {
  const { status, queueSize, processQueue } = useSyncContext();

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
    <button
      onClick={() => processQueue()}
      disabled={status === 'syncing' || !navigator.onLine}
      className={cn(
        "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
        config.className,
        "hover:opacity-80 active:scale-95"
      )}
    >
      <Icon className={cn("w-3 h-3", config.iconClassName)} />
      <span>{config.text}</span>
    </button>
  );
}
