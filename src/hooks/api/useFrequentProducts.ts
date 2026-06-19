"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Product } from "@/types";

/**
 * POS-2 MM-5: Hook para obtener los productos más vendidos del turno actual.
 *
 * Estrategia (sin RPC dedicada):
 * 1. Si hay un turno activo (cash_closure pendiente), usar su `created_at` como
 *    lower bound temporal.
 * 2. Si no hay turno, usar últimas 24h.
 * 3. Consultar `transaction_items` join `transactions` (filtrado por store_id,
 *    status != 'voided', created_at >= lower bound), agrupar por product_id
 *    sumando quantity, ordenar desc, limit 12.
 * 4. Hydrate con datos de `products` (vía get_products_for_pos cache) para
 *    mantener stock_current actualizado.
 *
 * Refresca cada 60s.
 */
export interface FrequentProduct {
  product: Product;
  timesSold: number;
  totalQuantity: number;
}

export function useFrequentProducts(
  storeId?: string | null,
  shiftOpenedAt?: string | null,
  allProducts?: Product[],
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const lowerBound = shiftOpenedAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return useQuery<FrequentProduct[]>({
    queryKey: ["frequent-products", storeId, lowerBound],
    queryFn: async () => {
      if (!storeId) return [];

      // Traer transacciones del turno actual (no voided)
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("id")
        .eq("store_id", storeId)
        .neq("status", "voided")
        .gte("created_at", lowerBound);

      if (txError) throw txError;
      if (!txData || txData.length === 0) return [];

      const txIds = txData.map((t) => t.id);

      // Traer todos los transaction_items de esas ventas
      const { data: itemsData, error: itemsError } = await supabase
        .from("transaction_items")
        .select("product_id, quantity")
        .in("transaction_id", txIds);

      if (itemsError) throw itemsError;
      if (!itemsData || itemsData.length === 0) return [];

      // Agregar por product_id
      const agg = new Map<string, { timesSold: number; totalQuantity: number }>();
      for (const item of itemsData) {
        const pid = item.product_id as string;
        const qty = (item.quantity as number) || 0;
        const current = agg.get(pid) || { timesSold: 0, totalQuantity: 0 };
        current.timesSold += 1;
        current.totalQuantity += qty;
        agg.set(pid, current);
      }

      // Top 12 por totalQuantity
      const top = Array.from(agg.entries())
        .sort((a, b) => b[1].totalQuantity - a[1].totalQuantity)
        .slice(0, 12);

      if (top.length === 0) return [];

      // Hydrate con datos de products
      const topProductIds = top.map(([pid]) => pid);
      let productsById = new Map<string, Product>();
      if (allProducts && allProducts.length > 0) {
        for (const p of allProducts) productsById.set(p.id, p);
      } else {
        // Fallback: fetch directo
        const { data: prodData, error: prodError } = await supabase
          .from("products")
          .select("*")
          .in("id", topProductIds);
        if (prodError) throw prodError;
        if (prodData) {
          for (const p of prodData as unknown as Product[]) productsById.set(p.id, p);
        }
      }

      return top
        .map(([pid, stats]) => {
          const product = productsById.get(pid);
          if (!product) return null;
          return {
            product,
            timesSold: stats.timesSold,
            totalQuantity: stats.totalQuantity,
          };
        })
        .filter((x): x is FrequentProduct => x !== null);
    },
    enabled: !!storeId && enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
