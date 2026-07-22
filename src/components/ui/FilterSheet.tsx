'use client';

/**
 * FilterSheet — Abanico de filtros colapsable para móvil.
 *
 * PROBLEMA que resuelve:
 *   CatalogHeader, POSView, WorkersView y otras vistas muestran todos los
 *   filtros simultáneamente en un flex-wrap → en móvil se ven 5-6 filas
 *   de botones antes del primer producto. El usuario reportó:
 *   "conglomerando muchos botones".
 *
 * SOLUCIÓN (patrón estándar internacional — Slack, Linear, Notion):
 *   En móvil (<768px), los filtros se agrupan en un bottom sheet que se
 *   abre al tap "Filtros". Dentro del sheet, los filtros se organizan
 *   por tipo en secciones claramente separadas:
 *     - Stock status (chips)
 *     - Categorías (chips)
 *     - Estado (select)
 *     - Acciones bulk (botones)
 *
 *   En desktop (≥768px), los filtros se muestran inline como antes
 *   (no hay cambio en desktop).
 *
 * PROPS:
 *   - filterCount: número de filtros activos (para badge)
 *   - children: contenido del sheet (secciones de filtros)
 *   - onClear: callback para limpiar todos los filtros
 *
 * Uso:
 *   <FilterSheet filterCount={3} onClear={handleClear}>
 *     <FilterSection title="Stock">
 *       <FilterChip ... />
 *     </FilterSection>
 *   </FilterSheet>
 */

import React, { useState } from 'react';
import { Filter, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/ui/useMobile';

interface FilterSheetProps {
  filterCount?: number;
  onClear?: () => void;
  children: React.ReactNode;
  /** En desktop, mostrar los children inline en vez de en el sheet */
  desktopInline?: boolean;
}

export function FilterSheet({ filterCount = 0, onClear, children, desktopInline = true }: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  // En desktop, mostrar inline (sin sheet)
  if (!isMobile && desktopInline) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Botón "Filtros" con badge de count */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border text-xs font-black uppercase tracking-widest transition-all active:scale-95',
          filterCount > 0
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
        )}
        aria-label={`Abrir filtros${filterCount > 0 ? ` (${filterCount} activos)` : ''}`}
      >
        <Filter className="w-4 h-4" />
        <span>Filtros</span>
        {filterCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black">
            {filterCount}
          </span>
        )}
      </button>

      {/* Bottom Sheet con los filtros organizados */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[70vh] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/30 shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Filtros
                {filterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black">
                    {filterCount}
                  </span>
                )}
              </SheetTitle>
              <div className="flex items-center gap-2">
                {onClear && filterCount > 0 && (
                  <button
                    type="button"
                    onClick={onClear}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-[10px] font-bold uppercase text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Cerrar filtros"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          {/* Contenido scrolleable */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            {children}
          </div>

          {/* Footer con botón "Aplicar" */}
          <div className="shrink-0 px-4 py-3 border-t border-border/30 bg-card" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full h-11 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all"
            >
              Ver resultados
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * FilterSection — Sección dentro del FilterSheet.
 * Agrupa filtros del mismo tipo con un título.
 */
interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function FilterSection({ title, children, className }: FilterSectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

/**
 * FilterChip — Chip individual dentro de una FilterSection.
 * Touch target ≥44px.
 */
interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

export function FilterChip({ label, active, onClick, icon }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold uppercase border transition-all active:scale-95',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}
