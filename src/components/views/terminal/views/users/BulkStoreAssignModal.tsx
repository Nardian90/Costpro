'use client';

import React, { useState, useMemo } from 'react';
import { Store } from '@/types';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Building, Check, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F2-T04: Modal de asignación masiva de tiendas a un usuario.
 *
 * Reemplaza el flujo one-by-one ("Añadir Tienda" repetitivo) por un selector
 * con checkboxes donde el admin marca todas las tiendas a las que el usuario
 * debe tener acceso, en una sola operación.
 *
 * Flujo:
 * 1. Admin hace clic en "Asignar Tiendas" (botón nuevo en UserForm)
 * 2. Se abre este modal con todas las tiendas disponibles
 * 3. Las tiendas ya asignadas aparecen pre-seleccionadas
 * 4. Admin marca/desmarca las tiendas deseadas
 * 5. Al confirmar, el caller recibe la lista de storeIds seleccionados
 *    y actualiza el useFieldArray del UserForm
 *
 * El rol por defecto para nuevas asignaciones es 'clerk' (editable luego
 * en la tabla de memberships del UserForm).
 */
interface BulkStoreAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: Store[];
  selectedStoreIds: string[];
  onConfirm: (selectedStoreIds: string[]) => void;
}

export function BulkStoreAssignModal({
  isOpen,
  onClose,
  stores,
  selectedStoreIds,
  onConfirm,
}: BulkStoreAssignModalProps) {
  const [search, setSearch] = useState('');
  // Estado local de selección — inicializado con las tiendas ya asignadas
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedStoreIds));

  // Reset al abrir/cerrar
  React.useEffect(() => {
    if (isOpen) {
      setSelected(new Set(selectedStoreIds));
      setSearch('');
    }
  }, [isOpen, selectedStoreIds]);

  // Filtrar tiendas por búsqueda
  const filteredStores = useMemo(() => {
    if (!search.trim()) return stores;
    const q = search.toLowerCase().trim();
    return stores.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.slug || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q)
    );
  }, [stores, search]);

  const toggleStore = (storeId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(storeId)) {
        next.delete(storeId);
      } else {
        next.add(storeId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filteredStores.map(s => s.id)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
  };

  const selectedCount = selected.size;
  const newCount = Array.from(selected).filter(id => !selectedStoreIds.includes(id)).length;
  const removedCount = selectedStoreIds.filter(id => !selected.has(id)).length;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      aria-label="Asignar tiendas masivamente"
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <Users className="w-5 h-5" />
          Asignar Tiendas
        </span>
      }
      description={
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
          Selecciona múltiples tiendas en una sola operación
        </span>
      }
      footer={
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 sm:flex-none h-11">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-xs"
          >
            <Check className="w-4 h-4 mr-2" />
            Confirmar {selectedCount} {selectedCount === 1 ? 'tienda' : 'tiendas'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-4">
        {/* Resumen de cambios */}
        {(newCount > 0 || removedCount > 0) && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <div className="flex-1 text-xs">
              {newCount > 0 && (
                <span className="text-success font-bold">+{newCount} nueva{newCount === 1 ? '' : 's'} </span>
              )}
              {removedCount > 0 && (
                <span className="text-destructive font-bold">-{removedCount} a remover </span>
              )}
              <span className="text-muted-foreground">· {selectedCount} total seleccionada{selectedCount === 1 ? '' : 's'}</span>
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tienda por nombre, slug o dirección..."
            aria-label="Buscar tienda"
            className="w-full pl-10 pr-3 py-2.5 h-11 rounded-lg bg-muted/30 border border-border text-sm font-medium outline-none focus:ring-1 focus:ring-primary focus:border-primary/30 transition-all"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Acciones bulk */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold uppercase tracking-widest hover:bg-primary/20 transition-colors"
          >
            Seleccionar todas
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground font-bold uppercase tracking-widest hover:bg-muted/80 transition-colors"
          >
            Limpiar
          </button>
          <span className="ml-auto text-muted-foreground">
            {filteredStores.length} {filteredStores.length === 1 ? 'tienda' : 'tiendas'}
          </span>
        </div>

        {/* Lista de tiendas con checkboxes */}
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {filteredStores.length === 0 ? (
            <div className="py-10 text-center">
              <Building className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                {search ? 'Sin coincidencias' : 'No hay tiendas disponibles'}
              </p>
            </div>
          ) : (
            filteredStores.map(store => {
              const isChecked = selected.has(store.id);
              const wasAssigned = selectedStoreIds.includes(store.id);
              return (
                <label
                  key={store.id}
                  className={cn(
                    "flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/30",
                    isChecked && "bg-primary/5"
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleStore(store.id)}
                    aria-label={`Asignar tienda ${store.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-bold text-sm truncate">{store.name}</span>
                      {wasAssigned && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Actual
                        </span>
                      )}
                    </div>
                    {(store.address || store.slug) && (
                      <p className="text-xs text-muted-foreground truncate ml-5">
                        {store.address || `/${store.slug}`}
                      </p>
                    )}
                  </div>
                  {!store.is_active && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                      Inactiva
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          Las nuevas tiendas asignadas tendrán rol <strong>Cajero (clerk)</strong> por defecto.
          Puedes cambiar el rol individualmente en la tabla de memberships después de confirmar.
        </p>
      </div>
    </BaseModal>
  );
}
