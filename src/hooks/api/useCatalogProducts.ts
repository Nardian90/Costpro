/**
 * useCatalogProducts — Hook unificado para paginación del catálogo.
 *
 * Modos:
 *   - 'infinite': useInfiniteQuery (para vista TARJETAS con scroll infinito)
 *   - 'page': useQuery (para vista TABLA con paginación tradicional)
 *
 * Ambos modos usan el mismo RPC `get_paginated_products_v2` con sort + filter
 * server-side, garantizando consistencia entre páginas.
 *
 * Reset automático: cuando cambian filters/search/sort/pageSize, React Query
 * trata la query key como nueva y reinicia desde offset=0.
 */

import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { getCleanStoreId } from './base';
// FIX UUID-CATALOG-CENTRAL (2026-10-15): importar el uuidRegex canónico del proyecto
// (permisivo 8-4-4-4-12, alineado con el tipo `uuid` de Postgres que NO exige bits
// de variante RFC 4122). Ver nota en catalogProductsV2ParamsSchema.
import { uuidRegex as isUuidRegex, uuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { paginatedProductSchema } from '@/validation/schemas';
import { z } from 'zod';

// Schema for v2 RPC params
export const catalogProductsV2ParamsSchema = z.object({
  p_limit: z.number().int().default(24),
  p_offset: z.number().int().default(0),
  // FIX UUID-CATALOG-CENTRAL (2026-10-15): aquí vivía `z.string().uuid()` (Zod 4),
  // que exige bits de versión [1-8] y variante [89ab] según RFC 4122/9562. El UUID
  // canónico de TIENDA CENTRAL COSTPRO (d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576,
  // variante 'e') es válido para Postgres pero era RECHAZADO aquí, abortando la
  // llamada ANTES de llegar a la red con «Invalid UUID» en p_store_id — de ahí el
  // «Ha ocurrido un error» solo en Central (Enervida, variante 'b', pasaba).
  // Mismo patrón ya corregido en accounts-payable (2026-07-14) y reverse (V2.4.4).
  // Se usa el uuidRegex del proyecto: valida la forma 8-4-4-4-12 que acepta el
  // contrato real de la RPC (p_store_id uuid de Postgres).
  p_store_id: z.string().regex(uuidRegex, 'UUID de tienda inválido').nullable(),
  p_search_term: z.string().default(''),
  p_category: z.string().default(''),
  p_sort_key: z.enum(['name', 'sku', 'price', 'cost_price', 'stock_current']).default('name'),
  p_sort_dir: z.enum(['asc', 'desc']).default('asc'),
  p_stock_filter: z.enum(['all', 'out', 'low', 'ok']).default('all'),
  p_active_filter: z.enum(['all', 'active', 'inactive']).default('all'),
});

export type CatalogProductsV2Params = z.input<typeof catalogProductsV2ParamsSchema>;

export interface UseCatalogProductsOptions {
  storeId?: string | null;
  searchTerm?: string;
  category?: string;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  stockFilter?: 'all' | 'out' | 'low' | 'ok';
  activeFilter?: 'all' | 'active' | 'inactive';
  pageSize?: number;
  /** 'infinite' for cards (scroll), 'page' for table (traditional pagination). */
  mode: 'infinite' | 'page';
  /** Only for mode='page': current page number (1-indexed). */
  page?: number;
  enabled?: boolean;
}

/**
 * Guardia compartida en el límite de la llamada (Fase 2 del incidente UUID).
 *
 *   - Sin tienda (null/''/'null'/'undefined'): estado vacío normal — NO se
 *     llama a la RPC (la función exige p_store_id salvo para admins, y el
 *     catálogo siempre es por-tienda; evita mostrar mezcla de tiendas).
 *   - Con un string que NO es UUID: error CONTROLADO con mensaje útil. Antes
 *     se devolvía un estado vacío silencioso, indistinguible de «tienda sin
 *     productos», que enmascaraba el defecto real (violación UI-02 del
 *     requisito de mensajes comprensibles). Nunca consulta datos ni filtra
 *     por otra tienda: falla antes de tocar la red.
 */
function resolveCatalogStoreId(rawStoreId: string | null): string | null {
  if (rawStoreId === null) return null;
  if (!isUuidRegex.test(rawStoreId)) {
    throw new Error(
      `El identificador de la tienda activa no es un UUID válido para el catálogo. ` +
      `Vuelva a seleccionar la tienda; si el problema persiste, cierre sesión y vuelva a entrar. `
      + `(valor recibido: "${rawStoreId.slice(0, 64)}")`
    );
  }
  return rawStoreId;
}

async function fetchProductsPage(params: CatalogProductsV2Params) {
  const validated = catalogProductsV2ParamsSchema.parse(params);
  const rpcName = 'get_paginated_products_v2';
  const { data, error } = await supabase.rpc(rpcName, {
    p_limit: validated.p_limit,
    p_offset: validated.p_offset,
    p_store_id: validated.p_store_id ?? null,
    p_search_term: validated.p_search_term || null,
    p_category: validated.p_category || null,
    p_sort_key: validated.p_sort_key,
    p_sort_dir: validated.p_sort_dir,
    p_stock_filter: validated.p_stock_filter,
    p_active_filter: validated.p_active_filter,
  });
  if (error) throw error;
  const products = await validateRPCArrayResponse(data, paginatedProductSchema, rpcName);
  const total = (products && products.length > 0) ? (products[0].total_count || 0) : 0;
  return { products: products || [], total };
}

/**
 * Hook for infinite scroll (cards view).
 * Returns cumulative pages of products.
 */
export function useCatalogProductsInfinite(opts: UseCatalogProductsOptions) {
  const cleanStoreId = getCleanStoreId(opts.storeId);
  const limit = opts.pageSize ?? 30; // larger batch for infinite scroll

  return useInfiniteQuery({
    queryKey: [
      'catalog-products-v2',
      'infinite',
      cleanStoreId,
      opts.searchTerm ?? '',
      opts.category ?? '',
      opts.sortKey ?? 'name',
      opts.sortDir ?? 'asc',
      opts.stockFilter ?? 'all',
      opts.activeFilter ?? 'all',
      limit,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const pStoreId = resolveCatalogStoreId(cleanStoreId);
      // Sin tienda identificada: estado vacío normal, sin consultar (no hay
      // contexto de tienda que filtrar y la RPC exige p_store_id no-admin).
      if (pStoreId === null) return { products: [], total: 0, nextOffset: null };
      const result = await fetchProductsPage({
        p_limit: limit,
        p_offset: pageParam as number,
        p_store_id: pStoreId,
        p_search_term: opts.searchTerm ?? '',
        p_category: opts.category ?? '',
        p_sort_key: (opts.sortKey as any) ?? 'name',
        p_sort_dir: opts.sortDir ?? 'asc',
        p_stock_filter: opts.stockFilter ?? 'all',
        p_active_filter: opts.activeFilter ?? 'all',
      });
      const nextOffset = (pageParam as number + result.products.length) < result.total
        ? (pageParam as number) + result.products.length
        : null;
      return { ...result, nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: opts.enabled !== false && opts.storeId !== undefined,
    staleTime: 30_000, // 30s cache
  });
}

/**
 * Hook for traditional pagination (table view).
 * Returns a single page of products + total count + hasNextPage.
 */
export function useCatalogProductsPage(opts: UseCatalogProductsOptions) {
  const cleanStoreId = getCleanStoreId(opts.storeId);
  const limit = opts.pageSize ?? 24;
  const page = opts.page ?? 1;
  const offset = Math.max(0, (page - 1) * limit);

  return useQuery({
    queryKey: [
      'catalog-products-v2',
      'page',
      cleanStoreId,
      opts.searchTerm ?? '',
      opts.category ?? '',
      opts.sortKey ?? 'name',
      opts.sortDir ?? 'asc',
      opts.stockFilter ?? 'all',
      opts.activeFilter ?? 'all',
      limit,
      page,
    ],
    queryFn: async () => {
      const pStoreId = resolveCatalogStoreId(cleanStoreId);
      // Sin tienda identificada: estado vacío normal, sin consultar (ídem).
      if (pStoreId === null) return { products: [], total: 0 };
      return await fetchProductsPage({
        p_limit: limit,
        p_offset: offset,
        p_store_id: pStoreId,
        p_search_term: opts.searchTerm ?? '',
        p_category: opts.category ?? '',
        p_sort_key: (opts.sortKey as any) ?? 'name',
        p_sort_dir: opts.sortDir ?? 'asc',
        p_stock_filter: opts.stockFilter ?? 'all',
        p_active_filter: opts.activeFilter ?? 'all',
      });
    },
    enabled: opts.enabled !== false && opts.storeId !== undefined,
    placeholderData: keepPreviousData, // smooth pagination transitions
    staleTime: 30_000,
  });
}
