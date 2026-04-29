'use client';

import React from 'react';
import { Plus, Edit, Trash2, Building, Target, Check, RotateCcw } from 'lucide-react';
import { cn, getStoreLogoUrl } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { useStoresView } from './useStoresView';
import { StoreModals } from './StoreModals';
import { useAuthStore } from '@/store';

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
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase text-[clamp(1.5rem,5vw,2rem)] font-black uppercase tracking-tighter text-primary"> Sucursales </h2>
          <ActionMenu
            actions={[
              { id: 'new', label: 'Nueva Sucursal', icon: Plus, onClick: handleCreateStore, variant: 'primary' }
            ]}
            className="sm:w-auto"
          />
        </div>

        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Filtrar por nombre o ubicación..." />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {stores.map((store) => (
            <div key={store.id} className="p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex flex-col shadow-sm">
              {/* Descripción oculta para screen readers */}
              <span id={`store-desc-${store.id}`} className="sr-only">
                Tienda {store.name}.
                {store.address ? ` Dirección: ${store.address}.` : ' Sin dirección registrada.'}
                Estado: {store.is_active ? 'activa' : 'inactiva'}.
                {store.id === user?.activeStoreId ? ' Esta es tu tienda activa.' : ''}
              </span>

              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                  {store.logo_url && getStoreLogoUrl(store.logo_url) ? (
                    <img src={getStoreLogoUrl(store.logo_url) || ''} alt={store.name} className="w-full h-full object-cover" />
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
              <p className="text-xs font-bold text-muted-foreground leading-relaxed flex-1 mb-6">{store.address || 'Ubicación no especificada'}</p>

              <div className="space-y-2">
                {activeStoreId !== store.id ? (
                  <button
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
                    aria-pressed={true}
                    className="w-full py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-primary font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Tienda Actual
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEditStore(store)}
                    aria-label={`Editar configuración de ${store.name}`}
                    className="py-2 rounded-xl border border-border hover:bg-muted font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Info
                  </button>
                  {isAdmin && (
                    <button
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
          {stores.length === 0 && (
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
