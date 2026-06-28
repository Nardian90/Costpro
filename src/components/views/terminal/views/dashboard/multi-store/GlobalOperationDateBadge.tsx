'use client';

/**
 * GlobalOperationDateBadge — Badge de Fecha de Operación Actual.
 * Extraído de MultiStoreDashboardView.
 *
 * Política de secuencia global (forward-only locking).
 * Muestra la fecha MAX de todos los documentos del sistema.
 */

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useGlobalOperationDate } from '@/hooks/api/useGlobalOperationDate';

export function GlobalOperationDateBadge() {
  const { user } = useAuthStore();
  const { data, isLoading } = useGlobalOperationDate(user?.activeStoreId);

  if (isLoading) {
    return (
      <div className="h-11 px-3 rounded-lg border border-border/50 bg-card/50 animate-pulse flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Cargando...
        </span>
      </div>
    );
  }

  const hasDate = !!data?.maxDate;
  const formatted = data?.maxDateFormatted || '—';

  return (
    <div
      className={cn(
        'h-11 px-3 rounded-lg border flex items-center gap-2 transition-colors',
        hasDate
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/50 bg-muted/30',
      )}
      title={hasDate
        ? `Fecha mínima para nuevos documentos: ${formatted}`
        : 'Sin documentos previos — cualquier fecha es válida'}
      role="status"
      aria-label={`Fecha de operación actual: ${formatted}`}
    >
      <CalendarClock className={cn('w-4 h-4 shrink-0', hasDate ? 'text-primary' : 'text-muted-foreground')} />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Fecha Operación
        </span>
        <span className={cn(
          'text-xs font-black tabular-nums',
          hasDate ? 'text-primary' : 'text-muted-foreground',
        )}>
          {formatted}
        </span>
      </div>
    </div>
  );
}
