import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { getCleanStoreId } from "./base";
import { uuidRegex } from "@/validation/schemas";
import type { Product } from "@/types";

interface ReceptionCatalogPage {
  products: Product[];
  total: number;
  nextPage: number | null;
}

/**
 * CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§2.1/§4):
 * Búsqueda de productos del flujo de RECEPCIÓN (modal «Agregar Producto» de la
 * recepción manual) sobre la RPC `get_products_for_reception`.
 *
 * Por qué NO `useInventory`/`get_paginated_products`: esa RPC la comparten 9
 * módulos (Inventario, Transferencias, Hoja de Costo, reportes, tienda
 * pública...). La búsqueda de recepción tiene un requisito propio: una tienda
 * CONECTADA al Catálogo Maestro debe ver también los MAESTROS de la
 * organización sin fila local (source='master') — la misma unión que
 * `get_paginated_products_v2` aplica al Catálogo desde CATALOG-MASTER-002
 * (causa raíz verificada: FERROCARRIL/SHADDAI veían 0 productos en la
 * recepción manual y Express).
 *
 * Devuelve la MISMA forma que `useInventory` (pages[].products / pages[].total
 * / nextOffset→nextPage) para que `useReceptionState` intercambie el hook sin
 * tocar su lógica de paginación.
 */
export function useReceptionCatalogSearch(
  storeId?: string | null,
  searchTerm = "",
  limit = 60,
) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useInfiniteQuery({
    queryKey: ["reception-catalog", cleanStoreId, searchTerm, limit],
    queryFn: async ({ pageParam = 1 }): Promise<ReceptionCatalogPage> => {
      if (!cleanStoreId || !uuidRegex.test(cleanStoreId)) {
        return { products: [], total: 0, nextPage: null };
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_products_for_reception",
        {
          p_store_id: cleanStoreId,
          p_search_term: searchTerm,
          p_page: pageParam as number,
          p_page_size: limit,
        },
      );

      if (rpcError) throw rpcError;
      const rows = (rpcData || []) as any[];
      const total = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;

      const products: Product[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku || "",
        barcode: row.barcode || "",
        cost_price: Number(row.cost_price) || 0,
        price: Number(row.price) || 0,
        unit_of_measure: row.unit_of_measure || "unidad",
        stock_current: Number(row.stock_current) || 0,
        min_stock: Number(row.min_stock) || 0,
        is_active: row.is_active,
        category: row.category || null,
        // CP-LOG-UNIFICATION-001: procedencia de la fila — 'master' = maestro
        // de la organización SIN fila local (requiere activación antes de
        // registrar la recepción; el flujo la realiza automáticamente con
        // resolve_reception_import_rows, el mismo camino del importador).
        source: row.source === "master" ? "master" : "local",
        master_product_id: row.master_product_id || null,
        store_id: cleanStoreId,
      }) as Product);

      const page = pageParam as number;
      const nextPage = page * limit < total ? page + 1 : null;
      return { products, total, nextPage };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: storeId !== undefined,
    staleTime: 30_000,
  });
}
