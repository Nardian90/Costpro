"use client";

import React, { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ProductCard } from "@/components/ui/atomic";
import { Product } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface VirtualizedProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  /** Número de columnas según breakpoint. Default: 4. */
  columns?: number;
  /** Altura estimada de cada fila en px (para sizing del virtualizador). */
  rowHeight?: number;
  /** Gap entre filas en px. */
  rowGap?: number;
  /** Clase CSS adicional para el contenedor scrollable. */
  className?: string;
}

/**
 * POS-3b EM-3: Virtualización del grid de productos con @tanstack/react-virtual.
 *
 * Problema previo: con >2000 productos, el grid renderizaba TODOS los nodos DOM
 * al mismo tiempo, causando lag en scroll y paint.
 *
 * Solución: solo se renderizan las filas visibles (+ un overscan de 3 filas).
 * El scroll se ve nativo porque el virtualizador mantiene la altura total del
 * contenedor igual a la suma de todas las filas.
 *
 * Estrategia: agrupar productos en filas de N columnas. Cada "row virtual"
 * contiene `columns` productos. Así el virtualizador maneja filas, no items
 * individuales (más eficiente y respeta el layout CSS Grid).
 */
export function VirtualizedProductGrid({
  products,
  onAddToCart,
  columns = 4,
  rowHeight = 240,
  rowGap = 24,
  className,
}: VirtualizedProductGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Agrupar productos en filas de `columns` items
  const rows = useMemo(() => {
    const result: Product[][] = [];
    for (let i = 0; i < products.length; i += columns) {
      result.push(products.slice(i, i + columns));
    }
    return result;
  }, [products, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + rowGap,
    overscan: 3,
  });

  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto scrollbar-thin ${className ?? ""}`}
      style={{ contain: "strict" }}
      aria-label="Grid virtualizado de productos"
    >
      <div
        style={{
          height: `${totalHeight}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className={`grid gap-4 sm:gap-6 pb-6`}
              // CSS Grid con número dinámico de columnas
              // Mismo patrón que el grid no-virtualizado para mantener layout.
              data-columns={columns}
            >
              {row.map((product) => (
                <div
                  key={product.id}
                  role="option"
                  aria-selected={false}
                  aria-label={`${product.name} — ${formatCurrency(product.price)}`}
                  className={
                    // Clases responsivas para columnas
                    columns === 4
                      ? "w-full"
                      : "w-full"
                  }
                >
                  <ProductCard product={product} onClick={onAddToCart} variant="pos" />
                </div>
              ))}
              {/* Rellenar espacios vacíos si la última fila no está completa */}
              {row.length < columns &&
                Array.from({ length: columns - row.length }).map((_, i) => (
                  <div key={`empty-${i}`} aria-hidden="true" className="w-full" />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hook helper para detectar columnas según viewport.
 * Útil si quieres que el grid virtualizado sea responsivo.
 */
export function useGridColumnCount() {
  const [count, setCount] = React.useState(4);
  React.useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setCount(1);      // sm
      else if (w < 768) setCount(2); // md
      else if (w < 1280) setCount(3);// xl
      else setCount(4);              // 2xl+
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}

/**
 * Wrapper que combina VirtualizedProductGrid + useGridColumnCount.
 * Se usa desde POSView para no tener que manejar el estado responsive ahí.
 */
export function VirtualizedProductGridWithResponsive({
  products,
  onAddToCart,
}: {
  products: Product[];
  onAddToCart: (p: Product) => void;
}) {
  const columns = useGridColumnCount();
  return (
    <VirtualizedProductGrid
      products={products}
      onAddToCart={onAddToCart}
      columns={columns}
      rowHeight={240}
      rowGap={24}
      className="h-[calc(100vh-300px)] min-h-[400px]"
    />
  );
}
