"use client";

import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn, formatCurrency } from "@/lib/utils";
import { Package, Trash2, Edit2 } from "lucide-react";

interface VirtualizedReceptionItemsProps {
  items: Array<{
    local_id: string;
    name: string;
    sku: string;
    quantity: number;
    unit_cost: number;
    unit_of_measure: string;
    is_new: boolean;
    update_price: boolean;
    variant_name: string | null;
    sale_price: number | null;
  }>;
  onEdit: (localId: string) => void;
  onRemove: (localId: string) => void;
  className?: string;
}

/**
 * EM-R3: Virtualización de la lista de items de recepción.
 *
 * Con @tanstack/react-virtual, solo se renderizan los items visibles
 * (+ overscan 5). Permite listas de 500+ items sin lag.
 *
 * Threshold de uso: >20 items. Por debajo, render normal es más rápido.
 */
export function VirtualizedReceptionItems({
  items,
  onEdit,
  onRemove,
  className,
}: VirtualizedReceptionItemsProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Altura estimada por item
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className={cn("overflow-y-auto scrollbar-thin max-h-[500px]", className)}
      style={{ contain: "strict" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={item.local_id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="p-3 border-b border-border/50 flex items-start gap-3"
            >
              {/* Index */}
              <span className="text-xs font-black text-muted-foreground tabular-nums shrink-0 mt-1">
                {virtualRow.index + 1}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                  {item.is_new && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-info/10 text-info border border-info/20 uppercase">
                      Nuevo
                    </span>
                  )}
                  {item.update_price && item.sale_price && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 uppercase">
                      Precio: {formatCurrency(item.sale_price)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  SKU: {item.sku || "--"} · UM: {item.unit_of_measure} · Cant: {item.quantity} · Costo: {formatCurrency(item.unit_cost)}
                  {item.variant_name && <span className="ml-2 text-info font-bold">· Var: {item.variant_name}</span>}
                </p>
              </div>

              {/* Total + Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black text-sm text-primary tabular-nums">
                  {formatCurrency(item.quantity * item.unit_cost)}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(item.local_id)}
                  className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={`Editar ${item.name}`}
                >
                  <Package className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.local_id)}
                  className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-destructive/10 rounded-lg text-destructive/70 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                  aria-label={`Eliminar ${item.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
