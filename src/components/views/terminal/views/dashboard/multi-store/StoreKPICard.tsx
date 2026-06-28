'use client';

/**
 * StoreKPICard — Tarjeta de KPIs por tienda para el dashboard consolidado.
 * Extraída de MultiStoreDashboardView.
 *
 * Memoizada para evitar re-renders innecesarios cuando otras cards cambian.
 */

import React, { memo } from 'react';
import { Building2, ExternalLink, Settings, BarChart3, Crown } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { StoreKPI } from '@/hooks/api/useMultiStoreDashboard';
import { Store } from '@/types';
import { MetricMini } from './MetricMini';

export interface StoreKPICardProps {
  kpi: StoreKPI;
  onActivate: (storeId: string) => void;
  onConfig?: (storeId: string) => void;
  onOpenDashboard?: (storeId: string, storeName: string) => void;
  store?: Store;
}

export const StoreKPICard = memo(function StoreKPICard({ kpi, onActivate, onConfig, onOpenDashboard, store }: StoreKPICardProps) {
  const t = useTranslations('stores.dashboard');

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
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden',
            kpi.isActive ? 'bg-primary/10' : 'bg-muted'
          )}>
            {store?.logo_url ? (
              <img src={store.logo_url} alt={kpi.storeName} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <Building2 className={cn('w-4 h-4', kpi.isActive ? 'text-primary' : 'text-muted-foreground')} />
            )}
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-tight leading-tight line-clamp-1">
              {kpi.storeName}
            </h3>
            {kpi.storeAddress && (
              <p className="text-sm text-muted-foreground line-clamp-1">{kpi.storeAddress}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onOpenDashboard && (
            <button
              type="button"
              onClick={() => onOpenDashboard(kpi.storeId, kpi.storeName)}
              aria-label={`Dashboard avanzado de ${kpi.storeName}`}
              title="Dashboard 10/10"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary/10 transition-colors group"
            >
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          )}
          {onConfig && (
            <button
              type="button"
              onClick={() => onConfig(kpi.storeId)}
              aria-label={t('configureStore', { name: kpi.storeName })}
              title={t('storeConfig')}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary/10 transition-colors group"
            >
              <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          )}
          {kpi.isActive && (
            <span className="text-sm font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary">
              {t('active')}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricMini
          label={t('salesToday')}
          value={formatCurrency(kpi.todaySales)}
        />
        <MetricMini
          label={t('transactions')}
          value={kpi.todayTransactions}
        />
        <MetricMini
          label={t('lowStock')}
          value={kpi.lowStockCount}
          alert={kpi.lowStockCount > 0}
          isNA={false}
        />
        <MetricMini
          label={t('inStorefront')}
          value={kpi.visibleProducts}
          isNA={kpi.visibleProducts === 0 && !kpi.storeSlug}
        />
      </div>

      {/* Acción */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {kpi.storeSlug && (() => {
            const cleanSlug = kpi.storeSlug.toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            return (
            <a
              href={`/tienda/${cleanSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all"
              aria-label={t('visitPublicStore', { name: kpi.storeName })}
              title={t('visit')}
            >
              <ExternalLink className="w-3 h-3" />
              {t('visit')}
            </a>
            );
          })()}
          {!kpi.isActive && (
            <button type="button"
              onClick={() => onActivate(kpi.storeId)}
              aria-label={t('activateAsWorkStore', { name: kpi.storeName })}
              className={cn(
                'flex-1 py-3 min-h-[44px] rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors',
                kpi.storeSlug && 'flex-initial'
              )}
            >
              {t('activate')}
            </button>
          )}
        </div>
        {/* Botón premium "Dashboard" — acceso rápido al dashboard KPI avanzado de la tienda. */}
        {onOpenDashboard && (
          <button
            type="button"
            onClick={() => onOpenDashboard(kpi.storeId, kpi.storeName)}
            className="w-full py-2.5 min-h-[44px] rounded-xl font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 border-2 border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 text-primary hover:from-primary/20 hover:to-primary/10 hover:border-primary/50 hover:shadow-md hover:shadow-primary/10"
            aria-label={`Dashboard KPI avanzado de ${kpi.storeName}`}
            title="Dashboard KPI con analítica, insights y trazabilidad"
          >
            <Crown className="w-3.5 h-3.5" />
            <BarChart3 className="w-3.5 h-3.5" />
            Dashboard
          </button>
        )}
      </div>
    </div>
  );
});
