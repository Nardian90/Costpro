'use client';

import React from 'react';
import { Building2, TrendingUp, ShoppingCart, AlertTriangle, RefreshCcw, ExternalLink } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useMultiStoreDashboard, StoreKPI } from '@/hooks/api/useMultiStoreDashboard';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';

// Props de cada métrica mini dentro de la tarjeta
interface MetricMiniProps {
  label: string;
  value: string | number;
  alert?: boolean;
  isNA?: boolean;
}

function MetricMini({ label, value, alert = false, isNA = false }: MetricMiniProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-black',
        isNA ? 'text-muted-foreground' : alert ? 'text-destructive' : 'text-foreground'
      )}>
        {isNA ? 'N/A' : value}
      </p>
    </div>
  );
}

// Tarjeta KPI por tienda
interface StoreKPICardProps {
  kpi: StoreKPI;
  onActivate: (storeId: string) => void;
}

function StoreKPICard({ kpi, onActivate }: StoreKPICardProps) {
  return (
    <div className={cn(
      'p-5 rounded-2xl border transition-all',
      kpi.isActive
        ? 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/10'
        : 'border-border bg-card hover:border-border/80'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            kpi.isActive ? 'bg-primary/10' : 'bg-muted'
          )}>
            <Building2 className={cn('w-4 h-4', kpi.isActive ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div>
            <h3 className="font-black text-xs uppercase tracking-tight leading-tight line-clamp-1">
              {kpi.storeName}
            </h3>
            {kpi.storeAddress && (
              <p className="text-[10px] text-muted-foreground line-clamp-1">{kpi.storeAddress}</p>
            )}
          </div>
        </div>
        {kpi.isActive && (
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
            Activa
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricMini
          label="Ventas hoy"
          value={formatCurrency(kpi.todaySales)}
        />
        <MetricMini
          label="Transacciones"
          value={kpi.todayTransactions}
        />
        <MetricMini
          label="Stock bajo"
          value={kpi.lowStockCount}
          alert={kpi.lowStockCount > 0}
          isNA={false}
        />
        <MetricMini
          label="En vitrina"
          value={kpi.visibleProducts}
          isNA={kpi.visibleProducts === 0 && !kpi.storeSlug}
        />
      </div>

      {/* Acción */}
      <div className="flex items-center gap-2">
        {kpi.storeSlug && (() => {
          const cleanSlug = kpi.storeSlug.toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
          return (
          <a
            href={`/tienda/${cleanSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all"
            aria-label={`Visitar tienda pública de ${kpi.storeName}`}
            title="Visitar tienda pública"
          >
            <ExternalLink className="w-3 h-3" />
            Visitar
          </a>
          );
        })()}
        {!kpi.isActive && (
          <button
            onClick={() => onActivate(kpi.storeId)}
            aria-label={`Activar ${kpi.storeName} como tienda de trabajo`}
            className={cn(
              'flex-1 py-2 rounded-xl border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-colors',
              kpi.storeSlug && 'flex-initial'
            )}
          >
            Activar
          </button>
        )}
      </div>
    </div>
  );
}

// Vista principal
export default function MultiStoreDashboardView() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';

  const { data: stores = [], isLoading: loadingStores } = useStores(
    user?.id || '',
    isAdmin,
    isEncargado
  );

  const { data: kpis = [], isLoading: loadingKPIs, refetch } = useMultiStoreDashboard(
    stores,
    user?.activeStoreId
  );

  const { switchStore } = useStoreSwitcher();

  const isLoading = loadingStores || loadingKPIs;
  const totalSalesToday = kpis.reduce((s, k) => s + k.todaySales, 0);
  const totalTransactions = kpis.reduce((s, k) => s + k.todayTransactions, 0);
  const totalAlerts = kpis.reduce((s, k) => s + k.lowStockCount + k.pendingTransfersOut, 0);

  const handleActivateStore = async (storeId: string) => {
    await switchStore(storeId);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-sm uppercase tracking-tight">Tablero Consolidado</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stores.length} tienda{stores.length !== 1 ? 's' : ''} · Datos actualizados cada 60s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          aria-label="Actualizar datos del tablero"
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
        >
          <RefreshCcw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ventas totales hoy', value: formatCurrency(totalSalesToday), icon: TrendingUp },
          { label: 'Transacciones', value: totalTransactions, icon: ShoppingCart },
          { label: 'Alertas activas', value: totalAlerts, icon: AlertTriangle, alert: totalAlerts > 0 },
        ].map(({ label, value, icon: Icon, alert }) => (
          <div key={label} className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-3.5 h-3.5', alert ? 'text-destructive' : 'text-muted-foreground')} />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
            </div>
            <p className={cn('font-black text-lg', alert ? 'text-destructive' : 'text-foreground')}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Grid de tiendas */}
      <StateRenderer
        isLoading={isLoading}
        error={null}
        data={kpis}
        loadingComponent={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
          </div>
        }
      >
        {(data) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map(kpi => (
              <StoreKPICard
                key={kpi.storeId}
                kpi={kpi}
                onActivate={handleActivateStore}
              />
            ))}
          </div>
        )}
      </StateRenderer>
    </div>
  );
}
