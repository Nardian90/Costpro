'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency } from '@/lib/utils';
import type { SidebarMetrics } from './types';

interface FinancialOverviewProps {
  metrics: SidebarMetrics;
}

const FinancialOverview = React.memo(function FinancialOverview({ metrics }: FinancialOverviewProps) {
  const items = [
    {
      label: 'Producto',
      value: metrics.productName ? (
        <span className="text-xs font-bold text-foreground truncate block max-w-[140px] sm:max-w-[200px]">
          {metrics.productName}
        </span>
      ) : (
        <Skeleton className="inline-block w-16 h-4 rounded" />
      ),
    },
    {
      label: 'Costo Total',
      value: metrics.totalCost !== undefined ? (
        <span className="text-xs font-black font-mono text-primary">{formatCurrency(metrics.totalCost)}</span>
      ) : (
        <Skeleton className="inline-block w-16 h-4 rounded" />
      ),
    },
    {
      label: 'Precio Venta',
      value: metrics.salePrice !== undefined ? (
        <span className="text-xs font-black font-mono text-foreground">{formatCurrency(metrics.salePrice)}</span>
      ) : (
        <Skeleton className="inline-block w-16 h-4 rounded" />
      ),
    },
    {
      label: 'Utilidad',
      value: metrics.utilityPercent !== null ? (
        <span className="text-xs font-black font-mono text-amber-600 dark:text-amber-400">
          {metrics.utilityPercent}%
        </span>
      ) : (
        <Skeleton className="inline-block w-10 h-4 rounded" />
      ),
    },
  ];

  return (
    <div className="flex items-center gap-3 sm:gap-6 px-3 sm:px-4 py-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 sm:gap-3">
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">
            {item.label}
          </span>
          {item.value}
        </div>
      ))}
    </div>
  );
});

export default FinancialOverview;
