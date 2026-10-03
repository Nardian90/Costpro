'use client';

import React, { lazy, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar as CalendarIcon,
  LayoutDashboard,
  Settings2,
  TrendingUp,
  ShoppingCart,
  Banknote,
  ArrowUpRight,
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useUIStore, useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useStores } from '@/hooks/api/useStores';
import { StateRenderer } from '@/components/ui/StateRenderer';
import type { Product } from '@/types';
import { useDashboardView } from './useDashboardView';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import PageHeader from '@/components/ui/PageHeader';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocale } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { NoStorePrompt } from '@/components/ui/NoStoreGuard';
import { withChunkRetry } from '@/components/ui/ChunkErrorBoundary';

// Lazy load heavy dashboard components to improve TBT and LCP
const ConcentricDashboardRing = dynamic(() => import('./ConcentricDashboardRing').then(mod => mod.ConcentricDashboardRing), {
  loading: () => <div className="h-[280px] w-[280px] rounded-2xl bg-muted/20 animate-pulse flex items-center justify-center text-sm text-muted-foreground uppercase font-bold font-display">...</div>,
  ssr: false
});

const ExecutiveKpiCards = dynamic(() => import('./ExecutiveKpiCards').then(mod => mod.ExecutiveKpiCards), {
  loading: () => <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[120px] animate-pulse bg-muted/5 rounded-2xl" aria-hidden="true" />,
  ssr: false
});

// ══════════════════════════════════════════════════════════════════════════
// REMEDIACIÓN V2 (fix/dashboard-consolidated-tabs): UN SOLO DASHBOARD.
//
// "Dashboard" (ViewType 'store-dashboard', menú Inicio → OPERACIÓN) abre la
// vista consolidada por tabs — Panel / Resumen / Productos / Comportamiento —
// de la TIENDA ACTIVA: StoreDashboardView, el MISMO componente que "Gestión de
// Tiendas" abre por tienda (botón "Dashboard" de cada tarjeta). El viejo
// "Panel de Control" deja de ser un destino standalone; sobrevive como (1)
// tab default "Panel" del dashboard consolidado (REMEDIACIÓN V3 — su gráfico
// circular concéntrico, fix/dashboard-tab-panel-control) y como (2) resumen
// compacto embebido del Inicio (AICommandCenterView, prop embedded).
//
//   Acceso 1: menú Inicio → OPERACIÓN → Dashboard  → tienda ACTIVA
//             (fuente de verdad certificada: user.activeStoreId =
//             profiles.active_store_id — cero hardcode, sin stores[0]).
//   Acceso 2: Gestión de Tiendas → botón "Dashboard" de una tarjeta → ESA
//             tienda (ManagementHubView/MultiStoreDashboardView ya lo hacen;
//             sin cambios — mismo componente, misma vista).
//
// El nombre de la tienda activa se resuelve con useStores — la MISMA fuente
// que el selector de tienda del header (TerminalShell). Sin tienda activa
// (o tienda revocada) → NoStorePrompt (estado honesto certificado).
// ══════════════════════════════════════════════════════════════════════════
const LazyStoreDashboardView = withChunkRetry(
  lazy(() => import('./StoreDashboardView')),
  'StoreDashboardView'
);

/** Skeleton honesto mientras se resuelve la tienda activa / carga el chunk. */
function StoreDashboardGateSkeleton() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto" aria-busy="true" aria-label="Cargando dashboard">
      <div className="h-24 rounded-2xl bg-muted/20 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/**
 * StoreDashboardGate — resuelve la tienda activa y monta la vista consolidada.
 * FASE 3 (fuente de verdad): storeId SIEMPRE = user.activeStoreId; el nombre
 * sale del listado useStores (misma query que el selector del header). Si el
 * listado aún carga → skeleton; si no hay tienda activa o ya no es accesible
 * (membresía revocada) → NoStorePrompt (navega a Gestión de Tiendas).
 * onClose del dashboard ("← Tiendas") → vuelve a Gestión de Tiendas,
 * coherente con el breadcrumb interno del componente.
 */
function StoreDashboardGate() {
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();

  // isEncargado: misma expresión certificada de TerminalShell (FIX HIGH-004).
  const isEncargado =
    user?.role === 'encargado' ||
    user?.role === 'manager' ||
    user?.memberships?.some((m) => m.role === 'encargado') ||
    false;

  const { data: stores = [], isLoading: isLoadingStores } = useStores(
    user?.id || '',
    user?.role === 'admin',
    isEncargado
  );

  const activeStore = useMemo(
    () => stores.find((s) => s.id === user?.activeStoreId),
    [stores, user?.activeStoreId]
  );

  if (!activeStore) {
    if (isLoadingStores) return <StoreDashboardGateSkeleton />;
    // Sin tienda activa, o activa pero no accesible/revocada → prompt honesto.
    return <NoStorePrompt />;
  }

  return (
    <LazyStoreDashboardView
      storeId={activeStore.id}
      storeName={activeStore.name}
      onClose={() => setCurrentView('management-hub')}
    />
  );
}

// CAMBIO 1 (HOME/SALES/PERFORMANCE DEFAULTS): prop `embedded` — cuando TRUE,
// el dashboard se renderiza como sección del Inicio (AICommandCenterView):
// el PageHeader pasa a h2 (una sola h1 por página — el shell ya pinta "Inicio")
// y el ancho máximo se amplía al contenedor padre.
//
// DASHBOARD V3 (feat/dashboard-v3-audit-ux) — FASE 4/6: prop `aside` opcional.
// AICommandCenterView pasa <RecentActivityPanel /> ("Acciones recientes") para
// que quede AL LADO del gráfico circular (Resumen de Indicadores) en desktop,
// y debajo de él en mobile — única representación canónica, la instancia al
// final del Inicio se retira. "Alertas Críticas" sale de este componente y
// pasa al final del Inicio (después de Darian) — ver AICommandCenterView.
//
// REMEDIACIÓN (fix/dashboard-active-store): "Dashboard" responde a la pregunta
// "¿cómo está MI tienda activa?" — para TODOS los roles. Se elimina la rama
// admin/manager → MultiStoreDashboardView (el tablero consolidado multi-tienda
// ya NO se presenta como "Dashboard": vive como tab "KPIs" del hub "Gestión de
// Tiendas", ViewType 'management-hub'). La fuente de verdad de la tienda activa
// es la certificada: useAuthStore().user.activeStoreId (profiles.active_store_id).
// Cero hardcode: sin stores[0], sin tienda fija, sin segunda fuente de verdad.
//
// REMEDIACIÓN V2 (fix/dashboard-consolidated-tabs): modo standalone (la entrada
// "Dashboard" del menú) → vista consolidada por tabs de la tienda activa
// (StoreDashboardGate). Modo embedded (sección del Inicio) → resumen compacto
// DashboardViewImpl (Panel de Control como widget, no como destino).
// REMEDIACIÓN V3 (fix/dashboard-tab-panel-control): la vista consolidada abre
// por defecto en el tab "Panel" (anillo concéntrico del antiguo Panel de
// Control) — el widget embebido del Inicio NO cambia.
export default function DashboardView({ embedded = false, aside = undefined }: { embedded?: boolean; aside?: React.ReactNode } = {}) {
  if (embedded) return <DashboardViewImpl embedded aside={aside} />;
  return <StoreDashboardGate />;
}

/**
 * DashboardViewImpl — implementación single-store del Dashboard (tienda activa).
 * REMEDIACIÓN (fix/dashboard-active-store): es la ÚNICA implementación — antes
 * era la rama no-admin (clerk, encargado, usuario, warehouse, costo); ahora
 * también la usan admin/manager. Todos los hooks se llaman incondicionalmente
 * (Rules of Hooks OK) y los datos responden a user.activeStoreId.
 */
function DashboardViewImpl({ embedded = false, aside = undefined }: { embedded?: boolean; aside?: React.ReactNode } = {}) {
  const t = useTranslations('dashboard.singleStore');
  const locale = useLocale();
  const dateFnsLocale = locale === 'en' ? enLocale : esLocale;

  const {
    summary,
    kpis,
    isLoading,
    dashboardError,
    refetchDashboard,
    timeRange,
    setTimeRange,
    selectedDate,
    setSelectedDate
  } = useDashboardView();
  const { setCurrentView } = useUIStore();

  return (
    <div className={embedded ? 'space-y-6 w-full' : 'space-y-6 max-w-5xl mx-auto'}>
      {/* F2: PageHeader — jerarquía estándar (título único, descripción, acciones).
          Sustituye el h2 ad-hoc text-3xl + subtítulo uppercase tracking-widest.
          CAMBIO 1: embebido en Inicio el título es h2 (GATE 16 — una sola h1). */}
      <PageHeader
        headingLevel={embedded ? 'h2' : 'h1'}
        title={t('title')}
        description={t('subtitle')}
        icon={LayoutDashboard}
        secondaryActions={
          <>
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(v) => { if (v) setTimeRange(v as 'day' | 'month' | 'year') }}
              className="bg-muted rounded-xl p-1 w-full sm:w-auto"
            >
              <ToggleGroupItem value="day" className="flex-1 sm:flex-none text-sm font-medium px-4 py-3 min-h-[44px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                {t('day')}
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="flex-1 sm:flex-none text-sm font-medium px-4 py-3 min-h-[44px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                {t('month')}
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="flex-1 sm:flex-none text-sm font-medium px-4 py-3 min-h-[44px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                {t('year')}
              </ToggleGroupItem>
            </ToggleGroup>

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={t('selectDate')} className="flex items-center gap-2 min-h-[44px] py-2.5 px-4 rounded-xl border border-border/50 bg-card text-xs font-medium text-muted-foreground min-w-[140px] justify-center hover:bg-muted/50 hover:text-foreground transition-colors w-full sm:w-auto">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {timeRange === 'day'
                    ? formatDate(selectedDate)
                    : (timeRange === 'month'
                        ? format(selectedDate, 'MMMM yyyy', { locale: dateFnsLocale })
                        : format(selectedDate, 'yyyy'))}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-border/50 bg-card shadow-sm rounded-2xl" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  locale={dateFnsLocale}
                  className="rounded-2xl"
                />
              </PopoverContent>
            </Popover>
          </>
        }
      />

      <StateRenderer
        isLoading={isLoading}
        error={dashboardError}
        onRetry={dashboardError ? refetchDashboard : undefined}
        data={summary && kpis ? [{ kpis, summary }] : []}
      >
        {(data) => {
          const { kpis, summary } = data[0];
          const sales = kpis?.gross_sales || 0;
          const costs = kpis?.cost_of_goods || 0;
          const profit = kpis?.profit || 0;

          const transactions = summary?.transaction_count || 0;
          const avgTicket = summary?.average_ticket || 0;
          const totalCash = summary?.total_cash || 0;
          const totalTransfer = summary?.total_transfer || 0;

          return (
            <div className="flex flex-col gap-8">
              {/* DASHBOARD V3 (FASE 4): Resumen de Indicadores (gráfico circular)
                  + Acciones recientes lado a lado en desktop (lg+). En mobile
                  se apilan: gráfico primero, Acciones recientes después — sin
                  columnas forzadas ni espacios muertos. El aside es UNA única
                  representación canónica de Acciones recientes. */}
              <section
                aria-label="Resumen de indicadores y acciones recientes"
                className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start"
              >
                <div className="flex flex-col items-center min-w-0">
                  <ConcentricDashboardRing
                    sales={sales}
                    costs={costs}
                    profit={profit}
                  />

                  {/* Mini Stats under the ring — all tokens, no hardcoded colors */}
                  <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full max-w-sm mt-4">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mb-2"></div>
                      <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('sales')}</span>
                      <span className="text-sm font-bold font-display text-foreground tabular-nums">{formatCurrency(sales)}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/50 mb-2"></div>
                      <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('costs')}</span>
                      <span className="text-sm font-bold font-display text-foreground tabular-nums">{formatCurrency(costs)}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      {/* FIX UX-001: was bg-[#00E0FF], now uses semantic success token */}
                      <div className="w-2 h-2 rounded-full bg-success mb-2"></div>
                      <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('profit')}</span>
                      <span className="text-sm font-bold font-display text-foreground tabular-nums">{formatCurrency(profit)}</span>
                    </div>
                  </div>
                </div>

                {/* DASHBOARD V3 (FASE 5): Acciones recientes junto al gráfico.
                    Lógica y contenido intactos (RecentActivityPanel). */}
                {aside && <div className="min-w-0">{aside}</div>}
              </section>

              {/* Sales Summary — uses previously hidden SalesSummary data */}
              <section className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">{t('salesSummary')}</h2>
                  <span className="text-sm font-mono text-primary animate-pulse uppercase font-semibold">{t('liveUpdates')}</span>
                </div>
                <ExecutiveKpiCards
                  sales={sales}
                  costs={costs}
                  profit={profit}
                />

                {/* PM-001: SalesSummary detail cards — previously computed but never shown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryPill
                    icon={<ShoppingCart className="w-3.5 h-3.5" />}
                    label={t('transactions')}
                    value={transactions.toString()}
                  />
                  <SummaryPill
                    icon={<TrendingUp className="w-3.5 h-3.5" />}
                    label={t('averageTicket')}
                    value={formatCurrency(avgTicket)}
                  />
                  <SummaryPill
                    icon={<Banknote className="w-3.5 h-3.5" />}
                    label={t('cash')}
                    value={formatCurrency(totalCash)}
                  />
                  <SummaryPill
                    icon={<ArrowUpRight className="w-3.5 h-3.5" />}
                    label={t('transfer')}
                    value={formatCurrency(totalTransfer)}
                  />
                </div>
              </section>

              {/* Action Buttons — removed dead "Reporte" button, kept "Ajustes" */}
              <div className="flex justify-end">
                <button type="button"
                  onClick={() => setCurrentView('settings')}
                  className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-border/50 bg-card shadow-sm hover:bg-muted/50 active:scale-[0.98] transition-all"
                >
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('settings')}</span>
                </button>
              </div>

              {/* DASHBOARD V3 (FASE 6): "Alertas Críticas" ya NO vive aquí —
                  se movió al FINAL del Inicio (después de Darian), como última
                  sección del Panel de Control. Ver AICommandCenterView. */}
            </div>
          );
        }}
      </StateRenderer>
    </div>
  );
}

/** Small summary pill for SalesSummary detail metrics */
function SummaryPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border/50">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <p className="text-sm font-bold font-display text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/**
 * DashboardAlertsSection — "Alertas Críticas" (stock bajo) del Inicio.
 *
 * DASHBOARD V3 (feat/dashboard-v3-audit-ux — FASE 6): era la última sección
 * INTERNA del widget del dashboard; ahora es la ÚLTIMA sección del Inicio
 * (después de Darian). Es autocontenida: resuelve sus propios datos
 * (useProducts de la tienda activa — misma query key, cache compartida con
 * react-query) y sus acciones de navegación. Lógica de filtrado intacta:
 * solo productos con stock_current <= min_stock; máx 4 tarjetas + botón
 * "Ver todas"; renderiza null mientras carga o si no hay alertas.
 */
export function DashboardAlertsSection() {
  const t = useTranslations('dashboard.singleStore');
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();
  const { data: productsData, isLoading: isLoadingProducts } = useProducts(user?.activeStoreId);

  const products: Product[] = productsData || [];
  const criticalProducts = products.filter(p => (p.stock_current ?? 0) <= (p.min_stock ?? 0));

  if (isLoadingProducts || criticalProducts.length === 0) return null;

  return (
    <section className="p-6 rounded-2xl border border-destructive/20 bg-card shadow-sm" aria-label={t('inventoryAlerts')}>
      <h3 className="text-sm font-bold text-destructive uppercase tracking-wider flex items-center gap-2 mb-4">
        {t('criticalAlerts')}
      </h3>
      <div className="space-y-3">
        {criticalProducts.slice(0, 4).map(product => (
          <div key={product.id} className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors">
            <div className="flex justify-between items-center">
              <div className="overflow-hidden">
                <div className="font-semibold text-sm text-foreground truncate">{product.name}</div>
                <div className="text-sm font-mono text-muted-foreground uppercase">{product.sku}</div>
              </div>
              <div className="text-destructive font-bold text-sm whitespace-nowrap ml-2 tabular-nums">{product.stock_current} {t('units')}</div>
            </div>
          </div>
        ))}
        {criticalProducts.length > 4 && (
          <button type="button"
            onClick={() => setCurrentView('inventory')}
            className="w-full py-3 min-h-[44px] text-sm font-semibold uppercase text-primary hover:underline mt-2"
          >
            {t('viewAllAlerts')} ({criticalProducts.length})
          </button>
        )}
      </div>
    </section>
  );
}
