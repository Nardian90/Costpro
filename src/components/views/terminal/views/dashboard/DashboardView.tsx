'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  Calendar as CalendarIcon,
  FileDown,
  Settings2,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
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

// Lazy load heavy dashboard components to improve TBT and LCP
const ConcentricDashboardRing = dynamic(() => import('./ConcentricDashboardRing').then(mod => mod.ConcentricDashboardRing), {
  loading: () => <div className="h-[280px] w-[280px] rounded-full bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground uppercase font-black">Cargando Visualización...</div>,
  ssr: false
});

const ExecutiveKpiCards = dynamic(() => import('./ExecutiveKpiCards').then(mod => mod.ExecutiveKpiCards), {
  loading: () => <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[120px] animate-pulse bg-muted/5 rounded-3xl" />,
  ssr: false
});

export default function DashboardView() {
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
  } = useProducts(user?.storeId);

  const products = productsData || [];

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header with Title and Time Range */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-2">
        <div>
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Panel de Control</h2>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mt-1 opacity-70">Executive KPI Overview</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(v) => v && setTimeRange(v as any)}
              className="bg-card/50 border border-border p-1 rounded-2xl w-full sm:w-auto"
            >
              <ToggleGroupItem value="day" className="flex-1 sm:flex-none text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                Día
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="flex-1 sm:flex-none text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                Mes
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="flex-1 sm:flex-none text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all">
                Año
              </ToggleGroupItem>
            </ToggleGroup>

            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 py-2 px-4 rounded-xl border border-border bg-card/50 text-xs font-black uppercase tracking-widest text-muted-foreground min-w-[140px] justify-center hover:bg-card hover:text-foreground transition-colors w-full sm:w-auto">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {timeRange === 'day'
                    ? formatDate(selectedDate)
                    : (timeRange === 'month'
                        ? format(selectedDate, 'MMMM yyyy', { locale: es })
                        : format(selectedDate, 'yyyy'))}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-border bg-card shadow-2xl rounded-2xl" align="end">
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
            <div className="flex flex-col gap-10">
              {/* Concentric Ring Section */}
              <div className="flex flex-col items-center">
                <ConcentricDashboardRing
                  sales={sales}
                  costs={costs}
                  profit={profit}
                />

                {/* Mini Stats under the ring */}
                <div className="grid grid-cols-3 gap-8 w-full max-w-sm mt-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mb-2 shadow-[0_0_8px_rgba(var(--primary),0.6)]"></div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Ventas</span>
                    <span className="text-sm font-black text-foreground">{formatCurrency(sales)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-background mb-2 shadow-[0_0_8px_rgba(100,116,139,0.6)]"></div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Costos</span>
                    <span className="text-sm font-black text-foreground">{formatCurrency(costs)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-[#00E0FF] mb-2 shadow-[0_0_8px_rgba(0,224,255,0.6)]"></div>
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Utilidad</span>
                    <span className="text-sm font-black text-foreground">{formatCurrency(profit)}</span>
                  </div>
                </div>
              </div>

              {/* Summary Cards with Sparklines */}
              <section className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground dark:text-foreground/80">Resumen de Ventas</h2>
                  <span className="text-xs font-mono text-primary animate-pulse uppercase font-black">Live Updates</span>
                </div>
                <ExecutiveKpiCards
                  sales={sales}
                  costs={costs}
                  profit={profit}
                />
              </section>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button className="bg-card/50 border border-border py-5 rounded-[24px] flex flex-col items-center justify-center group active:scale-95 transition-all hover:bg-card">
                  <FileDown className="w-6 h-6 text-slate-500 group-hover:text-primary transition-colors" />
                  <span className="text-xs font-black mt-2 text-muted-foreground uppercase tracking-widest">Reporte</span>
                </button>
                <button
                  onClick={() => setCurrentView('settings')}
                  className="bg-card/50 border border-border py-5 rounded-[24px] flex flex-col items-center justify-center group active:scale-95 transition-all hover:bg-card"
                >
                  <Settings2 className="w-6 h-6 text-slate-500 group-hover:text-[#00E0FF] transition-colors" />
                  <span className="text-xs font-black mt-2 text-muted-foreground uppercase tracking-widest">Ajustes</span>
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
    <div className="p-6 rounded-[32px] border border-destructive/10 bg-card/30 shadow-sm mt-4">
      <h3 className="text-sm font-black text-destructive uppercase tracking-widest flex items-center gap-2 mb-6">
        Alertas Críticas
      </h3>
      <div className="space-y-3">
        {criticalProducts.slice(0, 4).map(product => (
          <div key={product.id} className="p-4 rounded-[20px] bg-destructive/5 border border-destructive/10 group hover:bg-destructive/10 transition-colors">
            <div className="flex justify-between items-center">
              <div className="overflow-hidden">
                <div className="font-bold text-xs text-foreground truncate">{product.name}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase">{product.sku}</div>
              </div>
              <div className="text-destructive font-black text-sm whitespace-nowrap ml-2">{product.stock_current} uds</div>
            </div>
          </div>
        ))}
        {criticalProducts.length > 4 && (
          <button
            onClick={onViewInventory}
            className="w-full py-2 text-xs font-black uppercase text-primary hover:underline mt-2"
          >
            Ver todas las alertas ({criticalProducts.length})
          </button>
        )}
      </div>
    </div>
  );
}
