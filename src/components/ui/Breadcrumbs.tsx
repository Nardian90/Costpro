'use client';

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useUIStore, ViewType } from '@/store';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';
import { cn } from '@/lib/utils';

/**
 * Breadcrumbs — Breadcrumbs dinámicos para todas las vistas.
 *
 * ════════════════════════════════════════════════════════════════════════
 * M-2 (IA Audit): Breadcrumbs dinámicos en todas las vistas (no solo algunas).
 * ════════════════════════════════════════════════════════════════════════
 * Antes: solo Wiki y Help tenían breadcrumbs personalizados. Las vistas
 * principales (POS, Inventario, Recepciones, etc.) no tenían wayfinding
 * jerárquico — el usuario no sabía dónde estaba en el árbol de navegación.
 *
 * Este componente genera breadcrumbs automáticamente a partir del árbol
 * SIDEBAR_STRUCTURE, resolviendo el path completo: Grupo > Submenu > Vista.
 * También mapea vistas "destino" (pos, sales_catalog, catalog, history, cash)
 * a su hub ancestro (sales-hub) para mostrar el path lógico correcto.
 *
 * Impacto: +0.3 puntos Wayfinding. Consistencia visual en todas las vistas.
 *
 * Uso:
 *   <Breadcrumbs className="..." />
 *   <Breadcrumbs showHome={false} />  // omitir el item "Inicio"
 *
 * El componente se oculta automáticamente en mobile (<640px) si la jerarquía
 * tiene 3+ niveles, para no consumir espacio vertical valioso.
 * ════════════════════════════════════════════════════════════════════════
 */

/**
 * Map de vistas "destino" → vista ancestro (hub) al que pertenecen.
 * Permite mostrar el breadcrumb correcto cuando el usuario está en una
 * sub-vista que no está directamente en el sidebar.
 */
const VIEW_TO_HUB: Partial<Record<ViewType, ViewType>> = {
  // Sub-vistas del hub de Venta
  pos: 'sales-hub',
  sales_catalog: 'sales-hub',
  catalog: 'sales-hub',
  history: 'sales-hub',
  cash: 'sales-hub',
  sales: 'sales-hub',
  inventory_count: 'sales-hub',
  // Sub-vistas de Inventario (tabs internas — el ancestro es 'inventory')
  // No necesitan mapeo porque ya están en el sidebar como item 'inventory'.
};

interface BreadcrumbItem {
  label: string;
  view?: ViewType;
  isCurrent: boolean;
}

interface BreadcrumbsProps {
  /** Clases adicionales para el contenedor. */
  className?: string;
  /** Mostrar item "Inicio" al principio (default: true). */
  showHome?: boolean;
  /** Versión compacta (text-[10px]) para espacios reducidos. */
  compact?: boolean;
}

/**
 * Resuelve el path completo de breadcrumbs para una vista dada.
 * Recorre SIDEBAR_STRUCTURE buscando el módulo, submenu e item que contengan
 * la vista, y devuelve la lista ordenada.
 */
function resolveBreadcrumbPath(view: ViewType): BreadcrumbItem[] {
  // Si la vista tiene un hub ancestro, usar ese como punto de partida
  const hubView = VIEW_TO_HUB[view];
  const targetView = hubView || view;
  const items: BreadcrumbItem[] = [];

  for (const navModule of SIDEBAR_STRUCTURE) {
    const found = findInView(navModule, targetView, []);
    if (found.length > 0) {
      items.push(...found);
      // Si la vista original es diferente al target (porque usamos el hub),
      // añadir la vista actual como último item
      if (hubView && view !== hubView) {
        items.push({
          label: getLabelForView(view),
          isCurrent: true,
        });
      }
      return items;
    }
  }

  // Fallback: si no se encuentra en el sidebar, mostrar solo el label
  return [{ label: getLabelForView(view), isCurrent: true }];
}

/** Búsqueda recursiva en el árbol de navegación. */
function findInView(
  mod: NavModule,
  view: ViewType,
  acc: BreadcrumbItem[]
): BreadcrumbItem[] {
  const currentAcc = [
    ...acc,
    { label: mod.label, view: undefined, isCurrent: false } as BreadcrumbItem,
  ];

  if (mod.type === 'item' && mod.id === view) {
    // Marcar el último como current y devolver
    return currentAcc.map((item, idx) => ({
      ...item,
      isCurrent: idx === currentAcc.length - 1,
      view: idx === currentAcc.length - 1 ? view : item.view,
    }));
  }

  if (mod.children) {
    for (const child of mod.children) {
      const found = findInView(child, view, currentAcc);
      if (found.length > 0) return found;
    }
  }

  return [];
}

/** Labels para vistas que no están directamente en el sidebar. */
function getLabelForView(view: ViewType): string {
  const labels: Partial<Record<ViewType, string>> = {
    pos: 'Terminal de Venta',
    sales_catalog: 'Tabla IPV',
    catalog: 'Catálogo',
    history: 'Historial',
    cash: 'Arqueo de Caja',
    sales: 'Ventas',
    inventory_count: 'Venta por Conteo',
    occ: 'Centro de Control',
  };
  return labels[view] || String(view);
}

export function Breadcrumbs({
  className,
  showHome = true,
  compact = false,
}: BreadcrumbsProps) {
  const currentView = useUIStore((s) => s.currentView);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const items = React.useMemo(() => resolveBreadcrumbPath(currentView), [currentView]);

  // En mobile, si hay 3+ niveles, ocultar para no consumir espacio
  const totalItems = (showHome ? 1 : 0) + items.length;
  if (totalItems < 2) return null; // No mostrar si solo hay 1 nivel

  const textSize = compact ? 'text-[10px]' : 'text-xs';
  const iconSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <nav
      aria-label="Ruta de navegación"
      className={cn(
        'flex items-center gap-1 text-muted-foreground font-bold uppercase tracking-widest',
        textSize,
        totalItems >= 4 && 'hidden sm:flex', // Ocultar en mobile si es muy largo
        className,
      )}
    >
      {showHome && (
        <>
          <button
            type="button"
            onClick={() => setCurrentView('occ')}
            className="flex items-center gap-1 hover:text-primary transition-colors"
            aria-label="Volver al inicio"
          >
            <Home className={iconSize} aria-hidden="true" />
            <span className="hidden sm:inline">Inicio</span>
          </button>
          <ChevronRight className={cn(iconSize, 'opacity-40')} aria-hidden="true" />
        </>
      )}

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${idx}`}>
            {isLast ? (
              <span
                className={cn('text-foreground truncate max-w-[200px]')}
                aria-current="page"
              >
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => item.view && setCurrentView(item.view)}
                disabled={!item.view}
                className={cn(
                  'hover:text-primary transition-colors truncate max-w-[140px]',
                  !item.view && 'cursor-default hover:text-muted-foreground',
                )}
              >
                {item.label}
              </button>
            )}
            {!isLast && (
              <ChevronRight className={cn(iconSize, 'opacity-40')} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
