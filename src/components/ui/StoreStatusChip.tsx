'use client';

/**
 * StoreStatusChip — chip informativo del estado de vitrina de un producto.
 *
 * REPRESENTACIÓN ÚNICA del estado (§6 del módulo UX/UI): los chips son solo
 * informativos; la alternación vive en el menú ⋮ (ProductActionsMenu) y en
 * Catálogo. Prohibido representar el mismo estado de varias formas a la vez.
 *
 * Compartido por:
 *   - InventoryCardView (tarjetas STOCK ACTUAL, desktop)
 *   - InventoryMobileTable (filas compactas, móvil — §24: "● Visible / ● Precio")
 */

import { cn } from '@/lib/utils';

export function StoreStatusChip({ on, label, hiddenLabel, tone = 'success', size = 'default' }: {
    on: boolean;
    label: string;
    /** Etiqueta cuando el estado está desactivado (p. ej. "Oculto"). */
    hiddenLabel?: string;
    tone?: 'success' | 'warning';
    /** 'default' = tarjetas desktop · 'compact' = filas móvil (§24) */
    size?: 'default' | 'compact';
}) {
    const activeTone = tone === 'warning'
        ? 'bg-warning/10 text-warning border-warning/20'
        : 'bg-success/10 text-success border-success/20';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border font-black uppercase tracking-widest whitespace-nowrap',
                size === 'compact'
                    ? 'px-1.5 py-0 text-[8px]'
                    : 'px-2 py-0.5 text-[10px]',
                on ? activeTone : 'bg-muted/60 text-muted-foreground/70 border-border'
            )}
            title={on ? `${label}: activado` : `${hiddenLabel || label}: desactivado`}
        >
            <span className={cn(
                'rounded-full shrink-0',
                size === 'compact' ? 'w-1 h-1' : 'w-1.5 h-1.5',
                on ? (tone === 'warning' ? 'bg-warning' : 'bg-success') : 'bg-muted-foreground/40'
            )} />
            {on ? label : (hiddenLabel || label)}
        </span>
    );
}

export default StoreStatusChip;
