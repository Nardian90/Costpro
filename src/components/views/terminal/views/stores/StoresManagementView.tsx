'use client';

import React from 'react';
import Image from 'next/image';
import { Plus, Edit, Trash2, Building, Target, Check, RotateCcw, Loader2, Copy, ExternalLink } from 'lucide-react';
import { cn, getStoreLogoUrl } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { useStoresView } from './useStoresView';
import { StoreModals } from './StoreModals';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

export default function StoresManagementView() {
  const { user } = useAuthStore();
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
    handleCloseModal,
    handleStoreFormSubmit
  } = useStoresView();

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h2 className="text-[clamp(1.5rem,5vw,2rem)] font-black tracking-tighter uppercase text-primary">
            Sucursales
          </h2>
          <ActionMenu
            actions={[
              { id: 'new', label: 'Nueva Sucursal', icon: Plus, onClick: handleCreateStore, variant: 'primary' }
            ]}
            className="sm:w-auto"
          />
        </div>

        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Filtrar por nombre o ubicación..." aria-label="Buscar sucursales por nombre o ubicación" />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* UX-001: Loading state BEFORE map so it shows while fetching */}
          {isLoading && (
            <div className="col-span-full py-24 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary/40" aria-hidden="true" />
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground" role="status">Cargando sucursales...</p>
            </div>
          )}

          {!isLoading && stores.map((store) => (
            <div key={store.id} role="article" aria-label={`Tienda ${store.name}`} className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex flex-col shadow-sm">
              {/* Descripción oculta para screen readers */}
              <span id={`store-desc-${store.id}`} className="sr-only">
                Tienda {store.name}.
                {store.address ? ` Dirección: ${store.address}.` : ' Sin dirección registrada.'}
                {store.reeup ? ` Código REEUP: ${store.reeup}.` : ''}
                Estado: {store.is_active ? 'activa' : 'inactiva'}.
                {store.id === user?.activeStoreId ? ' Esta es tu tienda activa.' : ''}
              </span>

              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                  {store.logo_url && getStoreLogoUrl(store.logo_url) ? (
                    <Image src={getStoreLogoUrl(store.logo_url) || ''} alt={`Logo de ${store.name}`} width={56} height={56} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <Building className="w-6 h-6 text-muted-foreground opacity-40" />
                  )}
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded text-xs font-black uppercase tracking-widest",
                  store.is_active ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'
                )}>
                  {store.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              <h3 className="font-black text-lg uppercase tracking-tight mb-1">{store.name}</h3>
              <p className="text-xs font-bold text-muted-foreground leading-relaxed mb-1">{store.address || 'Ubicación no especificada'}</p>

              {/* Public Storefront Link + Visit Button */}
              {store.slug && (() => {
                const cleanSlug = store.slug.toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                return (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-0.5">Link Público</p>
                    <p className="text-[10px] font-mono text-foreground truncate" title={`${window.location.origin}/tienda/${cleanSlug}`}>
                      {window.location.origin}/tienda/{cleanSlug}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const fullUrl = `${window.location.origin}/tienda/${cleanSlug}`;
                      navigator.clipboard.writeText(fullUrl).then(() => {
                        toast.success('Link copiado: ' + fullUrl);
                      }).catch(() => {
                        toast.error('No se pudo copiar. Selecciona y copia manualmente.');
                      });
                    }}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-primary"
                    aria-label={`Copiar link público de ${store.name}`}
                    title="Copiar link completo"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={`/tienda/${cleanSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center"
                    aria-label={`Visitar tienda pública de ${store.name}`}
                    title="Visitar tienda pública"
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
                      Tel: {store.phone}
                    </p>
                  )}
                  {store.email && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      {store.email}
                    </p>
                  )}
                  {store.reeup && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      REEUP: {store.reeup}
                    </p>
                  )}
                  {store.bank_account && (
                    <p className="text-[10px] font-bold text-muted-foreground/60 tracking-wider">
                      Cta. Bancaria: {store.bank_account}
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
                    aria-label={`Activar ${store.name} como tienda de trabajo`}
                    aria-pressed={false}
                    aria-describedby={`store-desc-${store.id}`}
                    className="w-full py-2.5 rounded-xl bg-primary text-foreground font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Target className="w-3.5 h-3.5" />
                    Seleccionar Tienda
                  </button>
                ) : (
                  <div
                    role="status"
                    aria-label={`Tienda actual: ${store.name}`}
                    aria-current="true"
                    className="w-full py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-primary font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Tienda Actual
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditStore(store)}
                    aria-label={`Editar configuración de ${store.name}`}
                    className="py-2 rounded-xl border border-border hover:bg-muted font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Info
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleResetStore(store)}
                      aria-label={`Reiniciar todos los datos de ${store.name}`}
                      className="py-2 rounded-xl border border-border hover:bg-orange-500/10 hover:text-orange-500 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reiniciar
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStore(store)}
                      aria-label={`Eliminar tienda ${store.name}`}
                      aria-describedby={`store-desc-${store.id}`}
                      className="col-span-2 py-2 rounded-xl border border-border hover:bg-destructive/10 hover:text-destructive font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Borrar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!isLoading && stores.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-border rounded-xl bg-muted/10">
               <Building className="w-16 h-16 mx-auto mb-4 opacity-5" />
               <p className="font-black uppercase tracking-widest text-xs text-muted-foreground mb-2">No se encontraron sucursales</p>
               <p className="text-xs text-muted-foreground/50 font-bold uppercase tracking-wider">No tienes acceso a entidades en este contexto o no existen registros.</p>
            </div>
          )}
        </div>
      </div>
      <StoreModals
        mode={storeFormMode}
        isOpen={!!storeFormMode}
        onClose={handleCloseModal}
        onSubmit={handleStoreFormSubmit}
        selectedStore={selectedStore}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
