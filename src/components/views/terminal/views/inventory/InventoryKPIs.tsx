'use client';

import React, { useMemo } from 'react';
import { Package, TrendingDown, AlertTriangle, DollarSign, BarChart3, ArrowUpDown } from 'lucide-react';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface InventoryKPIsProps {
  products: Product[];
  className?: string;
}

export default function InventoryKPIsPanel({ products, className }: InventoryKPIsProps) {
  const kpis = useMemo(() => {
    const total = products.length;
    const totalStock = products.reduce((s, p) => s + (p.stock_current || 0), 0);
    const outOfStock = products.filter(p => (p.stock_current || 0) <= 0).length;
    const atMinStock = products.filter(p =>
      (p.stock_current || 0) > 0 &&
      (p.stock_current || 0) <= (p.min_stock || 0)
    ).length;
    const totalValue = products.reduce((s, p) =>
      s + (p.stock_current || 0) * (p.cost_average || p.cost_price || 0), 0
    );
    const avgPrice = total > 0
      ? products.reduce((s, p) => s + (p.price || 0), 0) / total
      : 0;

    // Top 3 products by value
    const topByValue = [...products]
      .sort((a, b) =>
        (b.stock_current || 0) * (b.cost_average || b.cost_price || 0) -
        (a.stock_current || 0) * (a.cost_average || a.cost_price || 0)
      )
      .slice(0, 3);

    // Top 3 products by stock volume
    const topByVolume = [...products]
      .sort((a, b) => (b.stock_current || 0) - (a.stock_current || 0))
      .slice(0, 3);

    return {
      total,
      totalStock,
      outOfStock,
      atMinStock,
      totalValue,
      avgPrice,
      topByValue,
      topByVolume,
      healthPercent: total > 0
        ? Math.round(((total - outOfStock - atMinStock) / total) * 100)
        : 100,
    };
  }, [products]);

  const cards = [
    {
      label: 'Total Productos',
      value: kpis.total.toString(),
      icon: Package,
      color: 'text-primary',
      bg: 'bg-primary/10 border-primary/20',
    },
    {
      label: 'Unidades en Stock',
      value: kpis.totalStock.toLocaleString(),
      icon: BarChart3,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      label: 'Valor del Inventario',
      value: formatCurrency(kpis.totalValue),
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-500/10 border-green-500/20',
    },
    {
      label: 'Agotados',
      value: kpis.outOfStock.toString(),
      icon: AlertTriangle,
      color: kpis.outOfStock > 0 ? 'text-destructive' : 'text-muted-foreground',
      bg: kpis.outOfStock > 0 ? 'bg-destructive/10 border-destructive/20' : 'bg-muted/30 border-border',
    },
    {
      label: 'En Mínimo',
      value: kpis.atMinStock.toString(),
      icon: TrendingDown,
      color: kpis.atMinStock > 0 ? 'text-amber-600' : 'text-muted-foreground',
      bg: kpis.atMinStock > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-muted/30 border-border',
    },
    {
      label: 'Precio Promedio',
      value: formatCurrency(kpis.avgPrice),
      icon: ArrowUpDown,
      color: 'text-violet-600',
      bg: 'bg-violet-500/10 border-violet-500/20',
    },
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Health bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Salud del Inventario</span>
          <span className={cn(
            'text-xs font-black',
            kpis.healthPercent >= 80 ? 'text-green-600' :
            kpis.healthPercent >= 50 ? 'text-amber-600' : 'text-destructive'
          )}>
            {kpis.healthPercent}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              kpis.healthPercent >= 80 ? 'bg-green-500' :
              kpis.healthPercent >= 50 ? 'bg-amber-500' : 'bg-destructive'
            )}
            style={{ width: `${kpis.healthPercent}%` }}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className={cn('p-3 rounded-xl border text-center', card.bg)}>
            <card.icon className={cn('w-4 h-4 mx-auto mb-1.5', card.color)} />
            <div className={cn('text-lg sm:text-xl font-black', card.color)}>{card.value}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Top products by value and volume */}
      {(kpis.topByValue.length > 0 || kpis.topByVolume.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" /> Mayor Valor en Inventario
            </div>
            <div className="space-y-2">
              {kpis.topByValue.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate mr-2">
                    <span className="text-muted-foreground font-mono mr-1">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="font-black text-green-600 shrink-0">
                    {formatCurrency((p.stock_current || 0) * (p.cost_average || p.cost_price || 0))}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Package className="w-3 h-3" /> Mayor Volumen de Stock
            </div>
            <div className="space-y-2">
              {kpis.topByVolume.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate mr-2">
                    <span className="text-muted-foreground font-mono mr-1">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="font-black text-blue-600 shrink-0">
                    {(p.stock_current || 0).toLocaleString()} uds
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
