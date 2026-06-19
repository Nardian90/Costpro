'use client';

import React from 'react';
import { Separator } from '@/components/ui/separator';
import { calculateItbis } from '@/contracts/oferta';

interface FinancialSummaryProps {
  subtotal: number;
  descuento: number;
  itbisRate: number;
  total: number;
  currency: string;
}

export default function FinancialSummary({
  subtotal,
  descuento,
  itbisRate,
  total,
  currency,
}: FinancialSummaryProps) {
  const itbisAmount = calculateItbis(subtotal, descuento, itbisRate);
  const fmt = (v: number) => v.toLocaleString('es-CU', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 rounded-lg">
        <span className="text-xs text-muted-foreground">Subtotal</span>
        <span className="text-xs font-bold tabular-nums">{fmt(subtotal)} {currency}</span>
      </div>
      {descuento > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-destructive/5 rounded-lg">
          <span className="text-xs text-destructive">Descuento</span>
          <span className="text-xs font-bold text-destructive tabular-nums">-{fmt(descuento)} {currency}</span>
        </div>
      )}
      {itbisRate > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5 rounded-lg">
          <span className="text-xs text-primary">Impuesto ({itbisRate}%)</span>
          <span className="text-xs font-bold text-primary tabular-nums">{fmt(itbisAmount)} {currency}</span>
        </div>
      )}
      <Separator />
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 rounded-lg">
        <span className="font-black text-sm uppercase tracking-widest text-primary">TOTAL</span>
        <span className="font-black text-lg text-primary tabular-nums">{fmt(total)} {currency}</span>
      </div>
    </div>
  );
}
