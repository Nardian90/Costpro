'use client';

/**
 * MetricMini — Componente de métrica individual para el dashboard consolidado.
 * Extraído de MultiStoreDashboardView para reducir el tamaño del archivo principal.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface MetricMiniProps {
  label: string;
  value: string | number;
  alert?: boolean;
  isNA?: boolean;
}

export function MetricMini({ label, value, alert = false, isNA = false }: MetricMiniProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-black tabular-nums',
        alert ? 'text-destructive' : isNA ? 'text-muted-foreground/50' : 'text-foreground',
      )}>
        {isNA ? 'N/A' : value}
      </p>
    </div>
  );
}
