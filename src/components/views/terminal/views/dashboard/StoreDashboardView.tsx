'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ReactECharts from 'echarts-for-react';
import type { DateRange } from 'react-day-picker';
import {
  X, ArrowLeft, TrendingUp, TrendingDown, ShoppingCart, Banknote,
  AlertTriangle, AlertCircle, Lightbulb, Sparkles, Package,
  Clock, Calendar as CalendarIcon, Target, Zap, RefreshCw, ChevronRight,
  ShoppingBag, Tag, BarChart3, Activity, Percent, DollarSign,
  ArrowUpRight, ArrowDownRight, ExternalLink, PanelLeftClose,
  PanelLeftOpen, Search, CalendarRange,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useStoreAnalytics, useStoreInsights, type Insight, type InsightDetail } from '@/hooks/api/useStoreAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useUIStore } from '@/store';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

// ECharts cargado dinámicamente
const ECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full rounded-xl bg-muted/20 animate-pulse" />,
}) as unknown as typeof ReactECharts;

// ── Props ──────────────────────────────────────────────────────

interface StoreDashboardViewProps {
  storeId: string;
  storeName: string;
  onClose: () => void;
}

// ── Colores y constantes ───────────────────────────────────────

const CHART_PALETTE = [
  '#3B82F6', '#8B5CF6', '#06B6D4', '#10B981',
  '#F59E0B', '#EF4444', '#EC4899', '#14B8A6',
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  mixed: 'Mixto',
  wallet: 'Billetera',
  other: 'Otro',
};

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Compact currency format: $4.5k, $1.2M */
function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ── Componente principal ───────────────────────────────────────

export default function StoreDashboardView({ storeId, storeName, onClose }: StoreDashboardViewProps) {
  // Estado: o bien "days" (7/30/90) o rango personalizado
  const [days, setDays] = useState(30);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  // Construir parámetros para el hook
  const analyticsParams = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return {
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
      };
    }
    return days; // number = legacy mode
  }, [days, dateRange]);

  const { data: analytics, isLoading, error, refetch, isFetching } = useStoreAnalytics(storeId, analyticsParams);
  const insights = useStoreInsights(analytics);
  const { setCurrentView, sidebarState, toggleSidebar } = useUIStore();

  const sidebarInset = useMemo(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return '0rem';
    switch (sidebarState) {
      case 'expanded': return '18rem';
      case 'rail': return '5rem';
      case 'closed': return '0rem';
      default: return '0rem';
    }
  }, [sidebarState]);

  // Etiqueta del rango activo
  const rangeLabel = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, 'dd/MM/yy')} - ${format(dateRange.to, 'dd/MM/yy')}`;
    }
    return `Últimos ${days}d`;
  }, [days, dateRange]);

  // Presets para el date picker
  const applyPreset = (presetDays: number) => {
    setDays(presetDays);
    setDateRange(undefined);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-background/98 backdrop-blur-xl overflow-y-auto"
      style={{ left: sidebarInset }}
    >
      {/* Header sticky */}
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border/50">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={toggleSidebar}
              className="shrink-0 w-9 h-9 rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={sidebarState === 'expanded' ? 'Contraer menú lateral' : 'Expandir menú lateral'}
              title={sidebarState === 'expanded' ? 'Contraer menú' : sidebarState === 'rail' ? 'Cerrar menú' : 'Abrir menú'}
            >
              {sidebarState === 'expanded' ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-sm sm:text-base text-foreground tracking-tight truncate flex items-center gap-2">
                Dashboard · {storeName}
              </h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-widest hidden sm:block">
                {rangeLabel} · Análisis ejecutivo para toma de decisiones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-9 h-9 rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center disabled:opacity-50"
              aria-label="Refrescar datos"
              title="Refrescar"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', isFetching && 'animate-spin')} />
            </button>

            {/* ToggleGroup: solo visible cuando NO hay rango personalizado activo */}
            {!dateRange?.from && (
              <ToggleGroup
                type="single"
                value={String(days)}
                onValueChange={(v) => { if (v) { setDays(Number(v)); setDateRange(undefined); } }}
                className="bg-muted rounded-xl p-1"
              >
                <ToggleGroupItem value="7" className="text-xs font-bold px-2.5 py-1.5 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  7d
                </ToggleGroupItem>
                <ToggleGroupItem value="30" className="text-xs font-bold px-2.5 py-1.5 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  30d
                </ToggleGroupItem>
                <ToggleGroupItem value="90" className="text-xs font-bold px-2.5 py-1.5 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  90d
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {/* Date Range Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'h-9 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors',
                    dateRange?.from
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/50 bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-label="Seleccionar rango de fechas"
                  title="Rango de fechas personalizado"
                >
                  <CalendarRange className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{dateRange?.from ? 'Personalizado' : 'Rango'}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-border/50 bg-card shadow-sm rounded-2xl" align="end">
                <div className="p-2 border-b border-border/30 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyPreset(7)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-muted text-muted-foreground"
                  >
                    7d
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(30)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-muted text-muted-foreground"
                  >
                    30d
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(90)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-muted text-muted-foreground"
                  >
                    90d
                  </button>
                </div>
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    if (range?.from && range?.to) {
                      // Validar que el rango no sea futuro ni > 365 días
                      const today = new Date();
                      if (range.to > today) {
                        toast.error('La fecha final no puede ser futura');
                        return;
                      }
                      const diffDays = Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24));
                      if (diffDays > 365) {
                        toast.error('El rango máximo es de 365 días');
                        return;
                      }
                    }
                  }}
                  numberOfMonths={2}
                  disabled={(date) => date > new Date() || date < subDays(new Date(), 730)}
                  initialFocus
                  className="rounded-2xl"
                />
                {dateRange?.from && dateRange?.to && (
                  <div className="p-2 border-t border-border/30 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {format(dateRange.from, 'dd/MM/yy')} → {format(dateRange.to, 'dd/MM/yy')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDateRange(undefined)}
                      className="text-[10px] font-black uppercase tracking-wider text-destructive hover:underline"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center"
              aria-label="Cerrar dashboard"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 lg:px-8 pb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <button
            type="button"
            onClick={onClose}
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Tiendas
          </button>
          <ChevronRight className="w-3 h-3 opacity-50" />
          <span className="text-foreground">Dashboard {storeName}</span>
        </div>
      </div>

      {/* Body — padding-left respeta sidebar del shell en desktop */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto space-y-5">
        {isLoading ? (
          <DashboardSkeleton />
        ) : error ? (
          <DashboardError error={error} />
        ) : !analytics ? (
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold uppercase tracking-wider">Sin datos</p>
          </div>
        ) : (
          <>
            {/* SECCIÓN 1: KPIs Hero Row con tendencias */}
            <KpiHeroRow analytics={analytics} days={days} />

            {/* SECCIÓN 2: Insights prioritarios (compacto, máximo 4 destacados) */}
            <InsightsPriorityPanel insights={insights} />

            {/* SECCIÓN 3: Gráfico principal de ventas temporales */}
            <ChartCard
              title="Tendencia de ventas"
              subtitle={`Últimos ${days} días — comparativa con promedio móvil 7 días`}
              icon={<TrendingUp className="w-4 h-4 text-primary" />}
              action={
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary" /> Ventas diarias
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Promedio 7d
                  </span>
                </div>
              }
            >
              <SalesTimeSeriesChart analytics={analytics} />
            </ChartCard>

            {/* SECCIÓN 4: Top productos + Distribución de pagos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard
                title="Top 10 productos por ingreso"
                subtitle="Rentabilidad y volumen"
                icon={<Target className="w-4 h-4 text-success" />}
              >
                <TopProductsChart analytics={analytics} />
              </ChartCard>
              <ChartCard
                title="Distribución de pagos"
                subtitle="Métodos utilizados por clientes"
                icon={<Banknote className="w-4 h-4 text-warning" />}
              >
                <PaymentDistributionChart analytics={analytics} />
              </ChartCard>
            </div>

            {/* SECCIÓN 5: Margen por categoría + Ventas por día de semana */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard
                title="Margen por categoría"
                subtitle="Rentabilidad (rojo <15%, ámbar <25%, púrpura ≥25%)"
                icon={<Zap className="w-4 h-4 text-purple-500" />}
              >
                <CategoryMarginsChart analytics={analytics} />
              </ChartCard>
              <ChartCard
                title="Ventas por día de semana"
                subtitle="Cuándo vendes más"
                icon={<Calendar className="w-4 h-4 text-cyan-500" />}
              >
                <WeekdayChart analytics={analytics} />
              </ChartCard>
            </div>

            {/* SECCIÓN 6: Ventas por hora del día */}
            <ChartCard
              title="Ventas por hora del día"
              subtitle="Identifica tus horas pico (resaltadas en azul)"
              icon={<Clock className="w-4 h-4 text-primary" />}
            >
              <HourDistributionChart analytics={analytics} />
            </ChartCard>

            {/* SECCIÓN 7: Alertas operativas (3 columnas) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <StockAlertCard
                title="Stock crítico"
                subtitle="Reposición urgente requerida"
                items={analytics.low_stock.map((p) => ({
                  id: p.product_id,
                  name: p.name,
                  metric: `${p.stock_current}/${p.min_stock}`,
                  detail: `Déficit: ${p.deficit} uds`,
                  severity: 'critical' as const,
                }))}
                emptyText="Todo el stock está saludable"
                icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
                actionLabel="Ir a inventario"
                onAction={() => { setCurrentView('inventory'); onClose(); }}
              />
              <StockAlertCard
                title="Movimiento lento"
                subtitle="Sin ventas en 30+ días"
                items={analytics.slow_movers.slice(0, 8).map((p) => ({
                  id: p.product_id,
                  name: p.name,
                  metric: `${p.days_without_sales}d`,
                  detail: `Stock: ${p.stock_current} uds`,
                  severity: 'warning' as const,
                }))}
                emptyText="Todos los productos rotan bien"
                icon={<Clock className="w-4 h-4 text-warning" />}
                actionLabel="Crear oferta"
                onAction={() => { setCurrentView('ofertas'); onClose(); }}
              />
              <StockAlertCard
                title="Exceso de inventario"
                subtitle="Capital inmovilizado"
                items={analytics.overstock.slice(0, 8).map((p) => ({
                  id: p.product_id,
                  name: p.name,
                  metric: p.days_of_stock ? `${p.days_of_stock}d` : '∞',
                  detail: formatCurrency(p.overstock_value),
                  severity: 'opportunity' as const,
                }))}
                emptyText="Sin exceso de inventario"
                icon={<Package className="w-4 h-4 text-cyan-500" />}
                actionLabel="Ver catálogo"
                onAction={() => { setCurrentView('catalog'); onClose(); }}
              />
            </div>

            {/* SECCIÓN 8: Top productos por cantidad (tabla) */}
            <ChartCard
              title="Ranking por unidades vendidas"
              subtitle="Los productos más populares"
              icon={<ShoppingBag className="w-4 h-4 text-success" />}
            >
              <TopProductsQuantityTable analytics={analytics} />
            </ChartCard>

            {/* SECCIÓN 9: Análisis específico por categoría (drill-down) */}
            <CategoryDrillDownPanel analytics={analytics} />

            {/* SECCIÓN 10: Análisis específico por producto (drill-down) */}
            <ProductDrillDownPanel analytics={analytics} onGoToCatalog={() => { setCurrentView('catalog'); onClose(); }} />

            {/* SECCIÓN 11: Todos los insights en lista expandible */}
            {insights.length > 4 && (
              <AllInsightsPanel insights={insights} onSelectInsight={setSelectedInsight} />
            )}
          </>
        )}
      </div>

      {/* Modal de detalle del insight seleccionado */}
      {selectedInsight && (
        <InsightDetailModal
          insight={selectedInsight}
          onClose={() => setSelectedInsight(null)}
        />
      )}
    </div>
  );
}

// ── KPIs Hero Row con tendencia ────────────────────────────────

function KpiHeroRow({ analytics, days }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']>; days: number }) {
  const k = analytics.kpis;
  const profit = k.period_sales - k.period_cost;
  const marginPct = k.period_sales > 0 ? (profit / k.period_sales) * 100 : 0;

  // Tendencia: comparar últimos 7 días vs anteriores (si hay data)
  const trend = useMemo(() => {
    if (analytics.sales_series.length < 14) return null;
    const recent = analytics.sales_series.slice(-7).reduce((s, p) => s + p.sales, 0);
    const previous = analytics.sales_series.slice(-14, -7).reduce((s, p) => s + p.sales, 0);
    if (previous === 0) return null;
    return ((recent - previous) / previous) * 100;
  }, [analytics.sales_series]);

  const cards = [
    {
      label: `Ventas (${days}d)`,
      value: formatCurrency(k.period_sales),
      icon: TrendingUp,
      gradient: 'from-primary/15 via-primary/5 to-transparent',
      iconColor: 'text-primary',
      accent: 'border-primary/20',
      sub: (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
          <span className="text-muted-foreground">Hoy:</span>
          <span className="text-foreground">{formatCurrency(k.today_sales)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{k.today_transactions} tx</span>
        </span>
      ),
      trend,
    },
    {
      label: 'Costo mercadería',
      value: formatCurrency(k.period_cost),
      icon: ArrowUpRight,
      gradient: 'from-muted-foreground/10 via-muted/5 to-transparent',
      iconColor: 'text-muted-foreground',
      accent: 'border-border/40',
      sub: (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>{k.period_items_sold.toFixed(0)} unidades vendidas</span>
        </span>
      ),
      trend: null,
    },
    {
      label: 'Ganancia neta',
      value: formatCurrency(profit),
      icon: Target,
      gradient: 'from-success/15 via-success/5 to-transparent',
      iconColor: 'text-success',
      accent: 'border-success/20',
      sub: (
        <span className={cn(
          'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider',
          marginPct >= 25 ? 'text-success' : marginPct >= 15 ? 'text-warning' : 'text-destructive',
        )}>
          <Percent className="w-3 h-3" />
          <span>Margen: {marginPct.toFixed(1)}%</span>
          {marginPct < 15 && <span className="text-destructive">(bajo)</span>}
          {marginPct >= 25 && <span className="text-success">(saludable)</span>}
        </span>
      ),
      trend: null,
    },
    {
      label: 'Ticket promedio',
      value: formatCurrency(k.avg_ticket),
      icon: ShoppingCart,
      gradient: 'from-purple-500/10 via-purple-500/5 to-transparent',
      iconColor: 'text-purple-500',
      accent: 'border-purple-500/20',
      sub: (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Activity className="w-3 h-3" />
          <span>{k.avg_items_per_sale.toFixed(1)} uds/venta · {k.period_transactions} transacciones</span>
        </span>
      ),
      trend: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className={cn(
            'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 sm:p-5',
            card.gradient,
            card.accent,
          )}
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {card.label}
            </span>
            <card.icon className={cn('w-4 h-4', card.iconColor)} />
          </div>
          <p className="text-xl sm:text-2xl font-black tabular-nums text-foreground tracking-tight leading-none">
            {card.value}
          </p>
          <div className="mt-2">
            {card.sub}
            {card.trend !== null && card.trend !== undefined && (
              <span className={cn(
                'ml-2 inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded',
                card.trend > 0 ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10',
              )}>
                {card.trend > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                {Math.abs(card.trend).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Insights Priority Panel (top 4, compacto) ──────────────────

const SEVERITY_CONFIG: Record<Insight['severity'], { color: string; bg: string; border: string; icon: typeof AlertCircle }> = {
  critical: { color: 'text-destructive', bg: 'bg-destructive/5', border: 'border-destructive/30', icon: AlertCircle },
  warning: { color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/30', icon: AlertTriangle },
  opportunity: { color: 'text-cyan-600', bg: 'bg-cyan-500/5', border: 'border-cyan-500/30', icon: Lightbulb },
  positive: { color: 'text-success', bg: 'bg-success/5', border: 'border-success/30', icon: Sparkles },
};

const SEVERITY_ORDER: Record<Insight['severity'], number> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
  positive: 3,
};

function InsightsPriorityPanel({ insights, onSelectInsight }: { insights: Insight[]; onSelectInsight?: (i: Insight) => void }) {
  // Ordenar por severidad y mostrar top 4
  const sorted = [...insights].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const top = sorted.slice(0, 4);

  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
        <Sparkles className="w-8 h-8 mx-auto mb-2 text-success" />
        <p className="text-sm font-bold text-success uppercase tracking-wider">Todo en orden</p>
        <p className="text-xs text-muted-foreground mt-1">No hay alertas ni oportunidades pendientes</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lightbulb className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-tight">Insights prioritarios</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Clic en cada insight para ver detalle y respaldo histórico</p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/40 px-2 py-1 rounded-full">
          {insights.length} total
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
        {top.map((insight) => {
          const config = SEVERITY_CONFIG[insight.severity];
          const Icon = config.icon;
          return (
            <button
              key={insight.id}
              type="button"
              onClick={() => onSelectInsight?.(insight)}
              className={cn(
                'rounded-xl border p-3.5 flex gap-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5',
                config.bg, config.border,
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-background/70', config.color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className={cn('font-bold text-xs uppercase tracking-tight leading-tight', config.color)}>
                    {insight.title}
                  </p>
                  {insight.metric && (
                    <span className={cn('text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded bg-background/70 shrink-0', config.color)}>
                      {insight.metric}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5 line-clamp-2">{insight.message}</p>
                <p className="text-[11px] font-medium text-foreground/80 leading-relaxed flex items-start gap-1">
                  <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 opacity-50" />
                  <span className="line-clamp-2">{insight.recommendation}</span>
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── All Insights Panel (lista completa, expandible) ────────────

function AllInsightsPanel({ insights, onSelectInsight }: { insights: Insight[]; onSelectInsight?: (i: Insight) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...insights].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const visible = expanded ? sorted : sorted.slice(0, 8);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-tight">Todos los insights</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{insights.length} avisos · clic para ver detalle</p>
          </div>
        </div>
        {insights.length > 8 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
          >
            {expanded ? 'Ver menos' : `Ver ${insights.length - 8} más`}
          </button>
        )}
      </div>
      <div className="divide-y divide-border/30">
        {visible.map((insight) => {
          const config = SEVERITY_CONFIG[insight.severity];
          const Icon = config.icon;
          return (
            <button
              key={insight.id}
              type="button"
              onClick={() => onSelectInsight?.(insight)}
              className={cn('w-full px-5 py-3 flex gap-3 items-start hover:bg-muted/30 transition-colors text-left', config.bg)}
            >
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-background/70', config.color)}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('font-bold text-xs uppercase tracking-tight', config.color)}>{insight.title}</p>
                  {insight.metric && (
                    <span className={cn('text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded bg-background/70 shrink-0', config.color)}>
                      {insight.metric}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{insight.message}</p>
                <p className="text-[11px] font-medium text-foreground/70 leading-relaxed mt-1 flex items-start gap-1">
                  <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 opacity-50" />
                  <span>{insight.recommendation}</span>
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Chart Card wrapper ─────────────────────────────────────────

function ChartCard({
  title, subtitle, icon, children, action,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-sm uppercase tracking-tight text-foreground truncate">{title}</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ── Sales Time Series Chart con promedio móvil ─────────────────

function SalesTimeSeriesChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const option = useMemo(() => {
    const series = analytics.sales_series;
    // Promedio móvil 7 días
    const movingAvg = series.map((_, i) => {
      const window = series.slice(Math.max(0, i - 6), i + 1);
      return window.reduce((s, p) => s + p.sales, 0) / window.length;
    });

    return {
      grid: { left: 55, right: 20, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (params: any) => {
          const date = new Date(params[0].axisValue);
          const dateStr = date.toLocaleDateString('es-CU', { day: '2-digit', month: 'short', year: 'numeric' });
          let html = `<div style="font-weight:700;margin-bottom:4px">${dateStr}</div>`;
          params.forEach((p: any) => {
            const color = p.color;
            html += `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>${p.seriesName}: <strong>${formatCurrency(p.value)}</strong></div>`;
          });
          const idx = params[0].dataIndex;
          const tx = series[idx]?.transactions || 0;
          html += `<div style="margin-top:4px;font-size:11px;color:#94A3B8">${tx} transacciones</div>`;
          return html;
        },
      },
      xAxis: {
        type: 'category',
        data: series.map((p) => p.date),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (val: string) => {
            const d = new Date(val);
            return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' });
          },
          interval: Math.max(0, Math.floor(series.length / 12) - 1),
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (val: number) => moneyShort(val),
        },
        splitLine: { lineStyle: { color: '#F1F5F9' } },
      },
      series: [
        {
          name: 'Ventas',
          data: series.map((p) => p.sales),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: false,
          itemStyle: { color: '#3B82F6' },
          lineStyle: { width: 2.5, color: '#3B82F6' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0)' },
              ],
            },
          },
        },
        {
          name: 'Promedio 7d',
          data: movingAvg,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#94A3B8', type: 'dashed' },
        },
      ],
    };
  }, [analytics]);

  return <ECharts option={option} style={{ height: 300 }} />;
}

// ── Top Products Chart (Horizontal Bar) ────────────────────────

function TopProductsChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const option = useMemo(() => {
    const products = [...analytics.top_products_revenue].reverse();
    return {
      grid: { left: 140, right: 50, top: 10, bottom: 20 },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (p: any) => {
          const item = products[p.dataIndex];
          return `<div style="font-weight:700;margin-bottom:4px;max-width:240px">${item.name}</div>
                  <div>Ingreso: <strong style="color:#10B981">${formatCurrency(item.revenue)}</strong></div>
                  <div>Unidades: ${item.quantity}</div>
                  <div>Costo: ${formatCurrency(item.cost)}</div>
                  <div>Margen: <strong style="color:${item.margin_pct < 15 ? '#EF4444' : '#10B981'}">${item.margin_pct}%</strong></div>
                  ${item.category ? `<div style="font-size:11px;color:#94A3B8">${item.category}</div>` : ''}`;
        },
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748B', fontSize: 10,
          formatter: (val: number) => moneyShort(val),
        },
        splitLine: { lineStyle: { color: '#F1F5F9' } },
      },
      yAxis: {
        type: 'category',
        data: products.map((p) => {
          const name = p.name.length > 22 ? p.name.slice(0, 22) + '…' : p.name;
          return name;
        }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#1E293B', fontSize: 11, fontWeight: 600,
          width: 130, overflow: 'truncate',
        },
      },
      series: [
        {
          type: 'bar',
          data: products.map((p) => ({
            value: p.revenue,
            itemStyle: {
              color: {
                type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: '#10B981' },
                  { offset: 1, color: '#06B6D4' },
                ],
              },
              borderRadius: [0, 6, 6, 0],
            },
          })),
          barWidth: 14,
          label: {
            show: true, position: 'right',
            formatter: (p: any) => moneyShort(p.value),
            color: '#10B981', fontSize: 10, fontWeight: 700,
          },
        },
      ],
    };
  }, [analytics]);

  return <ECharts option={option} style={{ height: 320 }} />;
}

// ── Payment Distribution (Donut + Lista detallada) ─────────────

function PaymentDistributionChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  // Vista mejorada: donut + lista lateral con barras de progreso y detalle
  const data = analytics.payment_distribution;
  const total = data.reduce((s, d) => s + d.total, 0);
  const totalTx = data.reduce((s, d) => s + d.count, 0);

  const option = useMemo(() => {
    const chartData = data.map((p, i) => ({
      name: PAYMENT_METHOD_LABELS[p.method] || p.method,
      value: p.total,
      count: p.count,
      pct: p.pct,
      itemStyle: { color: CHART_PALETTE[i % CHART_PALETTE.length] },
    }));
    return {
      title: {
        text: moneyShort(total),
        subtext: `${totalTx} tx`,
        left: '50%',
        top: 'center',
        textAlign: 'center',
        textStyle: { color: '#1E293B', fontSize: 22, fontWeight: 'bold' },
        subtextStyle: { color: '#64748B', fontSize: 11, fontWeight: 'bold' },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (p: any) => `${p.name}<br/><strong>${formatCurrency(p.value)}</strong> (${p.data.pct}%)<br/>${p.data.count} transacciones`,
      },
      series: [
        {
          type: 'pie',
          radius: ['62%', '85%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: true, fontSize: 12, fontWeight: 'bold',
              formatter: '{b}\n{d}%',
            },
          },
          data: chartData,
        },
      ],
    };
  }, [data, total, totalTx]);

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground uppercase tracking-wider">
        Sin transacciones en el período
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Donut centrado */}
      <div className="flex justify-center">
        <ECharts option={option} style={{ height: 240, width: '100%' }} />
      </div>

      {/* Lista detallada con barras de progreso */}
      <div className="space-y-2.5">
        {data.map((p, i) => {
          const label = PAYMENT_METHOD_LABELS[p.method] || p.method;
          const color = CHART_PALETTE[i % CHART_PALETTE.length];
          return (
            <div key={p.method} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-bold text-foreground truncate">{label}</span>
                  <span className="text-muted-foreground text-[10px] font-mono">({p.count} tx)</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black tabular-nums text-foreground">{formatCurrency(p.total)}</span>
                  <span
                    className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {p.pct}%
                  </span>
                </div>
              </div>
              {/* Barra de progreso visual */}
              <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${p.pct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total footer */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50 text-xs">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Total {totalTx} transacciones
        </span>
        <span className="font-black tabular-nums text-foreground">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

// ── Category Margins Chart ─────────────────────────────────────

function CategoryMarginsChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const option = useMemo(() => {
    const cats = analytics.category_margins.slice(0, 8);
    return {
      grid: { left: 140, right: 50, top: 20, bottom: 30 },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (p: any) => {
          const item = cats[p.dataIndex];
          return `<div style="font-weight:700;margin-bottom:4px">${item.category}</div>
                  Ingreso: ${formatCurrency(item.revenue)}<br/>
                  Costo: ${formatCurrency(item.cost)}<br/>
                  Margen: <strong style="color:${item.margin_pct < 15 ? '#EF4444' : '#10B981'}">${item.margin_pct}%</strong><br/>
                  Ganancia: ${formatCurrency(item.margin)}<br/>
                  Unidades vendidas: ${item.items_sold}`;
        },
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748B', fontSize: 10,
          formatter: (val: number) => `${val}%`,
        },
        splitLine: { lineStyle: { color: '#F1F5F9' } },
      },
      yAxis: {
        type: 'category',
        data: cats.map((c) => {
          const name = c.category.length > 18 ? c.category.slice(0, 18) + '…' : c.category;
          return name;
        }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#1E293B', fontSize: 11, fontWeight: 600 },
      },
      series: [
        {
          type: 'bar',
          data: cats.map((c) => ({
            value: c.margin_pct,
            itemStyle: {
              color: c.margin_pct < 15 ? '#EF4444' : c.margin_pct < 25 ? '#F59E0B' : '#8B5CF6',
              borderRadius: [0, 6, 6, 0],
            },
          })),
          barWidth: 14,
          label: {
            show: true, position: 'right',
            formatter: '{c}%',
            color: '#64748B', fontSize: 10, fontWeight: 700,
          },
          markLine: {
            symbol: 'none',
            silent: true,
            data: [{ xAxis: 15 }, { xAxis: 25 }],
            lineStyle: { color: '#94A3B8', type: 'dashed', width: 1 },
            label: { show: false },
          },
        },
      ],
    };
  }, [analytics]);

  return <ECharts option={option} style={{ height: 280 }} />;
}

// ── Weekday Distribution Chart ─────────────────────────────────

function WeekdayChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const option = useMemo(() => {
    const weekdayMap = new Map(analytics.weekday_distribution.map((w) => [w.weekday, w]));
    const data = Array.from({ length: 7 }, (_, i) => ({
      day: WEEKDAY_LABELS[i],
      sales: weekdayMap.get(i)?.sales || 0,
      transactions: weekdayMap.get(i)?.transactions || 0,
    }));
    const maxSales = Math.max(...data.map((d) => d.sales));
    return {
      grid: { left: 55, right: 20, top: 20, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (params: any) => {
          const item = data[params[0].dataIndex];
          return `<div style="font-weight:700">${item.day}</div>
                  Ventas: <strong style="color:#06B6D4">${formatCurrency(item.sales)}</strong><br/>
                  Transacciones: ${item.transactions}`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.day),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisLabel: { color: '#64748B', fontSize: 11, fontWeight: 600 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748B', fontSize: 10,
          formatter: (val: number) => moneyShort(val),
        },
        splitLine: { lineStyle: { color: '#F1F5F9' } },
      },
      series: [
        {
          type: 'bar',
          data: data.map((d) => ({
            value: d.sales,
            itemStyle: {
              color: d.sales === maxSales && d.sales > 0
                ? {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: '#06B6D4' },
                      { offset: 1, color: '#3B82F6' },
                    ],
                  }
                : '#CBD5E1',
              borderRadius: [6, 6, 0, 0],
            },
          })),
          barWidth: 28,
          label: {
            show: true, position: 'top',
            formatter: (p: any) => p.value > 0 ? moneyShort(p.value) : '',
            color: '#64748B', fontSize: 9, fontWeight: 700,
          },
        },
      ],
    };
  }, [analytics]);

  return <ECharts option={option} style={{ height: 250 }} />;
}

// ── Hour Distribution Chart ────────────────────────────────────

function HourDistributionChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const option = useMemo(() => {
    const hourMap = new Map(analytics.hour_distribution.map((h) => [h.hour, h]));
    const data = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      sales: hourMap.get(h)?.sales || 0,
      transactions: hourMap.get(h)?.transactions || 0,
    }));
    return {
      grid: { left: 55, right: 20, top: 20, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (params: any) => {
          const item = data[params[0].dataIndex];
          const hourStr = item.hour.toString().padStart(2, '0');
          return `<div style="font-weight:700">${hourStr}:00 - ${hourStr}:59</div>
                  Ventas: <strong style="color:#3B82F6">${formatCurrency(item.sales)}</strong><br/>
                  Transacciones: ${item.transactions}`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => `${d.hour}h`),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisLabel: { color: '#64748B', fontSize: 10, interval: 1 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748B', fontSize: 10,
          formatter: (val: number) => moneyShort(val),
        },
        splitLine: { lineStyle: { color: '#F1F5F9' } },
      },
      series: [
        {
          type: 'bar',
          data: data.map((d) => ({
            value: d.sales,
            itemStyle: {
              color: d.hour >= 9 && d.hour <= 19
                ? {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: '#3B82F6' },
                      { offset: 1, color: '#1D4ED8' },
                    ],
                  }
                : '#CBD5E1',
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barWidth: 12,
        },
      ],
    };
  }, [analytics]);

  return <ECharts option={option} style={{ height: 250 }} />;
}

// ── Top Products by Quantity Table ─────────────────────────────

function TopProductsQuantityTable({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  if (analytics.top_products_quantity.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground uppercase tracking-wider">
        Sin productos vendidos en el período
      </div>
    );
  }
  const maxQty = Math.max(...analytics.top_products_quantity.map((p) => p.quantity));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/50">
            <th className="text-left py-2 px-2 font-black w-10">#</th>
            <th className="text-left py-2 px-2 font-black">Producto</th>
            <th className="text-left py-2 px-2 font-black hidden sm:table-cell">SKU</th>
            <th className="text-right py-2 px-2 font-black">Unidades</th>
            <th className="text-right py-2 px-2 font-black hidden md:table-cell">Ingreso</th>
            <th className="text-left py-2 px-2 font-black w-24 hidden lg:table-cell">Participación</th>
          </tr>
        </thead>
        <tbody>
          {analytics.top_products_quantity.map((p, i) => (
            <tr key={p.product_id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-2 font-black text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="py-2.5 px-2 font-bold text-foreground truncate max-w-[200px]">{p.name}</td>
              <td className="py-2.5 px-2 text-muted-foreground font-mono text-xs hidden sm:table-cell">{p.sku || '—'}</td>
              <td className="py-2.5 px-2 text-right font-black tabular-nums text-success">{p.quantity}</td>
              <td className="py-2.5 px-2 text-right font-bold tabular-nums text-primary hidden md:table-cell">{formatCurrency(p.revenue)}</td>
              <td className="py-2.5 px-2 hidden lg:table-cell">
                <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-success rounded-full"
                    style={{ width: `${(p.quantity / maxQty) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Stock Alert Card con action button ─────────────────────────

function StockAlertCard({
  title, subtitle, items, emptyText, icon, actionLabel, onAction,
}: {
  title: string;
  subtitle: string;
  items: { id: string; name: string; metric: string; detail: string; severity: 'critical' | 'warning' | 'opportunity' }[];
  emptyText: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  const severityColor = {
    critical: 'text-destructive',
    warning: 'text-warning',
    opportunity: 'text-cyan-600',
  };
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
        {icon}
        <div className="min-w-0 flex-1">
          <h4 className="font-black text-xs uppercase tracking-tight text-foreground">{title}</h4>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{subtitle}</p>
        </div>
        <span className={cn(
          'text-[10px] font-black tabular-nums px-2 py-0.5 rounded-full',
          items.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
        )}>
          {items.length}
        </span>
      </div>
      <div className="flex-1 max-h-[280px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground uppercase tracking-wider">
            {emptyText}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-2 border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-xs text-foreground truncate flex-1" title={item.name}>{item.name}</p>
                <span className={cn('font-black text-xs tabular-nums shrink-0', severityColor[item.severity])}>
                  {item.metric}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>
            </div>
          ))
        )}
      </div>
      {items.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/50">
          <button
            type="button"
            onClick={onAction}
            className="w-full py-2 rounded-lg bg-muted/40 hover:bg-muted text-[10px] font-black uppercase tracking-widest text-foreground transition-colors flex items-center justify-center gap-1.5"
          >
            {actionLabel}
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Categoría Drill-Down Panel ─────────────────────────────────

function CategoryDrillDownPanel({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const categories = analytics.category_margins;

  if (categories.length === 0) {
    return (
      <ChartCard
        title="Análisis por categoría"
        subtitle="Rentabilidad detallada por grupo de productos"
        icon={<Tag className="w-4 h-4 text-primary" />}
      >
        <div className="py-8 text-center text-xs text-muted-foreground uppercase tracking-wider">
          Sin datos de categorías en el período
        </div>
      </ChartCard>
    );
  }

  const selected = categories.find((c) => c.category === selectedCategory) || categories[0];

  return (
    <ChartCard
      title="Análisis por categoría"
      subtitle="Selecciona una categoría para ver su desempeño detallado"
      icon={<Tag className="w-4 h-4 text-primary" />}
    >
      <div className="space-y-4">
        {/* Selector de categoría (chips) */}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => setSelectedCategory(c.category)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all',
                selected.category === c.category
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {c.category.length > 18 ? c.category.slice(0, 18) + '…' : c.category}
            </button>
          ))}
        </div>

        {/* Detalle de la categoría seleccionada */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ingresos</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.revenue)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.cost)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ganancia</p>
            <p className="text-base font-black tabular-nums text-success">{formatCurrency(selected.margin)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Margen</p>
            <p className={cn(
              'text-base font-black tabular-nums',
              selected.margin_pct < 15 ? 'text-destructive' : selected.margin_pct < 25 ? 'text-warning' : 'text-success',
            )}>
              {selected.margin_pct}%
            </p>
          </div>
        </div>

        {/* Barra de margen visual */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>Margen real</span>
            <span>Benchmark: 25% saludable, 15% mínimo</span>
          </div>
          <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden">
            {/* Zona roja (0-15%) */}
            <div className="absolute inset-y-0 left-0 bg-destructive/30" style={{ width: '15%' }} />
            {/* Zona ámbar (15-25%) */}
            <div className="absolute inset-y-0 bg-warning/30" style={{ left: '15%', width: '10%' }} />
            {/* Zona verde (25-100%) */}
            <div className="absolute inset-y-0 bg-success/30" style={{ left: '25%', width: '75%' }} />
            {/* Indicador del margen real */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-1 h-5 bg-foreground rounded-full shadow-lg"
              style={{ left: `${Math.min(selected.margin_pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
            <span>0%</span><span>15%</span><span>25%</span><span>50%</span><span>100%</span>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Interpretación:</strong> Esta categoría vendió{' '}
          <strong className="text-foreground">{selected.items_sold.toFixed(0)} unidades</strong>, generando{' '}
          <strong className="text-foreground">{formatCurrency(selected.revenue)}</strong> en ingresos.{' '}
          {selected.margin_pct < 15
            ? 'El margen está por debajo del 15% — revisa precios o costos para evitar pérdida operativa.'
            : selected.margin_pct < 25
              ? 'El margen está entre 15-25% — hay espacio para mejorarlo renegociando costos.'
              : 'El margen es saludable (>25%) — sostén la estrategia actual.'}
        </p>
      </div>
    </ChartCard>
  );
}

// ── Producto Drill-Down Panel ──────────────────────────────────

function ProductDrillDownPanel({
  analytics,
  onGoToCatalog,
}: {
  analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']>;
  onGoToCatalog: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const products = analytics.top_products_revenue;

  if (products.length === 0) {
    return (
      <ChartCard
        title="Análisis por producto"
        subtitle="Detalle individual de cada producto vendido"
        icon={<Package className="w-4 h-4 text-purple-500" />}
      >
        <div className="py-8 text-center text-xs text-muted-foreground uppercase tracking-wider">
          Sin productos vendidos en el período
        </div>
      </ChartCard>
    );
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase()),
  );
  const selected = products.find((p) => p.product_id === selectedId) || products[0];

  return (
    <ChartCard
      title="Análisis por producto"
      subtitle="Selecciona un producto para ver su desempeño individual"
      icon={<Package className="w-4 h-4 text-purple-500" />}
      action={
        <button
          type="button"
          onClick={onGoToCatalog}
          className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-1"
        >
          Ver catálogo
          <ChevronRight className="w-3 h-3" />
        </button>
      }
    >
      <div className="space-y-4">
        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto por nombre o SKU..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/40 border border-border/30 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Lista de productos seleccionable */}
        <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border/30 divide-y divide-border/20">
          {filtered.map((p) => (
            <button
              key={p.product_id}
              type="button"
              onClick={() => setSelectedId(p.product_id)}
              className={cn(
                'w-full px-3 py-2.5 flex items-center justify-between gap-2 transition-colors text-left',
                selected.product_id === p.product_id
                  ? 'bg-primary/10 hover:bg-primary/15'
                  : 'hover:bg-muted/40',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-xs text-foreground truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  {p.sku || 'Sin SKU'} · {p.category || 'Sin categoría'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-xs tabular-nums text-foreground">{formatCurrency(p.revenue)}</p>
                <p className="text-[10px] text-muted-foreground">{p.quantity} uds</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground uppercase tracking-wider">
              Sin resultados
            </div>
          )}
        </div>

        {/* Detalle del producto seleccionado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ingresos</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.revenue)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo total</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.cost)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidades</p>
            <p className="text-base font-black tabular-nums text-foreground">{selected.quantity}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Margen</p>
            <p className={cn(
              'text-base font-black tabular-nums',
              selected.margin_pct < 15 ? 'text-destructive' : selected.margin_pct < 25 ? 'text-warning' : 'text-success',
            )}>
              {selected.margin_pct}%
            </p>
          </div>
        </div>

        {/* Precio promedio calculado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Precio prom. venta</p>
            <p className="text-sm font-black tabular-nums text-primary">
              {selected.quantity > 0 ? formatCurrency(selected.revenue / selected.quantity) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo unitario</p>
            <p className="text-sm font-black tabular-nums text-muted-foreground">
              {selected.quantity > 0 ? formatCurrency(selected.cost / selected.quantity) : '—'}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Interpretación:</strong> {selected.name} generó{' '}
          <strong className="text-foreground">{formatCurrency(selected.revenue)}</strong> en ingresos con{' '}
          <strong className="text-foreground">{selected.quantity} unidades</strong> vendidas.{' '}
          {selected.margin_pct < 15
            ? 'Margen bajo — revisa el precio de venta o negocia mejores costos con tu proveedor.'
            : selected.margin_pct < 25
              ? 'Margen aceptable — hay espacio para optimizarlo.'
              : 'Margen saludable — producto rentable, mantén su disponibilidad.'}
        </p>
      </div>
    </ChartCard>
  );
}

// ── Insight Detail Modal ───────────────────────────────────────

function InsightDetailModal({ insight, onClose }: { insight: Insight; onClose: () => void }) {
  const config = SEVERITY_CONFIG[insight.severity];
  const Icon = config.icon;

  // Construir la configuración del chart según el tipo de detail
  const chartOption = useMemo(() => {
    if (!insight.detail) return null;

    switch (insight.detail.type) {
      case 'stock': {
        if (!insight.detail.chartData || insight.detail.chartData.length === 0) return null;
        return {
          grid: { left: 50, right: 20, top: 20, bottom: 30 },
          tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            textStyle: { color: '#F1F5F9', fontSize: 12 },
            formatter: (params: any) => {
              const p = params[0];
              const d = new Date(p.axisValue);
              return `${d.toLocaleDateString('es-CU', { day: '2-digit', month: 'short' })}<br/><strong>${formatCurrency(p.value)}</strong>`;
            },
          },
          xAxis: {
            type: 'category',
            data: insight.detail.chartData.map((p) => p.date),
            axisLabel: { color: '#64748B', fontSize: 10 },
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              color: '#64748B', fontSize: 10,
              formatter: (v: number) => moneyShort(v),
            },
            splitLine: { lineStyle: { color: '#F1F5F9' } },
          },
          series: [{
            type: 'bar',
            data: insight.detail.chartData.map((p) => p.value),
            itemStyle: { color: '#3B82F6', borderRadius: [4, 4, 0, 0] },
            barWidth: 14,
          }],
        };
      }
      case 'trend': {
        if (!insight.detail.chartData || insight.detail.chartData.length === 0) return null;
        return {
          grid: { left: 50, right: 20, top: 20, bottom: 30 },
          tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            textStyle: { color: '#F1F5F9', fontSize: 12 },
            formatter: (params: any) => {
              const p = params[0];
              const d = new Date(p.axisValue);
              return `${d.toLocaleDateString('es-CU', { day: '2-digit', month: 'short' })}<br/>Ventas: <strong>${formatCurrency(p.value)}</strong>`;
            },
          },
          xAxis: {
            type: 'category',
            data: insight.detail.chartData.map((p) => p.date),
            axisLabel: { color: '#64748B', fontSize: 10 },
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              color: '#64748B', fontSize: 10,
              formatter: (v: number) => moneyShort(v),
            },
            splitLine: { lineStyle: { color: '#F1F5F9' } },
          },
          series: [{
            type: 'line',
            data: insight.detail.chartData.map((p) => p.value),
            smooth: true,
            showSymbol: false,
            itemStyle: { color: '#3B82F6' },
            lineStyle: { width: 2.5, color: '#3B82F6' },
            areaStyle: {
              color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
                  { offset: 1, color: 'rgba(59, 130, 246, 0)' },
                ],
              },
            },
          }],
        };
      }
      case 'top':
      case 'concentration':
      case 'payment':
      case 'weekday':
      case 'margin': {
        if (!insight.detail.chartData || insight.detail.chartData.length === 0) return null;
        return {
          grid: { left: 100, right: 30, top: 20, bottom: 30 },
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            textStyle: { color: '#F1F5F9', fontSize: 12 },
          },
          xAxis: {
            type: 'value',
            axisLabel: {
              color: '#64748B', fontSize: 10,
              formatter: (v: number) => insight.detail?.type === 'margin' ? `${v}%` : moneyShort(v),
            },
            splitLine: { lineStyle: { color: '#F1F5F9' } },
          },
          yAxis: {
            type: 'category',
            data: insight.detail.chartData.map((p) => p.name),
            axisLabel: { color: '#1E293B', fontSize: 11, fontWeight: 600 },
          },
          series: [{
            type: 'bar',
            data: insight.detail.chartData.map((p) => p.value),
            itemStyle: {
              color: {
                type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: '#3B82F6' },
                  { offset: 1, color: '#06B6D4' },
                ],
              },
              borderRadius: [0, 6, 6, 0],
            },
            barWidth: 14,
          }],
        };
      }
      case 'rotation':
        return null;
      default:
        return null;
    }
  }, [insight.detail]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={cn('px-5 py-4 border-b border-border/50 flex items-start justify-between gap-3', config.bg)}>
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-background/70', config.color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className={cn('font-black text-sm uppercase tracking-tight', config.color)}>{insight.title}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                Categoría: {insight.category} · Severidad: {insight.severity}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg hover:bg-muted/60 transition-colors flex items-center justify-center"
            aria-label="Cerrar detalle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Mensaje principal */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mensaje</p>
            <p className="text-sm text-foreground leading-relaxed">{insight.message}</p>
          </div>

          {/* Métricas de respaldo */}
          {insight.detail && <DetailMetrics detail={insight.detail} />}

          {/* Gráfico de respaldo */}
          {chartOption && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {insight.detail?.type === 'stock' && 'Ventas diarias del período (respaldo del cálculo)'}
                {insight.detail?.type === 'trend' && 'Evolución de ventas en el período'}
                {insight.detail?.type === 'top' && 'Top productos por ingreso'}
                {insight.detail?.type === 'concentration' && 'Concentración de ingresos por producto'}
                {insight.detail?.type === 'payment' && 'Distribución de métodos de pago'}
                {insight.detail?.type === 'weekday' && 'Ventas por día de la semana'}
                {insight.detail?.type === 'margin' && 'Margen por categoría (%)'}
              </p>
              <div className="rounded-xl border border-border/30 bg-muted/10 p-3">
                <ECharts option={chartOption} style={{ height: 240 }} />
              </div>
            </div>
          )}

          {/* Recomendación */}
          <div className={cn('rounded-xl border p-4', config.bg, config.border)}>
            <p className={cn('text-[10px] font-black uppercase tracking-widest mb-1.5', config.color)}>
              Recomendación accionable
            </p>
            <p className="text-sm text-foreground leading-relaxed">{insight.recommendation}</p>
          </div>

          {/* Fundamentación (cómo se calcula) */}
          {insight.detail && <Fundamentation detail={insight.detail} />}
        </div>
      </div>
    </div>
  );
}

// ── Detail Metrics (cards con números de respaldo) ─────────────

function DetailMetrics({ detail }: { detail: InsightDetail }) {
  switch (detail.type) {
    case 'stock':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricBox label="Stock actual" value={`${detail.stockCurrent} uds`} />
          <MetricBox label="Stock mínimo" value={`${detail.minStock} uds`} />
          <MetricBox label="Déficit" value={`${detail.deficit} uds`} highlight="warning" />
          <MetricBox
            label="Ritmo venta"
            value={`${detail.avgDailySales.toFixed(2)} uds/día`}
            highlight={detail.avgDailySales > 0 ? 'success' : 'muted'}
          />
          <MetricBox
            label="Vendido período"
            value={`${detail.totalSold.toFixed(0)} uds`}
          />
          <MetricBox label="Período" value={`${detail.periodDays} días`} />
          <MetricBox
            label="Días hasta agotar"
            value={detail.daysUntilOut !== null ? `${detail.daysUntilOut} días` : '∞ (sin rotación)'}
            highlight={detail.daysUntilOut !== null && detail.daysUntilOut <= 3 ? 'critical' : 'success'}
          />
          <MetricBox
            label="Cobertura recomendada"
            value={detail.avgDailySales > 0 ? `${Math.ceil(detail.avgDailySales * 14)} uds (14d)` : '—'}
          />
        </div>
      );
    case 'rotation':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MetricBox label="Stock actual" value={`${detail.stockCurrent} uds`} />
          {detail.daysWithoutSales !== undefined && (
            <MetricBox label="Días sin venta" value={`${detail.daysWithoutSales}d`} highlight="warning" />
          )}
          {detail.avgDailySales !== undefined && (
            <MetricBox label="Venta diaria prom." value={`${detail.avgDailySales.toFixed(2)} uds/d`} />
          )}
          {detail.daysOfStock !== undefined && detail.daysOfStock !== null && (
            <MetricBox label="Días de stock" value={`${detail.daysOfStock}d`} highlight={detail.daysOfStock > 45 ? 'warning' : 'success'} />
          )}
          {detail.overstockValue !== undefined && (
            <MetricBox label="Capital inmovilizado" value={formatCurrency(detail.overstockValue)} highlight="warning" />
          )}
          {detail.lastSaleDate && (
            <MetricBox label="Última venta" value={new Date(detail.lastSaleDate).toLocaleDateString('es-CU')} />
          )}
        </div>
      );
    case 'margin':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricBox label="Categoría" value={detail.category} />
          <MetricBox label="Ingresos" value={formatCurrency(detail.revenue)} />
          <MetricBox label="Costo" value={formatCurrency(detail.cost)} />
          <MetricBox label="Ganancia" value={formatCurrency(detail.margin)} highlight="success" />
          <MetricBox
            label="Margen %"
            value={`${detail.marginPct}%`}
            highlight={detail.marginPct < 15 ? 'critical' : detail.marginPct < 25 ? 'warning' : 'success'}
          />
          <MetricBox label="Unidades vendidas" value={`${detail.itemsSold.toFixed(0)}`} />
        </div>
      );
    case 'top':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricBox label="Producto" value={detail.productName} />
          <MetricBox label="Ingresos" value={formatCurrency(detail.revenue)} highlight="success" />
          <MetricBox label="Unidades vendidas" value={`${detail.quantity}`} />
          <MetricBox
            label="Margen"
            value={`${detail.marginPct}%`}
            highlight={detail.marginPct < 15 ? 'critical' : 'success'}
          />
          <MetricBox label="Categoría" value={detail.category || 'Sin categoría'} />
          <MetricBox label="Período" value={`${detail.periodDays} días`} />
        </div>
      );
    case 'concentration':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MetricBox label="Producto dominante" value={detail.productName} />
            <MetricBox
              label="% concentración"
              value={`${detail.concentration.toFixed(1)}%`}
              highlight="warning"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Top 5 productos y su participación</p>
            <div className="space-y-1">
              {detail.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs px-3 py-1.5 rounded-lg bg-muted/30">
                  <span className="font-bold truncate">{p.name}</span>
                  <span className="font-black tabular-nums shrink-0">{p.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    case 'trend':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MetricBox label="7d recientes" value={formatCurrency(detail.recent)} />
          <MetricBox label="7d previos" value={formatCurrency(detail.previous)} />
          <MetricBox
            label="Cambio"
            value={`${detail.change > 0 ? '+' : ''}${detail.change.toFixed(1)}%`}
            highlight={detail.change > 0 ? 'success' : 'critical'}
          />
        </div>
      );
    case 'payment':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricBox label="Método dominante" value={detail.dominantMethod} />
            <MetricBox label="% concentración" value={`${detail.pct}%`} highlight="warning" />
            <MetricBox label="Transacciones" value={`${detail.count}`} />
            <MetricBox label="Total" value={formatCurrency(detail.total)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Todos los métodos</p>
            <div className="space-y-1">
              {detail.allMethods.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs px-3 py-1.5 rounded-lg bg-muted/30">
                  <span className="font-bold">{m.name}</span>
                  <span className="font-black tabular-nums shrink-0">{m.pct}% · {formatCurrency(m.value)} ({m.count} tx)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    case 'weekday':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MetricBox label="Mejor día" value={detail.bestDay} highlight="success" />
            <MetricBox label="Ventas" value={formatCurrency(detail.bestDaySales)} />
            <MetricBox label="Transacciones" value={`${detail.bestDayTransactions}`} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Todos los días</p>
            <div className="space-y-1">
              {detail.allDays.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs px-3 py-1.5 rounded-lg bg-muted/30">
                  <span className="font-bold">{d.name}</span>
                  <span className="font-black tabular-nums shrink-0">{formatCurrency(d.sales)} · {d.transactions} tx</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function MetricBox({
  label, value, highlight,
}: {
  label: string; value: string; highlight?: 'success' | 'warning' | 'critical' | 'muted';
}) {
  const color = {
    success: 'text-success',
    warning: 'text-warning',
    critical: 'text-destructive',
    muted: 'text-muted-foreground',
  };
  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate" title={label}>{label}</p>
      <p className={cn('text-sm font-black tabular-nums truncate', highlight ? color[highlight] : 'text-foreground')} title={value}>
        {value}
      </p>
    </div>
  );
}

// ── Fundamentación (cómo se calculó el insight) ────────────────

function Fundamentation({ detail }: { detail: InsightDetail }) {
  const text = useMemo(() => {
    switch (detail.type) {
      case 'stock':
        return `Cómo se calcula: ritmo de venta = unidades vendidas (${detail.totalSold.toFixed(0)}) / días del período (${detail.periodDays}) = ${detail.avgDailySales.toFixed(2)} uds/día. Días hasta agotar = stock actual (${detail.stockCurrent}) / ritmo de venta = ${detail.daysUntilOut !== null ? detail.daysUntilOut + ' días' : 'no aplica (sin ventas)'}. Recomendación de reposición = ritmo × 14 días (cobertura 2 semanas).`;
      case 'rotation':
        if (detail.daysWithoutSales !== undefined) {
          return `Cómo se calcula: se identifica la última fecha de venta registrada. Los días sin venta = hoy - última venta. Si supera 30 días, el producto entra en alerta de movimiento lento. Stock inmovilizado = capital atado sin generar retorno.`;
        }
        return `Cómo se calcula: días de stock = stock actual / venta diaria promedio. >45 días = sobrecompra con capital inmovilizado. Rotación óptima retail: 15-30 días.`;
      case 'margin':
        return `Cómo se calcula: margen % = (ingresos - costo) / ingresos × 100. Benchmark retail: <15% zona de pérdida operativa, 15-25% margen aceptable, >25% saludable. Costos a considerar: mercadería + gastos operativos prorrateados (rent, sueldos, luz).`;
      case 'top':
        return `Cómo se calcula: se suman los ingresos (precio × cantidad) de todas las transacciones del producto en el período. Es el principal generador de caja de la tienda. Mantener stock 3x venta semanal protege contra stockout del producto estrella.`;
      case 'concentration':
        return `Cómo se calcula: % concentración = ingresos del producto / ingresos totales × 100. >50% indica dependencia peligrosa: si este producto se agota o pierde demanda, el impacto en caja es severo. Diversificar protege el negocio.`;
      case 'trend':
        return `Cómo se calcula: se comparan las ventas de los últimos 7 días vs los 7 días previos. Cambio % = (reciente - previo) / previo × 100. >5% de cambio se considera significativo. Momentum positivo = oportunidad; negativo = alerta temprana.`;
      case 'payment':
        return `Cómo se calcula: se agrupan las transacciones por método de pago y se calcula el % del total. >80% en un método = dependencia operativa. Cada método no habilitado representa clientes potenciales perdidos por fricción en el pago.`;
      case 'weekday':
        return `Cómo se calcula: se suman las ventas por día de la semana en el período analizado. El día con mayor volumen indica cuándo la tienda tiene mayor tráfico. Reforzar personal y stock ese día maximiza la conversión.`;
      default:
        return '';
    }
  }, [detail]);

  if (!text) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-muted/10 p-4 space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Lightbulb className="w-3 h-3" />
        Fundamentación del análisis
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-[300px] rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
    </div>
  );
}

function DashboardError({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive" />
      <p className="text-sm font-bold text-destructive uppercase tracking-wider">Error al cargar dashboard</p>
      <p className="text-xs text-muted-foreground mt-2 font-mono">{msg}</p>
    </div>
  );
}
