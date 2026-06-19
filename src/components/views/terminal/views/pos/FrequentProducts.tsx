"use client";

import React from "react";
import { Flame } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import type { Product } from "@/types";
import { useFrequentProducts, type FrequentProduct } from "@/hooks/api/useFrequentProducts";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useAuthStore } from "@/store";
import ProductImage from "@/components/ui/ProductImage";

interface FrequentProductsProps {
  /** Lista completa de productos (para hydrate sin round-trip extra) */
  products: Product[];
  /** Al hacer clic en un frecuente, ejecuta onAddToCart (igual que el grid normal) */
  onAddToCart: (product: Product) => void;
  className?: string;
}

/**
 * POS-2 MM-5: Sección "Productos Frecuentes".
 *
 * Muestra hasta 12 chips con los productos más vendidos del turno actual.
 * Al hacer clic, agrega al carrito igual que el grid normal.
 *
 * Si el turno no tiene ventas aún, no se renderiza (no tiene sentido mostrar
 * "frecuentes" de un turno vacío).
 */
export function FrequentProducts({ products, onAddToCart, className }: FrequentProductsProps) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const { data: activeShift } = useActiveShift(storeId);
  const { data: frequent, isLoading } = useFrequentProducts(
    storeId,
    activeShift?.created_at,
    products,
    { enabled: !!activeShift },
  );

  if (!activeShift) return null; // Sin turno → no mostrar
  if (!isLoading && (!frequent || frequent.length === 0)) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Frecuentes del turno
        </h3>
        <span className="text-[10px] font-bold text-muted-foreground/70">
          {frequent?.length ?? 0}
        </span>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin"
        role="list"
        aria-label="Productos frecuentes del turno"
      >
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 w-28 h-20 rounded-xl bg-muted/50 animate-pulse border border-border/50"
              />
            ))
          : frequent?.map((fp: FrequentProduct, idx: number) => (
              <motion.button
                key={fp.product.id}
                type="button"
                role="listitem"
                onClick={() => onAddToCart(fp.product)}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                className={cn(
                  "shrink-0 w-28 sm:w-32 rounded-xl border-2 border-border/50 bg-card hover:border-primary hover:bg-primary/5 transition-all p-2 text-left group focus:outline-none focus:ring-2 focus:ring-primary/30",
                  (fp.product.stock_current ?? 0) <= 0 && "opacity-50",
                )}
                title={`${fp.product.name} — vendido ${fp.timesSold}× (${fp.totalQuantity} unidades) en este turno`}
                aria-label={`Agregar ${fp.product.name} al carrito. Vendido ${fp.timesSold} veces en este turno.`}
              >
                <div className="flex items-start gap-1.5">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                    <ProductImage
                      src={fp.product.image_url || undefined}
                      name={fp.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-foreground line-clamp-2 leading-tight">
                      {fp.product.name}
                    </p>
                    <p className="text-[10px] font-bold text-primary tabular-nums mt-0.5">
                      {formatCurrency(fp.product.price || 0)}
                    </p>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <Flame className="w-2.5 h-2.5 text-primary/70" aria-hidden="true" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                    {fp.timesSold}× / {fp.totalQuantity}u
                  </span>
                </div>
              </motion.button>
            ))}
      </div>
    </div>
  );
}
