'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Target,
  Package,
  Check,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardKPIs, SalesSummary, Product } from '@/types';

interface DashboardViewProps {
  kpis: DashboardKPIs;
  summary: SalesSummary;
  criticalProducts: Product[];
  canViewFinancials: boolean;
  onViewInventory: () => void;
}

export default function DashboardView({
  kpis,
  summary,
  criticalProducts,
  canViewFinancials,
  onViewInventory
}: DashboardViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Dashboard</h2>
        <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg border border-border bg-card/50 text-xs font-bold">
          <Calendar className="w-3 h-3" />
          Hoy: {new Date().toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI Cards */}
        <div className="md:col-span-1 p-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ventas Totales</span>
            <div className="p-2 bg-green-500/10 rounded-xl">
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
          </div>
          <div className="text-4xl font-black text-foreground">${kpis.gross_sales.toFixed(2)}</div>
          <div className="text-[10px] font-bold text-green-500 mt-2 uppercase tracking-widest">+12% vs ayer</div>
        </div>

        {canViewFinancials && (
          <>
            <div className="md:col-span-1 p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Costo de Ventas</span>
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Target className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <div className="text-4xl font-black text-foreground">${kpis.cost_of_goods.toFixed(2)}</div>
              <div className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">
                Margen: {((kpis.profit / kpis.gross_sales) * 100 || 0).toFixed(1)}%
              </div>
            </div>

            <div className="md:col-span-1 p-6 rounded-xl border border-primary/20 bg-primary/5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-primary font-bold">Utilidad Neta</span>
                <div className="p-2 bg-primary/20 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="text-4xl font-black text-primary">${kpis.profit.toFixed(2)}</div>
              <div className="text-[10px] font-black text-primary/70 mt-2 uppercase tracking-widest">Utilidad Diaria</div>
            </div>
          </>
        )}

        {/* Additional Stats */}
        <div className="md:col-span-2 p-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Resumen de Ventas
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { label: 'Transacciones', value: summary.transaction_count, sub: 'Hoy' },
              { label: 'Ticket Promedio', value: `$${summary.average_ticket.toFixed(2)}`, sub: 'ARS' },
              { label: 'Efectivo', value: `$${summary.total_cash.toFixed(2)}`, sub: 'Recaudado', color: 'text-green-500' },
              { label: 'Transferencia', value: `$${summary.total_transfer.toFixed(2)}`, sub: 'Banco', color: 'text-primary' },
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-lg bg-background/50 border border-border/50">
                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter block mb-1">{stat.label}</span>
                <div className={cn("text-xl font-black tracking-tight", stat.color || "text-foreground")}>{stat.value}</div>
                <span className="text-[8px] font-bold text-muted-foreground/50 uppercase">{stat.sub}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-1 p-6 rounded-xl border border-destructive/10 bg-card shadow-sm">
          <h3 className="text-lg font-black text-destructive uppercase tracking-widest flex items-center gap-2 mb-6">
            <Package className="w-5 h-5" />
            Alertas Críticas
          </h3>
          <div className="space-y-3">
            {criticalProducts.slice(0, 4).map(product => (
              <div key={product.id} className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 group hover:bg-destructive/10 transition-colors">
                <div className="flex justify-between items-center">
                  <div className="overflow-hidden">
                    <div className="font-bold text-xs text-foreground truncate">{product.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{product.sku}</div>
                  </div>
                  <div className="text-destructive font-black text-sm whitespace-nowrap ml-2">{product.stock_current} uds</div>
                </div>
              </div>
            ))}
            {criticalProducts.length === 0 && (
              <div className="text-center py-10">
                <Check className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-20" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Todo en orden</p>
              </div>
            )}
            {criticalProducts.length > 4 && (
              <button
                onClick={onViewInventory}
                className="w-full py-2 text-[10px] font-black uppercase text-primary hover:underline"
              >
                Ver todas las alertas ({criticalProducts.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
