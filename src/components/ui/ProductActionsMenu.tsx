'use client';

/**
 * ProductActionsMenu — Menú contextual ⋮ del producto (REPLANTEAMIENTO UX:
 * fix/ux-inventario-vitrina · docs/ux/auditoria-inventario-vitrina.md)
 *
 * Reemplaza la fila de 5 iconos-toggles que InventoryCardView renderizaba bajo
 * cada tarjeta (ruido visual, doble representación estado/acción, sin agrupación).
 *
 * Clasificación de acciones (criterio UX del módulo especial):
 *   - Acciones de producto:  Editar · Ajustar stock · Ver Kardex
 *   - Configuración de tienda (afecta la vitrina directamente):
 *       Visible en tienda · Precio visible · Stock visible · Promoción
 *
 * Comportamiento:
 *   - Los ítems de configuración mantienen el menú ABIERTO al alternar
 *     (onSelect + preventDefault) para permitir cambiar varios estados seguidos
 *     con feedback en vivo (checkmark + spinner por ítem).
 *   - Los ítems de acción cierran el menú y abren su modal correspondiente.
 *   - Táctil y teclado: Radix DropdownMenu (portal, roving focus, Escape).
 *   - Estados de carga por operación: spinner + disabled en el ítem en vuelo.
 */

import React from 'react';
import type { Product } from '@/types';
import { cn } from '@/lib/utils';
import {
    MoreVertical,
    Edit3,
    PackagePlus,
    BookOpen,
    Eye,
    DollarSign,
    Package,
    Tag,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface ProductActionsMenuProps {
    product: Product;
    onEdit?: (product: Product) => void;
    onAdjust?: (product: Product) => void;
    onViewKardex?: (product: Product) => void;
    onToggleVisible?: (product: Product, visible: boolean) => void;
    isTogglingVisible?: string | null;
    onTogglePriceVisible?: (product: Product) => void;
    isTogglingPriceVisible?: string | null;
    onToggleStockVisible?: (product: Product) => void;
    isTogglingStockVisible?: string | null;
    onTogglePromotion?: (product: Product) => void;
    isTogglingPromotion?: string | null;
    align?: 'start' | 'center' | 'end';
    /** Tamaño del trigger: 'sm' = 36px (desktop, default) · 'lg' = 44px táctil
     * (móvil — §23: el ⋮ debe ser fácil de tocar, sin depender de hover). */
    triggerSize?: 'sm' | 'lg';
}

/** Spinner inline reutilizable para ítems en vuelo (mismo lenguaje visual que
 * los toggles anteriores: border-2 border-current border-t-transparent). */
function ItemSpinner() {
    return <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />;
}

export function ProductActionsMenu({
    product,
    onEdit,
    onAdjust,
    onViewKardex,
    onToggleVisible, isTogglingVisible,
    onTogglePriceVisible, isTogglingPriceVisible,
    onToggleStockVisible, isTogglingStockVisible,
    onTogglePromotion, isTogglingPromotion,
    align = 'end',
    triggerSize = 'sm',
}: ProductActionsMenuProps) {
    const busy =
        isTogglingVisible === product.id ||
        isTogglingPriceVisible === product.id ||
        isTogglingStockVisible === product.id ||
        isTogglingPromotion === product.id;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    disabled={busy}
                    className={cn(
                        'inline-flex items-center justify-center rounded-lg',
                        triggerSize === 'lg' ? 'w-11 h-11' : 'w-9 h-9',
                        'bg-card/90 border border-border text-muted-foreground',
                        'hover:bg-muted hover:text-foreground transition-all active:scale-90',
                        'shadow-sm backdrop-blur-sm',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                        'disabled:opacity-50'
                    )}
                    aria-label={`Más acciones de ${product.name}`}
                    title="Más acciones"
                >
                    {busy ? (
                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <MoreVertical className="w-4 h-4" />
                    )}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align={align} sideOffset={6} className="w-60">
                {/* ── Acciones del producto ── */}
                {onEdit && (
                    <DropdownMenuItem onSelect={() => onEdit(product)} className="gap-2.5 py-2.5 cursor-pointer">
                        <Edit3 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold">Editar producto</span>
                    </DropdownMenuItem>
                )}
                {onAdjust && (
                    <DropdownMenuItem onSelect={() => onAdjust(product)} className="gap-2.5 py-2.5 cursor-pointer">
                        <PackagePlus className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold">Ajustar stock</span>
                    </DropdownMenuItem>
                )}
                {onViewKardex && (
                    <DropdownMenuItem onSelect={() => onViewKardex(product)} className="gap-2.5 py-2.5 cursor-pointer">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold">Ver Kardex</span>
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* ── Configuración de tienda (afecta la vitrina) ──
                    CheckboxItems con preventDefault → el menú permanece abierto
                    y los checkmarks reflejan el estado real tras cada toggle. */}
                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Configuración de tienda
                </DropdownMenuLabel>

                {onToggleVisible && (
                    <DropdownMenuCheckboxItem
                        checked={!!product.visible_en_tienda}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => onToggleVisible(product, !product.visible_en_tienda)}
                        disabled={isTogglingVisible === product.id}
                        className={cn('gap-2.5 py-2.5 cursor-pointer', product.visible_en_tienda && 'text-foreground')}
                    >
                        <Eye className={cn('w-4 h-4 shrink-0', product.visible_en_tienda ? 'text-success' : 'text-muted-foreground/50')} />
                        <span className="font-semibold flex-1">Visible en tienda</span>
                        {isTogglingVisible === product.id && <ItemSpinner />}
                    </DropdownMenuCheckboxItem>
                )}

                {onTogglePriceVisible && (
                    <DropdownMenuCheckboxItem
                        checked={!!product.price_visible}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => onTogglePriceVisible(product)}
                        disabled={isTogglingPriceVisible === product.id}
                        className="gap-2.5 py-2.5 cursor-pointer"
                    >
                        <DollarSign className={cn('w-4 h-4 shrink-0', product.price_visible ? 'text-success' : 'text-muted-foreground/50')} />
                        <span className="font-semibold flex-1">Precio visible</span>
                        {isTogglingPriceVisible === product.id && <ItemSpinner />}
                    </DropdownMenuCheckboxItem>
                )}

                {onToggleStockVisible && (
                    <DropdownMenuCheckboxItem
                        checked={!!product.stock_visible}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => onToggleStockVisible(product)}
                        disabled={isTogglingStockVisible === product.id}
                        className="gap-2.5 py-2.5 cursor-pointer"
                    >
                        <Package className={cn('w-4 h-4 shrink-0', product.stock_visible ? 'text-success' : 'text-muted-foreground/50')} />
                        <span className="font-semibold flex-1">Stock visible</span>
                        {isTogglingStockVisible === product.id && <ItemSpinner />}
                    </DropdownMenuCheckboxItem>
                )}

                {onTogglePromotion && (
                    <DropdownMenuCheckboxItem
                        checked={!!product.on_promotion}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => onTogglePromotion(product)}
                        disabled={isTogglingPromotion === product.id}
                        className="gap-2.5 py-2.5 cursor-pointer"
                    >
                        <Tag className={cn('w-4 h-4 shrink-0', product.on_promotion ? 'text-warning' : 'text-muted-foreground/50')} />
                        <span className="font-semibold flex-1">En promoción</span>
                        {isTogglingPromotion === product.id && <ItemSpinner />}
                    </DropdownMenuCheckboxItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default ProductActionsMenu;
