'use client';

import React, { useState, useCallback, memo } from 'react';
import { Building2, TrendingUp, ShoppingCart, AlertTriangle, RefreshCcw, ExternalLink, Settings, BarChart3, CalendarClock } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useMultiStoreDashboard, StoreKPI } from '@/hooks/api/useMultiStoreDashboard';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { StoreModals } from '@/components/views/terminal/views/stores/StoreModals';
import { StoreFormMode } from '@/components/views/terminal/views/stores/useStoresView';
import { useStoreEdit } from '@/hooks/views/useStoreEdit'; // F3-T02: hook compartido
import { storeApiClient, authHeaders } from '@/services/store-api-client';
import { Store } from '@/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
// Dashboard 10/10 — vista avanzada de analytics por tienda.
// G3-PERF + G3-HARDEN: lazy-loaded because it's 2.2k LOC with ECharts; only
// needed when the user opens the per-store dashboard overlay. withChunkRetry
// wraps it in ChunkErrorBoundary for production resilience.
import { withChunkRetry } from '@/components/ui/ChunkErrorBoundary';
const StoreDashboardView = withChunkRetry(
  React.lazy(() => import('./StoreDashboardView')),
  'StoreDashboardView'
);
// Política de secuencia global: badge "Fecha de Operación Actual"
import { useGlobalOperationDate } from '@/hooks/api/useGlobalOperationDate';
// Mobile-first: hook para responsive rendering
import { useIsMobile } from '@/hooks/ui/useMobile';
// Pull-to-refresh: gesto nativo mobile para refrescar datos
import { usePullToRefresh } from '@/hooks/ui/usePullToRefresh';

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
      <p className="text-sm font-black uppercase text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-black tabular-nums',
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
  onConfig?: (storeId: string) => void;
  onOpenDashboard?: (storeId: string, storeName: string) => void;
  store?: Store;
}

// Tarjeta KPI por tienda — memoizada para evitar re-renders innecesarios
// cuando otras cards cambian (ej: al activar una tienda, solo esa card debe re-renderizar)
const StoreKPICard = memo(function StoreKPICard({ kpi, onActivate, onConfig, onOpenDashboard, store }: StoreKPICardProps) {
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
    </div>
  );
});

// Vista principal
export default function MultiStoreDashboardView() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';
  const queryClient = useQueryClient();
  const t = useTranslations('stores.dashboard');
  const isMobile = useIsMobile();
  // Pull-to-refresh: gesto nativo mobile para refrescar KPIs
  const { pullDistance, isRefreshing, bind: pullToRefreshBind } = usePullToRefresh(async () => {
    await refetch();
    await queryClient.invalidateQueries({ queryKey: ['global-max-operation-date'] });
  });
  // F3-T02: hook compartido para edición de stores + plantilla FC.
  // Elimina la duplicación con useStoresView.ts.
  const storeEdit = useStoreEdit();

  const { data: stores = [], isLoading: loadingStores } = useStores(
    user?.id || '',
    isAdmin,
    isEncargado
  );

  const { data: kpis = [], isLoading: loadingKPIs, error: kpiError, refetch } = useMultiStoreDashboard(
    stores,
    user?.activeStoreId
  );

  const { switchStore } = useStoreSwitcher();

  // Store config modal state (inline, no navigation needed)
  const [storeFormMode, setStoreFormMode] = useState<StoreFormMode>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dashboard 10/10 — estado del panel avanzado por tienda
  const [dashboardStore, setDashboardStore] = useState<{ id: string; name: string } | null>(null);

  const handleOpenDashboard = useCallback((storeId: string, storeName: string) => {
    setDashboardStore({ id: storeId, name: storeName });
  }, []);

  const handleCloseDashboard = useCallback(() => {
    setDashboardStore(null);
  }, []);

  const isLoading = loadingStores || loadingKPIs;
  const totalSalesToday = kpis.reduce((s, k) => s + k.todaySales, 0);
  const totalTransactions = kpis.reduce((s, k) => s + k.todayTransactions, 0);
  const totalAlerts = kpis.reduce((s, k) => s + k.lowStockCount + k.pendingTransfersOut, 0);

  const handleActivateStore = async (storeId: string) => {
    await switchStore(storeId);
  };

  // Open store config modal directly from Dashboard KPI
  const handleConfigStore = useCallback((storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    if (store) {
      setSelectedStore(store);
      setStoreFormMode('edit');
    }
  }, [stores]);

  // F3-T02: handleStoreFormSubmit ahora delega al hook compartido useStoreEdit.
  // Antes este bloque reimplementaba la lógica de guardado de FC que ya existía
  // en useStoresView.ts, con el comentario "previously, editing a store from the
  // Dashboard KPI would NOT save the FC template". Esa divergencia ya no existe
  // porque ambas vistas consumen el mismo hook.
  // Audit-Fix #2c: explicit Promise<void> return type for consistency with
  // useStoresView.handleStoreFormSubmit. Original signature inferred void correctly.
  const handleStoreFormSubmit = async (mode: StoreFormMode, data: Partial<Store>): Promise<void> => {
    if (!mode || !selectedStore) return;
    setIsSubmitting(true);
    try {
      if (mode === 'edit') {
        const fcWasActive = selectedStore.cost_template?.is_active === true;
        await storeEdit.editStoreWithFC(selectedStore.id, data, fcWasActive);
        toast.success(t('storeUpdated'));
      }
      setStoreFormMode(null);
      setSelectedStore(null);
      storeEdit.invalidateStoreQueries();
    } catch (error: unknown) {
      logger.error('DATABASE', 'STORE_UPDATE_FROM_DASHBOARD_FAILED', { error });
      toast.error((error instanceof Error ? error.message : String(error)) || t('storeUpdateError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedStore(null);
    setStoreFormMode(null);
  };

  // Build a map of storeId → Store for quick lookup
  const storeMap = new Map(stores.map(s => [s.id, s]));

  return (
    <div
      className="p-4 sm:p-6 space-y-6"
      {...(isMobile ? pullToRefreshBind : {})}
      style={isMobile && pullDistance > 0 ? { transform: `translateY(${pullDistance * 0.3}px)`, transition: 'transform 0.2s ease' } : undefined}
    >
      {/* Pull-to-refresh indicator (mobile only) */}
      {isMobile && (pullDistance > 5 || isRefreshing) && (
        <div className="flex items-center justify-center py-2" style={{ height: `${pullDistance}px` }}>
          <RefreshCcw className={cn('w-5 h-5 text-muted-foreground', isRefreshing && 'animate-spin')} />
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-sm uppercase tracking-tight">{t('consolidatedBoard')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('storeCount', { count: stores.length, s: stores.length !== 1 ? 's' : '' })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Badge: Fecha de Operación Actual (política forward-only locking) */}
          <GlobalOperationDateBadge />

          <button
            type="button"
            onClick={() => refetch()}
            aria-label={t('refreshData')}
            className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <RefreshCcw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: t('totalSalesToday'), value: formatCurrency(totalSalesToday), icon: TrendingUp },
          { label: t('transactions'), value: totalTransactions, icon: ShoppingCart },
          { label: t('activeAlerts'), value: totalAlerts, icon: AlertTriangle, alert: totalAlerts > 0 },
        ].map(({ label, value, icon: Icon, alert }) => (
          <div key={label} className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn('w-3.5 h-3.5', alert ? 'text-destructive' : 'text-muted-foreground')} />
              <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
            </div>
            <p className={cn('font-black text-lg tabular-nums', alert ? 'text-destructive' : 'text-foreground')}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Grid de tiendas */}
      <StateRenderer
        isLoading={isLoading}
        error={kpiError}
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
                onConfig={handleConfigStore}
                onOpenDashboard={handleOpenDashboard}
                store={storeMap.get(kpi.storeId)}
              />
            ))}
          </div>
        )}
      </StateRenderer>

      {/* Store Config Modal (inline, opens from Settings icon) */}
      <StoreModals
        mode={storeFormMode}
        isOpen={!!storeFormMode}
        onClose={handleCloseModal}
        onSubmit={handleStoreFormSubmit}
        selectedStore={selectedStore}
        isSubmitting={isSubmitting}
      />

      {/* Dashboard 10/10 — vista avanzada de analytics por tienda.
          Se renderiza como overlay full-screen cuando el usuario hace clic
          en el botón BarChart3 de una tarjeta de tienda. */}
      {dashboardStore && (
        <StoreDashboardView
          storeId={dashboardStore.id}
          storeName={dashboardStore.name}
          onClose={handleCloseDashboard}
        />
      )}
    </div>
  );
}

// ── Badge: Fecha de Operación Actual ──────────────────────────
// Política de secuencia global (forward-only locking).
// Muestra la fecha MAX de todos los documentos del sistema.
// Sirve como "termómetro" para que el usuario sepa cuál es la fecha
// mínima permitida antes de intentar generar un nuevo documento.

function GlobalOperationDateBadge() {
  // Per-store: muestra la fecha MAX de la tienda activa del usuario.
  // Si no hay tienda activa, muestra el MAX global.
  const { user } = useAuthStore();
  const { data, isLoading } = useGlobalOperationDate(user?.activeStoreId);

  if (isLoading) {
    return (
      <div className="h-11 px-3 rounded-lg border border-border/50 bg-card/50 animate-pulse flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Cargando...
        </span>
      </div>
    );
  }

  const hasDate = !!data?.maxDate;
  const formatted = data?.maxDateFormatted || '—';

  return (
    <div
      className={cn(
        'h-11 px-3 rounded-lg border flex items-center gap-2 transition-colors',
        hasDate
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/50 bg-muted/30',
      )}
      title={hasDate
        ? `Fecha mínima para nuevos documentos: ${formatted}`
        : 'Sin documentos previos — cualquier fecha es válida'}
      role="status"
      aria-label={`Fecha de operación actual: ${formatted}`}
    >
      <CalendarClock className={cn('w-4 h-4 shrink-0', hasDate ? 'text-primary' : 'text-muted-foreground')} />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Fecha Operación
        </span>
        <span className={cn(
          'text-xs font-black tabular-nums',
          hasDate ? 'text-primary' : 'text-muted-foreground',
        )}>
          {formatted}
        </span>
      </div>
    </div>
  );
}
