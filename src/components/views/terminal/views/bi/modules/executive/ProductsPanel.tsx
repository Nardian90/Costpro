'use client';

/**
 * ProductsPanel — «Productos que sostienen el negocio» (misión §3B/§4).
 *
 * FUSIÓN de las dos vistas repetidas del dashboard anterior (Top por ingreso
 * + Ranking por unidades mostraban el MISMO set dos veces): una sola tabla con
 * ingreso, unidades, margen % y participación % — misma fuente
 * (top_products_revenue del RPC) sin duplicar consultas.
 *
 * Composición de margen por categoría como LISTA NUMÉRICA (no barras): los
 * costos registrados pueden ser anómalos (margen muy negativo) y una escala
 * de barras queda inutilizable; la lista mantiene precisión y legibilidad con
 * los umbrales publicados (<15% rojo, <25% ámbar, ≥25% verde).
 */

import React from 'react';
import { formatCurrency, cn } from '@/lib/utils';
import { formatCurrencyShort } from '@/hooks/api/useStoreAnalytics';
import type { StoreAnalytics } from '@/hooks/api/useStoreAnalytics';

interface Props {
  analytics: StoreAnalytics;
}

function marginTone(pct: number): string {
  if (pct < 15) return 'text-red-600 dark:text-red-400';
  if (pct < 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function ProductsPanel({ analytics }: Props) {
  const tops = analytics.top_products_revenue ?? [];
  const sales = analytics.kpis?.period_sales ?? 0;
  const cats = (analytics.category_margins ?? []).filter((c) => c.revenue > 0).slice(0, 8);

  return (
    <section aria-label="Productos que sostienen el negocio" data-testid="executive-products">
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Productos que sostienen el negocio
        </h2>
        <span className="text-[11px] font-bold text-muted-foreground">top 10 · ingreso, unidades y margen</span>
      </div>

      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="executive-products-table">
            <thead>
              <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <th className="p-2.5 text-left">Producto</th>
                <th className="p-2.5 text-right">Ingreso</th>
                <th className="p-2.5 text-right">Uds</th>
                <th className="p-2.5 text-right">Margen</th>
                <th className="p-2.5 text-right">Particip.</th>
              </tr>
            </thead>
            <tbody>
              {tops.slice(0, 10).map((p) => {
                const share = sales > 0 ? (p.revenue / sales) * 100 : 0;
                return (
                  <tr key={p.product_id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-2.5 max-w-[220px]">
                      <span className="block font-bold text-foreground truncate">{p.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{p.category ?? 'Sin categoría'}</span>
                    </td>
                    <td className="p-2.5 text-right tabular-nums font-bold">{formatCurrency(p.revenue)}</td>
                    <td className="p-2.5 text-right tabular-nums">{p.quantity}</td>
                    <td className={cn('p-2.5 text-right tabular-nums font-black', marginTone(p.margin_pct))}>
                      <span
                        title="Margen sobre el costo registrado en la venta (cost_at_sale). Productos sin costo registrado muestran 100%."
                        className="cursor-help"
                      >
                        {p.margin_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-muted-foreground">{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {tops.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    Sin ventas de productos en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Composición de margen por categoría — lista numérica precisa.
          Misma fuente (category_margins del RPC), mismos umbrales publicados. */}
      {cats.length > 0 && (
        <div className="mt-4 rounded-xl border border-border/50 bg-card p-3.5">
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Margen por categoría
            </h3>
            <span className="text-[10px] text-muted-foreground">rojo &lt;15% · ámbar &lt;25% · verde ≥25%</span>
          </div>
          <ul className="space-y-1.5" data-testid="executive-category-margins">
            {cats
              .slice()
              .sort((a, b) => b.revenue - a.revenue)
              .map((c) => {
                const anomalous = c.margin_pct < -100;
                return (
                  <li key={c.category} className="flex items-center justify-between gap-3 px-1 py-1 rounded-lg hover:bg-muted/30 transition-colors">
                    <span className="text-xs font-bold text-foreground truncate min-w-0">{c.category}</span>
                    <span className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span className="text-[11px] text-muted-foreground w-20 text-right">{formatCurrencyShort(c.revenue)}</span>
                      <span
                        className={cn('text-xs font-black w-20 text-right', marginTone(c.margin_pct))}
                        title={`Ingreso ${formatCurrency(c.revenue)} · costo registrado ${formatCurrency(c.cost)}${anomalous ? ' — costo anómalo: supera varias veces el ingreso, revisa el costo registrado de esta familia' : ''}`}
                      >
                        {c.margin_pct.toFixed(1)}%
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
          <p className="mt-2 px-1 text-[10px] text-muted-foreground">
            Margen sobre el costo registrado en la venta (cost_at_sale). Categorías con margen muy
            negativo suelen reflejar costos mal registrados, no pérdidas reales de venta.
          </p>
        </div>
      )}
    </section>
  );
}
