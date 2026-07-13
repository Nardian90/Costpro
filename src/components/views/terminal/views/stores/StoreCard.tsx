'use client';

import React from 'react';
import Image from 'next/image';
import {
  Edit, Trash2, Building, Target, Check, Loader2,
  RotateCcw, Power, UserCog, Settings, X, Archive, ArchiveRestore,
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

/**
 * StoreCard — Componente independiente para renderizar una tarjeta de tienda.
 *
 * EXTRAÍDO de StoresManagementView.tsx (líneas 238-534) como parte del refactor
 * de auditoría. Esto permite:
 *   - Reutilizar StoreCard en VirtualizedStoreGrid (renderItem)
 *   - Testear StoreCard de forma aislada
 *   - Reducir StoresManagementView de ~820 a ~520 líneas
 *
 * Props: todos los handlers y estado que el padre ya maneja.
 * El StoreCard es "dumb" — solo renderiza y emite eventos via callbacks.
 */

export interface StoreCardProps {
  store: Store;
  // Selection state (admin bulk operations)
  isSelected: boolean;
  isAdmin: boolean;
  // Active store
  activeStoreId: string | null | undefined;
  userActiveStoreId?: string;
  // User counts (F1-T05)
  userCounts: Record<string, { total: number; byRole: Record<string, number> } | undefined>;
  // Health (F4-T05)
  health: any;
  // Async state
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
  // FIX-GESTION-UNIFICADA-V2: KPIs en tiempo real + dashboard avanzado
  kpi?: StoreKPI;
  onOpenDashboard?: (store: Store) => void;
}

export function StoreCard({
  store,
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
  kpi,
  onOpenDashboard,
}: StoreCardProps) {
  const t = useTranslations('stores');
  const tc = useTranslations('common');

  return (
    <div
      role="article"
      aria-label={`${t('title')} ${store.name}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (activeStoreId !== store.id) onSetActiveStore(store.id);
        }
      }}
      className={cn(
        "p-6 rounded-2xl border bg-card hover:border-primary/30 transition-all flex flex-col shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none relative",
        isSelected && "border-primary ring-2 ring-primary/20"
      )}
    >
      {/* F4-T01: checkbox de selección bulk (solo admin, esquina superior izquierda) */}
      {isAdmin && (
        <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(store.id)}
            aria-label={`Seleccionar tienda ${store.name} para operación masiva`}
          />
        </div>
      )}
      {/* Descripción oculta para screen readers */}
      <span id={`store-desc-${store.id}`} className="sr-only">
        {t('title')} {store.name}.
        {store.address ? ` ${t('address')}: ${store.address}.` : ` ${t('addressNotSpecified')}.`}
        {store.reeup ? ` ${t('reeup')}: ${store.reeup}.` : ''}
        {store.is_active ? t('active') : t('inactive')}.
        {store.id === userActiveStoreId ? ` ${t('currentStore')}.` : ''}
      </span>

      <div className="flex items-start justify-between mb-6">
        <div className="w-14 h-14 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
          {store.logo_url && getStoreLogoUrl(store.logo_url) ? (
            <Image src={getStoreLogoUrl(store.logo_url) || ''} alt={`${t('logo')} ${store.name}`} width={56} height={56} className="w-full h-full object-cover" unoptimized />
          ) : (
            <Building className="w-6 h-6 text-muted-foreground opacity-70" />
          )}
        </div>
        <span className={cn(
          "px-2 py-0.5 rounded text-xs font-black uppercase tracking-widest",
          store.is_active ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        )}>
          {store.is_active ? t('active') : t('inactive')}
        </span>
      </div>

      <h3 className="font-black text-lg uppercase tracking-tight mb-1">{store.name}</h3>
      <p className="text-sm font-bold text-muted-foreground leading-relaxed mb-1">{store.address || t('addressNotSpecified')}</p>

      {/* FIX-GESTION-UNIFICADA-V2: KPIs en tiempo real (de MultiStoreDashboardView) */}
      {kpi && (
        <div className="grid grid-cols-4 gap-2 my-3 p-2.5 rounded-xl bg-muted/20 border border-border/50">
          <KpiMini
            icon={TrendingUp}
            label="Ventas hoy"
            value={formatCurrency(kpi.todaySales)}
            color="text-primary"
          />
          <KpiMini
            icon={ShoppingCart}
            label="Trans."
            value={kpi.todayTransactions}
            color="text-foreground"
          />
          <KpiMini
            icon={AlertTriangle}
            label="Stock bajo"
            value={kpi.lowStockCount}
            color={kpi.lowStockCount > 0 ? 'text-destructive' : 'text-muted-foreground'}
            alert={kpi.lowStockCount > 0}
          />
          <KpiMini
            icon={Package}
            label="En vitrina"
            value={kpi.visibleProducts}
            color="text-foreground"
          />
        </div>
      )}

      {/* FC Template Indicator */}
      <div className="flex items-center gap-1.5 mb-1">
        {store.cost_template?.is_active ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
            <FileText className="w-3 h-3" />
            FC: {store.cost_template.modalidad || 'Plantilla configurada'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-bold px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border">
            <FileText className="w-3 h-3 opacity-70" />
            Sin plantilla FC
          </span>
        )}
      </div>

      {/* F1-T05: badge "N usuarios" con breakdown por rol en tooltip */}
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
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded border",
                total > 0
                  ? 'bg-primary/5 text-primary border-primary/20'
                  : 'bg-muted/50 text-muted-foreground/60 border-border'
              )}
              title={tooltip}
              aria-label={`Tienda ${store.name}: ${total} usuario${total === 1 ? '' : 's'} asignado${total === 1 ? '' : 's'}. ${breakdown}`}
            >
              <Users className="w-3 h-3" />
              {total} {total === 1 ? 'usuario' : 'usuarios'}
            </span>
            {/* F4-T05: badge de Health Score con tooltip breakdown */}
            <StoreHealthBadge storeId={store.id} health={health} compact />
          </div>
        );
      })()}

      {/* Public Storefront Link + Visit Button */}
      {store.slug && (() => {
        // FIX-AUDIT-1: Use store.slug directly (DB stores slug with hyphens via slugify)
        // FIX-SSR: Guard window.location.origin for SSR/prerender safety
        const slug = store.slug;
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const fullUrl = origin ? `${origin}/tienda/${slug}` : `/tienda/${slug}`;
        return (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black uppercase tracking-widest text-primary/60 mb-0.5">{t('publicLink')}</p>
              <p className="text-sm font-mono text-foreground truncate" title={fullUrl}>
                {fullUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                // FIX-SSR: Use computed fullUrl (already guarded for SSR)
                const url = typeof window !== 'undefined'
                  ? `${window.location.origin}/tienda/${slug}`
                  : `/tienda/${slug}`;
                navigator.clipboard.writeText(url).then(() => {
                  toast.success(t('linkCopied') + ': ' + url);
                }).catch(() => {
                  toast.error(t('copyError'));
                });
              }}
              className="shrink-0 p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-primary/10 transition-colors text-primary"
              aria-label={`${t('copyLink')} ${store.name}`}
              title={t('copyLink')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/tienda/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-2.5 min-h-[44px] min-w-[44px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center"
              aria-label={`${t('visitStorefront')} ${store.name}`}
              title={t('publicStorefront')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        );
      })()}

      {/* UX-002: Show store metadata in card for quick reference */}
      {(store.reeup || store.bank_account || store.phone || store.email) && (
        <div className="flex flex-col gap-0.5 mb-4">
          {store.phone && (
            <p className="text-sm font-bold text-muted-foreground/60 tracking-wider">
              {t('phone')}: {store.phone}
            </p>
          )}
          {store.email && (
            <p className="text-sm font-bold text-muted-foreground/60 tracking-wider">
              {store.email}
            </p>
          )}
          {store.reeup && (
            <p className="text-sm font-bold text-muted-foreground/60 tracking-wider">
              {t('reeup')}: {store.reeup}
            </p>
          )}
          {store.bank_account && (
            <p className="text-sm font-bold text-muted-foreground/60 tracking-wider">
              {t('bankAccount')}: {store.bank_account}
            </p>
          )}
        </div>
      )}

      <div className="flex-1" />

      <div className="space-y-2">
        {/* FIX-GESTION-UNIFICADA-V2: botón "Ver Dashboard" → dashboard avanzado por tienda */}
        {onOpenDashboard && (
          <button
            type="button"
            onClick={() => onOpenDashboard(store)}
            aria-label={`Ver dashboard avanzado de ${store.name}`}
            title="Dashboard con analytics, insights IA y drill-down"
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Ver Dashboard
          </button>
        )}
        {activeStoreId !== store.id ? (
          <button
            type="button"
            onClick={() => onSetActiveStore(store.id)}
            aria-label={`${t('selectStore')} ${store.name}`}
            aria-pressed={false}
            aria-describedby={`store-desc-${store.id}`}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-primary text-foreground font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Target className="w-3.5 h-3.5" />
            {t('selectStore')}
          </button>
        ) : (
          <div
            role="status"
            aria-label={`${t('currentStore')}: ${store.name}`}
            aria-current="true"
            className="w-full py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-primary font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <Check className="w-3.5 h-3.5" />
            {t('currentStore')}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* F2-T02: botón Configurar */}
          <button
            type="button"
            onClick={() => onConfigStore(store)}
            aria-label={`Configurar tienda ${store.name}`}
            title="Configuración centralizada con checklist de completitud"
            className="min-h-[44px] py-2.5 rounded-xl border border-border hover:bg-primary/10 hover:text-primary font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
          >
            <Settings className="w-3 h-3" />
            Configurar
          </button>
          <button
            type="button"
            onClick={() => onEditStore(store)}
            aria-label={`${tc('edit')} ${store.name}`}
            title="Formulario avanzado de edición (datos completos)"
            className="min-h-[44px] py-2.5 rounded-xl border border-border hover:bg-muted font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
          >
            <Edit className="w-3 h-3" />
            {t('info')}
          </button>
          {/* F2-T05: botón Equipo */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onTeamStore(store)}
              aria-label={`Ver equipo de ${store.name}`}
              title="Ver y administrar usuarios asignados a esta tienda"
              className="min-h-[44px] py-2.5 rounded-xl border border-border hover:bg-primary/10 hover:text-primary font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
            >
              <UserCog className="w-3 h-3" />
              Equipo
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onResetStore(store)}
              aria-label={`${t('resetStore')} ${store.name}`}
              className="min-h-[44px] py-2.5 rounded-xl border border-border hover:bg-warning/10 hover:text-warning font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t('reset')}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onToggleStatus(store)}
              disabled={isTogglingStatus}
              aria-label={`${store.is_active ? 'Desactivar' : 'Activar'} tienda ${store.name}`}
              title={store.is_active ? 'Desactivar tienda (pausa temporal, preserva configuración y usuarios)' : 'Reactivar tienda (vuelve a estar operativa)'}
              className={cn(
                "min-h-[44px] py-2.5 rounded-xl border font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                store.is_active
                  ? "border-border hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300 dark:hover:bg-amber-950/40"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
              )}
            >
              {isTogglingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
              {store.is_active ? 'Pausar' : 'Activar'}
            </button>
          )}
          {/* Archivar / Restaurar */}
          {isAdmin && store.is_active && (
            <button
              type="button"
              onClick={() => onArchiveStore(store)}
              disabled={archivingStoreId === store.id}
              aria-label={`Archivar tienda ${store.name}`}
              title="Archivar (cierre temporal prolongado). Preserva ventas, inventario y configuración. Puede restaurarla cuando quiera."
              className="min-h-[44px] py-2.5 rounded-xl border border-border font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors hover:bg-violet-100 hover:text-violet-700 hover:border-violet-300 dark:hover:bg-violet-950/40 disabled:opacity-50"
            >
              {archivingStoreId === store.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
              Archivar
            </button>
          )}
          {isAdmin && !store.is_active && (
            <button
              type="button"
              onClick={() => onRestoreStore(store)}
              disabled={archivingStoreId === store.id}
              aria-label={`Restaurar tienda ${store.name}`}
              title="Restaurar tienda archivada. Vuelve a estar activa y operativa."
              className="min-h-[44px] py-2.5 rounded-xl border border-violet-300 bg-violet-50 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800 disabled:opacity-50"
            >
              {archivingStoreId === store.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArchiveRestore className="w-3 h-3" />}
              Restaurar
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onDeleteStore(store)}
              aria-label={`${t('deleteStore')} ${store.name}`}
              aria-describedby={`store-desc-${store.id}`}
              className="col-span-2 min-h-[44px] py-2.5 rounded-xl border border-border hover:bg-destructive/10 hover:text-destructive font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {t('erase')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI Mini (sub-componente para KPIs en tiempo real) ─────────────────────
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
