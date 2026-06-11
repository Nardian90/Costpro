'use client';

import React from 'react';
import { cn, formatCurrency } from '@/lib/utils';

interface SalesCatalogTotalsProps {
  activeRowsCount: number;
  itemCount: number;
  subtotal: number;
  cashTotal: number;
  transferTotal: number;
  showMixedColumns: boolean;
}

export default function SalesCatalogTotals({
  activeRowsCount,
  itemCount,
  subtotal,
  cashTotal,
  transferTotal,
  showMixedColumns,
}: SalesCatalogTotalsProps) {
  return (
    <div className="sticky bottom-0 z-30 bg-card/95 backdrop-blur-xl border-2 border-primary/20 rounded-2xl p-4 sm:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] space-y-3 mt-4">
      <div className={cn(
        'grid gap-3',
        showMixedColumns ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
      )}>
        <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
          <span className="text-xs font-black uppercase text-muted-foreground tracking-widest block">
            Productos
          </span>
          <span className="text-lg font-black text-foreground">{activeRowsCount}</span>
        </div>
        <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
          <span className="text-xs font-black uppercase text-muted-foreground tracking-widest block">
            Uds. Totales
          </span>
          <span className="text-lg font-black text-foreground">{itemCount}</span>
        </div>
        {showMixedColumns && (
          <>
            <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/20">
              <span className="text-xs font-black uppercase text-emerald-600 tracking-widest block">
                Efectivo
              </span>
              <span className="text-lg font-black text-emerald-600">
                {formatCurrency(cashTotal)}
              </span>
            </div>
            <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/20">
              <span className="text-xs font-black uppercase text-blue-600 tracking-widest block">
                Transferencia
              </span>
              <span className="text-lg font-black text-blue-600">
                {formatCurrency(transferTotal)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-primary/20">
        <span className="text-xs font-black uppercase text-foreground tracking-widest">
          Total Final
        </span>
        <span className="text-[clamp(1.5rem,5vw,2rem)] font-black text-primary tracking-tighter">
          {formatCurrency(subtotal)}
        </span>
      </div>
    </div>
  );
}
