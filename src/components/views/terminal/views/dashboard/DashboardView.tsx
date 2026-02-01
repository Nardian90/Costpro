'use client';

import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Target,
  Package,
  Check,
  Calendar,
  HelpCircle
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useCanAccess, useUIStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { StateRenderer } from '@/components/ui/StateRenderer';
import type { DashboardKPIs, Product, SalesSummary } from '@/types';
import { useDashboardView, type DashboardTimeRange } from './useDashboardView';
import { useAuthStore } from '@/store';
import { SecurityScrollContainer } from '@/components/ui/SecurityScrollContainer';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DashboardView() {
  const { user } = useAuthStore();
  const { summary, kpis, isLoading, timeRange, setTimeRange } = useDashboardView();
  const { setCurrentView } = useUIStore();

  const {
    data: productsData,
    isLoading: isLoadingProducts,
    error: productsError
  } = useProducts(user?.storeId);
  const products = productsData || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter uppercase">Panel de Control</h2>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1 opacity-70">Indicadores de rendimiento</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(v) => v && setTimeRange(v as any)}
              className="bg-card border border-border p-1 rounded-xl w-full sm:w-auto"
            >
              <ToggleGroupItem value="day" className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Hoy
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Mes
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Año
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="hidden lg:flex items-center gap-2 py-2 px-3 rounded-xl border border-border bg-card/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground min-w-[140px] justify-center">
              <Calendar className="w-3 h-3" />
              {timeRange === 'day' ? formatDate(new Date()) : (timeRange === 'month' ? format(new Date(), 'MMMM yyyy', { locale: es }) : format(new Date(), 'yyyy'))}
            </div>
        </div>
      </div>

      <StateRenderer
        isLoading={isLoading || isLoadingProducts}
        error={productsError}
        data={summary && kpis ? [{ kpis, summary }] : []}
      >
        {(data) => {
          const { kpis, summary } = data[0];
          return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DashboardKpisSection kpis={kpis} timeRange={timeRange} />
              <DashboardSummarySection summary={summary} timeRange={timeRange} />
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

function DashboardKpisSection({ kpis, timeRange }: { kpis: DashboardKPIs, timeRange: DashboardTimeRange }) {
  const canViewFinancials = useCanAccess('warehouse');
  const rangeLabel = timeRange === 'day' ? 'Diaria' : (timeRange === 'month' ? 'Mensual' : 'Anual');

  // Treat 0 as missing data if there are sales (prevents 100% margin on missing costs)
  const hasCostData = kpis.cost_of_goods !== null &&
                      kpis.cost_of_goods !== undefined &&
                      (kpis.cost_of_goods > 0 || kpis.gross_sales === 0);

  const hasProfitData = kpis.profit !== null &&
                        kpis.profit !== undefined &&
                        (kpis.cost_of_goods !== 0 || kpis.gross_sales === 0);

  return (
    <>
      <div className="md:col-span-1 p-6 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ventas Totales</span>
          <div className="p-2 bg-green-500/10 rounded-xl">
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
        </div>
        <div className="text-4xl font-black text-foreground whitespace-nowrap">{formatCurrency(kpis?.gross_sales || 0)}</div>
        {/* Indicador de variación desactivado por falta de datos históricos/temporales */}
        <div className="text-xs font-bold text-muted-foreground/80 mt-2 uppercase tracking-widest whitespace-nowrap">Variación: N/D</div>
      </div>

      {canViewFinancials && (
        <>
          <div className="md:col-span-1 p-6 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Costo de Ventas</span>
              <div className="p-2 bg-amber-500/10 rounded-xl">
                <Target className="w-5 h-5 text-amber-500" />
              </div>
            </div>
            <div className={cn("text-4xl font-black whitespace-nowrap", hasCostData ? "text-foreground" : "text-muted-foreground/40")}>
              {hasCostData ? formatCurrency(kpis.cost_of_goods!) : "Sin datos"}
            </div>
            <div className="text-xs font-bold text-muted-foreground mt-2 uppercase tracking-widest flex items-center gap-1 whitespace-nowrap">
              {hasCostData ? (
                <>Margen: {(((kpis?.profit || 0) / (Math.max(kpis?.gross_sales || 0, 1))) * 100).toFixed(1)}%</>
              ) : (
                <span className="flex items-center gap-1 text-amber-500/70" title="Existen ventas sin registro de costo unitario o costos en 0">
                  <HelpCircle className="w-3 h-3" />
                  Costos no disponibles
                </span>
              )}
            </div>
          </div>

          <div className={cn(
            "md:col-span-1 p-6 rounded-xl border shadow-sm transition-all",
            hasProfitData ? "border-primary/20 bg-primary/5 shadow-primary/5" : "border-border bg-card"
          )}>
            <div className="flex items-center justify-between mb-4">
              <span className={cn("text-xs font-black uppercase tracking-widest", hasProfitData ? "text-primary font-bold" : "text-muted-foreground")}>Utilidad Neta</span>
              <div className={cn("p-2 rounded-xl", hasProfitData ? "bg-primary/20" : "bg-muted/10")}>
                <TrendingUp className={cn("w-5 h-5", hasProfitData ? "text-primary" : "text-muted-foreground")} />
              </div>
            </div>
            <div className={cn("text-4xl font-black whitespace-nowrap", hasProfitData ? "text-primary" : "text-muted-foreground/40")}>
              {hasProfitData ? formatCurrency(kpis.profit!) : "N/D"}
            </div>
            <div className={cn("text-xs font-black mt-2 uppercase tracking-widest whitespace-nowrap", hasProfitData ? "text-primary" : "text-muted-foreground/80")}>
              {hasProfitData ? `Utilidad ${rangeLabel} (Real)` : "Datos insuficientes"}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DashboardSummarySection({ summary, timeRange }: { summary: SalesSummary, timeRange: DashboardTimeRange }) {
  const rangeLabel = timeRange === 'day' ? 'Hoy' : (timeRange === 'month' ? 'Mes' : 'Año');

  return (
    <div className="md:col-span-2 p-6 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Resumen de Ventas
        </h3>
      </div>
      <SecurityScrollContainer minWidth="300px">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: 'Transacciones', value: summary?.transaction_count || 0, sub: rangeLabel },
            { label: 'Ticket Promedio', value: formatCurrency(summary?.average_ticket || 0), sub: 'ARS' },
            { label: 'Efectivo', value: formatCurrency(summary?.total_cash || 0), sub: 'Recaudado', color: 'text-green-500' },
            { label: 'Transferencia', value: formatCurrency(summary?.total_transfer || 0), sub: 'Banco', color: 'text-primary' },
          ].map((stat, i) => (
            <div key={i} className="p-4 rounded-lg bg-background/50 border border-border/50 overflow-hidden">
              <span className="text-xs font-black uppercase text-muted-foreground tracking-tighter block mb-1 whitespace-nowrap">{stat.label}</span>
              <div className={cn("text-xl font-black tracking-tight whitespace-nowrap", stat.color || "text-foreground")}>{stat.value}</div>
              <span className="text-xs font-bold text-muted-foreground/80 uppercase whitespace-nowrap">{stat.sub}</span>
            </div>
          ))}
        </div>
      </SecurityScrollContainer>
    </div>
  );
}

function DashboardAlertsSection({ products, onViewInventory, onGoToCatalog }: { products: Product[], onViewInventory: () => void, onGoToCatalog: () => void }) {
  const criticalProducts = products.filter(p => (p.stock_current ?? 0) <= (p.min_stock ?? 0));
  const unpricedProducts = products.filter(p => p.price === null || p.price <= 0);

  return (
    <div className="md:col-span-1 space-y-6">
      {/* Alerta de Productos sin Precio */}
      {unpricedProducts.length >= 5 && (
        <div className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-sm">
          <h3 className="text-lg font-black text-amber-600 uppercase tracking-widest flex items-center gap-2 mb-4">
            <Target className="w-5 h-5" />
            ⚠ Productos sin precio
          </h3>
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
               <span className="text-4xl font-black text-amber-600">{unpricedProducts.length}</span>
               <span className="text-xs font-bold text-amber-600/70 uppercase tracking-widest">Productos detectados</span>
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase leading-relaxed">
              Existen productos sin precio asignado. Esto representa un riesgo operativo y de facturación.
            </p>
            <button
              onClick={onGoToCatalog}
              className="w-full py-3 bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
            >
              Ir a catálogo / corregir precios
            </button>
          </div>
        </div>
      )}

      {/* Alertas de Stock Críticas */}
      <div className="p-6 rounded-xl border border-destructive/10 bg-card shadow-sm">
        <h3 className="text-lg font-black text-destructive uppercase tracking-widest flex items-center gap-2 mb-6">
          <Package className="w-5 h-5" />
          Alertas Críticas
        </h3>
        <div className="space-y-3">
          {criticalProducts.length > 0 ? (
            <>
              {criticalProducts.slice(0, 4).map(product => (
                <div key={product.id} className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 group hover:bg-destructive/10 transition-colors">
                  <div className="flex justify-between items-center">
                    <div className="overflow-hidden">
                      <div className="font-bold text-xs text-foreground truncate">{product.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{product.sku}</div>
                    </div>
                    <div className="text-destructive font-black text-sm whitespace-nowrap ml-2">{product.stock_current} uds</div>
                  </div>
                </div>
              ))}
              {criticalProducts.length > 4 && (
                <button
                  onClick={onViewInventory}
                  className="w-full py-2 text-xs font-black uppercase text-primary hover:underline"
                >
                  Ver todas las alertas ({criticalProducts.length})
                </button>
              )}
            </>
          ) : (
            <div className="text-center py-10">
              <Check className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-20" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Todo en orden</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
