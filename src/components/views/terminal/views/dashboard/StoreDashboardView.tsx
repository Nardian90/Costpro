'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ReactECharts from 'echarts-for-react';
import type { DateRange } from 'react-day-picker';
import { useIsMobile } from '@/hooks/ui/useMobile';
import {
  X, ArrowLeft, TrendingUp, TrendingDown, ShoppingCart, Banknote,
  AlertTriangle, AlertCircle, Lightbulb, Sparkles, Package,
  Clock, Calendar as CalendarIcon, Target, Zap, RefreshCw, ChevronRight,
  ShoppingBag, Tag, BarChart3, Activity, Percent, DollarSign,
  ArrowUpRight, ArrowDownRight, ExternalLink, PanelLeftClose,
  PanelLeftOpen, Search, CalendarRange,
  LineChart, BookOpen, Crown, CheckCircle2,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useStoreAnalytics, useStoreInsights, type Insight, type InsightDetail, formatCurrencyShort, PAYMENT_LABELS_ES } from '@/hooks/api/useStoreAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { BaseModal } from '@/components/ui/BaseModal';
import { useUIStore } from '@/store';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('dashboard.storeDashboard');
  // Estado: o bien "days" (7/30/90) o rango personalizado
  const [days, setDays] = useState(30);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  // Pestañas: progressive disclosure — Resumen / Productos / Comportamiento
  // Pregunta que responde cada una:
  //   - resumen: "¿Cómo va la tienda?" (KPIs + insights + tendencia + alertas críticas)
  //   - productos: "¿Qué comprar/descontinuar?" (top + ranking + drill-down + márgenes)
  //   - comportamiento: "¿Cuándo y cómo se vende?" (pagos + weekday + hora + todos los insights)
  type TabId = 'resumen' | 'productos' | 'comportamiento';
  const [activeTab, setActiveTab] = useState<TabId>('resumen');

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
              className="shrink-0 w-11 h-11 rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
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
              <p className="text-xs sm:text-xs text-muted-foreground uppercase tracking-widest hidden sm:block">
                {rangeLabel} · Análisis ejecutivo para toma de decisiones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-11 h-11 rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center disabled:opacity-50"
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
                <ToggleGroupItem value="7" className="text-sm font-bold px-3 py-2.5 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  7d
                </ToggleGroupItem>
                <ToggleGroupItem value="30" className="text-sm font-bold px-3 py-2.5 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  30d
                </ToggleGroupItem>
                <ToggleGroupItem value="90" className="text-sm font-bold px-3 py-2.5 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
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
                    'h-11 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors',
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
                    className="flex-1 px-2 py-1.5 rounded-lg text-sm font-black uppercase tracking-wider hover:bg-muted text-muted-foreground"
                  >
                    7d
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(30)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-sm font-black uppercase tracking-wider hover:bg-muted text-muted-foreground"
                  >
                    30d
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(90)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-sm font-black uppercase tracking-wider hover:bg-muted text-muted-foreground"
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
                    <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {format(dateRange.from, 'dd/MM/yy')} → {format(dateRange.to, 'dd/MM/yy')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDateRange(undefined)}
                      className="text-sm font-black uppercase tracking-wider text-destructive hover:underline"
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
              className="w-11 h-11 rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center"
              aria-label="Cerrar dashboard"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 lg:px-8 pb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
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
            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-70" />
            <p className="text-sm font-bold uppercase tracking-wider">{t('noData')}</p>
          </div>
        ) : (
          <>
            {/* ─── Tabs: progressive disclosure ───
                Patrón idéntico a InventarioView para consistencia.
                Cada tab responde una pregunta distinta para evitar ruido cognitivo. */}
            <div
              className="sticky top-[60px] z-10 flex border-b border-border bg-card/95 backdrop-blur rounded-t-xl overflow-hidden -mx-1"
              role="tablist"
              aria-label="Secciones del dashboard"
            >
              {([
                { id: 'resumen', label: 'Resumen', icon: BarChart3, hint: 'KPIs + insights + alertas' },
                { id: 'productos', label: 'Productos', icon: Package, hint: 'Análisis por producto y categoría' },
                { id: 'comportamiento', label: 'Comportamiento', icon: Activity, hint: 'Patrones de venta y pago' },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex-1 min-h-[44px] py-3 px-2 sm:px-4 text-xs sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 sm:gap-2',
                      isActive
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ────────── TAB 1: RESUMEN ──────────
                Audiencia: decisor / dueño
                Pregunta: "¿cómo va la tienda?" */}
            {activeTab === 'resumen' && (
              <div className="space-y-5">
                {/* KPIs Hero Row */}
                <KpiHeroRow analytics={analytics} days={days} />

                {/* Orden de Compra Inteligente — botón premium que genera OC automática */}
                <SmartPurchaseOrderButton analytics={analytics} storeId={storeId} />

                {/* Insights prioritarios (top 4, clickeables para ver detalle) */}
                <InsightsPriorityPanel insights={insights} onSelectInsight={setSelectedInsight} />

                {/* Tendencia de ventas */}
                <ChartCard
                  title="Tendencia de ventas"
                  subtitle={`Últimos ${days} días — comparativa con promedio móvil 7 días`}
                  icon={<TrendingUp className="w-4 h-4 text-primary" />}
                  action={
                    <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
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

                {/* Alertas operativas (3 columnas) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <StockAlertCard
                    title="Stock crítico"
                    subtitle="Calculado por ritmo de venta real"
                    items={(() => {
                      // Calcular stock crítico basado en ritmo de venta, no en min_stock del producto.
                      // Fórmula: stock_min_necesario = avgDailySales × 14 días (cobertura 2 semanas)
                      // Es crítico si: tiene ventas reales AND stock_current < stock_min_necesario
                      const periodDays = Math.max(1, analytics.period_days);
                      // Cruzar top_products_revenue (ventas) con low_stock/slow_movers/overstock (stock_current)
                      const stockMap = new Map<string, number>();
                      for (const ls of analytics.low_stock) stockMap.set(ls.product_id, ls.stock_current);
                      for (const sm of analytics.slow_movers) if (!stockMap.has(sm.product_id)) stockMap.set(sm.product_id, sm.stock_current);
                      for (const os of analytics.overstock) if (!stockMap.has(os.product_id)) stockMap.set(os.product_id, os.stock_current);

                      const criticalItems = analytics.top_products_revenue
                        .map((p) => {
                          const avgDaily = p.quantity / periodDays;
                          const stockCurrent = stockMap.get(p.product_id) ?? 0;
                          const stockMinNeeded = Math.ceil(avgDaily * 14);
                          const deficit = Math.max(0, stockMinNeeded - stockCurrent);
                          const daysUntilOut = avgDaily > 0 ? Math.round(stockCurrent / avgDaily) : null;
                          return {
                            product_id: p.product_id,
                            name: p.name,
                            stock_current: stockCurrent,
                            min_stock_calc: stockMinNeeded,
                            deficit,
                            daysUntilOut,
                            avgDaily,
                            isCritical: avgDaily > 0 && stockCurrent < stockMinNeeded,
                          };
                        })
                        .filter((p) => p.isCritical)
                        .sort((a, b) => (a.daysUntilOut ?? 999) - (b.daysUntilOut ?? 999))
                        .slice(0, 8);
                      return criticalItems.map((p) => ({
                        id: p.product_id,
                        name: p.name,
                        metric: p.daysUntilOut !== null ? `${p.daysUntilOut}d` : '—',
                        detail: `Stock ${p.stock_current} / necesario ${p.min_stock_calc} (venta ${p.avgDaily.toFixed(1)}/día)`,
                        severity: (p.daysUntilOut !== null && p.daysUntilOut <= 3 ? 'critical' : 'warning') as 'critical' | 'warning',
                      }));
                    })()}
                    emptyText="Todo el stock está saludable"
                    icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
                    actionLabel="Ir a inventario"
                    onAction={() => { setCurrentView('inventory'); onClose(); }}
                    alertType="stock"
                    analytics={analytics}
                  />
                  <StockAlertCard
                    title="Movimiento lento"
                    subtitle="Sin ventas en 30+ días"
                    items={analytics.slow_movers
                      .filter((p) => p.stock_current > 0 && p.days_without_sales > 0)
                      .slice(0, 8)
                      .map((p) => ({
                        id: p.product_id,
                        name: p.name,
                        metric: p.days_without_sales > 0 ? `${p.days_without_sales}d sin venta` : 'Sin actividad',
                        detail: `Stock: ${p.stock_current} uds inmovilizadas`,
                        severity: 'warning' as const,
                      }))}
                    emptyText="Todos los productos rotan bien"
                    icon={<Clock className="w-4 h-4 text-warning" />}
                    actionLabel="Crear oferta"
                    onAction={() => { setCurrentView('ofertas'); onClose(); }}
                    alertType="slow"
                    analytics={analytics}
                  />
                  <StockAlertCard
                    title="Exceso de inventario"
                    subtitle="Capital inmovilizado"
                    items={analytics.overstock.slice(0, 8).map((p) => ({
                      id: p.product_id,
                      name: p.name,
                      metric: p.days_of_stock ? `${p.days_of_stock}d de stock` : '∞',
                      detail: formatCurrency(p.overstock_value),
                      severity: 'opportunity' as const,
                    }))}
                    emptyText="Sin exceso de inventario"
                    icon={<Package className="w-4 h-4 text-cyan-500" />}
                    actionLabel="Ver catálogo"
                    onAction={() => { setCurrentView('catalog'); onClose(); }}
                    alertType="overstock"
                    analytics={analytics}
                  />
                </div>
              </div>
            )}

            {/* ────────── TAB 2: PRODUCTOS ──────────
                Audiencia: comprador / analista de inventario
                Pregunta: "¿qué comprar, qué descontinuar?" */}
            {activeTab === 'productos' && (
              <div className="space-y-5">
                {/* Top 10 productos por ingreso */}
                <ChartCard
                  title="Top 10 productos por ingreso"
                  subtitle="Rentabilidad y volumen"
                  icon={<Target className="w-4 h-4 text-success" />}
                >
                  <TopProductsChart analytics={analytics} />
                </ChartCard>

                {/* Ranking por unidades vendidas (tabla) */}
                <ChartCard
                  title="Ranking por unidades vendidas"
                  subtitle="Los productos más populares"
                  icon={<ShoppingBag className="w-4 h-4 text-success" />}
                >
                  <TopProductsQuantityTable analytics={analytics} />
                </ChartCard>

                {/* Margen por categoría */}
                <ChartCard
                  title="Margen por categoría"
                  subtitle="Rentabilidad (rojo <15%, ámbar <25%, púrpura ≥25%)"
                  icon={<Zap className="w-4 h-4 text-purple-500" />}
                >
                  <CategoryMarginsChart analytics={analytics} />
                </ChartCard>

                {/* Drill-down por categoría */}
                <CategoryDrillDownPanel analytics={analytics} />

                {/* Drill-down por producto */}
                <ProductDrillDownPanel analytics={analytics} onGoToCatalog={() => { setCurrentView('catalog'); onClose(); }} />
              </div>
            )}

            {/* ────────── TAB 3: COMPORTAMIENTO ──────────
                Audiencia: operador / vendedor / marketing
                Pregunta: "¿cuándo y cómo se vende?" */}
            {activeTab === 'comportamiento' && (
              <div className="space-y-5">
                {/* Distribución de pagos */}
                <ChartCard
                  title="Distribución de pagos"
                  subtitle="Métodos utilizados por clientes"
                  icon={<Banknote className="w-4 h-4 text-warning" />}
                >
                  <PaymentDistributionChart analytics={analytics} />
                </ChartCard>

                {/* Ventas por día de semana + hora (grid 2 col en desktop) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <ChartCard
                    title="Ventas por día de semana"
                    subtitle="Cuándo vendes más"
                    icon={<CalendarIcon className="w-4 h-4 text-cyan-500" />}
                  >
                    <WeekdayChart analytics={analytics} />
                  </ChartCard>
                  <ChartCard
                    title="Ventas por hora del día"
                    subtitle="Horas pico (resaltadas)"
                    icon={<Clock className="w-4 h-4 text-primary" />}
                  >
                    <HourDistributionChart analytics={analytics} />
                  </ChartCard>
                </div>

                {/* Todos los insights en lista expandible */}
                {insights.length > 0 && (
                  <AllInsightsPanel insights={insights} onSelectInsight={setSelectedInsight} />
                )}
              </div>
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

// ── Orden de Compra Inteligente (Premium) ──────────────────────
// Algoritmo: analiza productos con alta rotación + stock bajo/necesario
// y genera una lista de compras para mantener 30 días de cobertura.

interface SmartPOItem {
  product_id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  avg_daily_sales: number;
  days_until_out: number | null;
  recommended_qty: number;
  stock_needed_30d: number;
  urgency: 'critical' | 'warning' | 'normal';
  reason: string;
}

function SmartPurchaseOrderButton({ analytics, storeId }: {
  analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']>;
  storeId: string;
}) {
  const t = useTranslations('dashboard.storeDashboard');
  const [showModal, setShowModal] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { setCurrentView } = useUIStore();

  // Algoritmo: calcular productos a recomendar para OC inteligente
  const recommendedItems: SmartPOItem[] = useMemo(() => {
    const periodDays = Math.max(1, analytics.period_days);
    // Cruzar top_products_revenue (ventas) con low_stock/slow_movers/overstock (stock_current)
    const stockMap = new Map<string, number>();
    const minStockMap = new Map<string, number>();
    for (const ls of analytics.low_stock) {
      stockMap.set(ls.product_id, ls.stock_current);
      minStockMap.set(ls.product_id, ls.min_stock);
    }
    for (const sm of analytics.slow_movers) {
      if (!stockMap.has(sm.product_id)) stockMap.set(sm.product_id, sm.stock_current);
    }
    for (const os of analytics.overstock) {
      if (!stockMap.has(os.product_id)) stockMap.set(os.product_id, os.stock_current);
    }

    const items: SmartPOItem[] = analytics.top_products_revenue
      .map((p) => {
        const avgDaily = p.quantity / periodDays;
        const stockCurrent = stockMap.get(p.product_id) ?? 0;
        // Stock necesario para 30 días de cobertura
        const stockNeeded30d = Math.ceil(avgDaily * 30);
        // Días hasta agotar
        const daysUntilOut = avgDaily > 0 ? Math.round(stockCurrent / avgDaily) : null;
        // Cantidad recomendada = lo que falta para 30 días de cobertura
        const recommendedQty = Math.max(0, stockNeeded30d - stockCurrent);
        // Urgencia
        let urgency: 'critical' | 'warning' | 'normal' = 'normal';
        if (daysUntilOut !== null && daysUntilOut <= 7) urgency = 'critical';
        else if (daysUntilOut !== null && daysUntilOut <= 14) urgency = 'warning';

        // Solo recomendar si: tiene ventas reales AND necesita reposición
        const needsReplenish = avgDaily > 0 && recommendedQty > 0;

        let reason = '';
        if (urgency === 'critical') {
          reason = `Se agota en ${daysUntilOut}d. Vende ${avgDaily.toFixed(1)}/día. Pedido urgente.`;
        } else if (urgency === 'warning') {
          reason = `Cobertura ${daysUntilOut}d. Vende ${avgDaily.toFixed(1)}/día. Reponer pronto.`;
        } else if (needsReplenish) {
          reason = `Vende ${avgDaily.toFixed(1)}/día. Para 30d de cobertura necesitas ${stockNeeded30d} uds.`;
        } else {
          reason = 'Stock suficiente para 30+ días.';
        }

        return {
          product_id: p.product_id,
          name: p.name,
          sku: p.sku,
          stock_current: stockCurrent,
          avg_daily_sales: avgDaily,
          days_until_out: daysUntilOut,
          recommended_qty: recommendedQty,
          stock_needed_30d: stockNeeded30d,
          urgency,
          reason,
        };
      })
      .filter((item) => item.avg_daily_sales > 0 && item.recommended_qty > 0)
      .sort((a, b) => {
        // Ordenar por urgencia (critical primero), luego por recommended_qty descendente
        const urgencyOrder = { critical: 0, warning: 1, normal: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return b.recommended_qty - a.recommended_qty;
      })
      .slice(0, 15); // Top 15 priorizados

    return items;
  }, [analytics]);

  const totalUnits = recommendedItems.reduce((s, i) => s + i.recommended_qty, 0);
  const criticalCount = recommendedItems.filter((i) => i.urgency === 'critical').length;

  const handleGenerate = () => {
    setGenerated(true);
    // En una implementación completa, aquí se llamaría a la API para crear la OC
    // Por ahora, marcamos como generada y mostramos el resumen
    toast.success(`Orden de compra inteligente generada: ${recommendedItems.length} productos, ${totalUnits} unidades`);
  };

  const handleGoToPurchaseOrders = () => {
    setShowModal(false);
    setCurrentView('purchase-orders');
  };

  return (
    <>
      {/* Botón premium con gradiente */}
      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-black text-sm uppercase tracking-tight text-foreground">Orden de Compra Inteligente</h3>
              <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-primary to-primary/70 text-primary-foreground px-2 py-0.5 rounded-full border border-primary/50 flex items-center gap-1 shadow-sm shrink-0">
                <Crown className="w-2.5 h-2.5" />
                Premium
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              El sistema analiza rotación y stock, y recomienda qué comprar para mantener 30 días de cobertura.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="shrink-0 px-5 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-black text-sm uppercase tracking-widest hover:shadow-lg hover:shadow-primary/25 active:scale-95 transition-all flex items-center gap-2"
          aria-label="Generar orden de compra inteligente"
        >
          <Zap className="w-4 h-4" />
          Generar OC
        </button>
      </div>

      {/* Modal con recomendaciones */}
      {showModal && (
        <BaseModal
          open={showModal}
          onOpenChange={() => { setShowModal(false); setGenerated(false); }}
          aria-label="Orden de Compra Inteligente"
          title={
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-base font-black uppercase tracking-tight">Orden de Compra Inteligente</span>
              <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-primary to-primary/70 text-primary-foreground px-2 py-0.5 rounded-full border border-primary/50 flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                Premium
              </span>
            </div>
          }
          description="Recomendación automática basada en ritmo de venta real de los últimos 30 días"
          maxWidth="sm:max-w-2xl"
          footer={
            <div className="flex items-center justify-between gap-3 w-full">
              <p className="text-xs text-muted-foreground">
                {recommendedItems.length} productos · {totalUnits} unidades · {criticalCount} críticos
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setGenerated(false); }}
                  className="px-4 min-h-[44px] py-2.5 border border-border rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                {generated ? (
                  <button
                    type="button"
                    onClick={handleGoToPurchaseOrders}
                    className="px-4 min-h-[44px] py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm uppercase tracking-widest flex items-center gap-1.5"
                  >
                    Ver Órdenes de Compra
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="px-4 min-h-[44px] py-2.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold rounded-xl hover:shadow-lg hover:shadow-primary/25 transition-all text-sm uppercase tracking-widest flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Confirmar OC
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Explicación del algoritmo */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex gap-2">
              <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80 leading-relaxed space-y-1">
                <p><strong className="text-primary">Cómo funciona:</strong> El sistema identifica productos con venta real y calcula cuántas unidades necesitas para 30 días de cobertura (mes completo).</p>
                <p><strong className="text-primary">Fórmula:</strong> cantidad_recomendada = (venta_diaria × 30) − stock_actual</p>
                <p><strong className="text-primary">Priorización:</strong> crítico (≤7 días stock) → urgente (≤14 días) → normal (15-30 días). Solo se incluyen productos con rotación.</p>
              </div>
            </div>

            {/* Lista de productos recomendados */}
            {recommendedItems.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success" />
                <p className="text-sm font-bold text-success uppercase tracking-wider">Todo bien</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No hay productos que requieran reposición. El stock actual cubre 30+ días para todos los productos con rotación.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recommendedItems.map((item, idx) => {
                  const urgencyColor = {
                    critical: 'border-destructive/30 bg-destructive/5',
                    warning: 'border-warning/30 bg-warning/5',
                    normal: 'border-border/50 bg-card',
                  };
                  const urgencyLabel = {
                    critical: 'CRÍTICO',
                    warning: 'URGENTE',
                    normal: 'NORMAL',
                  };
                  const urgencyTextColor = {
                    critical: 'text-destructive',
                    warning: 'text-warning',
                    normal: 'text-muted-foreground',
                  };
                  return (
                    <div key={item.product_id} className={cn('rounded-xl border p-3', urgencyColor[item.urgency])}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.sku || 'Sin SKU'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-lg tabular-nums text-primary">{item.recommended_qty}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">uds</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                        <span className={cn('text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border', urgencyTextColor[item.urgency], urgencyColor[item.urgency])}>
                          {urgencyLabel[item.urgency]}
                        </span>
                      </div>
                      {/* Barra de cobertura visual */}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Cobertura:</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              item.urgency === 'critical' ? 'bg-destructive' : item.urgency === 'warning' ? 'bg-warning' : 'bg-success',
                            )}
                            style={{ width: `${Math.min(100, ((item.days_until_out ?? 0) / 30) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black tabular-nums text-muted-foreground shrink-0">
                          {item.days_until_out ?? '∞'}d / 30d
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen */}
            {recommendedItems.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-black tabular-nums text-primary">{recommendedItems.length}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Productos</p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums text-primary">{totalUnits}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unidades</p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums text-destructive">{criticalCount}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Críticos</p>
                </div>
              </div>
            )}
          </div>
        </BaseModal>
      )}
    </>
  );
}

// ── KPIs Hero Row con tendencia ────────────────────────────────

function KpiHeroRow({ analytics, days }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']>; days: number }) {
  const t = useTranslations('dashboard.storeDashboard');
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
        <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider">
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
        <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
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
          'flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider',
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
        <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Activity className="w-3 h-3" />
          <span>{k.avg_items_per_sale.toFixed(1)} uds/venta · {k.period_transactions} transacciones</span>
        </span>
      ),
      trend: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">
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
                'ml-2 inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded',
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
  const t = useTranslations('dashboard.storeDashboard');
  // Ordenar por severidad y mostrar top 4
  const sorted = [...insights].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const top = sorted.slice(0, 4);

  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
        <Sparkles className="w-8 h-8 mx-auto mb-2 text-success" />
        <p className="text-sm font-bold text-success uppercase tracking-wider">Todo en orden</p>
        <p className="text-sm text-muted-foreground mt-1">No hay alertas ni oportunidades pendientes</p>
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
            <p className="text-sm text-muted-foreground uppercase tracking-widest">Clic en cada insight para ver detalle y respaldo histórico</p>
          </div>
        </div>
        <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest bg-muted/40 px-2 py-1 rounded-full">
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
                  <p className={cn('font-bold text-sm uppercase tracking-tight leading-tight', config.color)}>
                    {insight.title}
                  </p>
                  {insight.metric && (
                    <span className={cn('text-sm font-black tabular-nums px-1.5 py-0.5 rounded bg-background/70 shrink-0', config.color)}>
                      {insight.metric}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-1.5 line-clamp-2">{insight.message}</p>
                <p className="text-sm font-medium text-foreground/80 leading-relaxed flex items-start gap-1">
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
  const t = useTranslations('dashboard.storeDashboard');
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
            <p className="text-sm text-muted-foreground uppercase tracking-widest">{insights.length} avisos · clic para ver detalle</p>
          </div>
        </div>
        {insights.length > 8 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-bold uppercase tracking-widest text-primary hover:underline"
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
                  <p className={cn('font-bold text-sm uppercase tracking-tight', config.color)}>{insight.title}</p>
                  {insight.metric && (
                    <span className={cn('text-sm font-black tabular-nums px-1.5 py-0.5 rounded bg-background/70 shrink-0', config.color)}>
                      {insight.metric}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{insight.message}</p>
                <p className="text-sm font-medium text-foreground/70 leading-relaxed mt-1 flex items-start gap-1">
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
  const t = useTranslations('dashboard.storeDashboard');
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-sm uppercase tracking-tight text-foreground truncate">{title}</h3>
            <p className="text-sm text-muted-foreground uppercase tracking-widest truncate">{subtitle}</p>
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
  const t = useTranslations('dashboard.storeDashboard');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const option = useMemo(() => {
    const series = analytics.sales_series;
    // Promedio móvil 7 días
    const movingAvg = series.map((_, i) => {
      const window = series.slice(Math.max(0, i - 6), i + 1);
      return window.reduce((s, p) => s + p.sales, 0) / window.length;
    });

    const isLine = chartType === 'line';

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
      series: isLine ? [
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
      ] : [
        {
          name: 'Ventas',
          data: series.map((p) => p.sales),
          type: 'bar',
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#3B82F6' },
                { offset: 1, color: '#60A5FA' },
              ],
            },
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '60%',
        },
        {
          name: 'Promedio 7d',
          data: movingAvg,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#F59E0B', type: 'dashed' },
        },
      ],
    };
  }, [analytics, chartType]);

  return (
    <div className="relative">
      {/* Toggle línea/barras */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg border border-border/40 p-0.5">
        <button
          type="button"
          onClick={() => setChartType('line')}
          className={cn(
            'px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1',
            chartType === 'line' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label="Ver como gráfico de líneas"
          title="Líneas: mejor para ver tendencia"
        >
          <LineChart className="w-3 h-3" />
          Línea
        </button>
        <button
          type="button"
          onClick={() => setChartType('bar')}
          className={cn(
            'px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1',
            chartType === 'bar' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label="Ver como gráfico de barras"
          title="Barras: mejor para comparar días"
        >
          <BarChart3 className="w-3 h-3" />
          Barras
        </button>
      </div>
      <ECharts option={option} style={{ height: 300 }} />
    </div>
  );
}

// ── Top Products Chart (Horizontal Bar) ────────────────────────

function TopProductsChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const t = useTranslations('dashboard.storeDashboard');
  const option = useMemo(() => {
    const products = [...analytics.top_products_revenue].reverse();
    return {
      grid: { left: 130, right: 70, top: 12, bottom: 24, containLabel: false },
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
          color: '#475569', fontSize: 11, fontWeight: 500,
          formatter: (val: number) => moneyShort(val),
        },
        splitLine: { lineStyle: { color: '#F1F5F9' } },
      },
      yAxis: {
        type: 'category',
        data: products.map((p) => {
          const name = p.name.length > 28 ? p.name.slice(0, 28) + '…' : p.name;
          return name;
        }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#0F172A', fontSize: 13, fontWeight: 700,
          width: 140, overflow: 'truncate',
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
  const t = useTranslations('dashboard.storeDashboard');
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
        subtextStyle: { color: '#475569', fontSize: 12, fontWeight: 'bold' },
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
      <div className="py-12 text-center text-sm text-muted-foreground uppercase tracking-wider">
        Sin transacciones en el período
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Donut centrado — altura responsive para mobile */}
      <div className="flex justify-center">
        <ECharts option={option} style={{ height: 'clamp(200px, 40vw, 280px)', width: '100%' }} />
      </div>

      {/* Lista detallada con barras de progreso */}
      <div className="space-y-3">
        {data.map((p, i) => {
          const label = PAYMENT_METHOD_LABELS[p.method] || p.method;
          const color = CHART_PALETTE[i % CHART_PALETTE.length];
          return (
            <div key={p.method} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-bold text-foreground truncate">{label}</span>
                  <span className="text-muted-foreground text-sm font-mono">({p.count} tx)</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black tabular-nums text-foreground">{formatCurrency(p.total)}</span>
                  <span
                    className="text-sm font-black tabular-nums px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {p.pct}%
                  </span>
                </div>
              </div>
              {/* Barra de progreso visual — h-2 para mejor visibilidad */}
              <div
                className="relative h-2 w-full bg-muted rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={p.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${p.pct}% del total`}
              >
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
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50 text-sm">
        <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Total {totalTx} transacciones
        </span>
        <span className="font-black tabular-nums text-foreground">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

// ── Category Margins Chart ─────────────────────────────────────

function CategoryMarginsChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const t = useTranslations('dashboard.storeDashboard');
  const option = useMemo(() => {
    const cats = analytics.category_margins.slice(0, 8);
    return {
      grid: { left: 140, right: 80, top: 20, bottom: 30, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#F1F5F9', fontSize: 13 },
        formatter: (p: any) => {
          const item = cats[p.dataIndex];
          const health = item.margin_pct < 15 ? '🔴 Pérdida operativa' : item.margin_pct < 25 ? '🟡 Aceptable' : '🟢 Saludable';
          return `<div style="font-weight:700;margin-bottom:6px;font-size:14px">${item.category}</div>
                  <div style="margin-bottom:4px">Estado: <strong>${health}</strong></div>
                  <div>Ingreso: <strong>${formatCurrency(item.revenue)}</strong></div>
                  <div>Costo: ${formatCurrency(item.cost)}</div>
                  <div>Margen: <strong style="color:${item.margin_pct < 15 ? '#EF4444' : '#10B981'}">${item.margin_pct}%</strong></div>
                  <div>Ganancia: ${formatCurrency(item.margin)}</div>
                  <div>Unidades vendidas: ${item.items_sold}</div>`;
        },
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#0F172A', fontSize: 12, fontWeight: 600,
          formatter: (val: number) => `${val}%`,
        },
        splitLine: { lineStyle: { color: '#E2E8F0' } },
      },
      yAxis: {
        type: 'category',
        data: cats.map((c) => {
          const name = c.category.length > 20 ? c.category.slice(0, 20) + '…' : c.category;
          return name;
        }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#0F172A', fontSize: 13, fontWeight: 700 },
      },
      series: [
        {
          type: 'bar',
          data: cats.map((c) => ({
            value: c.margin_pct,
            itemStyle: {
              // Rojo si <15%, amarillo si 15-25%, verde si >25%
              color: c.margin_pct < 15 ? '#EF4444' : c.margin_pct < 25 ? '#F59E0B' : '#10B981',
              borderRadius: [0, 6, 6, 0],
            },
          })),
          barWidth: 16,
          label: {
            show: true, position: 'right',
            formatter: (p: any) => {
              const item = cats[p.dataIndex];
              const tag = item.margin_pct < 15 ? ' ⚠️' : item.margin_pct < 25 ? '' : ' ✓';
              return `${p.value}%${tag}`;
            },
            color: '#0F172A', fontSize: 12, fontWeight: 700,
          },
          markLine: {
            symbol: 'none',
            silent: true,
            data: [
              { xAxis: 15, label: { show: true, formatter: 'Mín 15%', color: '#EF4444', fontSize: 10, fontWeight: 700, position: 'insideStartTop' } },
              { xAxis: 25, label: { show: true, formatter: 'Saludable 25%', color: '#10B981', fontSize: 10, fontWeight: 700, position: 'insideStartTop' } },
            ],
            lineStyle: { color: '#94A3B8', type: 'dashed', width: 1.5 },
          },
        },
      ],
    };
  }, [analytics]);

  // Recomendación accionable basada en el análisis de márgenes
  const recommendations = useMemo(() => {
    const cats = analytics.category_margins.slice(0, 8);
    if (cats.length === 0) return null;
    const critical = cats.filter((c) => c.margin_pct < 15);
    const healthy = cats.filter((c) => c.margin_pct >= 25);
    const improvable = cats.filter((c) => c.margin_pct >= 15 && c.margin_pct < 25);

    if (critical.length > 0) {
      const worst = critical.sort((a, b) => a.margin_pct - b.margin_pct)[0];
      return {
        type: 'critical' as const,
        text: `Acción urgente: "${worst.category}" tiene margen de ${worst.margin_pct}% (zona de pérdida). Sube el precio o renegocia el costo con el proveedor. Si no es posible, considera descontinuar la categoría.`,
        count: critical.length,
      };
    }
    if (improvable.length > 0) {
      return {
        type: 'warning' as const,
        text: `Oportunidad: ${improvable.length} categoría(s) con margen entre 15-25% (mejorable). Revisa precios o costos para llevarlas al 25%+ (zona saludable).`,
        count: improvable.length,
      };
    }
    return {
      type: 'positive' as const,
      text: `Excelente: ${healthy.length} categoría(s) con margen saludable (≥25%). Mantén la estrategia actual y considera aumentar el stock de estas categorías.`,
      count: healthy.length,
    };
  }, [analytics]);

  return (
    <div className="space-y-3">
      <ECharts option={option} style={{ height: 280 }} />
      {recommendations && (
        <div className={cn(
          'rounded-xl border p-3 flex gap-2 items-start',
          recommendations.type === 'critical' ? 'border-destructive/30 bg-destructive/5' :
          recommendations.type === 'warning' ? 'border-warning/30 bg-warning/5' :
          'border-success/30 bg-success/5',
        )}>
          <Target className={cn(
            'w-4 h-4 shrink-0 mt-0.5',
            recommendations.type === 'critical' ? 'text-destructive' :
            recommendations.type === 'warning' ? 'text-warning' :
            'text-success',
          )} />
          <div>
            <p className={cn(
              'text-xs font-black uppercase tracking-widest mb-1',
              recommendations.type === 'critical' ? 'text-destructive' :
              recommendations.type === 'warning' ? 'text-warning' :
              'text-success',
            )}>
              {recommendations.type === 'critical' ? 'Decisión requerida' :
               recommendations.type === 'warning' ? 'Oportunidad de mejora' :
               'Estrategia saludable'}
            </p>
            <p className="text-sm text-foreground/90 leading-relaxed">{recommendations.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weekday Distribution Chart ─────────────────────────────────

function WeekdayChart({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const t = useTranslations('dashboard.storeDashboard');
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
          color: '#475569', fontSize: 11, fontWeight: 500,
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
  const t = useTranslations('dashboard.storeDashboard');
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
        axisLabel: { color: '#475569', fontSize: 11, interval: 1, fontWeight: 500 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#475569', fontSize: 11, fontWeight: 500,
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
  const t = useTranslations('dashboard.storeDashboard');
  if (analytics.top_products_quantity.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground uppercase tracking-wider">
        Sin productos vendidos en el período
      </div>
    );
  }
  const maxQty = Math.max(...analytics.top_products_quantity.map((p) => p.quantity));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-sm uppercase tracking-widest text-muted-foreground border-b border-border/50">
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
              <td className="py-2.5 px-2 text-muted-foreground font-mono text-sm hidden sm:table-cell">{p.sku || '—'}</td>
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
  alertType, analytics,
}: {
  title: string;
  subtitle: string;
  items: { id: string; name: string; metric: string; detail: string; severity: 'critical' | 'warning' | 'opportunity' }[];
  emptyText: string;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  /** Tipo de alerta para fundamentación contextual */
  alertType?: 'stock' | 'slow' | 'overstock';
  /** Analytics para construir detalle al hacer clic */
  analytics?: NonNullable<ReturnType<typeof useStoreAnalytics>['data']>;
}) {
  const t = useTranslations('dashboard.storeDashboard');
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; metric: string; detail: string; severity: 'critical' | 'warning' | 'opportunity' } | null>(null);
  const severityColor = {
    critical: 'text-destructive',
    warning: 'text-warning',
    opportunity: 'text-cyan-600',
  };

  // Construir detalle fundamentado para el item seleccionado
  const selectedItemDetail = useMemo(() => {
    if (!selectedItem || !analytics || !alertType) return null;
    // Buscar el item en el analytics correspondiente
    if (alertType === 'stock') {
      const item = analytics.low_stock.find((p) => p.product_id === selectedItem.id);
      if (!item) return null;
      const periodDays = Math.max(1, analytics.period_days);
      return {
        type: 'stock' as const,
        stockCurrent: item.stock_current,
        minStock: item.min_stock,
        deficit: item.deficit,
        avgDailySales: 0, // no disponible aquí, el insight sí lo tiene
        daysUntilOut: null,
        totalSold: 0,
        periodDays,
        chartData: [],
      };
    }
    if (alertType === 'slow') {
      const item = analytics.slow_movers.find((p) => p.product_id === selectedItem.id);
      if (!item) return null;
      return {
        type: 'rotation' as const,
        stockCurrent: item.stock_current,
        daysWithoutSales: item.days_without_sales,
        lastSaleDate: item.last_sale_date,
        periodDays: Math.max(1, analytics.period_days),
        chartData: [],
      };
    }
    if (alertType === 'overstock') {
      const item = analytics.overstock.find((p) => p.product_id === selectedItem.id);
      if (!item) return null;
      return {
        type: 'rotation' as const,
        stockCurrent: item.stock_current,
        daysOfStock: item.days_of_stock,
        avgDailySales: item.avg_daily_sales,
        overstockValue: item.overstock_value,
        periodDays: Math.max(1, analytics.period_days),
        chartData: [],
      };
    }
    return null;
  }, [selectedItem, analytics, alertType]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
        {icon}
        <div className="min-w-0 flex-1">
          <h4 className="font-black text-sm uppercase tracking-tight text-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground uppercase tracking-widest">{subtitle}</p>
        </div>
        <span className={cn(
          'text-xs font-black tabular-nums px-2 py-0.5 rounded-full',
          items.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
        )}>
          {items.length}
        </span>
      </div>
      <div className="flex-1 max-h-[280px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground uppercase tracking-wider">
            {emptyText}
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className="w-full px-4 py-2 border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors text-left focus:outline-none focus:bg-muted/40"
              aria-label={`Ver fundamentación de ${item.name}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm text-foreground truncate flex-1" title={item.name}>{item.name}</p>
                <span className={cn('font-black text-sm tabular-nums shrink-0', severityColor[item.severity])}>
                  {item.metric}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{item.detail}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-1 flex items-center gap-1">
                <Lightbulb className="w-2.5 h-2.5" />
                Clic para ver por qué
              </p>
            </button>
          ))
        )}
      </div>
      {items.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/50">
          <button
            type="button"
            onClick={onAction}
            className="w-full min-h-[44px] py-2.5 rounded-lg bg-muted/40 hover:bg-muted text-sm font-black uppercase tracking-widest text-foreground transition-colors flex items-center justify-center gap-1.5"
          >
            {actionLabel}
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Modal de fundamentación al clic en producto */}
      {selectedItem && (
        <BaseModal
          open={!!selectedItem}
          onOpenChange={() => setSelectedItem(null)}
          aria-label={`Fundamentación: ${selectedItem.name}`}
          title={
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <span className="text-base font-black uppercase tracking-tight">¿Por qué {selectedItem.name}?</span>
            </div>
          }
          description="Fundamentación del análisis y recomendación logística"
          maxWidth="sm:max-w-lg"
          footer={
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="px-4 min-h-[44px] py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-widest"
            >
              Entendido
            </button>
          }
        >
          <div className="space-y-4">
            {/* Resumen del producto */}
            <div className="rounded-xl border border-border/30 bg-muted/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-black text-sm uppercase tracking-tight">{selectedItem.name}</p>
                <span className={cn('text-sm font-black tabular-nums', severityColor[selectedItem.severity])}>
                  {selectedItem.metric}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{selectedItem.detail}</p>
            </div>

            {/* Fundamentación Diataxis */}
            {selectedItemDetail && <Fundamentation detail={selectedItemDetail} />}

            {/* Tip educativo */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex gap-2">
              <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80 leading-relaxed">
                <strong className="text-primary">Tip:</strong> Las alertas no son alarmas, son oportunidades de mejora.
                Cada producto en esta lista representa una decisión pendiente: reponer, liquidar, transferir, o descontinuar.
                La meta no es "limpiar la lista", es tomar la decisión correcta para cada caso.
              </p>
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}

// ── Categoría Drill-Down Panel ─────────────────────────────────

function CategoryDrillDownPanel({ analytics }: { analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']> }) {
  const t = useTranslations('dashboard.storeDashboard');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const categories = analytics.category_margins;

  if (categories.length === 0) {
    return (
      <ChartCard
        title="Análisis por categoría"
        subtitle="Rentabilidad detallada por grupo de productos"
        icon={<Tag className="w-4 h-4 text-primary" />}
      >
        <div className="py-8 text-center text-sm text-muted-foreground uppercase tracking-wider">
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
                'px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Ingresos</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.revenue)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Costo</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.cost)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Ganancia</p>
            <p className="text-base font-black tabular-nums text-success">{formatCurrency(selected.margin)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Margen</p>
            <p className={cn(
              'text-base font-black tabular-nums',
              selected.margin_pct < 15 ? 'text-destructive' : selected.margin_pct < 25 ? 'text-warning' : 'text-success',
            )}>
              {selected.margin_pct}%
            </p>
          </div>
        </div>

        {/* Barra de margen visual — simplificada y clara */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-foreground">Margen: {selected.margin_pct}%</span>
            <span className={cn(
              'font-black uppercase tracking-widest text-xs px-2 py-0.5 rounded-full',
              selected.margin_pct < 15 ? 'bg-destructive/15 text-destructive' :
              selected.margin_pct < 25 ? 'bg-warning/15 text-warning' :
              'bg-success/15 text-success',
            )}>
              {selected.margin_pct < 15 ? '⚠️ Pérdida' : selected.margin_pct < 25 ? 'Aceptable' : '✓ Saludable'}
            </span>
          </div>
          <div className="relative h-4 w-full rounded-full overflow-hidden border border-border/50">
            {/* Zona roja (0-15%) */}
            <div className="absolute inset-y-0 left-0 bg-destructive/40" style={{ width: '15%' }} />
            {/* Zona ámbar (15-25%) */}
            <div className="absolute inset-y-0 bg-warning/40" style={{ left: '15%', width: '10%' }} />
            {/* Zona verde (25-100%) */}
            <div className="absolute inset-y-0 bg-success/40" style={{ left: '25%', width: '75%' }} />
            {/* Indicador del margen real */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 bg-foreground rounded-full shadow-lg z-10"
              style={{ left: `${Math.min(selected.margin_pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
            <span>0%</span>
            <span className="text-destructive">15% mínimo</span>
            <span className="text-success">25% saludable</span>
            <span>100%</span>
          </div>
        </div>

        {/* Decisión recomendada */}
        <div className={cn(
          'rounded-xl border p-3 flex gap-2 items-start',
          selected.margin_pct < 15 ? 'border-destructive/30 bg-destructive/5' :
          selected.margin_pct < 25 ? 'border-warning/30 bg-warning/5' :
          'border-success/30 bg-success/5',
        )}>
          <Target className={cn(
            'w-4 h-4 shrink-0 mt-0.5',
            selected.margin_pct < 15 ? 'text-destructive' :
            selected.margin_pct < 25 ? 'text-warning' :
            'text-success',
          )} />
          <div>
            <p className={cn(
              'text-xs font-black uppercase tracking-widest mb-1',
              selected.margin_pct < 15 ? 'text-destructive' :
              selected.margin_pct < 25 ? 'text-warning' :
              'text-success',
            )}>
              {selected.margin_pct < 15 ? 'Decisión urgente' :
               selected.margin_pct < 25 ? 'Oportunidad de mejora' :
               'Estrategia saludable'}
            </p>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {selected.margin_pct < 15
                ? `"${selected.category}" tiene margen de ${selected.margin_pct}% (zona de pérdida operativa). Sube el precio o renegocia el costo. Si no es posible, considera descontinuar productos de esta categoría.`
                : selected.margin_pct < 25
                  ? `"${selected.category}" tiene margen de ${selected.margin_pct}% (mejorable). Cada punto de margen = ${formatCurrency(selected.revenue * 0.01)} adicionales. Renegocia costos para llegar al 25%.`
                  : `"${selected.category}" tiene margen saludable (${selected.margin_pct}%). Aumenta el stock de esta categoría para capitalizar la rentabilidad.`}
            </p>
          </div>
        </div>
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
  const t = useTranslations('dashboard.storeDashboard');
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
        <div className="py-8 text-center text-sm text-muted-foreground uppercase tracking-wider">
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
          className="text-sm font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-1"
        >
          Ver catálogo
          <ChevronRight className="w-3 h-3" />
        </button>
      }
    >
      <div className="space-y-4">
        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto por nombre o SKU..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/40 border border-border/30 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                <p className="text-sm text-muted-foreground font-mono">
                  {p.sku || 'Sin SKU'} · {p.category || 'Sin categoría'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-sm tabular-nums text-foreground">{formatCurrency(p.revenue)}</p>
                <p className="text-sm text-muted-foreground">{p.quantity} uds</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground uppercase tracking-wider">
              Sin resultados
            </div>
          )}
        </div>

        {/* Detalle del producto seleccionado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Ingresos</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.revenue)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Costo total</p>
            <p className="text-base font-black tabular-nums text-foreground">{formatCurrency(selected.cost)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Unidades</p>
            <p className="text-base font-black tabular-nums text-foreground">{selected.quantity}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Margen</p>
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
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Precio prom. venta</p>
            <p className="text-sm font-black tabular-nums text-primary">
              {selected.quantity > 0 ? formatCurrency(selected.revenue / selected.quantity) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Costo unitario</p>
            <p className="text-sm font-black tabular-nums text-muted-foreground">
              {selected.quantity > 0 ? formatCurrency(selected.cost / selected.quantity) : '—'}
            </p>
          </div>
        </div>

        {/* Gráfico de ventas por día del producto seleccionado */}
        <ProductDailySalesChart analytics={analytics} productId={selected.product_id} productName={selected.name} />

        {/* Recomendación accionable */}
        <div className={cn(
          'rounded-xl border p-3 flex gap-2 items-start',
          selected.margin_pct < 15 ? 'border-destructive/30 bg-destructive/5' :
          selected.margin_pct < 25 ? 'border-warning/30 bg-warning/5' :
          'border-success/30 bg-success/5',
        )}>
          <Target className={cn(
            'w-4 h-4 shrink-0 mt-0.5',
            selected.margin_pct < 15 ? 'text-destructive' :
            selected.margin_pct < 25 ? 'text-warning' :
            'text-success',
          )} />
          <div>
            <p className={cn(
              'text-xs font-black uppercase tracking-widest mb-1',
              selected.margin_pct < 15 ? 'text-destructive' :
              selected.margin_pct < 25 ? 'text-warning' :
              'text-success',
            )}>
              {selected.margin_pct < 15 ? 'Acción requerida' :
               selected.margin_pct < 25 ? 'Oportunidad de mejora' :
               'Producto rentable'}
            </p>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {selected.margin_pct < 15
                ? `"${selected.name}" tiene margen de ${selected.margin_pct}% (zona de pérdida). Sube el precio de venta o renegocia el costo con tu proveedor. Si no es posible, considera descontinuar el producto.`
                : selected.margin_pct < 25
                  ? `"${selected.name}" tiene margen de ${selected.margin_pct}% (mejorable). Renegocia costos o ajusta el precio para llegar al 25%+ (saludable). Cada punto porcentual de margen = ${formatCurrency(selected.revenue * 0.01)} adicionales.`
                  : `"${selected.name}" tiene margen saludable de ${selected.margin_pct}%. Producto rentable — mantén stock disponible y considera promociones para aumentar volumen.`}
            </p>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

// ── Product Daily Sales Chart (gráfico de ventas por día del producto) ──

function ProductDailySalesChart({ analytics, productId, productName }: {
  analytics: NonNullable<ReturnType<typeof useStoreAnalytics>['data']>;
  productId: string;
  productName: string;
}) {
  const option = useMemo(() => {
    // Filtrar la serie de ventas para mostrar solo los días con actividad
    const series = analytics.sales_series.filter((p) => p.items_sold > 0);

    return {
      grid: { left: 55, right: 20, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(139, 92, 246, 0.3)',
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        formatter: (params: any) => {
          const date = new Date(params[0].axisValue);
          const dateStr = date.toLocaleDateString('es-CU', { day: '2-digit', month: 'short', year: 'numeric' });
          return `<div style="font-weight:700;margin-bottom:4px">${dateStr}</div>
                  <div>Ventas del día: <strong style="color:#8B5CF6">${formatCurrency(params[0].value)}</strong></div>
                  <div style="font-size:11px;color:#94A3B8;margin-top:2px">Producto: ${productName}</div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: series.map((p) => p.date),
        axisLine: { lineStyle: { color: '#E2E8F0' } },
        axisLabel: {
          color: '#0F172A', fontSize: 10, fontWeight: 600,
          formatter: (val: string) => {
            const d = new Date(val);
            return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit' });
          },
          interval: Math.max(0, Math.floor(series.length / 10) - 1),
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#0F172A', fontSize: 10, fontWeight: 600,
          formatter: (val: number) => moneyShort(val),
        },
        splitLine: { lineStyle: { color: '#E2E8F0' } },
      },
      series: [
        {
          name: 'Ventas',
          data: series.map((p) => p.sales),
          type: 'bar',
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#8B5CF6' },
                { offset: 1, color: '#A78BFA' },
              ],
            },
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '60%',
        },
      ],
    };
  }, [analytics, productName]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <BarChart3 className="w-3 h-3 text-purple-500" />
        Ventas por día — {productName}
      </p>
      <ECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

// ── Insight Detail Modal ───────────────────────────────────────

function InsightDetailModal({ insight, onClose }: { insight: Insight; onClose: () => void }) {
  const t = useTranslations('dashboard.storeDashboard');
  const config = SEVERITY_CONFIG[insight.severity];
  const Icon = config.icon;
  const isMobile = useIsMobile();

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
            axisLabel: { color: '#1E293B', fontSize: 12, fontWeight: 600 },
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
    <div className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto',
      isMobile
        ? 'flex items-end p-0' // mobile: bottom sheet
        : 'flex items-center justify-center p-4', // desktop: centered dialog
    )}>
      <div className={cn(
        'bg-card border-border shadow-2xl overflow-y-auto',
        isMobile
          ? 'rounded-t-2xl border-t w-full max-h-[90vh] pb-[env(safe-area-inset-bottom)]' // mobile: bottom sheet
          : 'rounded-2xl border max-w-2xl w-full max-h-[90vh]', // desktop: centered
      )}>
        {/* Header */}
        <div className={cn('px-5 py-4 border-b border-border/50 flex items-start justify-between gap-3 sticky top-0 z-10', config.bg)}>
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-background/70', config.color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className={cn('font-black text-sm uppercase tracking-tight', config.color)}>{insight.title}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-widest mt-0.5">
                Categoría: {insight.category} · Severidad: {insight.severity}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-11 h-11 rounded-lg hover:bg-muted/60 transition-colors flex items-center justify-center"
            aria-label="Cerrar detalle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Mensaje principal */}
          <div className="space-y-1.5">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Mensaje</p>
            <p className="text-sm text-foreground leading-relaxed">{insight.message}</p>
          </div>

          {/* Métricas de respaldo */}
          {insight.detail && <DetailMetrics detail={insight.detail} />}

          {/* Gráfico de respaldo */}
          {chartOption && (
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
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
            <p className={cn('text-sm font-black uppercase tracking-widest mb-1.5', config.color)}>
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
  const t = useTranslations('dashboard.storeDashboard');
  switch (detail.type) {
    case 'stock':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Top 5 productos y su participación</p>
            <div className="space-y-1">
              {detail.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-lg bg-muted/30">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <MetricBox label="Método dominante" value={detail.dominantMethod} />
            <MetricBox label="% concentración" value={`${detail.pct}%`} highlight="warning" />
            <MetricBox label="Transacciones" value={`${detail.count}`} />
            <MetricBox label="Total" value={formatCurrency(detail.total)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Todos los métodos</p>
            <div className="space-y-1">
              {detail.allMethods.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-lg bg-muted/30">
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
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Todos los días</p>
            <div className="space-y-1">
              {detail.allDays.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-lg bg-muted/30">
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
  const t = useTranslations('dashboard.storeDashboard');
  const color = {
    success: 'text-success',
    warning: 'text-warning',
    critical: 'text-destructive',
    muted: 'text-muted-foreground',
  };
  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
      <p className="text-sm font-black uppercase tracking-widest text-muted-foreground truncate" title={label}>{label}</p>
      <p className={cn('text-sm font-black tabular-nums truncate', highlight ? color[highlight] : 'text-foreground')} title={value}>
        {value}
      </p>
    </div>
  );
}

// ── Fundamentación (cómo se calculó el insight) ────────────────

function Fundamentation({ detail }: { detail: InsightDetail }) {
  const t = useTranslations('dashboard.storeDashboard');
  const sections = useMemo(() => {
    switch (detail.type) {
      case 'stock':
        return {
          que: `Stock crítico: el inventario actual (${detail.stockCurrent} uds) está por debajo del mínimo definido (${detail.minStock} uds), con un déficit de ${detail.deficit} unidades.`,
          porQue: `Mantener stock por debajo del mínimo arriesga perder ventas (stockout). El mínimo se define para garantizar cobertura mientras llega la reposición del proveedor. Si el producto tiene rotación real, cada día sin stock es venta perdida y cliente insatisfecho.`,
          como: `Ritmo de venta = unidades vendidas (${detail.totalSold.toFixed(0)}) / días del período (${detail.periodDays}) = ${detail.avgDailySales.toFixed(2)} uds/día. Días hasta agotar = stock actual / ritmo = ${detail.daysUntilOut !== null ? detail.daysUntilOut + ' días' : 'no aplica (sin ventas)'}. Recomendación de reposición = ritmo × 14 días (cobertura 2 semanas).`,
          benchmark: `Cobertura ideal retail: 14–21 días. <7 días = zona de riesgo. Sin ventas = revisar política (¿el mínimo es necesario?).`,
        };
      case 'rotation':
        if (detail.daysWithoutSales !== undefined) {
          const d = detail.daysWithoutSales;
          return {
            que: d === 0
              ? `Sin ventas históricas registradas en el período analizado (${detail.periodDays} días).`
              : `Movimiento lento: ${d} días sin ninguna venta registrada.`,
            porQue: d === 0
              ? `El producto no ha generado ventas en el período. Capital invertido sin retorno. Posible causa: precio alto, sin demanda, mal categorizado, o no visible para el cliente.`
              : `El capital invertido en este producto lleva ${d} días sin recuperar. A partir de 30 días se considera "lento movimiento"; más de 90 días es "inventario muerto". Cada día adicional es costo de oportunidad del dinero inmovilizado.`,
            como: `Se identifica la última fecha de venta registrada. Los días sin venta = hoy - última venta. Stock inmovilizado = stock_actual × costo_unitario. Si el producto no aparece en las ventas del período, se marca como ${d === 0 ? 'sin actividad' : 'lento'}.`,
            benchmark: `Rotación ideal retail: 15–30 días. 30–60 días = observación. >60 días = acción recomendada. >90 días = liquidar.`,
          };
        }
        return {
          que: `Exceso de inventario: ${detail.stockCurrent} uds en stock = ${detail.daysOfStock ?? '∞'} días de cobertura.`,
          porQue: `Comprar de más inmoviliza capital que podría usarse en productos de mayor rotación. El costo de oportunidad del dinero inmovilizado es el retorno que ese capital generaría invertido en otro producto con mejor rotación.`,
          como: `Días de stock = stock actual / venta diaria promedio. >45 días = sobrecompra con capital inmovilizado. Stock inmovilizado = (stock_actual - stock_óptimo) × costo_unitario.`,
          benchmark: `Cobertura óptima: 15–30 días. 30–45 días = monitorear. >45 días = exceso (descuento o transferencia).`,
        };
      case 'margin':
        return {
          que: `Margen de ${detail.marginPct.toFixed(1)}% en la categoría "${detail.category}".`,
          porQue: `El margen es la diferencia entre precio de venta y costo, expresado como % del precio. Es el indicador principal de rentabilidad. Márgenes bajos obligan a alto volumen para cubrir gastos operativos; márgenes altos permiten resilience ante caídas de venta.`,
          como: `Margen % = (ingresos - costo) / ingresos × 100. Ingresos = precio × cantidad vendida. Costo = costo_unitario × cantidad. No incluye gastos operativos prorrateados (rent, sueldos, luz).`,
          benchmark: `<15% zona de pérdida operativa. 15–25% margen aceptable. >25% saludable. >40% premium.`,
        };
      case 'top':
        return {
          que: `Producto estrella: "${detail.productName}" genera ${formatCurrencyShort(detail.revenue)} en ingresos.`,
          porQue: `Los productos top son los principales generadores de caja. Proteger su disponibilidad es prioridad: un stockout del producto estrella tiene impacto desproporcionado en los ingresos del día. Concentración excesiva en pocos productos = riesgo.`,
          como: `Se suman los ingresos (precio × cantidad) de todas las transacciones del producto en el período. Ranking por ingreso total descendente.`,
          benchmark: `Mantener stock 3× venta semanal protege contra stockout. Top 20% de productos debería generar 80% de ingresos (principio Pareto).`,
        };
      case 'concentration':
        return {
          que: `Concentración del ${detail.concentration.toFixed(1)}% en "${detail.productName}".`,
          porQue: `Depender de un solo producto es riesgo operativo: si pierde demanda, se agota, o el proveedor falla, el impacto en caja es severo. Diversificar el mix protege contra shocks.`,
          como: `% concentración = ingresos del producto / ingresos totales × 100. Si >50%, la tienda es dependiente de ese producto.`,
          benchmark: `<20% saludable. 20–50% zona de observación. >50% dependencia peligrosa. >70% crítica.`,
        };
      case 'trend':
        return {
          que: `Tendencia: ${detail.change >= 0 ? '+' : ''}${detail.change.toFixed(1)}% vs período anterior.`,
          porQue: `Detectar momentum temprano permite ajustar compras y marketing. Tendencia positiva = oportunidad de capitalizar; negativa = alerta para investigar causas (competencia, estacionalidad,质量问题).`,
          como: `Se comparan ventas de los últimos 7 días vs los 7 días previos. Cambio % = (reciente - previo) / previo × 100. >5% se considera significativo.`,
          benchmark: `>10% momentum positivo fuerte. 5–10% crecimiento moderado. -5% a +5% estable. <-5% alerta. <-10% crítica.`,
        };
      case 'payment':
        return {
          que: `Método dominante: ${PAYMENT_LABELS_ES[detail.dominantMethod] || detail.dominantMethod} (${detail.pct.toFixed(1)}% del total).`,
          porQue: `Concentración en un método de pago es dependencia operativa: si el método falla (caída de red, problema bancario), se pierden ventas. Cada método no habilitado representa clientes potenciales perdidos por fricción.`,
          como: `Se agrupan transacciones por método de pago y se calcula el % del total. Ingresos totales = suma de todos los métodos.`,
          benchmark: `<50% distribución saludable. 50–80% dependencia moderada. >80% dependencia crítica.`,
        };
      case 'weekday':
        return {
          que: `Día pico: ${detail.bestDay} con ${formatCurrencyShort(detail.bestDaySales)} en ventas.`,
          porQue: `Conocer el día de mayor tráfico permite reforzar personal, stock y promociones ese día para maximizar conversión. Días bajos son oportunidad de promociones específicas.`,
          como: `Se suman ventas por día de la semana en el período. El día con mayor volumen es el pico de demanda semanal.`,
          benchmark: `Variación <30% entre días = estable. >50% = Concentración de demanda (reforzar día pico).`,
        };
      default:
        return null;
    }
  }, [detail]);

  if (!sections) return null;

  return (
    <div className="rounded-xl border border-border/30 bg-muted/10 p-4 space-y-3">
      <p className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Lightbulb className="w-3 h-3" />
        Fundamentación del análisis (Diataxis)
      </p>
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 gap-1.5">
          <p className="text-xs font-black uppercase tracking-widest text-primary/80 flex items-center gap-1">
            <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px]">1</span>
            Qué está pasando
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed pl-6">{sections.que}</p>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <p className="text-xs font-black uppercase tracking-widest text-primary/80 flex items-center gap-1">
            <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px]">2</span>
            Por qué importa
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed pl-6">{sections.porQue}</p>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <p className="text-xs font-black uppercase tracking-widest text-primary/80 flex items-center gap-1">
            <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px]">3</span>
            Cómo se calcula
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed pl-6">{sections.como}</p>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <p className="text-xs font-black uppercase tracking-widest text-success/80 flex items-center gap-1">
            <span className="w-5 h-5 rounded bg-success/10 flex items-center justify-center text-[10px]">✓</span>
            Benchmark / referencia
          </p>
          <p className="text-sm text-success/90 leading-relaxed pl-6 font-medium">{sections.benchmark}</p>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────

function DashboardSkeleton() {
  const t = useTranslations('dashboard.storeDashboard');
  return (
    <div className="space-y-5">
      {/* Skeleton de tabs */}
      <div className="flex border-b border-border bg-card rounded-t-xl overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex-1 py-3 px-4 flex items-center justify-center gap-2">
            <Skeleton className="w-3.5 h-3.5 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
        ))}
      </div>
      {/* Skeleton de KPIs Hero */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="w-4 h-4 rounded" />
            </div>
            <Skeleton className="h-7 w-28 rounded" />
            <Skeleton className="h-2 w-32 rounded" />
          </div>
        ))}
      </div>
      {/* Skeleton de insights */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/50 flex items-center gap-2">
          <Skeleton className="w-7 h-7 rounded-lg" />
          <Skeleton className="h-3 w-32 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border p-3.5 flex gap-3">
              <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-2 w-full rounded" />
                <Skeleton className="h-2 w-5/6 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Skeleton de chart principal */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/50 flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-32 rounded" />
            <Skeleton className="h-2 w-24 rounded" />
          </div>
        </div>
        <div className="p-5">
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function DashboardError({ error }: { error: unknown }) {
  const t = useTranslations('dashboard.storeDashboard');
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive" />
      <p className="text-sm font-bold text-destructive uppercase tracking-wider">Error al cargar dashboard</p>
      <p className="text-sm text-muted-foreground mt-2 font-mono">{msg}</p>
    </div>
  );
}
