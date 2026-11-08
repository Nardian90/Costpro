'use client';

/**
 * COSTPRO-SALES-DASHBOARD-001 · Tab «Dashboard» dentro de Historial de Ventas.
 *
 * Diseño: docs/sales-dashboard/KPI_DEFINITIONS.md.
 * - UNA llamada RPC agregada (sin N+1, sin descargar documentos).
 * - Filtros globales: período (presets + personalizado), tienda (si tiene
 *   varias), vendedor, estado, método de pago y moneda de lectura.
 * - CUP y USD JAMÁS se suman: la vista CUP es contable (documentos), la
 *   vista USD son importes reales cobrados/devueltos en USD.
 * - Drill-down: reutiliza el tab Detalle existente con filtros aplicados
 *   (no crea un segundo historial — misión §12).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Filter, X, Loader2, DollarSign, Store, Users } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { isAdminLevel } from '@/lib/roles';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';
import {
  PERIOD_OPTIONS, resolvePeriodWindow, previousEquivalentWindow,
  granularityLabel, toDateInputValue, type PeriodPreset,
} from '@/lib/sales-dashboard/periods';
import { useSalesDashboard, useLocalSyncQueue, useProductDetail } from '@/hooks/api/useSalesDashboard';
import { KpiCards } from './dashboard/KpiCards';
import { EvolutionChart } from './dashboard/EvolutionChart';
import {
  SellersBlock, ProductsBlock, PaymentMethodsBlock, AlertsBlock, HeatmapBlock, PeriodComparison, StoresBlock,
} from './dashboard/blocks';

export interface DashboardDrill {
  status?: string;
  sellerName?: string;
}

/** Dimensión del análisis comparativo (REFINEMENT-002 §3). */
type ComparisonDimension = 'sellers' | 'stores';

interface SalesDashboardTabProps {
  /** Cambia al tab Detalle aplicando filtros (drill-down al historial). */
  onDrillToDetail: (d: DashboardDrill) => void;
  /** Vendedores visibles para el filtro (id, nombre). */
  sellers: { id: string; name: string }[];
}

export function SalesDashboardTab({ onDrillToDetail, sellers }: SalesDashboardTabProps) {
  const user = useAuthStore(s => s.user);
  const isAdmin = isAdminLevel(user?.role);

  // ── Filtros globales ──────────────────────────────────────────────────────
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [storeId, setStoreId] = useState<string>('');
  const [sellerId, setSellerId] = useState<string>('');
  const [status, setStatus] = useState<string>('completed');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [currencyView, setCurrencyView] = useState<'CUP' | 'USD'>('CUP');
  const [applied, setApplied] = useState(0); // contador de "Aplicar"
  /** Dimensión del bloque de rendimiento (REFINEMENT-002 §3). */
  const [dimension, setDimension] = useState<ComparisonDimension>('sellers');

  const window = useMemo(
    () => resolvePeriodWindow(period, customFrom, customTo),
    [period, customFrom, customTo, applied],
  );
  const filters = useMemo(
    () => ({
      storeId: storeId || null,
      sellerId: sellerId || null,
      status: status === 'all' ? '' : status,
      paymentMethod,
    }),
    [storeId, sellerId, status, paymentMethod, applied],
  );

  const { data, isLoading, error, refetch, isRefetching, lastUpdated } = useSalesDashboard(window, filters);
  const { snapshot: localQueue, refresh: refreshQueue } = useLocalSyncQueue();

  const [productDetailTarget, setProductDetailTarget] = useState<{ id: string; name: string } | null>(null);
  const productDetail = useProductDetail(window, filters.storeId, productDetailTarget?.id ?? null);

  const stores = useMemo(() => {
    // REFINEMENT-002: fuente de verdad = accessible_stores del RPC (capa de
    // datos; cubre admin/superadmin que no llevan membresías). Fallback al
    // user.stores heredado solo si el RPC aún no devolvió datos.
    if (data?.accessible_stores?.length) return data.accessible_stores.map(s => ({ id: s.id, name: s.name }));
    const list = (user as unknown as { stores?: { id: string; name: string }[] } | undefined)?.stores;
    return list ?? [];
  }, [data, user]);

  const hasActiveFilters =
    period !== 'this_month' || !!storeId || !!sellerId || status !== 'completed' || !!paymentMethod || currencyView === 'USD';

  const clearFilters = useCallback(() => {
    setPeriod('this_month');
    setCustomFrom(''); setCustomTo('');
    setStoreId(''); setSellerId(''); setStatus('completed'); setPaymentMethod('');
    setCurrencyView('CUP');
    setApplied(a => a + 1);
  }, []);

  const applyFilters = useCallback(() => {
    setApplied(a => a + 1);
    refreshQueue();
  }, [refreshQueue]);

  const drillToStatus = useCallback((st: string) => {
    onDrillToDetail({ status: st });
  }, [onDrillToDetail]);

  const drillToSeller = useCallback((id: string | null) => {
    setSellerId(id || '');
    setApplied(a => a + 1);
  }, []);

  const drillToStore = useCallback((id: string | null) => {
    setStoreId(id || '');
    setApplied(a => a + 1);
  }, []);

  const onBucketClick = useCallback((bucket: string) => {
    // Período del gráfico → ajustar ventana personalizada a ese bucket
    const [date] = bucket.split(' ');
    setPeriod('custom');
    setCustomFrom(date);
    setCustomTo(date);
    setApplied(a => a + 1);
  }, []);

  return (
    <div className="space-y-5" data-testid="sales-dashboard-root">
      {/* ── Barra de filtros global ── */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm" data-testid="dashboard-filters">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            {/* Período */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Período</span>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as PeriodPreset)}
                className="h-11 min-w-[130px] rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none cursor-pointer"
                aria-label="Período"
              >
                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            {period === 'custom' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desde</span>
                  <input
                    type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none"
                    aria-label="Fecha inicial"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hasta</span>
                  <input
                    type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none"
                    aria-label="Fecha final"
                  />
                </label>
              </>
            )}

            {/* Tienda (solo multi-tienda) */}
            {stores.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tienda</span>
                <select
                  value={storeId} onChange={e => setStoreId(e.target.value)}
                  className="h-11 min-w-[120px] rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none cursor-pointer"
                  aria-label="Tienda"
                >
                  <option value="">Todas mis tiendas</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}

            {/* Vendedor */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vendedor</span>
              <select
                value={sellerId} onChange={e => setSellerId(e.target.value)}
                className="h-11 min-w-[120px] rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none cursor-pointer"
                aria-label="Vendedor"
              >
                <option value="">Todos</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>

            {/* Estado */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</span>
              <select
                value={status} onChange={e => setStatus(e.target.value)}
                className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none cursor-pointer"
                aria-label="Estado de la venta"
              >
                <option value="completed">Completadas</option>
                <option value="voided">Anuladas</option>
                <option value="reversed">Revertidas</option>
                <option value="pending">Pendientes</option>
                <option value="all">Todos los estados</option>
              </select>
            </label>

            {/* Método de pago */}
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Método</span>
              <select
                value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none cursor-pointer"
                aria-label="Método de pago"
              >
                <option value="">Todos</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="zelle">Zelle</option>
                <option value="mixed">Mixto</option>
                <option value="card">Tarjeta</option>
              </select>
            </label>

            {/* Moneda de lectura */}
            <div className="flex rounded-lg border border-border overflow-hidden h-11" role="group" aria-label="Moneda de consulta">
              {(['CUP', 'USD'] as const).map(c => (
                <button
                  key={c} type="button" onClick={() => setCurrencyView(c)}
                  className={cn(
                    'px-3 text-xs font-black transition-all min-h-[44px]',
                    currencyView === c ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  <DollarSign className="w-3 h-3 inline mr-1" />{c}
                </button>
              ))}
            </div>

            {/* Aplicar / Limpiar */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button" onClick={applyFilters}
                className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide hover:opacity-90 transition-all min-h-[44px] flex items-center gap-1.5"
                data-testid="apply-filters"
              >
                <Filter className="w-3.5 h-3.5" /> Aplicar
              </button>
              {hasActiveFilters && (
                <button
                  type="button" onClick={clearFilters}
                  className="h-11 px-3 rounded-lg border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:bg-muted transition-all min-h-[44px]"
                  data-testid="clear-filters"
                >
                  <X className="w-3.5 h-3.5 inline mr-1" /> Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Indicadores de filtros activos + actualización */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary font-black uppercase tracking-wide" data-testid="active-filters-badge">
                <Filter className="w-3 h-3" /> Filtros activos
              </span>
            )}
            <span className="text-muted-foreground">
              {isAdmin && !storeId && stores.length > 1 ? 'Ámbito: todas tus tiendas' : 'Ámbito: tienda activa'}
            </span>
            {lastUpdated && (
              <span className="text-muted-foreground tabular-nums" data-testid="last-updated">
                · Actualizado {lastUpdated.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button" onClick={() => { refetch(); refreshQueue(); }}
              disabled={isRefetching}
              className="inline-flex items-center gap-1 text-primary font-black uppercase tracking-wide hover:opacity-80 disabled:opacity-50"
              data-testid="manual-refresh"
            >
              {isRefetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <StateRenderer
        isLoading={isLoading}
        error={error ?? null}
        data={data ? [data] : []}
        loadingComponent={
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        }
        emptyComponent={<div />}
      >
        {() => data && (
          <div className="space-y-5">
            {/* 1 · Resumen ejecutivo */}
            <section aria-label="Resumen ejecutivo">
              <KpiCards kpi={data.kpi} currencyView={currencyView} />
            </section>

            {/* 2 · Evolución */}
            <section className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Evolución de las ventas" data-testid="evolution-section">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Evolución de las ventas
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {granularityLabel(data.period.granularity)} · CUP · toca una barra para filtrar ese día
                </span>
              </div>
              <EvolutionChart
                series={data.series}
                granularity={data.period.granularity}
                currencyNote="CUP contable"
                onSelectBucket={data.period.granularity === 'day' ? onBucketClick : undefined}
              />
              <PeriodComparison kpi={data.kpi} />
            </section>

            {/* 3 · Rendimiento comparativo: Vendedores | Tiendas (REFINEMENT-002 §3) */}
            <section aria-label="Rendimiento comparativo" data-testid="performance-section">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Rendimiento comparativo
                </h3>
                {/* Control segmentado Analizar por: [Vendedores][Tiendas] */}
                <div
                  className="flex rounded-lg border border-border overflow-hidden h-11"
                  role="group"
                  aria-label="Analizar por"
                  data-testid="comparison-dimension-selector"
                >
                  {([['sellers', 'Vendedores'], ['stores', 'Tiendas']] as [ComparisonDimension, string][]).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDimension(k)}
                      aria-pressed={dimension === k}
                      data-testid={`dimension-${k}`}
                      className={cn(
                        'px-4 text-xs font-black uppercase tracking-wide transition-all min-h-[44px] flex items-center gap-1.5',
                        dimension === k ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {k === 'sellers' ? <Users className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {dimension === 'sellers' ? (
                <SellersBlock
                  sellers={data.sellers}
                  selectedSellerId={filters.sellerId}
                  onSelectSeller={drillToSeller}
                  onClearSelection={() => drillToSeller(null)}
                />
              ) : (
                <StoresBlock
                  stores={data.stores ?? []}
                  storesSeries={data.stores_series ?? []}
                  selectedStoreId={filters.storeId}
                  onDrillToStore={drillToStore}
                />
              )}

              {/* Nota de coherencia filtro vs comparación (§5) */}
              {dimension === 'stores' && filters.storeId && (
                <p className="mt-2 text-[11px] text-warning font-bold" data-testid="store-filter-compare-note">
                  El filtro «Tienda» está activo: la comparación muestra solo esa tienda.
                  Para comparar varias, selecciona «Todas mis tiendas» y usa los checks de «Comparar».
                </p>
              )}
            </section>

            {/* 4 · Productos */}
            <section aria-label="Productos">
              <ProductsBlock
                products={data.products}
                onProductClick={(id, name) => setProductDetailTarget({ id, name })}
              />
            </section>

            {/* 5 · Métodos de pago */}
            <section aria-label="Métodos de pago y cobros">
              <PaymentMethodsBlock methods={data.payment_methods} />
            </section>

            {/* 6 · Alertas */}
            <section aria-label="Control operativo y alertas">
              <h3 className="text-sm font-black uppercase tracking-widest mb-3">Control operativo y alertas</h3>
              <AlertsBlock alerts={data.alerts} localQueue={localQueue} onGoToStatus={drillToStatus} />
            </section>

            {/* 7 · Horario */}
            <section aria-label="Actividad por horario">
              <HeatmapBlock heatmap={data.heatmap} />
            </section>
          </div>
        )}
      </StateRenderer>

      {/* Modal detalle de producto (drill-down de productos) */}
      {productDetailTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setProductDetailTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Ventas de ${productDetailTarget.name}`}
          data-testid="product-detail-modal"
        >
          <div
            className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest">Ventas de «{productDetailTarget.name}»</h4>
                <p className="text-[11px] text-muted-foreground">Documentos válidos del período que incluyen este producto.</p>
              </div>
              <button
                type="button" onClick={() => setProductDetailTarget(null)}
                className="w-11 h-11 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {productDetail.isLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
              ) : productDetail.error ? (
                <p className="text-xs text-destructive">Error al cargar el detalle: {(productDetail.error as Error).message}</p>
              ) : (productDetail.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin ventas del producto en el período.</p>
              ) : (
                <table className="w-full text-xs" data-testid="product-detail-table">
                  <thead>
                    <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-left">Vendedor</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Línea (CUP)</th>
                      <th className="p-2 text-right">Doc. total (CUP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(productDetail.data ?? []).map(r => (
                      <tr key={r.transaction_id} className="border-b border-border/50">
                        <td className="p-2 tabular-nums">{new Date(r.completed_at).toLocaleString('es-CU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="p-2 font-bold">{r.seller_name || '—'}</td>
                        <td className="p-2 text-right tabular-nums">{Math.round(r.quantity * 10) / 10}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrency(r.line_net_cup)}</td>
                        <td className="p-2 text-right tabular-nums font-black">{formatCurrency(r.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
