'use client';

/**
 * ADNEGOCIO 2026-11-22 — Gráficos del período en el Estado de Rendimiento.
 *
 * Contenido del antiguo apartado «Resumen» de la pestaña Análisis (misión
 * ADNEGOCIO §3: la información se distribuye al informe al que corresponde —
 * ingresos, costos, gastos y resultados → Estado de Rendimiento). Código de
 * los gráficos trasladado SIN cambios de cálculo ni de consultas: misma
 * fuente (GET /api/fin/statements?type=dashboard → RPC fin_get_dashboard,
 * series_mensuales y top_gastos), mismos componentes y testids.
 *
 * El error de consulta se tolera (no bloquea el Estado de Rendimiento, que
 * vive arriba con su propia consulta): se muestra un aviso con reintento.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, PieChart as PieChartIcon, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useChartTheme, chartTooltipProps, chartAxisProps } from '@/lib/sales-dashboard/chart-theme';
import { SafePieChart } from '@/components/ui/SafePieChart';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchDashboard } from './fin-api';
import type { DashboardData } from './types';

interface IncomeChartsProps {
  storeId: string;
  from: string;
  to: string;
  refreshKey: number;
}

export function IncomeCharts({ storeId, from, to, refreshKey }: IncomeChartsProps) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const theme = useChartTheme();
  const tooltipProps = chartTooltipProps(theme);
  const axisProps = chartAxisProps(theme);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchDashboard(storeId, from, to, token);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al consultar los gráficos del período');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, from, to, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const series = (data?.series_mensuales ?? []).map((s) => ({
    ...s,
    label: `${s.mes.slice(5)}/${s.mes.slice(2, 4)}`,
    resultado: s.ingresos - s.gastos,
  }));
  const topGastos = (data?.top_gastos ?? []).map((g) => ({ name: g.name, value: g.total }));

  return (
    <div className="space-y-5" data-testid="income-charts">
      {/* Evolución mensual: Ingresos vs Gastos + línea de resultado */}
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Ingresos vs Gastos por mes">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Ingresos vs Gastos por mes
          </h3>
          <span className="text-[11px] text-muted-foreground">CUP contable · {from} — {to}</span>
        </div>
        {loading ? (
          <Skeleton className="h-[260px] rounded-xl" />
        ) : error ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="text-xs text-foreground">{error}</p>
            <button
              type="button"
              onClick={load}
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest hover:bg-muted"
            >
              <RefreshCw className="w-3 h-3" /> Reintentar
            </button>
          </div>
        ) : series.length === 0 ? (
          <p className="py-12 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
            Sin movimientos en el período
          </p>
        ) : (
          <div className="w-full h-[260px] sm:h-[300px]" data-testid="dashboard-income-expense-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} strokeOpacity={0.6} vertical={false} />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  minTickGap={12}
                  tick={axisProps.tick}
                  tickLine={axisProps.tickLine}
                  axisLine={axisProps.axisLine}
                />
                <YAxis
                  tick={axisProps.tick}
                  tickLine={axisProps.tickLine}
                  axisLine={axisProps.axisLine}
                  tickFormatter={(v: number) => (v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  width={42}
                />
                <Tooltip
                  formatter={(value: number | string, name: string) => [formatCurrency(Number(value)), name]}
                  contentStyle={tooltipProps.contentStyle}
                  labelStyle={tooltipProps.labelStyle}
                  itemStyle={tooltipProps.itemStyle}
                  cursor={tooltipProps.cursor}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => (
                  <span style={{ color: theme.axis, cursor: 'pointer', fontSize: 11 }}>{v}</span>
                )} />
                <Bar dataKey="ingresos" name="Ingresos (CUP)" fill={theme.series[0]} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos (CUP)" fill={theme.negative} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                <Line dataKey="resultado" name="Resultado (CUP)" stroke={theme.series[1]} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Distribución de gastos */}
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Distribución de gastos">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-primary" /> Distribución de gastos
          </h3>
          <span className="text-[11px] text-muted-foreground">Top categorías del período · CUP</span>
        </div>
        {loading ? (
          <Skeleton className="h-[280px] rounded-xl" />
        ) : error ? null : topGastos.length === 0 ? (
          <p className="py-12 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
            Sin movimientos en el período
          </p>
        ) : (
          <div data-testid="dashboard-expenses-pie">
            <SafePieChart
              data={topGastos}
              colors={[...theme.series]}
              height={280}
              innerRadius={55}
              outerRadius={90}
              showLegend
              title="Distribución de gastos por categoría"
            />
          </div>
        )}
      </section>
    </div>
  );
}
