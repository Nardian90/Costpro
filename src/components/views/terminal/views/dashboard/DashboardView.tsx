'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar as CalendarIcon,
  Settings2,
  TrendingUp,
  ShoppingCart,
  Banknote,
  ArrowUpRight,
} from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { StateRenderer } from '@/components/ui/StateRenderer';
import type { Product } from '@/types';
import { useDashboardView } from './useDashboardView';
import { useAuthStore } from '@/store';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTranslations, useLocale } from 'next-intl';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocale } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import MultiStoreDashboardView from './MultiStoreDashboardView';

// Lazy load heavy dashboard components to improve TBT and LCP
const ConcentricDashboardRing = dynamic(() => import('./ConcentricDashboardRing').then(mod => mod.ConcentricDashboardRing), {
  loading: () => <div className="h-[280px] w-[280px] rounded-2xl bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground uppercase font-bold font-display">...</div>,
  ssr: false
});

const ExecutiveKpiCards = dynamic(() => import('./ExecutiveKpiCards').then(mod => mod.ExecutiveKpiCards), {
  loading: () => <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[120px] animate-pulse bg-muted/5 rounded-2xl" aria-hidden="true" />,
  ssr: false
});

export default function DashboardView() {
  // Audit-Fix #3: la decisión admin/no-admin se hace en un wrapper component
  // separado (DashboardRouter) para evitar llamar hooks innecesarios cuando
  // el usuario es admin. Originalmente, este componente llamaba useDashboardView
  // y useProducts SIEMPRE (incluso para admins que caían al early return hacia
  // MultiStoreDashboardView — wasted queries a Supabase).
  //
  // Solución: DashboardView es el router que decide cuál componente renderizar.
  // DashboardViewImpl contiene la implementación original (clerk/encargado).
  // MultiStoreDashboardView se renderiza para admins sin llamar hooks de clerk.
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  if (isAdminOrManager) {
    return <MultiStoreDashboardView />;
  }
  return <DashboardViewImpl />;
}

/**
 * DashboardViewImpl — implementación para usuarios no-admin (clerk, encargado,
 * usuario, warehouse, costo). Todos los hooks se llaman incondicionalmente aquí
 * (Rules of Hooks OK), y solo se monta cuando el usuario NO es admin/manager.
 */
function DashboardViewImpl() {
  const t = useTranslations('dashboard.singleStore');
  const locale = useLocale();
  const dateFnsLocale = locale === 'en' ? enLocale : esLocale;
  const { user } = useAuthStore();

  const {
    summary,
    kpis,
    isLoading,
    timeRange,
    setTimeRange,
    selectedDate,
    setSelectedDate
  } = useDashboardView();
  const { setCurrentView } = useUIStore();
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    error: productsError
  } = useProducts(user?.activeStoreId);

  const products = productsData || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header with Title and Time Range */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-display text-foreground tracking-tight">{t('title')}</h2>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(v) => { if (v) setTimeRange(v as 'day' | 'month' | 'year') }}
              className="bg-muted rounded-xl p-1 w-full sm:w-auto"
            >
              <ToggleGroupItem value="day" className="flex-1 sm:flex-none text-xs font-semibold uppercase tracking-wider px-4 py-3 min-h-[44px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                {t('day')}
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="flex-1 sm:flex-none text-xs font-semibold uppercase tracking-wider px-4 py-3 min-h-[44px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                {t('month')}
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="flex-1 sm:flex-none text-xs font-semibold uppercase tracking-wider px-4 py-3 min-h-[44px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                {t('year')}
              </ToggleGroupItem>
            </ToggleGroup>

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={t('selectDate')} className="flex items-center gap-2 min-h-[44px] py-2.5 px-4 rounded-xl border border-border/50 bg-card text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px] justify-center hover:bg-muted/50 hover:text-foreground transition-colors w-full sm:w-auto">
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
        </div>
      </div>

      <StateRenderer
        isLoading={isLoading || isLoadingProducts}
        error={productsError}
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
              {/* Concentric Ring Section */}
              <div className="flex flex-col items-center">
                <ConcentricDashboardRing
                  sales={sales}
                  costs={costs}
                  profit={profit}
                />

                {/* Mini Stats under the ring — all tokens, no hardcoded colors */}
                <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full max-w-sm mt-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mb-2"></div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('sales')}</span>
                    <span className="text-sm font-bold font-display text-foreground tabular-nums">{formatCurrency(sales)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 mb-2"></div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('costs')}</span>
                    <span className="text-sm font-bold font-display text-foreground tabular-nums">{formatCurrency(costs)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    {/* FIX UX-001: was bg-[#00E0FF], now uses semantic success token */}
                    <div className="w-2 h-2 rounded-full bg-success mb-2"></div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('profit')}</span>
                    <span className="text-sm font-bold font-display text-foreground tabular-nums">{formatCurrency(profit)}</span>
                  </div>
                </div>
              </div>

              {/* Sales Summary — uses previously hidden SalesSummary data */}
              <section className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">{t('salesSummary')}</h2>
                  <span className="text-xs font-mono text-primary animate-pulse uppercase font-semibold">{t('liveUpdates')}</span>
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
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('settings')}</span>
                </button>
              </div>

              {/* Alerts Section */}
              <DashboardAlertsSection
                products={products}
                onViewInventory={() => setCurrentView('inventory')}
                onGoToCatalog={() => setCurrentView('catalog')}
              />
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
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <p className="text-sm font-bold font-display text-foreground tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function DashboardAlertsSection({ products, onViewInventory, onGoToCatalog }: { products: Product[], onViewInventory: () => void, onGoToCatalog: () => void }) {
  const t = useTranslations('dashboard.singleStore');
  const criticalProducts = products.filter(p => (p.stock_current ?? 0) <= (p.min_stock ?? 0));

  if (criticalProducts.length === 0) return null;

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
                <div className="font-semibold text-xs text-foreground truncate">{product.name}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase">{product.sku}</div>
              </div>
              <div className="text-destructive font-bold text-sm whitespace-nowrap ml-2 tabular-nums">{product.stock_current} {t('units')}</div>
            </div>
          </div>
        ))}
        {criticalProducts.length > 4 && (
          <button type="button"
            onClick={onViewInventory}
            className="w-full py-3 min-h-[44px] text-xs font-semibold uppercase text-primary hover:underline mt-2"
          >
            {t('viewAllAlerts')} ({criticalProducts.length})
          </button>
        )}
      </div>
    </section>
  );
}
