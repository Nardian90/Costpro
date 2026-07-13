'use client';

/**
 * StoreCardEnhanced — Tarjeta de tienda fusionada con KPIs en tiempo real.
 *
 * GESTION-UNIFICADA-V2 (2026-07-13): fusiona 3 fuentes de información en una
 * sola tarjeta para el tab "Gestión Tiendas" del hub de Gestión:
 *
 *   1. StoreCard (StoresManagementView): logo, nombre, dirección, FC, usuarios,
 *      datos fiscales (REEUP, banco, teléfono, email), slug + link público,
 *      botones de editar/configurar/equipo/reset/pausar/archivar/eliminar.
 *
 *   2. StoreKPICard (MultiStoreDashboardView): KPIs en tiempo real — Ventas hoy,
 *      Transacciones, Stock bajo, En vitrina.
 *
 *   3. Botón "Ver Dashboard" → abre StoreDashboardView (dashboard avanzado por
 *      tienda con ECharts, insights IA, drill-down de productos).
 *
 * Clic en la tarjeta → activa la tienda + abre el dashboard avanzado de ESA
 * tienda (no la vista KPI vieja). Esto resuelve el problema reportado por el
 * usuario: antes, clic en la tarjeta solo cambiaba la tienda activa pero no
 * llevaba a ningún dashboard.
 *
 * La información del modal "Editar Sucursal" (nombre, dirección, teléfono,
 * email, REEUP, cuenta bancaria, slug, plantilla FC, logo, firma, sello,
 * lat/lng) ya está parcialmente visible en la tarjeta. El modal sigue
 * accesible vía el botón "Editar" para edición, pero la tarjeta muestra
 * suficiente info para no necesitar abrir el modal solo para consultar.
 */

import React from 'react';
import Image from 'next/image';
import {
  Edit, Trash2, Building, Target, Check, Loader2,
  RotateCcw, Power, UserCog, Settings, Archive, ArchiveRestore,
  Copy, ExternalLink, FileText, Users, BarChart3, TrendingUp,
  ShoppingCart, AlertTriangle, Package,
} from 'lucide-react';
import { cn, formatCurrency, getStoreLogoUrl } from '@/lib/utils';
import type { Store } from '@/types';
import type { StoreKPI } from '@/hooks/api/useMultiStoreDashboard';
import { Checkbox } from '@/components/ui/checkbox';
import { StoreHealthBadge } from './StoreHealthBadge';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export interface StoreCardEnhancedProps {
  store: Store;
  kpi?: StoreKPI;
  isSelected: boolean;
  isAdmin: boolean;
  activeStoreId: string | null | undefined;
  userActiveStoreId?: string;
  userCounts: Record<string, { total: number; byRole: Record<string, number> } | undefined>;
  health: any;
  isTogglingStatus: boolean;
  archivingStoreId: string | null;
  // Handlers
  onToggleSelect: (storeId: string) => void;
  onSetActiveStore: (storeId: string) => void;
  onEditStore: (store: Store) => void;
  onConfigStore: (store: Store) => void;
  onTeamStore: (store: Store) => void;
  onResetStore: (store: Store) => void;
  onToggleStatus: (store: Store) => void;
  onArchiveStore: (store: Store) => void;
  onRestoreStore: (store: Store) => void;
  onDeleteStore: (store: Store) => void;
  onOpenDashboard: (store: Store) => void;
}

export function StoreCardEnhanced({
  store,
  kpi,
  isSelected,
  isAdmin,
  activeStoreId,
  userActiveStoreId,
  userCounts,
  health,
  isTogglingStatus,
  archivingStoreId,
  onToggleSelect,
  onSetActiveStore,
  onEditStore,
  onConfigStore,
  onTeamStore,
  onResetStore,
  onToggleStatus,
  onArchiveStore,
  onRestoreStore,
  onDeleteStore,
  onOpenDashboard,
}: StoreCardEnhancedProps) {
  const t = useTranslations('stores');
  const tc = useTranslations('common');
  const isActiveStore = activeStoreId === store.id;
  const isCurrentStore = store.id === userActiveStoreId;

  // Click en la tarjeta → activar tienda + abrir dashboard avanzado
  const handleCardClick = () => {
    if (!isActiveStore) {
      onSetActiveStore(store.id);
    }
    onOpenDashboard(store);
  };

  return (
    <div
      role="article"
      aria-label={`${t('title')} ${store.name}`}
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        "p-5 rounded-2xl border bg-card hover:border-primary/40 hover:shadow-lg transition-all flex flex-col shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none relative cursor-pointer",
        isSelected && "border-primary ring-2 ring-primary/20",
        isActiveStore && "border-primary/40 bg-primary/5"
      )}
    >
      {/* Checkbox de selección bulk (solo admin, esquina superior izquierda) */}
      {isAdmin && (
        <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(store.id)}
            aria-label={`Seleccionar tienda ${store.name} para operación masiva`}
          />
        </div>
      )}

      {/* ── Header: logo + nombre + badges ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Checkbox offset */}
          {isAdmin && <div className="w-5" />}
          <div className="w-12 h-12 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
            {store.logo_url && getStoreLogoUrl(store.logo_url) ? (
              <Image
                src={getStoreLogoUrl(store.logo_url) || ''}
                alt={`${t('logo')} ${store.name}`}
                width={48}
                height={48}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <Building className="w-5 h-5 text-muted-foreground opacity-70" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-base uppercase tracking-tight leading-tight line-clamp-1">
              {store.name}
            </h3>
            <p className="text-xs font-bold text-muted-foreground line-clamp-1">
              {store.address || t('addressNotSpecified')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest",
            store.is_active ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          )}>
            {store.is_active ? t('active') : t('inactive')}
          </span>
        </div>
      </div>

      {/* ── KPIs en tiempo real (de MultiStoreDashboardView) ── */}
      <div className="grid grid-cols-4 gap-2 mb-3 p-3 rounded-xl bg-muted/20 border border-border/50">
        <KpiMini
          icon={TrendingUp}
          label="Ventas hoy"
          value={kpi ? formatCurrency(kpi.todaySales) : '—'}
          color="text-primary"
        />
        <KpiMini
          icon={ShoppingCart}
          label="Transacciones"
          value={kpi ? kpi.todayTransactions : '—'}
          color="text-foreground"
        />
        <KpiMini
          icon={AlertTriangle}
          label="Stock bajo"
          value={kpi ? kpi.lowStockCount : '—'}
          color={kpi && kpi.lowStockCount > 0 ? 'text-destructive' : 'text-muted-foreground'}
          alert={kpi ? kpi.lowStockCount > 0 : false}
        />
        <KpiMini
          icon={Package}
          label="En vitrina"
          value={kpi ? kpi.visibleProducts : '—'}
          color="text-foreground"
        />
      </div>

      {/* ── Badges: FC + Usuarios + Health ── */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {store.cost_template?.is_active ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
            <FileText className="w-2.5 h-2.5" />
            FC: {store.cost_template.modalidad || 'Configurada'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border">
            <FileText className="w-2.5 h-2.5 opacity-70" />
            Sin FC
          </span>
        )}
        {(() => {
          const count = userCounts[store.id];
          const total = count?.total ?? 0;
          const byRole = count?.byRole ?? {};
          const breakdown = Object.entries(byRole)
            .filter(([, n]) => n > 0)
            .map(([role, n]) => `${n} ${role}`)
            .join(' · ');
          const tooltip = total > 0 ? breakdown : 'Sin usuarios asignados';
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border",
                total > 0
                  ? 'bg-primary/5 text-primary border-primary/20'
                  : 'bg-muted/50 text-muted-foreground/60 border-border'
              )}
              title={tooltip}
              aria-label={`Tienda ${store.name}: ${total} usuario${total === 1 ? '' : 's'}. ${breakdown}`}
            >
              <Users className="w-2.5 h-2.5" />
              {total} {total === 1 ? 'usuario' : 'usuarios'}
            </span>
          );
        })()}
        <StoreHealthBadge storeId={store.id} health={health} compact />
      </div>

      {/* ── Datos fiscales compactos (del modal Editar) ── */}
      {(store.reeup || store.bank_account || store.phone || store.email) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-3 text-[10px] font-bold text-muted-foreground/70">
          {store.phone && (
            <p className="truncate" title={`Tel: ${store.phone}`}>
              📞 {store.phone}
            </p>
          )}
          {store.email && (
            <p className="truncate" title={`Email: ${store.email}`}>
              ✉ {store.email}
            </p>
          )}
          {store.reeup && (
            <p className="truncate" title={`REEUP: ${store.reeup}`}>
              REEUP: {store.reeup}
            </p>
          )}
          {store.bank_account && (
            <p className="truncate" title={`Banco: ${store.bank_account}`}>
              🏦 {store.bank_account}
            </p>
          )}
        </div>
      )}

      {/* ── Link público + Visitar ── */}
      {store.slug && (() => {
        const slug = store.slug;
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const fullUrl = origin ? `${origin}/tienda/${slug}` : `/tienda/${slug}`;
        return (
          <div
            className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10 mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-0.5">{t('publicLink')}</p>
              <p className="text-[10px] font-mono text-foreground truncate" title={fullUrl}>
                {fullUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const url = typeof window !== 'undefined'
                  ? `${window.location.origin}/tienda/${slug}`
                  : `/tienda/${slug}`;
                navigator.clipboard.writeText(url).then(() => {
                  toast.success(t('linkCopied') + ': ' + url);
                }).catch(() => {
                  toast.error(t('copyError'));
                });
              }}
              className="shrink-0 p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-primary/10 transition-colors text-primary"
              aria-label={`${t('copyLink')} ${store.name}`}
              title={t('copyLink')}
            >
              <Copy className="w-3 h-3" />
            </button>
            <a
              href={`/tienda/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 p-2 min-h-[36px] min-w-[36px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center"
              aria-label={`${t('visitStorefront')} ${store.name}`}
              title={t('publicStorefront')}
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
      })()}

      <div className="flex-1" />

      {/* ── Botón principal: Dashboard avanzado ── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDashboard(store);
        }}
        aria-label={`Ver dashboard avanzado de ${store.name}`}
        title="Dashboard 10/10 con analytics, insights IA y drill-down"
        className="w-full min-h-[44px] py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform mb-2"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        Ver Dashboard
      </button>

      {/* ── Botones secundarios en grid ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onConfigStore(store); }}
          aria-label={`Configurar tienda ${store.name}`}
          title="Configuración centralizada"
          className="min-h-[40px] py-2 rounded-lg border border-border hover:bg-primary/10 hover:text-primary font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors"
        >
          <Settings className="w-3 h-3" />
          Config
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEditStore(store); }}
          aria-label={`${tc('edit')} ${store.name}`}
          title="Editar datos de la sucursal"
          className="min-h-[40px] py-2 rounded-lg border border-border hover:bg-muted font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors"
        >
          <Edit className="w-3 h-3" />
          Editar
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onTeamStore(store); }}
            aria-label={`Ver equipo de ${store.name}`}
            title="Ver y administrar usuarios asignados"
            className="min-h-[40px] py-2 rounded-lg border border-border hover:bg-primary/10 hover:text-primary font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors"
          >
            <UserCog className="w-3 h-3" />
            Equipo
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSetActiveStore(store.id); }}
            disabled={isActiveStore}
            aria-label={`${t('selectStore')} ${store.name}`}
            className="min-h-[40px] py-2 rounded-lg border border-border hover:bg-muted font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors disabled:opacity-40"
          >
            <Target className="w-3 h-3" />
            {isActiveStore ? 'Activa' : 'Seleccionar'}
          </button>
        )}
      </div>

      {/* ── Acciones admin (reset, pausar/activar, archivar/restaurar, eliminar) ── */}
      {isAdmin && (
        <div className="grid grid-cols-4 gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onResetStore(store); }}
            aria-label={`${t('resetStore')} ${store.name}`}
            title={t('reset')}
            className="min-h-[36px] py-1.5 rounded-lg border border-border hover:bg-warning/10 hover:text-warning font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleStatus(store); }}
            disabled={isTogglingStatus}
            aria-label={`${store.is_active ? 'Desactivar' : 'Activar'} tienda ${store.name}`}
            title={store.is_active ? 'Pausar tienda' : 'Activar tienda'}
            className={cn(
              "min-h-[36px] py-1.5 rounded-lg border font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors disabled:opacity-50",
              store.is_active
                ? "border-border hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300 dark:hover:bg-amber-950/40"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
            )}
          >
            {isTogglingStatus ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Power className="w-2.5 h-2.5" />}
            {store.is_active ? 'Pausar' : 'Activar'}
          </button>
          {store.is_active ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onArchiveStore(store); }}
              disabled={archivingStoreId === store.id}
              aria-label={`Archivar tienda ${store.name}`}
              title="Archivar"
              className="min-h-[36px] py-1.5 rounded-lg border border-border font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors hover:bg-violet-100 hover:text-violet-700 hover:border-violet-300 dark:hover:bg-violet-950/40 disabled:opacity-50"
            >
              {archivingStoreId === store.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Archive className="w-2.5 h-2.5" />}
              Archivar
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRestoreStore(store); }}
              disabled={archivingStoreId === store.id}
              aria-label={`Restaurar tienda ${store.name}`}
              title="Restaurar"
              className="min-h-[36px] py-1.5 rounded-lg border border-violet-300 bg-violet-50 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800 disabled:opacity-50"
            >
              {archivingStoreId === store.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ArchiveRestore className="w-2.5 h-2.5" />}
              Restaurar
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDeleteStore(store); }}
            aria-label={`${t('deleteStore')} ${store.name}`}
            title={t('erase')}
            className="min-h-[36px] py-1.5 rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1 transition-colors"
          >
            <Trash2 className="w-2.5 h-2.5" />
            Borrar
          </button>
        </div>
      )}

      {/* Indicador de tienda actual */}
      {isCurrentStore && (
        <div className="mt-2 text-center text-[9px] font-black uppercase tracking-widest text-primary bg-primary/5 rounded py-1 border border-primary/20">
          ✓ Tienda actual
        </div>
      )}
    </div>
  );
}

// ── KPI Mini (sub-componente) ──────────────────────────────────────────────
function KpiMini({
  icon: Icon,
  label,
  value,
  color,
  alert = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-0.5">
      <Icon className={cn('w-3 h-3', alert ? 'text-destructive' : 'text-muted-foreground')} />
      <p className="text-[9px] font-black uppercase tracking-tight text-muted-foreground leading-tight">
        {label}
      </p>
      <p className={cn('text-xs font-black tabular-nums leading-tight', color)}>
        {value}
      </p>
    </div>
  );
}
