'use client';

/**
 * CP-FIN · Dashboard ejecutivo — «Ritmo de ventas» (misión Estados
 * Financieros §5-§7, primera pestaña de la vista).
 *
 * COMPOSICIÓN SELECCIONADA (investigación §4): Alternativa C — KPI ejecutivo
 * con evolución acumulada — incorporando el Bullet Chart de la Alternativa B
 * como comparación visual contra el 100% del período anterior. El gauge
 * semicircular (Alternativa A) se descarta tras comparar las tres: el arco
 * fijo recorta o deforma índices >100% (limitación documentada por Tableau,
 * «bullet graphs beat gauge charts»), consume más espacio para la misma
 * información y no expresa tendencia.
 *
 * DATOS: RPC get_sales_dashboard_analytics (fuente de verdad de las ventas)
 * en dos llamadas (ventana actual + comparable del mes anterior); franja
 * complementaria desde fin_get_dashboard (motor contable), claramente
 * separada de las ventas comerciales. Cero importes inventados.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Skeleton as SkeletonUi } from '@/components/ui/skeleton';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useChartTheme, chartTooltipProps, chartAxisProps } from '@/lib/sales-dashboard/chart-theme';
import {
  resolvePeriodWindow, previousMonthEquivalentWindow, toDateInputValue,
} from '@/lib/sales-dashboard/periods';
import {
  computeRhythmMetrics, buildEvolutionChartData, bulletScale,
} from '@/lib/sales-dashboard/rhythm';
import { useSalesRhythm } from '@/hooks/api/useSalesRhythm';
import { fetchDashboard } from './fin-api';
import type { DashboardData } from './types';

interface SalesRhythmDashboardProps {
  storeId: string;
  /** YMD Havana (aplicado) del período consultado. */
  from: string;
  to: string;
  refreshKey: number;
}

/** Badge de variación porcentual (semántica: crecimiento/descenso/igual). */
function VariationBadge({ variationPct, diffCup }: { variationPct: number | null; diffCup: number }) {
  if (variationPct === null) return null;
  const up = variationPct > 0;
  const flat = variationPct === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black tabular-nums',
        flat ? 'bg-muted text-muted-foreground' : up ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
      )}
      data-testid="rhythm-variation-badge"
    >
      <Icon className="w-3.5 h-3.5" />
      {up ? '+' : ''}{variationPct.toFixed(1)}%
    </span>
  );
}

/** Diferencia absoluta con signo, en CUP. */
function AbsoluteDiff({ diffCup }: { diffCup: number }) {
  const up = diffCup > 0;
  const flat = diffCup === 0;
  return (
    <span className={cn('text-xs font-black tabular-nums', flat ? 'text-muted-foreground' : up ? 'text-success' : 'text-destructive')}>
      {up ? '+' : ''}{formatCurrency(diffCup)} CUP
    </span>
  );
}

/**
 * Bullet chart (Alternativa B): barra de rendimiento + marca vertical del
 * 100% histórico. Escala lineal sin recortes: el tope crece en múltiplos de
 * 25% para cubrir el índice real (el gauge, en cambio, recorta >100%).
 */
function SalesBullet({ indexPct }: { indexPct: number | null }) {
  const { cap, markerPct, overflows } = bulletScale(indexPct);
  const ok = indexPct !== null && Number.isFinite(indexPct);
  const idx = ok ? (indexPct as number) : null;
  const barPct = ok ? Math.max(0, Math.min(100, ((idx as number) / cap) * 100)) : 0;
  const tone =
    !ok ? 'bg-muted-foreground/40'
      : (idx as number) >= 100 ? 'bg-success'
      : (idx as number) >= 90 ? 'bg-warning'
      : 'bg-destructive';

  return (
    <div className="w-full" data-testid="rhythm-bullet">
      <div
        role="img"
        aria-label={
          ok
            ? `Índice de rendimiento ${(idx as number).toFixed(1)}% respecto al 100% del período anterior`
            : 'Sin base comparable: el período anterior no registró ventas'
        }
      >
        <div className="relative h-4 w-full">
          {/* Zona de referencia sutil hasta el 100% (rango cualitativo Tableau) */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary/10" style={{ width: `${markerPct}%` }} />
          {/* Pista completa */}
          <div className="absolute inset-y-[5px] left-0 right-0 rounded-full bg-muted" />
          {/* Barra de rendimiento actual */}
          <div className={cn('absolute inset-y-[5px] left-0 rounded-full transition-all duration-500', tone)} style={{ width: `${barPct}%` }} />
          {/* Marca de referencia: 100% = período anterior */}
          <div className="absolute -top-1 h-6 w-[3px] rounded bg-foreground" style={{ left: `${markerPct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground tabular-nums">
          <span>0%</span>
          <span className="text-foreground font-black">▲ 100% · período anterior</span>
          <span>{overflows ? `${cap}% (escala)` : `${cap}%`}</span>
        </div>
      </div>
      {overflows && idx !== null && (
        <p className="mt-1 text-[10px] font-bold text-success">
          El índice ({idx.toFixed(1)}%) supera la escala visible: la barra se dibuja al tope, el valor real está en el encabezado.
        </p>
      )}
    </div>
  );
}

export function SalesRhythmDashboard({ storeId, from, to, refreshKey }: SalesRhythmDashboardProps) {
  const token = useAuthStore((s) => s.token);
  const theme = useChartTheme();
  const tooltipProps = chartTooltipProps(theme);
  const axisProps = chartAxisProps(theme);

  // Ventana Havana (DST-safe) a partir de las YMD aplicadas + comparable.
  const window = resolvePeriodWindow('custom', from, to);
  const prevWindow = previousMonthEquivalentWindow(window);
  const prevLabel = `${toDateInputValue(prevWindow.from)} — ${toDateInputValue(prevWindow.to)}`;

  const q = useSalesRhythm(window, storeId);

  // ── Franja financiera complementaria (motor contable; independiente) ──
  const [finData, setFinData] = useState<DashboardData | null>(null);
  const [finLoading, setFinLoading] = useState(true);
  const [finError, setFinError] = useState<string | null>(null);
  const loadFin = useCallback(async () => {
    setFinLoading(true);
    setFinError(null);
    try {
      const d = await fetchDashboard(storeId, from, to, token);
      setFinData(d);
    } catch (e) {
      setFinError(e instanceof Error ? e.message : 'Error al consultar el motor contable');
      setFinData(null);
    } finally {
      setFinLoading(false);
    }
  }, [storeId, from, to, token]);
  useEffect(() => { loadFin(); }, [loadFin, refreshKey]);

  if (q.isLoading) {
    return (
      <div className="space-y-5" data-testid="sales-rhythm-loading">
        <SkeletonUi className="h-[220px] rounded-xl" />
        <SkeletonUi className="h-[300px] rounded-xl" />
        <SkeletonUi className="h-[120px] rounded-xl" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-destructive/5 border border-destructive/20 rounded-2xl" data-testid="sales-rhythm-error">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-destructive">
            No se pudo cargar el ritmo de ventas
          </p>
          <p className="text-xs text-muted-foreground mt-1">{q.error instanceof Error ? q.error.message : 'Error de consulta'}</p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest min-h-[44px]"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }
  if (!q.data) return null;

  const kpi = q.data.current.kpi;
  const metrics = computeRhythmMetrics(
    {
      netCup: kpi.net_cup,
      devolutionsCup: kpi.devolutions_cup,
      devolutionsUsd: kpi.devolutions_usd,
      ops: kpi.ops,
    },
    {
      netCup: kpi.prev.net_cup,
      devolutionsCup: kpi.prev.devolutions_cup,
      devolutionsUsd: kpi.prev.devolutions_usd,
      ops: kpi.prev.ops,
    },
  );

  const evolution = buildEvolutionChartData(q.data.current.series, q.data.previous.series);
  const sinActividad = kpi.ops === 0 && metrics.ventasNetas === 0;

  return (
    <div className="space-y-5" data-testid="sales-rhythm-dashboard">
      {/* ── Zona protagonista: Ritmo de ventas ─────────────────────────── */}
      <section className="rounded-xl border border-primary/15 bg-card p-4 sm:p-6 shadow-sm" data-testid="rhythm-kpi-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Ritmo de ventas</h3>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Ventas netas comerciales · CUP
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-foreground tabular-nums">{from} — {to}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">Comparado con: {prevLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_minmax(260px,38%)] lg:items-center">
          {/* Valor central (jerarquía Attio: el número manda) */}
          <div>
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight text-foreground leading-none" data-testid="rhythm-net-sales">
                {formatCurrency(metrics.ventasNetas)}
              </span>
              <span className="text-sm font-bold text-muted-foreground pb-1">CUP</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {metrics.indexPct !== null ? (
                <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5" data-testid="rhythm-index">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Índice</span>
                  <span className="text-lg font-black tabular-nums text-foreground">{metrics.indexPct.toFixed(1)}%</span>
                </span>
              ) : null}
              <VariationBadge variationPct={metrics.variationPct} diffCup={metrics.diffCup} />
              {metrics.variationPct !== null && <AbsoluteDiff diffCup={metrics.diffCup} />}
            </div>
            {/* Componentes (desglose verificable de la cifra principal) */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-lg border border-border bg-background p-2.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ventas (docs)</p>
                <p className="text-sm font-black tabular-nums text-foreground">{formatCurrency(metrics.ventasDocumentos)}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.ops} operación{kpi.ops === 1 ? '' : 'es'}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-2.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Devoluciones (NC)</p>
                <p className="text-sm font-black tabular-nums text-destructive">−{formatCurrency(metrics.devolucionesCup)}</p>
                <p className="text-[10px] text-muted-foreground">CUP {kpi.devolutions_usd > 0 ? `· USD ${formatCurrency(kpi.devolutions_usd)} sin convertir` : ''}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-2.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Período anterior</p>
                <p className="text-sm font-black tabular-nums text-foreground">{formatCurrency(metrics.prevVentasNetas)}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.prev.ops} operación{kpi.prev.ops === 1 ? '' : 'es'}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-2.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ticket promedio</p>
                <p className="text-sm font-black tabular-nums text-foreground">{formatCurrency(kpi.avg_ticket_cup)}</p>
                <p className="text-[10px] text-muted-foreground">antes: {formatCurrency(kpi.prev.avg_ticket_cup)}</p>
              </div>
            </div>
          </div>

          {/* Comparación visual contra el 100% histórico */}
          <div className="rounded-xl border border-border bg-background p-3 sm:p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
              Rendimiento vs. 100% histórico
            </p>
            {metrics.baseState === 'ok' ? (
              <SalesBullet indexPct={metrics.indexPct} />
            ) : (
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3" data-testid="rhythm-no-base">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-foreground">
                  {metrics.baseState === 'no-base'
                    ? 'Sin base comparable: el período anterior no registró ventas netas. El importe actual se mantiene visible; no se calcula porcentaje.'
                    : 'La base del período anterior es negativa (devoluciones mayores que ventas): no permite una comparación porcentual fiable. La variación absoluta se muestra arriba.'}
                </p>
              </div>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              El 100% representa exclusivamente el período histórico de referencia — no un
              presupuesto ni una meta comercial.
            </p>
          </div>
        </div>

        {sinActividad && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-3" data-testid="rhythm-empty">
            <Landmark className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Período sin actividad: no hay documentos de venta completados en el intervalo consultado.
            </p>
          </div>
        )}
        {kpi.devolutions_usd > 0 && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Nota: existen devoluciones en USD ({formatCurrency(kpi.devolutions_usd)}) que no se suman al CUP
            contable — la operación no registra tipo de cambio histórico convertible y no se inventan tasas.
          </p>
        )}
      </section>

      {/* ── Evolución acumulada de las ventas ──────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Evolución acumulada de ventas">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest">Evolución acumulada de ventas</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">Períodos equivalentes · CUP</span>
        </div>
        {evolution.length < 2 ? (
          <p className="py-12 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
            Datos insuficientes para la evolución del período
          </p>
        ) : (
          <div className="w-full h-[280px] sm:h-[320px]" data-testid="rhythm-evolution-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} strokeOpacity={0.6} vertical={false} />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  minTickGap={10}
                  tick={axisProps.tick}
                  tickLine={axisProps.tickLine}
                  axisLine={axisProps.axisLine}
                />
                <YAxis
                  tick={axisProps.tick}
                  tickLine={axisProps.tickLine}
                  axisLine={axisProps.axisLine}
                  tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  width={46}
                />
                <Tooltip
                  formatter={(value: number | string, name: string) => [`${formatCurrency(Number(value))} CUP`, name]}
                  labelFormatter={(label: string) => `Día ${label} del período`}
                  contentStyle={tooltipProps.contentStyle}
                  labelStyle={tooltipProps.labelStyle}
                  itemStyle={tooltipProps.itemStyle}
                  cursor={tooltipProps.cursor}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => (
                  <span style={{ color: theme.axis, cursor: 'pointer', fontSize: 11 }}>{v}</span>
                )} />
                <Line
                  type="monotone"
                  dataKey="cur"
                  name="Actual (acumulado)"
                  stroke={theme.series[0]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="prev"
                  name="Mes anterior (acumulado)"
                  stroke={theme.axis}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Ventas netas de documento acumuladas día a día (CUP). La línea punteada es el período
          comparable del mes anterior; las divergencias muestran dónde se ganó o perdió ritmo.
        </p>
      </section>

      {/* ── Información financiera complementaria (motor contable) ─────── */}
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Información financiera del período" data-testid="rhythm-fin-strip">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest">Información financiera del período</h3>
          <span className="text-[11px] text-muted-foreground">Motor de partida doble · CUP contable</span>
        </div>
        {finLoading ? (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
            {[...Array(4)].map((_, i) => <SkeletonUi key={i} className="h-[72px] rounded-lg" />)}
          </div>
        ) : finError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="text-xs text-foreground">No se pudo consultar la información contable: {finError}</p>
            <button type="button" onClick={loadFin} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest hover:bg-muted">
              <RefreshCw className="w-3 h-3" /> Reintentar
            </button>
          </div>
        ) : finData ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
              {[
                { label: 'Ingresos contables', value: finData.kpis.ingresos, tip: 'Crédito − débito de categorías de ingreso del período (las devoluciones restan como contra-ingreso).' },
                { label: 'Costo de ventas', value: finData.kpis.costo_ventas, tip: 'Costo de los productos vendidos reconocido por el motor (débito − crédito).' },
                { label: 'Gastos operacionales', value: finData.kpis.gastos, tip: 'Consumo interno (vales), servicios recibidos, nómina y demás gastos del período.' },
                { label: 'Resultado del período', value: finData.kpis.resultado_neto, tip: 'Ingresos − costo de ventas − gastos (resultado contable, no ventas).' },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border bg-background p-2.5" title={c.tip}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{c.label}</p>
                  <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(c.value)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] text-muted-foreground leading-relaxed">
              Separación conceptual: estas cifras provienen del motor contable (partida doble) e
              incluyen efectos que las ventas comerciales no capturan; no deben sumarse ni
              compararse directamente con el «Ritmo de ventas» de arriba.
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}
