'use client';

/**
 * ReportsActionToolbar — Toolbar de acciones del Generador de Reportes.
 *
 * ════════════════════════════════════════════════════════════════════════
 * Audit-Fix #3: consolidar todos los botones en 1 fila + overflow "..." menu.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Antes: 2 ActionMenu separados (primaryActions + secondaryActions) que creaban
 * 2 filas con espacio muerto entre ellas, y cada ActionMenu tenía su propio
 * card/box con scroll horizontal en mobile.
 *
 * Ahora: 1 sola fila con todos los botones. Los que no caben se agrupan bajo
 * un botón "..." (MoreHorizontal) que abre un dropdown con el resto. Patrón
 * consistente con Shopify admin, Notion, Google Sheets.
 *
 * Comportamiento:
 *  1. El toolbar mide su ancho disponible con ResizeObserver.
 *  2. Muestra los primeros N botones que caben (priorizando primaryActions).
 *  3. Si sobran botones, muestra "..." al final que abre un DropdownMenu.
 *  4. El orden se preserva: primary primero, secondary después.
 *  5. No hay scroll horizontal — todo cabe o va al overflow.
 *
 * Accesibilidad:
 *  - El botón "..." tiene aria-label "Más acciones".
 *  - El dropdown es navegable con teclado (flechas + Enter).
 *  - Cada botón tiene aria-label descriptivo.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CostProLoader } from '@/components/ui/CostProLoader';

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: React.ElementType | ((props: React.SVGProps<SVGSVGElement>) => React.ReactElement);
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'success' | 'danger' | 'warning' | 'default';
  className?: string;
  ariaLabel?: string;
}

interface ReportsActionToolbarProps {
  /** Acciones principales (se muestran primero, siempre que haya espacio). */
  primaryActions: ToolbarAction[];
  /** Acciones secundarias (se muestran después, pueden ir al overflow). */
  secondaryActions: ToolbarAction[];
  className?: string;
}

/** Ancho estimado de cada botón en píxeles (incluye padding + gap). */
const ESTIMATED_BUTTON_WIDTH = 130;
/** Ancho del botón overflow "..." en píxeles. */
const OVERFLOW_BUTTON_WIDTH = 48;
/** Padding del toolbar en píxeles. */
const TOOLBAR_PADDING = 16;

export function ReportsActionToolbar({
  primaryActions,
  secondaryActions,
  className,
}: ReportsActionToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  // Medir el ancho del contenedor con ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const measure = () => setContainerWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Combinar todas las acciones en orden (primary primero)
  const allActions = useMemo(
    () => [...primaryActions, ...secondaryActions],
    [primaryActions, secondaryActions]
  );

  // Calcular cuántos botones caben sin overflow
  const visibleCount = useMemo(() => {
    if (containerWidth === 0) return allActions.length; // SSR o antes de medir — mostrar todos
    const availableWidth = containerWidth - TOOLBAR_PADDING;
    let used = 0;
    let count = 0;

    for (let i = 0; i < allActions.length; i++) {
      const btnWidth = estimateButtonWidth(allActions[i]);
      // Si agregar este botón excede el ancho, y aún quedan más botones,
      // necesitamos el botón overflow. Verificar si cabe + overflow.
      const wouldNeedOverflow = i < allActions.length - 1;
      const needed = wouldNeedOverflow ? btnWidth + OVERFLOW_BUTTON_WIDTH : btnWidth;

      if (used + needed > availableWidth && wouldNeedOverflow) {
        // No cabe este botón + overflow → parar aquí
        break;
      }
      if (used + btnWidth > availableWidth) {
        // No cabe ni siquiera este botón solo → parar
        break;
      }
      used += btnWidth;
      count++;
    }

    // Garantizar al menos 1 botón visible (el primary)
    return Math.max(count, Math.min(1, allActions.length));
  }, [allActions, containerWidth]);

  const visibleActions = allActions.slice(0, visibleCount);
  const overflowActions = allActions.slice(visibleCount);

  return (
    <div
      ref={containerRef}
      className={cn(
        'w-full flex items-center gap-2 p-2 rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-sm',
        className
      )}
      role="toolbar"
      aria-label="Acciones del generador de reportes"
    >
      {visibleActions.map((action) => (
        <ToolbarButton key={action.id} action={action} />
      ))}

      {overflowActions.length > 0 && (
        <DropdownMenu open={isOverflowOpen} onOpenChange={setIsOverflowOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Más acciones"
              title="Más acciones"
              className="shrink-0 inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl border border-border text-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 font-bold uppercase tracking-widest text-xs"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {overflowActions.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.id}
                  onClick={() => {
                    action.onClick();
                    setIsOverflowOpen(false);
                  }}
                  disabled={action.disabled}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer focus:bg-primary/10 focus:text-primary min-h-[44px]"
                >
                  {Icon && typeof Icon !== 'function' && (
                    <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {Icon && typeof Icon === 'function' && (
                    <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {action.label}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Spacer para empujar los botones a la izquierda */}
      <div className="flex-1" />
    </div>
  );
}

/** Botón individual del toolbar. */
function ToolbarButton({ action }: { action: ToolbarAction }) {
  const Icon = action.icon;
  const isLoading = action.label.includes('...') || action.label.includes('Procesando') || action.label.includes('Guardando') || action.label.includes('Preparando');

  const variantClass = getVariantClass(action.variant);

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={action.ariaLabel || action.label}
      title={action.label}
      className={cn(
        'shrink-0 inline-flex items-center justify-center gap-2 h-9 px-3 rounded-xl transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 font-bold uppercase tracking-widest text-xs',
        variantClass,
        action.className,
        action.disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {Icon && !isLoading && <Icon className="w-4 h-4" aria-hidden="true" />}
      {Icon && isLoading && <CostProLoader size={16} showText={false} showSubtext={false} />}
      <span className="whitespace-nowrap">{action.label}</span>
    </button>
  );
}

/** Estima el ancho de un botón basado en su label. */
function estimateButtonWidth(action: ToolbarAction): number {
  // Heurística: ~8px por carácter + padding (24px) + icono (20px)
  const labelWidth = action.label.length * 8 + 24 + 20;
  return Math.max(labelWidth, ESTIMATED_BUTTON_WIDTH);
}

/** Clases CSS por variante. */
function getVariantClass(variant?: string): string {
  switch (variant) {
    case 'primary':
      return 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90';
    case 'success':
      return 'border border-success/20 text-success hover:bg-success/10';
    case 'danger':
      return 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
    case 'warning':
      return 'bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25';
    case 'outline':
      return 'border border-primary/20 text-foreground hover:bg-primary/5';
    default:
      return 'border border-border bg-background text-foreground hover:bg-muted';
  }
}

export default ReportsActionToolbar;
