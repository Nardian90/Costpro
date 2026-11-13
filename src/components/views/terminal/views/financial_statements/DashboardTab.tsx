'use client';

/**
 * CP-FIN · Vista B — Pestaña «Dashboard» ejecutivo (período).
 *
 * KPIs del motor (resultado del período + saldos de balance a la fecha final),
 * evolución mensual Ingresos vs Gastos (recharts con useChartTheme — colores
 * reactivos a light/dark, patrón EvolutionChart del dashboard de ventas) y
 * distribución de gastos (SafePieChart). Las alertas SOLO se muestran cuando
 * el motor las activa, siempre sustentadas en datos.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  DollarSign,
  FileWarning,
  Landmark,
  Package,
  PieChart as PieChartIcon,
  RefreshCw,
  Settings2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useChartTheme, chartTooltipProps, chartAxisProps } from '@/lib/sales-dashboard/chart-theme';
import { SafePieChart } from '@/components/ui/SafePieChart';
import { fetchDashboard } from './fin-api';
import type { DashboardData, FinancialStatementTabId } from './types';

interface DashboardTabProps {
  storeId: string;
  from: string;
  to: string;
  refreshKey: number;
  /** Navega a otra pestaña de la vista (p. ej. desde la alerta de desequilibrio). */
  onGoToTab: (tab: FinancialStatementTabId) => void;
}

type KpiTone = 'primary' | 'success' | 'warning' | 'destructive';

interface KpiSpec {
  testId: string;
  label: string;
  value: number;
  subtext?: string;
  icon: React.ElementType;
  tone: KpiTone;
  tooltip: string;
}

function KpiCard({ spec }: { spec: KpiSpec }) {
  const Icon = spec.icon;
  return (
    <div
      className={cn(
        'relative p-3 sm:p-4 rounded-xl border bg-card shadow-sm',
        spec.tone === 'primary' && 'border-primary/15 bg-primary/[0.03]',
        spec.tone === 'success' && 'border-success/20 bg-success/[0.03]',
        spec.tone === 'warning' && 'border-warning/20 bg-warning/[0.03]',
        spec.tone === 'destructive' && 'border-destructive/20 bg-destructive/[0.03]',
      )}
      data-testid={spec.testId}
      title={spec.tooltip}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          {spec.label}
        </span>
        <Icon
          className={cn(
            'w-4 h-4 shrink-0',
            spec.tone === 'primary' && 'text-primary',
            spec.tone === 'success' && 'text-success',
            spec.tone === 'warning' && 'text-warning',
            spec.tone === 'destructive' && 'text-destructive',
          )}
        />
      </div>
      <div className="mt-1.5 text-lg sm:text-2xl font-black tabular-nums text-foreground leading-tight">
        {formatCurrency(spec.value)}
        <span className="ml-1 text-[10px] sm:text-xs font-bold text-muted-foreground">CUP</span>
      </div>
      {spec.subtext && (
        <p className="mt-1 text-[11px] font-bold text-muted-foreground tabular-nums">{spec.subtext}</p>
      )}
    </div>
  );
}

export function DashboardTab({ storeId, from, to, refreshKey, onGoToTab }: DashboardTabProps) {
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
      setError(e instanceof Error ? e.message : 'Error al cargar el dashboard financiero');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, from, to, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[260px] rounded-xl" />
        <Skeleton className="h-[260px] rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-destructive/5 border border-destructive/20 rounded-2xl">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-destructive">
            No se pudo cargar el dashboard
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest min-h-[44px]"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const k = data.kpis;
  const kpis: KpiSpec[] = [
    {
      testId: 'kpi-ingresos',
      label: 'Ingresos',
      value: k.ingresos,
      icon: DollarSign,
      tone: 'primary',
      tooltip: 'Ingresos reconocidos del período (naturaleza crédito), en CUP contable.',
    },
    {
      testId: 'kpi-utilidad-bruta',
      label: 'Utilidad bruta',
      value: k.utilidad_bruta,
      icon: TrendingUp,
      tone: k.utilidad_bruta < 0 ? 'destructive' : 'success',
      tooltip: 'Ingresos − costo de ventas del período.',
    },
    {
      testId: 'kpi-resultado-neto',
      label: 'Resultado neto',
      value: k.resultado_neto,
      icon: k.resultado_neto < 0 ? TrendingDown : TrendingUp,
      tone: k.resultado_neto < 0 ? 'destructive' : 'success',
      tooltip: 'Ingresos − costo de ventas − gastos del período.',
    },
    {
      testId: 'kpi-efectivo',
      label: 'Efectivo',
      value: k.efectivo_cup + k.efectivo_usd,
      subtext: `USD: ${formatCurrency(k.efectivo_usd)} en CUP`,
      icon: Wallet,
      tone: 'primary',
      tooltip: 'Efectivo en caja (CUP + equivalente CUP de la caja USD) a la fecha final del período.',
    },
    {
      testId: 'kpi-bancos',
      label: 'Bancos',
      value: k.bancos,
      icon: Landmark,
      tone: 'primary',
      tooltip: 'Dinero en bancos y transferencias (incluye Zelle) a la fecha final del período.',
    },
    {
      testId: 'kpi-cuentas-por-cobrar',
      label: 'Cuentas por cobrar',
      value: k.cuentas_por_cobrar,
      icon: Banknote,
      tone: 'primary',
      tooltip: 'Ventas a crédito pendientes de cobro a la fecha final del período.',
    },
    {
      testId: 'kpi-cuentas-por-pagar',
      label: 'Cuentas por pagar',
      value: k.cuentas_por_pagar,
      icon: ArrowLeftRight,
      tone: k.cuentas_por_pagar > 0 ? 'warning' : 'primary',
      tooltip: 'Obligaciones con proveedores y servicios pendientes de pago (no incluye nóminas ni retenciones).',
    },
    {
      testId: 'kpi-inventario',
      label: 'Inventario',
      value: k.inventario_valor,
      icon: Package,
      tone: 'primary',
      tooltip: 'Valor del inventario a costo promedio (WAC), en vivo.',
    },
  ];

  const series = (data.series_mensuales ?? []).map((s) => ({
    ...s,
    label: `${s.mes.slice(5)}/${s.mes.slice(2, 4)}`,
    resultado: s.ingresos - s.gastos,
  }));
  const topGastos = (data.top_gastos ?? []).map((g) => ({ name: g.name, value: g.total }));
  const a = data.alertas;
  const hayAlertas =
    a.gastos_mayores_que_ingresos ||
    a.desequilibrio_balance ||
    a.tipos_sin_configurar > 0 ||
    a.errores_contabilizacion > 0;

  return (
    <div className="space-y-5" data-testid="financial-dashboard-tab">
      {/* KPIs: 2 columnas en móvil, 4 en xl */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
        {kpis.map((spec) => (
          <KpiCard key={spec.testId} spec={spec} />
        ))}
      </div>

      {/* Evolución mensual: Ingresos vs Gastos + línea de resultado */}
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Ingresos vs Gastos por mes">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Ingresos vs Gastos por mes
          </h3>
          <span className="text-[11px] text-muted-foreground">CUP contable · {from} — {to}</span>
        </div>
        {series.length === 0 ? (
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
        {topGastos.length === 0 ? (
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

      {/* Alertas del motor (solo las activas, sustentadas en datos) */}
      {hayAlertas && (
        <section aria-label="Alertas financieras" className="space-y-2" data-testid="financial-alerts">
          {a.gastos_mayores_que_ingresos && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <span className="font-black uppercase tracking-wide">Los gastos superan los ingresos del período.</span>{' '}
                <span className="text-muted-foreground">
                  Ingresos {formatCurrency(k.ingresos)} frente a gastos totales{' '}
                  {formatCurrency(k.costo_ventas + k.gastos)} (costo de ventas + gastos).
                </span>
              </div>
            </div>
          )}
          {a.desequilibrio_balance && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 text-xs leading-relaxed">
                <span className="font-black uppercase tracking-wide text-destructive">
                  Desequilibrio del Estado de Situación: {formatCurrency(a.desequilibrio_monto)} CUP.
                </span>{' '}
                <span className="text-muted-foreground">
                  El motor reporta la diferencia tal cual; no se generan ajustes automáticos.
                </span>
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => onGoToTab('situacion')}
                    className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                    data-testid="alert-go-to-balance"
                  >
                    Ver Situación
                  </button>
                </div>
              </div>
            </div>
          )}
          {a.tipos_sin_configurar > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <Settings2 className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                <span className="font-black uppercase tracking-wide">
                  {a.tipos_sin_configurar} tipo{a.tipos_sin_configurar !== 1 ? 's' : ''} documental
                  {a.tipos_sin_configurar !== 1 ? 'es' : ''} sin configuración económica.
                </span>{' '}
                <span className="text-muted-foreground">
                  Documentos de esos tipos no generan asientos hasta configurar su regla en
                  Configuración de Documentos.
                </span>
              </p>
            </div>
          )}
          {a.errores_contabilizacion > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <FileWarning className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                <span className="font-black uppercase tracking-wide text-destructive">
                  {a.errores_contabilizacion} documento{a.errores_contabilizacion !== 1 ? 's' : ''} con
                  errores de contabilización.
                </span>{' '}
                <span className="text-muted-foreground">
                  El negocio no se bloqueó: los errores quedaron aislados y se pueden reprocesar.
                </span>
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
