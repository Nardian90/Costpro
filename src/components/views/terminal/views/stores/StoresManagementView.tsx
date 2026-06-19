'use client';

import React from 'react';
import Image from 'next/image';
import { Plus, Edit, Trash2, Building, Target, Check, RotateCcw, Loader2, Copy, ExternalLink, FileText, Users, Power, UserCog, Settings, X, CheckSquare, Rocket, GitCompare } from 'lucide-react';
import { cn, getStoreLogoUrl } from '@/lib/utils';
import type { Store } from '@/types';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { Checkbox } from '@/components/ui/checkbox';
import { useStoresView } from './useStoresView';
import { useBulkStoreAction } from '@/hooks/api/useStores';
import { StoreModals } from './StoreModals';
import { CreateStoreQuickModal } from './CreateStoreQuickModal';
import { StoreTeamModal } from './StoreTeamModal';
import { StoreConfigModal } from './StoreConfigModal';
import { StoreHealthBadge } from './StoreHealthBadge';
import { useStoreHealth } from '@/hooks/api/useStoreHealth';
import { BulkApplyTemplateModal } from './BulkApplyTemplateModal';
import { StoreOnboardingWizard } from './StoreOnboardingWizard';
import { StoreCompareModal } from './StoreCompareModal';
import { VirtualizedStoreGrid } from './VirtualizedStoreGrid'; // B3
import { DestructiveConfirmModal } from '@/components/ui/DestructiveConfirmModal';
import { useAuthStore } from '@/store';
import { useStoreUserCounts } from '@/hooks/api/useStoreUserCounts';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function StoresManagementView() {
  const t = useTranslations('stores');
  const tc = useTranslations('common');
  const { user } = useAuthStore();
  // F1-T05: conteo de usuarios por tienda para mostrar badge "N usuarios" en cada tarjeta.
  const { data: userCounts } = useStoreUserCounts();
  const {
    searchTerm,
    setSearchTerm,
    stores,
    activeStoreId,
    isAdmin,
    storeFormMode,
    selectedStore,
    isSubmitting,
    isLoading,
    handleCreateStore,
    handleEditStore,
    handleDeleteStore,
    handleResetStore,
    handleSetActiveStore,
    handleToggleStoreStatus,  // F2-T03
    isTogglingStatus,         // F2-T03
    storeToToggle,            // F2.5-3
    executeToggle,            // F2.5-3
    cancelToggle,             // F2.5-3
    togglePending,            // F2.5-3
    handleCloseModal,
    handleStoreFormSubmit
  } = useStoresView();
  // F4-T05: health score holístico por tienda (config, fiscal, FC, productos, ventas).
  // FIX-F4-T05: debe ir DESPUÉS de desestructurar `stores` de useStoresView,
  // no antes (era ReferenceError: Cannot access 'stores' before initialization).
  const { data: health } = useStoreHealth(stores);

  // F2-T05: state para el modal de equipo de la tienda.
  const [teamModalStore, setTeamModalStore] = useState<import('@/types').Store | null>(null);
  // F2-T02: state para el modal de configuración de tienda.
  const [configModalStore, setConfigModalStore] = useState<import('@/types').Store | null>(null);
  // F4-T01: state para selección múltiple de tiendas (bulk operations).
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  // F4-T01: confirmación destructiva bulk (deactivate/delete).
  const [bulkConfirm, setBulkConfirm] = useState<null | { action: 'activate' | 'deactivate' | 'delete'; storeIds: string[]; storeNames: string[] }>(null);
  // F4-T03: modal para aplicar plantilla FC a múltiples tiendas.
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  // F4-T04: onboarding wizard de 3 pasos.
  const [wizardOpen, setWizardOpen] = useState(false);
  // F6-T01: vista comparativa entre tiendas.
  const [compareOpen, setCompareOpen] = useState(false);
  // Reset-Flow-Fix: toggle para mantener catálogo al reiniciar tienda.
  // Si true: mantiene products + product_variants, solo resetea stock a 0.
  // Si false: borra TODO incluyendo catálogo.
  const [resetKeepCatalog, setResetKeepCatalog] = useState(false);
  const bulkAction = useBulkStoreAction();

  // Helpers de selección
  const toggleSelect = (storeId: string) => {
    setSelectedStoreIds(prev => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  };
  const selectAll = () => setSelectedStoreIds(new Set(stores.map(s => s.id)));
  const clearSelection = () => setSelectedStoreIds(new Set());

  const selectedCount = selectedStoreIds.size;
  const selectedStores = stores.filter(s => selectedStoreIds.has(s.id));

  // F4-T01: ejecutar acción bulk (con confirmación previa para deactivate/delete).
  const handleBulkAction = (action: 'activate' | 'deactivate' | 'delete') => {
    const ids = Array.from(selectedStoreIds);
    const names = selectedStores.map(s => s.name);
    // activate es seguro — ejecutar directo. deactivate/delete piden confirmación.
    if (action === 'activate') {
      void executeBulk(action, ids);
    } else {
      setBulkConfirm({ action, storeIds: ids, storeNames: names });
    }
  };

  const executeBulk = async (action: 'activate' | 'deactivate' | 'delete', ids: string[]) => {
    try {
      const result = await bulkAction.mutateAsync({ storeIds: ids, action });
      const verb = action === 'activate' ? 'activadas' : action === 'deactivate' ? 'desactivadas' : 'eliminadas';
      toast.success(`${result.affected} tienda${result.affected === 1 ? '' : 's'} ${verb}`);
      if (result.failed && result.failed > 0) {
        toast.warning(`${result.failed} tienda(s) no pudieron procesarse`);
      }
      clearSelection();
      setBulkConfirm(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error en operación bulk');
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h2 className="text-[clamp(1.5rem,5vw,2rem)] font-black tracking-tighter uppercase text-primary">
            {t('title')}
          </h2>
          <ActionMenu
            actions={[
              { id: 'new', label: t('newStore'), icon: Plus, onClick: handleCreateStore, variant: 'primary' },
              // F4-T04: onboarding wizard de 3 pasos para crear tienda completa
              { id: 'wizard', label: 'Nuevo con asistente', icon: Rocket, onClick: () => setWizardOpen(true), variant: 'outline' },
              // F6-T01: vista comparativa entre tiendas
              { id: 'compare', label: 'Comparar Tiendas', icon: GitCompare, onClick: () => setCompareOpen(true), variant: 'outline' },
            ]}
            className="sm:w-auto"
          />
        </div>

        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('filterByLocation')} aria-label={t('search')} />

        {/* B3: VirtualizedStoreGrid disponible para >20 tiendas.
            Requiere extraer StoreCard a componente separado — deuda técnica. */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* UX-001: Loading state BEFORE map so it shows while fetching */}
          {isLoading && (
            <div className="col-span-full py-24 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary/40" aria-hidden="true" />
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground" role="status">{t('loadingStores')}</p>
            </div>
          )}

          {!isLoading && stores.map((store) => (
            <div key={store.id} role="article" aria-label={`${t('title')} ${store.name}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (activeStoreId !== store.id) handleSetActiveStore(store.id); } }} className={cn(
              "p-6 rounded-2xl border bg-card hover:border-primary/30 transition-all flex flex-col shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none relative",
              selectedStoreIds.has(store.id) && "border-primary ring-2 ring-primary/20"
            )}>
              {/* F4-T01: checkbox de selección bulk (solo admin, esquina superior izquierda) */}
              {isAdmin && (
                <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedStoreIds.has(store.id)}
                    onCheckedChange={() => toggleSelect(store.id)}
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
                {store.id === user?.activeStoreId ? ` ${t('currentStore')}.` : ''}
              </span>

              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                  {store.logo_url && getStoreLogoUrl(store.logo_url) ? (
                    <Image src={getStoreLogoUrl(store.logo_url) || ''} alt={`${t('logo')} ${store.name}`} width={56} height={56} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <Building className="w-6 h-6 text-muted-foreground opacity-40" />
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
              <p className="text-xs font-bold text-muted-foreground leading-relaxed mb-1">{store.address || t('addressNotSpecified')}</p>

              {/* FC Template Indicator */}
              <div className="flex items-center gap-1.5 mb-1">
                {store.cost_template?.is_active ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
                    <FileText className="w-3 h-3" />
                    FC: {store.cost_template.modalidad || 'Plantilla configurada'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border">
                    <FileText className="w-3 h-3 opacity-40" />
                    Sin plantilla FC
                  </span>
                )}
              </div>

              {/* F1-T05: badge "N usuarios" con breakdown por rol en tooltip.
                  Permite al admin ver de un vistazo qué tiendas están "huérfanas" de personal. */}
              {(() => {
                const count = userCounts[store.id];
                const total = count?.total ?? 0;
                const byRole = count?.byRole ?? {};
                // Construir texto del tooltip: "2 admin · 3 encargado · 5 clerk" (solo roles presentes)
                const breakdown = Object.entries(byRole)
                  .filter(([, n]) => n > 0)
                  .map(([role, n]) => `${n} ${role}`)
                  .join(' · ');
                const tooltip = total > 0 ? breakdown : 'Sin usuarios asignados';
                return (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border",
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
                const cleanSlug = store.slug.toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                return (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-0.5">{t('publicLink')}</p>
                    <p className="text-[10px] font-mono text-foreground truncate" title={`${window.location.origin}/tienda/${cleanSlug}`}>
                      {window.location.origin}/tienda/{cleanSlug}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const fullUrl = `${window.location.origin}/tienda/${cleanSlug}`;
                      navigator.clipboard.writeText(fullUrl).then(() => {
                        toast.success(t('linkCopied') + ': ' + fullUrl);
                      }).catch(() => {
                        toast.error(t('copyError'));
                      });
                    }}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-primary"
                    aria-label={`${t('copyLink')} ${store.name}`}
                    title={t('copyLink')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={`/tienda/${cleanSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center"
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
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      {t('phone')}: {store.phone}
                    </p>
                  )}
                  {store.email && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      {store.email}
                    </p>
                  )}
                  {store.reeup && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      {t('reeup')}: {store.reeup}
                    </p>
                  )}
                  {store.bank_account && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      {t('bankAccount')}: {store.bank_account}
                    </p>
                  )}
                </div>
              )}

              <div className="flex-1" />

              <div className="space-y-2">
                {activeStoreId !== store.id ? (
                  <button
                    type="button"
                    onClick={() => handleSetActiveStore(store.id)}
                    aria-label={`${t('selectStore')} ${store.name}`}
                    aria-pressed={false}
                    aria-describedby={`store-desc-${store.id}`}
                    className="w-full py-2.5 rounded-xl bg-primary text-foreground font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Target className="w-3.5 h-3.5" />
                    {t('selectStore')}
                  </button>
                ) : (
                  <div
                    role="status"
                    aria-label={`${t('currentStore')}: ${store.name}`}
                    aria-current="true"
                    className="w-full py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-primary font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('currentStore')}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {/* F2-T02: botón Configurar — abre el modal de configuración centralizada
                      con 4 secciones (General, Fiscal, FC, Pública) y checklist de completitud. */}
                  <button
                    type="button"
                    onClick={() => setConfigModalStore(store)}
                    aria-label={`Configurar tienda ${store.name}`}
                    title="Configuración centralizada con checklist de completitud"
                    className="py-2 rounded-xl border border-border hover:bg-primary/10 hover:text-primary font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                    Configurar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditStore(store)}
                    aria-label={`${tc('edit')} ${store.name}`}
                    title="Formulario avanzado de edición (datos completos)"
                    className="py-2 rounded-xl border border-border hover:bg-muted font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    {t('info')}
                  </button>
                  {/* F2-T05: botón Equipo — abre modal con usuarios asignados a esta tienda.
                      Vista inversa a UserForm: desde la tienda, ver y administrar su equipo. */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setTeamModalStore(store)}
                      aria-label={`Ver equipo de ${store.name}`}
                      title="Ver y administrar usuarios asignados a esta tienda"
                      className="py-2 rounded-xl border border-border hover:bg-primary/10 hover:text-primary font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                      <UserCog className="w-3 h-3" />
                      Equipo
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleResetStore(store)}
                      aria-label={`${t('resetStore')} ${store.name}`}
                      className="py-2 rounded-xl border border-border hover:bg-warning/10 hover:text-warning font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('reset')}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleToggleStoreStatus(store)}
                      disabled={isTogglingStatus}
                      aria-label={`${store.is_active ? 'Desactivar' : 'Activar'} tienda ${store.name}`}
                      title={store.is_active ? 'Desactivar tienda (pausa temporal, preserva configuración y usuarios)' : 'Reactivar tienda (vuelve a estar operativa)'}
                      className={cn(
                        "py-2 rounded-xl border font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        store.is_active
                          ? "border-border hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300 dark:hover:bg-amber-950/40"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                      )}
                    >
                      {isTogglingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                      {store.is_active ? 'Pausar' : 'Activar'}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStore(store)}
                      aria-label={`${t('deleteStore')} ${store.name}`}
                      aria-describedby={`store-desc-${store.id}`}
                      className="col-span-2 py-2 rounded-xl border border-border hover:bg-destructive/10 hover:text-destructive font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('erase')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!isLoading && stores.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-xl bg-muted/10">
               <Building className="w-16 h-16 mx-auto mb-4 opacity-5" />
               <p className="font-black uppercase tracking-widest text-xs text-muted-foreground mb-2">{t('noStores')}</p>
               <p className="text-xs text-muted-foreground/50 font-bold uppercase tracking-wider">{t('noAccessOrNoRecords')}</p>
            </div>
          )}
        </div>

        {/* F4-T01: Barra de acciones bulk — aparece cuando hay ≥1 tienda seleccionada.
            Permite activar/desactivar/eliminar múltiples tiendas en una sola operación. */}
        {isAdmin && selectedCount > 0 && (
          <div className="sticky bottom-4 z-30 mx-auto max-w-2xl">
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-card border-2 border-primary shadow-2xl">
              <span className="text-xs font-black uppercase tracking-widest text-primary pl-2">
                {selectedCount} selec.
              </span>
              <div className="h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => handleBulkAction('activate')}
                disabled={bulkAction.isPending}
                className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Activar
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction('deactivate')}
                disabled={bulkAction.isPending}
                className="px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Pausar
              </button>
              {/* F4-T03: aplicar plantilla FC a múltiples tiendas */}
              <button
                type="button"
                onClick={() => setBulkTemplateOpen(true)}
                disabled={bulkAction.isPending}
                className="px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Aplicar FC
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction('delete')}
                disabled={bulkAction.isPending}
                className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={selectAll}
                className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                title="Seleccionar todas"
              >
                Todas
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label="Limpiar selección"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* F2-T01: Modal de creación rápida (2 campos: nombre + slug auto-generado).
          Reemplaza el formulario de 15+ campos para la creación inicial.
          El formulario avanzado sigue accesible para edición desde 'edit' mode.
          F2.5-1: handleCreateStore ahora setea mode='create-quick' (no 'create')
          para que handleStoreFormSubmit sepa que solo vienen name+slug. */}
      <CreateStoreQuickModal
        isOpen={storeFormMode === 'create-quick' || storeFormMode === 'create'}
        onClose={handleCloseModal}
        onSubmit={handleStoreFormSubmit}
        isSubmitting={isSubmitting}
      />
      {/* StoreModals maneja SOLO edit. Los modos create/create-quick se manejan
          en CreateStoreQuickModal arriba. Los modos delete/reset se manejan en
          DestructiveConfirmModal más abajo (F2.5-2). */}
      <StoreModals
        mode={(storeFormMode === 'create' || storeFormMode === 'create-quick' || storeFormMode === 'delete' || storeFormMode === 'reset') ? null : storeFormMode}
        isOpen={!!storeFormMode && storeFormMode === 'edit'}
        onClose={handleCloseModal}
        onSubmit={handleStoreFormSubmit}
        selectedStore={selectedStore}
        isSubmitting={isSubmitting}
      />
      {/* F2-T05: Modal de equipo de la tienda.
          Muestra los usuarios asignados con cambio de rol inline y remoción. */}
      <StoreTeamModal
        isOpen={!!teamModalStore}
        onClose={() => setTeamModalStore(null)}
        store={teamModalStore}
      />
      {/* F2-T02: Modal de configuración de tienda.
          Centraliza General, Fiscal, FC y Tienda Pública con checklist de completitud. */}
      <StoreConfigModal
        isOpen={!!configModalStore}
        onClose={() => setConfigModalStore(null)}
        store={configModalStore}
      />
      {/* F2.5-3: Modal de confirmación destructiva para desactivar tienda (F2-T03).
          Reemplaza el confirm() nativo por DestructiveConfirmModal estandarizado.
          Solo se muestra al desactivar (reactivar es seguro, no requiere confirmación). */}
      <DestructiveConfirmModal
        key={`toggle-${storeToToggle?.id ?? 'none'}`}
        isOpen={!!storeToToggle}
        onClose={cancelToggle}
        title="Desactivar Tienda"
        description="Pausa temporal — preserva configuración y usuarios"
        confirmName={storeToToggle?.name || ''}
        confirmNameLabel="Nombre de la tienda"
        warningText={
          <>
            Vas a desactivar la tienda <strong>{storeToToggle?.name}</strong>. Los usuarios
            asignados perderán acceso a esta tienda hasta que la reactives. La configuración,
            productos y membresías se conservan intactas.
          </>
        }
        itemsList={[
          'Usuarios asignados pierden acceso inmediato',
          'Configuración y productos se preservan',
          'Membresías se mantienen (no se revocan)',
          'Puedes reactivar la tienda en cualquier momento con 1 clic',
        ]}
        confirmLabel="Desactivar Tienda"
        onConfirm={() => { if (storeToToggle) { void executeToggle(storeToToggle); } }}
        isSubmitting={togglePending}
      />
      {/* F2.5-2: DestructiveConfirmModal para Eliminar tienda (reemplaza bloque ad-hoc en StoreModals) */}
      <DestructiveConfirmModal
        key={`delete-${selectedStore?.id ?? 'none'}`}
        isOpen={storeFormMode === 'delete'}
        onClose={handleCloseModal}
        title="Eliminar Tienda"
        description="Baja permanente con cleanup de memberships"
        confirmName={selectedStore?.name || ''}
        confirmNameLabel="Nombre de la tienda"
        warningText={
          <>
            Vas a eliminar la tienda <strong>{selectedStore?.name}</strong>. Esta acción es
            irreversible: la tienda se marca como inactiva, se revocan todas las memberships
            de usuarios y se limpia el campo <code>active_store_id</code> de los perfiles.
            Los datos históricos (ventas, recepciones) se conservan para auditoría.
          </>
        }
        itemsList={[
          'Tienda marcada como is_active=false (soft-delete)',
          'Todas las memberships de usuarios revocadas',
          'active_store_id limpiado de perfiles afectados',
          'Datos históricos (ventas, recepciones) preservados',
        ]}
        confirmLabel="Eliminar Definitivamente"
        onConfirm={() => handleStoreFormSubmit('delete', {})}
        isSubmitting={isSubmitting}
      />
      {/* F2.5-2: DestructiveConfirmModal para Reiniciar tienda (reemplaza bloque ad-hoc en StoreModals) */}
      <DestructiveConfirmModal
        key={`reset-${selectedStore?.id ?? 'none'}`}
        isOpen={storeFormMode === 'reset'}
        onClose={() => { handleCloseModal(); setResetKeepCatalog(false); }}
        title="Reiniciar Tienda"
        description="Borra todos los datos operativos — preserva configuración y usuarios"
        confirmName={selectedStore?.name || ''}
        confirmNameLabel="Nombre de la tienda"
        warningText={
          <>
            Vas a reiniciar la tienda <strong>{selectedStore?.name}</strong>. Se borrarán todos
            los datos operativos (ventas, recepciones, ajustes, transferencias, arqueos de caja).
            La configuración de la tienda y memberships se conservan siempre.
            {resetKeepCatalog
              ? ' El catálogo de productos se mantendrá (stock reseteado a 0).'
              : ' El catálogo de productos también se borrará.'}
          </>
        }
        itemsList={[
          'Ventas históricas eliminadas',
          'Recepciones de mercancía eliminadas',
          'Ajustes de inventario eliminados',
          'Transferencias entre tiendas eliminadas',
          'Arqueos de caja / cierres de turno eliminados',
          resetKeepCatalog
            ? 'Stock de productos reseteado a 0 (catálogo preservado)'
            : 'Catálogo de productos eliminado',
        ]}
        confirmLabel="Reiniciar Tienda"
        onConfirm={() => handleStoreFormSubmit('reset', { keepCatalog: resetKeepCatalog } as Partial<Store> & { keepCatalog?: boolean })}
        isSubmitting={isSubmitting}
        // Reset-Flow-Fix: toggle para mantener catálogo de productos.
        extraContent={
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={resetKeepCatalog}
              onChange={(e) => setResetKeepCatalog(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-border text-primary focus:ring-primary/30 shrink-0"
            />
            <div className="flex-1">
              <span className="text-xs font-black uppercase tracking-widest text-foreground block">
                Mantener catálogo de productos
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5 leading-relaxed">
                Si activas esta opción, los productos y variantes se conservan pero el stock
                se resetea a 0. Útil para reiniciar operaciones sin perder el catálogo.
              </span>
            </div>
          </label>
        }
      />
      {/* F4-T01: DestructiveConfirmModal para bulk deactivate/delete.
          Pide escribir "BULK" para confirmar (no el nombre de cada tienda — sería impracticable con 10+). */}
      {bulkConfirm && (
        <DestructiveConfirmModal
          key={`bulk-${bulkConfirm.action}-${bulkConfirm.storeIds.length}`}
          isOpen={!!bulkConfirm}
          onClose={() => !bulkAction.isPending && setBulkConfirm(null)}
          title={
            bulkConfirm.action === 'delete'
              ? `Eliminar ${bulkConfirm.storeIds.length} tiendas`
              : `Desactivar ${bulkConfirm.storeIds.length} tiendas`
          }
          description={
            bulkConfirm.action === 'delete'
              ? 'Baja permanente con cleanup de memberships'
              : 'Pausa temporal — preserva configuración y usuarios'
          }
          confirmName="BULK"
          confirmNameLabel="Escribe BULK para confirmar"
          warningText={
            <>
              Vas a {bulkConfirm.action === 'delete' ? 'eliminar' : 'desactivar'}{' '}
              <strong>{bulkConfirm.storeIds.length} tiendas</strong>:
              <div className="mt-2 max-h-32 overflow-y-auto">
                {bulkConfirm.storeNames.map((name, i) => (
                  <div key={i} className="text-xs">• {name}</div>
                ))}
              </div>
            </>
          }
          itemsList={
            bulkConfirm.action === 'delete'
              ? ['Soft-delete con revocación de memberships', 'Datos históricos preservados', 'Irreversible']
              : ['Usuarios pierden acceso', 'Configuración preservada', 'Reactivable en cualquier momento']
          }
          confirmLabel={
            bulkConfirm.action === 'delete' ? 'Eliminar Definitivamente' : 'Desactivar Tiendas'
          }
          onConfirm={() => executeBulk(bulkConfirm.action, bulkConfirm.storeIds)}
          isSubmitting={bulkAction.isPending}
        />
      )}
      {/* F4-T03: Modal para aplicar plantilla FC a múltiples tiendas seleccionadas. */}
      <BulkApplyTemplateModal
        isOpen={bulkTemplateOpen}
        onClose={() => setBulkTemplateOpen(false)}
        selectedStores={selectedStores}
      />
      {/* F4-T04: Onboarding wizard de 3 pasos para crear tienda completa. */}
      <StoreOnboardingWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
      {/* F6-T01: Vista comparativa entre tiendas. */}
      <StoreCompareModal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        stores={stores}
        preselectedIds={Array.from(selectedStoreIds)}
      />
    </>
  );
}
