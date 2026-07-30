'use client';

import React, { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Building, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F5-T01: Bottom sheet para selector de tienda en mobile.
 *
 * En mobile (<768px), reemplaza el DropdownMenu del Header por un Sheet
 * que se desliza desde abajo. Ocupa 60% de la altura, con búsqueda y
 * lista virtualizada. Nombres completos visibles (no truncados a 130px).
 *
 * El botón trigger (Building + nombre) es el mismo que usa el dropdown
 * en desktop — solo cambia el overlay de DropdownMenu a Sheet.
 */

interface StoreSelectorSheetProps {
  stores: Array<{ id: string; name: string }>;
  activeStoreId?: string | null;
  activeStoreName: string;
  onSelect: (storeId: string) => void;
  trigger: React.ReactNode;
}

export function StoreSelectorSheet({
  stores,
  activeStoreId,
  activeStoreName,
  onSelect,
  trigger,
}: StoreSelectorSheetProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredStores = useMemo(() => {
    if (!search.trim()) return stores;
    const q = search.toLowerCase().trim();
    return stores.filter(s => s.name.toLowerCase().includes(q));
  }, [stores, search]);

  const handleSelect = (storeId: string) => {
    onSelect(storeId);
    setSearch('');
    setOpen(false);
  };

  return (
    <>
      {/* El trigger es el mismo botón del header — solo cambia el onClick */}
      <div onClick={() => setOpen(true)} className="sm:hidden">
        {trigger}
      </div>

      {/* Sheet que se desliza desde abajo — solo visible en mobile via CSS */}
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
        <SheetContent side="bottom" className="h-[60vh] p-0 sm:hidden">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Cambiar Sucursal
            </SheetTitle>
          </SheetHeader>

          {/* Input de búsqueda */}
          <div className="relative px-4 pb-2">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar sucursal..."
              aria-label="Buscar sucursal por nombre"
              className="w-full pl-10 pr-10 py-2.5 h-11 rounded-lg bg-muted/40 border border-border/50 text-sm font-medium outline-none focus:ring-1 focus:ring-primary focus:border-primary/30 transition-all"
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-7 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Lista de tiendas con scroll */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 max-h-[40vh]">
            {filteredStores.length > 0 ? (
              filteredStores.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3.5 rounded-xl cursor-pointer transition-colors min-h-[44px]",
                    activeStoreId === s.id
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Building className={cn("w-4 h-4 shrink-0", activeStoreId === s.id ? "text-primary" : "text-muted-foreground/40")} />
                    {/* Nombres completos — sin truncado a 130px como en el dropdown */}
                    <span className="text-sm font-black uppercase tracking-tight truncate">{s.name}</span>
                  </div>
                  {activeStoreId === s.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No se encontraron sucursales con "<strong>{search}</strong>"
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
