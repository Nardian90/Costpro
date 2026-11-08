'use client';

/**
 * COSTPRO-SALES-DASHBOARD-001 · Bloques: vendedores, productos, métodos de
 * pago, alertas y mapa de calor. Todas las cifras vienen del RPC agregado;
 * cada bloque permite profundizar al detalle (misión §12).
 */
import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Package, AlertTriangle, Info, AlertOctagon, XCircle, Users } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { SalesDashboardResponse, DashboardSeller } from '@/lib/sales-dashboard/schema';
import { paymentMethodLabel, docStatusLabel } from '@/lib/sales-dashboard/schema';
import { percentChange } from '@/lib/sales-dashboard/periods';

// ── Rendimiento por vendedor ────────────────────────────────────────────────
type SellerSort = 'net' | 'ops' | 'ticket';

export function SellersBlock({
  sellers, selectedSellerId, onSelectSeller, onClearSelection,
}: {
  sellers: DashboardSeller[];
  selectedSellerId: string | null;
  onSelectSeller: (id: string | null) => void;
  onClearSelection: () => void;
}) {
  const [sort, setSort] = useState<SellerSort>('net');
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const arr = [...sellers];
    if (sort === 'net') arr.sort((a, b) => b.net_cup - a.net_cup);
    if (sort === 'ops') arr.sort((a, b) => b.ops - a.ops);
    if (sort === 'ticket') arr.sort((a, b) => b.avg_ticket_cup - a.avg_ticket_cup);
    return arr;
  }, [sellers, sort]);

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (sellers.length === 0) {
    return <EmptyBlock text="Sin ventas de vendedores en el período con los filtros aplicados." testId="sellers-empty" />;
  }

  const visible = compareIds.size > 0 ? sorted.filter(s => compareIds.has(s.seller_id || '')) : sorted;

  return (
    <div data-testid="sellers-block">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Rendimiento por vendedor
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([['net', 'Netas'], ['ops', 'Operaciones'], ['ticket', 'Ticket']] as [SellerSort, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all min-h-[32px]',
                sort === k ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
          {compareIds.size > 0 && (
            <button
              type="button"
              onClick={() => setCompareIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase border border-border text-muted-foreground hover:bg-muted min-h-[32px]"
            >
              Ver todos
            </button>
          )}
          {selectedSellerId && (
            <button
              type="button"
              onClick={onClearSelection}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase border border-primary/40 text-primary hover:bg-primary/10 min-h-[32px]"
            >
              Quitar filtro de vendedor
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs sm:text-sm" data-testid="sellers-table">
          <thead className="bg-muted/50">
            <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="p-3 text-left">Vendedor</th>
              <th className="p-3 text-right">Ventas</th>
              <th className="p-3 text-right hidden sm:table-cell">Brutas</th>
              <th className="p-3 text-right hidden md:table-cell">Descuentos</th>
              <th className="p-3 text-right hidden md:table-cell">Devoluciones</th>
              <th className="p-3 text-right">Netas</th>
              <th className="p-3 text-right hidden sm:table-cell">Ticket</th>
              <th className="p-3 text-right">%</th>
              <th className="p-3 text-center w-20 hidden sm:table-cell">Comparar</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr
                key={s.seller_id || 'unknown'}
                className={cn(
                  'border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer',
                  selectedSellerId === s.seller_id && 'bg-primary/5',
                )}
                onClick={() => onSelectSeller(selectedSellerId === s.seller_id ? null : s.seller_id)}
                data-testid={`seller-row-${(s.name || '').toLowerCase().replace(/\s+/g, '-')}`}
              >
                <td className="p-3 font-bold text-foreground">{s.name}</td>
                <td className="p-3 text-right tabular-nums">{s.ops}</td>
                <td className="p-3 text-right tabular-nums hidden sm:table-cell">{formatCurrency(s.gross_cup)}</td>
                <td className="p-3 text-right tabular-nums text-warning hidden md:table-cell">−{formatCurrency(s.discounts_cup)}</td>
                <td className="p-3 text-right tabular-nums text-destructive hidden md:table-cell">−{formatCurrency(s.devolutions_cup)}</td>
                <td className="p-3 text-right tabular-nums font-black">{formatCurrency(s.net_cup)}</td>
                <td className="p-3 text-right tabular-nums hidden sm:table-cell">{formatCurrency(s.avg_ticket_cup)}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, s.participation_pct))}%` }} />
                    </div>
                    <span className="tabular-nums font-bold text-primary">{s.participation_pct}%</span>
                  </div>
                </td>
                <td className="p-3 text-center hidden sm:table-cell" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={compareIds.has(s.seller_id || '')}
                    onChange={() => toggleCompare(s.seller_id || '')}
                    className="w-5 h-5 accent-primary cursor-pointer"
                    aria-label={`Comparar vendedor ${s.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Attribución: usuario que generó la venta (<code className="text-[10px]">seller_id</code>). Toca una fila para filtrar todo el dashboard por ese vendedor.
      </p>
    </div>
  );
}

// ── Productos ───────────────────────────────────────────────────────────────
export function ProductsBlock({
  products, onProductClick,
}: {
  products: SalesDashboardResponse['products'];
  onProductClick: (productId: string, name: string) => void;
}) {
  const [view, setView] = useState<'net' | 'units' | 'low'>('net');
  const list = view === 'net' ? products.top_net : view === 'units' ? products.top_units : products.low_movement;
  const totalNet = products.total_net_cup || 0;
  // Concentración: % de las netas cubierto por el top-3 (Pareto)
  const top3Pct = useMemo(() => {
    if (totalNet <= 0) return 0;
    return Math.round((products.top_net.slice(0, 3).reduce((s, p) => s + (p.net_cup || 0), 0) / totalNet) * 1000) / 10;
  }, [products.top_net, totalNet]);

  return (
    <div data-testid="products-block">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" /> Productos y comportamiento comercial
        </h3>
        <div className="flex items-center gap-1.5">
          {([['net', 'Mayor facturación'], ['units', 'Más vendidos'], ['low', 'Menor movimiento']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all min-h-[32px]',
                view === k ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted',
              )}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyBlock text="Sin productos con actividad en el período." testId="products-empty" />
      ) : (
        <>
          {view === 'net' && (
            <div className="mb-3 px-3 py-2 rounded-xl border border-primary/15 bg-primary/[0.04] text-xs font-bold text-foreground" data-testid="concentration-note">
              Concentración: los 3 principales productos representan <span className="text-primary">{top3Pct}%</span> de las ventas netas del período.
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs sm:text-sm" data-testid={`products-table-${view}`}>
              <thead className="bg-muted/50">
                <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="p-3 text-left">Producto</th>
                  <th className="p-3 text-left hidden sm:table-cell">SKU</th>
                  <th className="p-3 text-right">Unidades</th>
                  {view === 'low' ? null : <th className="p-3 text-right hidden sm:table-cell">Devueltas</th>}
                  {view !== 'low' && <th className="p-3 text-right">Neto (CUP)</th>}
                  {view === 'net' && <th className="p-3 text-right">%</th>}
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <tr
                    key={p.product_id || p.sku || p.name || Math.random()}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => p.product_id && onProductClick(p.product_id, p.name || p.sku || 'Producto')}
                    data-testid={`product-row-${(p.sku || p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  >
                    <td className="p-3 font-bold text-foreground">{p.name || '—'}</td>
                    <td className="p-3 text-muted-foreground tabular-nums hidden sm:table-cell">{p.sku || '—'}</td>
                    <td className="p-3 text-right tabular-nums">{Math.round((p.units_sold + Number.EPSILON) * 10) / 10}</td>
                    {view === 'low' ? null : <td className="p-3 text-right tabular-nums text-destructive hidden sm:table-cell">{Math.round((p.units_returned || 0) * 10) / 10}</td>}
                    {view !== 'low' && <td className="p-3 text-right tabular-nums font-black">{formatCurrency(p.net_cup || 0)}</td>}
                    {view === 'net' && <td className="p-3 text-right tabular-nums font-bold text-primary">{p.participation_pct || 0}%</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {view === 'low'
              ? 'Productos del catálogo activo sin ventas o por debajo del primer cuartil de unidades del período. Toca para ver sus ventas.'
              : 'Margen de contribución: omitido — no existe costo verificable por venta en todos los ámbitos (ver documentación de KPIs).'}
          </p>
        </>
      )}
    </div>
  );
}

// ── Métodos de pago ─────────────────────────────────────────────────────────
export function PaymentMethodsBlock({ methods }: { methods: SalesDashboardResponse['payment_methods'] }) {
  const maxDoc = Math.max(1, ...methods.by_document.map(m => m.amount_cup));
  const totalCollected = methods.by_collection.reduce((s, m) => s + m.amount, 0) || 1;

  return (
    <div data-testid="payment-methods-block">
      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-primary" /> Métodos de pago y cobros
      </h3>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            Valor de documentos (CUP contable)
          </div>
          {methods.by_document.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin ventas en el período.</p>
          ) : methods.by_document.map(m => (
            <div key={m.method} className="mb-2 last:mb-0" data-testid={`method-doc-${m.method}`}>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>{paymentMethodLabel(m.method)} <span className="text-muted-foreground font-normal">({m.ops} doc.)</span></span>
                <span className="tabular-nums">{formatCurrency(m.amount_cup)} CUP</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${(m.amount_cup / maxDoc) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            Dinero cobrado (por moneda real)
          </div>
          {methods.by_collection.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin cobros registrados.</p>
          ) : methods.by_collection.map(m => (
            <div key={`${m.method}-${m.currency}`} className="mb-2 last:mb-0" data-testid={`method-pay-${m.method}-${m.currency}`}>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>{paymentMethodLabel(m.method)} <span className="text-muted-foreground font-normal">({m.ops} doc.)</span></span>
                <span className={cn('tabular-nums', m.currency !== 'CUP' && 'text-blue-500')}>
                  {formatCurrency(m.amount)} {m.currency}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full', m.currency === 'CUP' ? 'bg-primary' : 'bg-blue-500')}
                  style={{ width: `${Math.min(100, (m.amount / totalCollected) * 100 * (m.currency === 'CUP' ? 1 : 6))}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground mt-2">
            Cobros = payment_transactions (fuente autoritativa). Facturado ≠ cobrado: las diferencias se reportan en Alertas. Este bloque no sustituye la conciliación de caja.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Alertas ─────────────────────────────────────────────────────────────────
export interface AlertItem {
  key: string;
  severity: 'info' | 'warning' | 'conflict' | 'error';
  title: string;
  count: number;
  amount?: { value: number; currency: 'CUP' | 'USD' };
  description: string;
  filterStatus?: string;
}

const SEVERITY_STYLES = {
  info: { icon: Info, cls: 'border-primary/30 bg-primary/[0.04] text-primary' },
  warning: { icon: AlertTriangle, cls: 'border-warning/40 bg-warning/[0.05] text-warning' },
  conflict: { icon: XCircle, cls: 'border-orange-500/40 bg-orange-500/[0.05] text-orange-500' },
  error: { icon: AlertOctagon, cls: 'border-destructive/40 bg-destructive/[0.05] text-destructive' },
} as const;

export function AlertsBlock({
  alerts, localQueue, onGoToStatus,
}: {
  alerts: SalesDashboardResponse['alerts'];
  localQueue: { pending: number; conflict: number };
  onGoToStatus: (status: string) => void;
}) {
  const items: AlertItem[] = [];

  if (localQueue.pending > 0) {
    items.push({
      key: 'local-pending', severity: 'info', title: 'Pendientes de sincronización (este dispositivo)',
      count: localQueue.pending,
      description: 'Ventas en cola offline que aún no llegan al servidor. Es un estado normal de operación offline — no es un error.',
    });
  }
  if (localQueue.conflict > 0) {
    items.push({
      key: 'local-conflict', severity: 'conflict', title: 'En conflicto (este dispositivo)',
      count: localQueue.conflict,
      description: 'Ventas de la cola offline en estado de conflicto o reintentos agotados. Requieren revisión manual.',
    });
  }
  for (const d of alerts.doc_status) {
    const meta = docStatusLabel(d.status);
    items.push({
      key: `doc-${d.status}`, severity: meta.severity, title: meta.label,
      count: d.ops, amount: { value: d.amount_cup, currency: 'CUP' },
      description: `Documentos en estado "${d.status}" del período con los filtros aplicados.`,
      filterStatus: d.status,
    });
  }
  if (alerts.devolutions_count > 0) {
    items.push({
      key: 'devolutions', severity: 'warning', title: 'Devoluciones (notas de crédito)',
      count: alerts.devolutions_count,
      amount: { value: alerts.devolutions_cup, currency: 'CUP' },
      description: `Además: ${formatCurrency(alerts.devolutions_usd)} USD devueltos en moneda USD.`,
    });
  }
  if (alerts.incident_sales > 0) {
    items.push({
      key: 'incidents', severity: 'warning', title: 'Ventas con incidencias de pago',
      count: alerts.incident_sales,
      description: 'Documentos válidos con payment_incidents registradas en el cobro.',
    });
  }
  for (const s of alerts.sync_log) {
    items.push({
      key: `sync-${s.status}`, severity: s.status === 'conflict' ? 'conflict' : 'error',
      title: s.status === 'conflict' ? 'Conflictos de sincronización (histórico)' : 'Errores de sincronización (histórico)',
      count: s.ops,
      description: 'Registros del log de sincronización del período (entidad venta).',
    });
  }
  if (alerts.unreconciled_ops > 0) {
    items.push({
      key: 'unreconciled', severity: 'error', title: 'Ventas sin cobros conciliados',
      count: alerts.unreconciled_ops,
      amount: { value: alerts.unreconciled_diff_cup, currency: 'CUP' },
      description: 'Ventas válidas sin filas de pago o con diferencia |total − Σ cobros| > 0,05 CUP.',
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/[0.04] p-4 flex items-center gap-3" data-testid="alerts-ok">
        <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-success" />
        </div>
        <div>
          <p className="text-sm font-black text-success uppercase tracking-wide">Sin alertas del período</p>
          <p className="text-xs text-muted-foreground">No se detectaron anulaciones, conflictos ni diferencias de conciliación.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5" data-testid="alerts-block">
      {items.map(a => {
        const S = SEVERITY_STYLES[a.severity];
        const Icon = S.icon;
        return (
          <div key={a.key} className={cn('rounded-xl border p-3 flex flex-col gap-1.5', S.cls)} data-testid={`alert-${a.key}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{a.title}</span>
              </span>
              <span className="text-lg font-black tabular-nums leading-none">{a.count}</span>
            </div>
            {a.amount && (
              <span className="text-xs font-bold tabular-nums">
                {formatCurrency(a.amount.value)} {a.amount.currency}
              </span>
            )}
            <p className="text-[11px] text-muted-foreground leading-snug flex-1">{a.description}</p>
            {a.filterStatus && (
              <button
                type="button"
                onClick={() => onGoToStatus(a.filterStatus!)}
                className="self-start text-[11px] font-black uppercase tracking-wide underline underline-offset-2 hover:opacity-80"
              >
                Ver documentos →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Mapa de calor día × hora ────────────────────────────────────────────────
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function HeatmapBlock({ heatmap }: { heatmap: SalesDashboardResponse['heatmap'] }) {
  const cell = (dow: number, hour: number) => heatmap.find(h => h.dow === dow && h.hour === hour);
  const maxNet = Math.max(1, ...heatmap.map(h => h.net_cup));

  return (
    <div data-testid="heatmap-block">
      <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-3">
        <TrendingDown className="w-4 h-4 text-primary rotate-180" /> Actividad por día y hora
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        <div className="min-w-[560px]">
          <div className="grid" style={{ gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))', gap: 2 }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-[9px] text-muted-foreground text-center tabular-nums">{h}</div>
            ))}
            {DOW_LABELS.map((label, di) => (
              <React.Fragment key={label}>
                <div className="text-[10px] font-black text-muted-foreground flex items-center">{label}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const c = cell(di + 1, h);
                  const intensity = c && c.net_cup > 0 ? 0.12 + 0.88 * (c.net_cup / maxNet) : 0;
                  return (
                    <div
                      key={h}
                      title={c ? `${label} ${h}:00 · ${c.ops} operaciones · ${formatCurrency(c.net_cup)} CUP` : `${label} ${h}:00 · sin ventas`}
                      className="aspect-square rounded-sm transition-transform hover:scale-110"
                      style={{
                        background: intensity > 0 ? `hsl(var(--primary) / ${intensity})` : 'hsl(var(--muted) / 0.4)',
                      }}
                      data-testid={`heatmap-cell-${di + 1}-${h}`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Menos</span>
            <div className="flex gap-0.5 mx-2">
              {[0.15, 0.35, 0.6, 0.85, 1].map(o => (
                <div key={o} className="w-4 h-2 rounded-sm" style={{ background: `hsl(var(--primary) / ${o})` }} />
              ))}
            </div>
            <span>Más ventas netas (CUP)</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Horario clasificado en la zona operativa de la tienda (America/Havana).</p>
        </div>
      </div>
    </div>
  );
}

// ── Resumen comparativo bajo el gráfico ────────────────────────────────────
export function PeriodComparison({ kpi }: { kpi: SalesDashboardResponse['kpi'] }) {
  const rows: [string, number, number][] = [
    ['Ventas brutas', kpi.gross_cup, kpi.prev.gross_cup],
    ['Descuentos', kpi.discounts_cup, kpi.prev.discounts_cup],
    ['Ventas netas', kpi.net_cup, kpi.prev.net_cup],
    ['Devoluciones', kpi.devolutions_cup, kpi.prev.devolutions_cup],
    ['Documentos', kpi.ops, kpi.prev.ops],
    ['Ticket promedio', kpi.avg_ticket_cup, kpi.prev.avg_ticket_cup],
    ['Cobrado USD', kpi.collected_usd, kpi.prev.collected_usd],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 mt-3" data-testid="period-comparison">
      {rows.map(([label, cur, prev]) => {
        const ch = percentChange(cur, prev);
        return (
          <div key={label} className="rounded-lg border border-border bg-card px-2.5 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate">{label}</div>
            <div className="text-sm font-black tabular-nums">{label === 'Documentos' ? cur : formatCurrency(cur)}</div>
            <div className="text-[10px] font-bold tabular-nums flex items-center gap-0.5">
              {ch === null ? (
                <span className="text-muted-foreground">— sin datos previos</span>
              ) : (
                <span className={ch > 0 ? 'text-success' : ch < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                  {ch > 0 ? <TrendingUp className="w-3 h-3 inline" /> : ch < 0 ? <TrendingDown className="w-3 h-3 inline" /> : null}
                  {ch > 0 ? '+' : ''}{ch}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyBlock({ text, testId }: { text: string; testId: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
