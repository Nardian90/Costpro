'use client';

import React, { useMemo, useState } from 'react';
import { Package, TrendingDown, AlertTriangle, DollarSign, BarChart3, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Product } from '@/types';
import { formatCurrency, cn } from '@/lib/utils';

interface InventoryKPIsProps {
  products: Product[];
  className?: string;
}

export default function InventoryKPIsPanel({ products, className }: InventoryKPIsProps) {
  const [isOpen, setIsOpen] = useState(false);

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
      {/* Collapsible header with health bar */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between group"
        aria-expanded={isOpen}
        aria-controls="inventory-kpis-content"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Salud del Inventario</span>
          <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden max-w-[200px]">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                kpis.healthPercent >= 80 ? 'bg-green-500' :
                kpis.healthPercent >= 50 ? 'bg-amber-500' : 'bg-destructive'
              )}
              style={{ width: `${kpis.healthPercent}%` }}
            />
          </div>
          <span className={cn(
            'text-xs font-black shrink-0',
            kpis.healthPercent >= 80 ? 'text-green-600' :
            kpis.healthPercent >= 50 ? 'text-amber-600' : 'text-destructive'
          )}>
            {kpis.healthPercent}%
          </span>
        </div>
        <div className={cn(
          'p-1 rounded-lg transition-colors shrink-0 ml-2',
          isOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground group-hover:bg-muted'
        )}>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Collapsible content */}
      <div
        id="inventory-kpis-content"
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isOpen
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 pt-2">
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
        </div>
      </div>
    </div>
  );
}
