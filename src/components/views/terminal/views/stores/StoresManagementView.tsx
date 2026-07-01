'use client';

import React from 'react';
import Image from 'next/image';
import { Plus, Loader2, X, CheckSquare, Rocket, GitCompare, Building } from 'lucide-react';
import { cn, getStoreLogoUrl } from '@/lib/utils';
import type { Store } from '@/types';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { useStoresView } from './useStoresView';
import { useBulkStoreAction } from '@/hooks/api/useStores';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { StoreModals } from './StoreModals';
// G3-PERF + G3-HARDEN: Heavy modals are dynamically imported to keep the
// StoresManagementView initial bundle lean. They only load when the user
// actually opens them. withChunkRetry wraps each in ChunkErrorBoundary so
// chunk-load failures (network blip, deploy mismatch) show a recoverable
// retry UI instead of a blank screen.
import { withChunkRetry } from '@/components/ui/ChunkErrorBoundary';
const CreateStoreQuickModal = withChunkRetry(
  React.lazy(() => import('./CreateStoreQuickModal').then(m => ({ default: m.CreateStoreQuickModal }))),
  'CreateStoreQuickModal'
);
const StoreTeamModal = withChunkRetry(
  React.lazy(() => import('./StoreTeamModal').then(m => ({ default: m.StoreTeamModal }))),
  'StoreTeamModal'
);
const StoreConfigModal = withChunkRetry(
  React.lazy(() => import('./StoreConfigModal').then(m => ({ default: m.StoreConfigModal }))),
  'StoreConfigModal'
);
const BulkApplyTemplateModal = withChunkRetry(
  React.lazy(() => import('./BulkApplyTemplateModal').then(m => ({ default: m.BulkApplyTemplateModal }))),
  'BulkApplyTemplateModal'
);
const StoreOnboardingWizard = withChunkRetry(
  React.lazy(() => import('./StoreOnboardingWizard').then(m => ({ default: m.StoreOnboardingWizard }))),
  'StoreOnboardingWizard'
);
const StoreCompareModal = withChunkRetry(
  React.lazy(() => import('./StoreCompareModal').then(m => ({ default: m.StoreCompareModal }))),
  'StoreCompareModal'
);
import { StoreHealthBadge } from './StoreHealthBadge';
import { useStoreHealth } from '@/hooks/api/useStoreHealth';
import { VirtualizedStoreGrid } from './VirtualizedStoreGrid'; // B3
import { StoreCard } from './StoreCard'; // FIX-AUDIT-7: extracted component
import { DestructiveConfirmModal } from '@/components/ui/DestructiveConfirmModal';
import { useAuthStore } from '@/store';
import { useStoreUserCounts } from '@/hooks/api/useStoreUserCounts';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function StoresManagementView() {
  const t = useTranslations('stores');
  const tc = useTranslations('common');
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
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
  // FIX-AUDIT-2: Use queryClient.invalidateQueries instead of window.location.reload()
  // to refresh the stores list without destroying React state or causing a page flash.
  const queryClient = useQueryClient();

  // Archivar/Restaurar tienda
  const [archivingStoreId, setArchivingStoreId] = useState<string | null>(null);

  const handleArchiveStore = async (store: Store) => {
    setArchivingStoreId(store.id);
    try {
      await apiFetch(`/api/stores/${store.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Archivado desde gestión de tiendas' }),
      });
      toast.success(`Tienda "${store.name}" archivada. Datos conservados.`);
      // FIX-AUDIT-2: Invalidate queries to refresh the list without page reload.
      // This preserves React state, avoids the page flash, and keeps TanStack Query cache consistent.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['store-health'] }),
        queryClient.invalidateQueries({ queryKey: ['store-user-counts'] }),
      ]);
    } catch (e: any) {
      toast.error('Error al archivar: ' + e.message);
    } finally {
      setArchivingStoreId(null);
    }
  };

  const handleRestoreStore = async (store: Store) => {
    setArchivingStoreId(store.id);
    try {
      await apiFetch(`/api/stores/${store.id}/restore`, {
        method: 'POST',
      });
      toast.success(`Tienda "${store.name}" restaurada y activa.`);
      // FIX-AUDIT-2: Invalidate queries to refresh the list without page reload.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['store-health'] }),
        queryClient.invalidateQueries({ queryKey: ['store-user-counts'] }),
      ]);
    } catch (e: any) {
      toast.error('Error al restaurar: ' + e.message);
    } finally {
      setArchivingStoreId(null);
    }
  };

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

        {/* B3 + FIX-AUDIT-7: VirtualizedStoreGrid activado para >20 tiendas.
            StoreCard extraído a componente independiente para que el virtualizer
            pueda reutilizarlo via renderItem. Para ≤20 tiendas, el grid simple
            es más eficiente (overhead de virtualización no vale la pena). */}
        {stores.length > 20 ? (
          <VirtualizedStoreGrid
            items={stores}
            rowKey={(s) => s.id}
            columns={3}
            renderItem={(store) => (
              <StoreCard
                store={store}
                isSelected={selectedStoreIds.has(store.id)}
                isAdmin={isAdmin}
                activeStoreId={activeStoreId}
                userActiveStoreId={user?.activeStoreId}
                userCounts={userCounts}
                health={health}
                isTogglingStatus={isTogglingStatus}
                archivingStoreId={archivingStoreId}
                onToggleSelect={toggleSelect}
                onSetActiveStore={handleSetActiveStore}
                onEditStore={handleEditStore}
                onConfigStore={setConfigModalStore}
                onTeamStore={setTeamModalStore}
                onResetStore={handleResetStore}
                onToggleStatus={handleToggleStoreStatus}
                onArchiveStore={handleArchiveStore}
                onRestoreStore={handleRestoreStore}
                onDeleteStore={handleDeleteStore}
              />
            )}
          />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* UX-001: Loading state BEFORE map so it shows while fetching */}
          {isLoading && (
            <div className="col-span-full py-24 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary/40" aria-hidden="true" />
              <p className="text-sm font-black uppercase tracking-widest text-muted-foreground" role="status">{t('loadingStores')}</p>
            </div>
          )}

          {!isLoading && stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              isSelected={selectedStoreIds.has(store.id)}
              isAdmin={isAdmin}
              activeStoreId={activeStoreId}
              userActiveStoreId={user?.activeStoreId}
              userCounts={userCounts}
              health={health}
              isTogglingStatus={isTogglingStatus}
              archivingStoreId={archivingStoreId}
              onToggleSelect={toggleSelect}
              onSetActiveStore={handleSetActiveStore}
              onEditStore={handleEditStore}
              onConfigStore={setConfigModalStore}
              onTeamStore={setTeamModalStore}
              onResetStore={handleResetStore}
              onToggleStatus={handleToggleStoreStatus}
              onArchiveStore={handleArchiveStore}
              onRestoreStore={handleRestoreStore}
              onDeleteStore={handleDeleteStore}
            />
          ))}

          {!isLoading && stores.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-xl bg-muted/10">
               <Building className="w-16 h-16 mx-auto mb-4 opacity-5" />
               <p className="font-black uppercase tracking-widest text-sm text-muted-foreground mb-2">{t('noStores')}</p>
               <p className="text-sm text-muted-foreground/70 font-bold uppercase tracking-wider">{t('noAccessOrNoRecords')}</p>
            </div>
          )}
        </div>
        )}

        {/* F4-T01: Barra de acciones bulk — aparece cuando hay ≥1 tienda seleccionada.
            Permite activar/desactivar/eliminar múltiples tiendas en una sola operación. */}
        {isAdmin && selectedCount > 0 && (
          <div className={cn(
            'sticky z-30 mx-auto max-w-2xl',
            isMobile ? 'bottom-0 pb-[env(safe-area-inset-bottom)]' : 'bottom-4',
          )}>
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-card border-2 border-primary shadow-2xl">
              <span className="text-sm font-black uppercase tracking-widest text-primary pl-2">
                {selectedCount} selec.
              </span>
              <div className="h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => handleBulkAction('activate')}
                disabled={bulkAction.isPending}
                className="min-h-[44px] px-3 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 text-sm font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Activar
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction('deactivate')}
                disabled={bulkAction.isPending}
                className="min-h-[44px] px-3 py-2.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 text-sm font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Pausar
              </button>
              {/* F4-T03: aplicar plantilla FC a múltiples tiendas */}
              <button
                type="button"
                onClick={() => setBulkTemplateOpen(true)}
                disabled={bulkAction.isPending}
                className="min-h-[44px] px-3 py-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-sm font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Aplicar FC
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction('delete')}
                disabled={bulkAction.isPending}
                className="min-h-[44px] px-3 py-2.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground text-sm font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Eliminar
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={selectAll}
                className="px-2 py-1.5 text-sm font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                title={t('selectAllTitle')}
              >
                {t('selectAll')}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label={t('clearSelection')}
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
        title={t('confirmTitleDeactivate')}
        description={t('confirmDescDeactivate')}
        confirmName={storeToToggle?.name || ''}
        confirmNameLabel={t('confirmNameLabel')}
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
        confirmLabel={t('confirmLabelDeactivate')}
        onConfirm={() => { if (storeToToggle) { void executeToggle(storeToToggle); } }}
        isSubmitting={togglePending}
      />
      {/* F2.5-2: DestructiveConfirmModal para Eliminar tienda (reemplaza bloque ad-hoc en StoreModals) */}
      <DestructiveConfirmModal
        key={`delete-${selectedStore?.id ?? 'none'}`}
        isOpen={storeFormMode === 'delete'}
        onClose={handleCloseModal}
        title={t('confirmTitleDelete')}
        description={t('confirmDescDelete')}
        confirmName={selectedStore?.name || ''}
        confirmNameLabel={t('confirmNameLabel')}
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
        confirmLabel={t('confirmLabelDelete')}
        onConfirm={() => handleStoreFormSubmit('delete', {})}
        isSubmitting={isSubmitting}
      />
      {/* F2.5-2: DestructiveConfirmModal para Reiniciar tienda (reemplaza bloque ad-hoc en StoreModals) */}
      <DestructiveConfirmModal
        key={`reset-${selectedStore?.id ?? 'none'}`}
        isOpen={storeFormMode === 'reset'}
        onClose={() => { handleCloseModal(); setResetKeepCatalog(false); }}
        title={t('confirmTitleReset')}
        description={t('confirmDescReset')}
        confirmName={selectedStore?.name || ''}
        confirmNameLabel={t('confirmNameLabel')}
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
        confirmLabel={t('confirmLabelReset')}
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
              <span className="text-sm font-black uppercase tracking-widest text-foreground block">
                {t('keepCatalogTitle')}
              </span>
              <span className="text-sm text-muted-foreground block mt-0.5 leading-relaxed">
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
              ? t('bulkDeleteTitle', { count: bulkConfirm.storeIds.length })
              : t('bulkDeactivateTitle', { count: bulkConfirm.storeIds.length })
          }
          description={
            bulkConfirm.action === 'delete'
              ? t('confirmDescDelete')
              : t('confirmDescDeactivate')
          }
          confirmName="BULK"
          confirmNameLabel={t('bulkConfirmNameLabel')}
          warningText={
            <>
              Vas a {bulkConfirm.action === 'delete' ? 'eliminar' : 'desactivar'}{' '}
              <strong>{bulkConfirm.storeIds.length} tiendas</strong>:
              <div className="mt-2 max-h-32 overflow-y-auto">
                {bulkConfirm.storeNames.map((name, i) => (
                  <div key={i} className="text-sm">• {name}</div>
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
            bulkConfirm.action === 'delete' ? t('bulkConfirmLabelDelete') : t('bulkConfirmLabelDeactivate')
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
