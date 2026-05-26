'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar as CalendarIcon,
  FileDown,
  Settings2,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useUIStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { StateRenderer } from '@/components/ui/StateRenderer';
import type { Product } from '@/types';
import { useDashboardView } from './useDashboardView';
import { useAuthStore } from '@/store';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import MultiStoreDashboardView from './MultiStoreDashboardView';

// Lazy load heavy dashboard components to improve TBT and LCP
const ConcentricDashboardRing = dynamic(() => import('./ConcentricDashboardRing').then(mod => mod.ConcentricDashboardRing), {
  loading: () => <div className="h-[280px] w-[280px] rounded-2xl bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground uppercase font-bold font-display">Cargando Visualización...</div>,
  ssr: false
});

const ExecutiveKpiCards = dynamic(() => import('./ExecutiveKpiCards').then(mod => mod.ExecutiveKpiCards), {
  loading: () => <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[120px] animate-pulse bg-muted/5 rounded-2xl" />,
  ssr: false
});

export default function DashboardView() {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  // All hooks must be called unconditionally (rules-of-hooks)
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

  if (isAdminOrManager) {
    return <MultiStoreDashboardView />;
  }

  const products = productsData || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header with Title and Time Range */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-display text-foreground tracking-tight">Panel de Control</h2>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-1">Executive KPI Overview</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(v) => v && setTimeRange(v as any)}
              className="bg-muted rounded-xl p-1 w-full sm:w-auto"
            >
              <ToggleGroupItem value="day" className="flex-1 sm:flex-none text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                Día
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="flex-1 sm:flex-none text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                Mes
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="flex-1 sm:flex-none text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                Año
              </ToggleGroupItem>
            </ToggleGroup>

            <Popover>
              <PopoverTrigger asChild>
                <button aria-label="Seleccionar fecha" /* FIX-ACC-015 */ className="flex items-center gap-2 py-2 px-4 rounded-xl border border-border/50 bg-card text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px] justify-center hover:bg-muted/50 hover:text-foreground transition-colors w-full sm:w-auto">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {timeRange === 'day'
                    ? formatDate(selectedDate)
                    : (timeRange === 'month'
                        ? format(selectedDate, 'MMMM yyyy', { locale: es })
                        : format(selectedDate, 'yyyy'))}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-border/50 bg-card shadow-sm rounded-2xl" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  locale={es}
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
          const { kpis } = data[0];
          const sales = kpis?.gross_sales || 0;
          const costs = kpis?.cost_of_goods || 0;
          const profit = kpis?.profit || 0;

          return (
            <div className="flex flex-col gap-8">
              {/* Concentric Ring Section */}
              <div className="flex flex-col items-center">
                <ConcentricDashboardRing
                  sales={sales}
                  costs={costs}
                  profit={profit}
                />

                {/* Mini Stats under the ring */}
                <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full max-w-sm mt-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mb-2"></div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ventas</span>
                    <span className="text-sm font-bold font-display text-foreground">{formatCurrency(sales)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 mb-2"></div>
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Costos</span>
                    <span className="text-sm font-bold font-display text-foreground">{formatCurrency(costs)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-[#00E0FF] mb-2"></div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Utilidad</span>
                    <span className="text-sm font-bold font-display text-foreground">{formatCurrency(profit)}</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards with Sparklines */}
              <section className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Resumen de Ventas</h2>
                  <span className="text-xs font-mono text-primary animate-pulse uppercase font-semibold">Live Updates</span>
                </div>
                <ExecutiveKpiCards
                  sales={sales}
                  costs={costs}
                  profit={profit}
                />
              </section>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button disabled aria-disabled="true" title="Próximamente disponible" /* FIX-ACC-019 */ className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-border/50 bg-card shadow-sm opacity-50 cursor-not-allowed active:scale-[0.98] transition-all enhanced-card">
                      <FileDown className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reporte</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Próximamente disponible</TooltipContent>
                </Tooltip>
                <button
                  onClick={() => setCurrentView('settings')}
                  className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-border/50 bg-card shadow-sm hover:bg-muted/50 active:scale-[0.98] transition-all enhanced-card"
                >
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ajustes</span>
                </button>
              </div>

              {/* Alerts Section (from original dashboard) */}
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

function DashboardAlertsSection({ products, onViewInventory, onGoToCatalog }: { products: Product[], onViewInventory: () => void, onGoToCatalog: () => void }) {
  const criticalProducts = products.filter(p => (p.stock_current ?? 0) <= (p.min_stock ?? 0));

  if (criticalProducts.length === 0) return null;

  return (
    <div className="p-6 rounded-2xl border border-destructive/20 bg-card shadow-sm">
      <h3 className="text-sm font-bold text-destructive uppercase tracking-wider flex items-center gap-2 mb-4">
        Alertas Críticas
      </h3>
      <div className="space-y-3">
        {criticalProducts.slice(0, 4).map(product => (
          <div key={product.id} className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors">
            <div className="flex justify-between items-center">
              <div className="overflow-hidden">
                <div className="font-semibold text-xs text-foreground truncate">{product.name}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase">{product.sku}</div>
              </div>
              <div className="text-destructive font-bold text-sm whitespace-nowrap ml-2">{product.stock_current} uds</div>
            </div>
          </div>
        ))}
        {criticalProducts.length > 4 && (
          <button
            onClick={onViewInventory}
            className="w-full py-2 text-xs font-semibold uppercase text-primary hover:underline mt-2"
          >
            Ver todas las alertas ({criticalProducts.length})
          </button>
        )}
      </div>
    </div>
  );
}
