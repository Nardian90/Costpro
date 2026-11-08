/**
 * PRICE LIST · Consulta consolidada de productos de la tienda activa
 * (misión CP-SALES-PRICE-LIST-001).
 *
 * Reutiliza el MISMO RPC del POS/Vender — `get_products_for_pos` — que ya
 * resuelve en servidor: scoping por tienda bajo RLS (p.store_id +
 * has_store_access), `stock_current` = SUM(inventory.quantity) de los
 * almacenes de ESA tienda (la existencia que `create_sale_v2` bloquea al
 * vender), precio de venta `price` + `price_currency`, y `sku` original.
 *
 * La llamada usa paginación en servidor (clamp del RPC: 1..5000) y encadena
 * páginas mientras vengan completas — catálogos grandes sin descargar
 * «todo el catálogo» de golpe ni N consultas por producto. Validación con
 * el schema compartido del proyecto (validateRPCArrayResponse). Cache
 * react-query propia (no toca la key ['products'] del POS).
 */

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { uuidRegex as isUuidRegex } from '@/validation/schemas';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { getProductsForPosResponseSchema } from '@/validation/schemas';
import { withLogging, getCleanStoreId } from './base';
import type { PriceListSourceItem } from '@/lib/price-list/model';

const RPC_NAME = 'get_products_for_pos';
const PAGE_SIZE = 5000;
/** Tope defensivo: 3 páginas de 5 000 filas (15 000 productos por tienda). */
const MAX_PAGES = 3;

async function fetchPriceListPage(storeId: string, offset: number): Promise<PriceListSourceItem[]> {
  const data = await withLogging(RPC_NAME, { p_store_id: storeId, p_offset: offset, p_limit: PAGE_SIZE }, () =>
    supabase.rpc(RPC_NAME, {
      p_store_id: storeId,
      p_search_term: '',
      p_category: '',
      p_offset: offset,
      p_limit: PAGE_SIZE,
    }),
  );
  // CP-OPERATIONAL-CLASS-001: el schema compartido convierte price NULL → 0
  // (.default(0)) — correcto para el POS, pero destruiría la distinción
  // «Sin precio (NULL) vs precio 0 legítimo» que exige la misión §4. SOLO en
  // este hook re-declaramos price nullable SIN default (el resto del schema
  // queda intacto).
  const priceListRowSchema = getProductsForPosResponseSchema.extend({
    price: z.number().min(0).nullable().optional(),
    operational_class: z.enum(['venta', 'insumo', 'activo_fijo', 'util_herramienta']).nullable().optional(),
  });
  const validated = await validateRPCArrayResponse(data, priceListRowSchema, RPC_NAME);
  return (validated ?? []).map((item) => ({
    id: item.id,
    sku: item.sku ?? null,
    name: item.name,
    description: item.description ?? null,
    price: item.price,
    price_currency: item.price_currency ?? null,
    stock_current: item.stock_current,
    is_active: item.is_active ?? null,
    is_service: item.is_service ?? null,
    // CP-OPERATIONAL-CLASS-001: clasificación operativa real (NULL = Sin clasificar).
    operational_class: item.operational_class ?? null,
  }));
}

/**
 * Productos de la TIENDA ACTIVA para el listado (solo lectura).
 * Devuelve TODAS las filas del RPC (sin filtrar stock): el criterio
 * stock > 0 y el orden por SKU se aplican en el modelo puro
 * (buildPriceListModel), testable y compartido por preview y export.
 */
export function usePriceListProducts(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);
  return useQuery({
    queryKey: ['price-list-products', cleanStoreId],
    queryFn: async (): Promise<PriceListSourceItem[]> => {
      if (!cleanStoreId || !isUuidRegex.test(cleanStoreId)) return [];
      const all: PriceListSourceItem[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const rows = await fetchPriceListPage(cleanStoreId, page * PAGE_SIZE);
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
      return all;
    },
    enabled: cleanStoreId !== '',
    staleTime: 5 * 60 * 1000,
  });
}

/** Identidad institucional de la tienda (logo + nombre), bajo RLS. */
export async function fetchPriceListStoreInfo(storeId: string): Promise<{
  id: string;
  name: string;
  logoUrl: string | null;
  reeup: string | null;
  nit: string | null;
} | null> {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name, logo_url, reeup, nit')
    .eq('id', storeId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    logoUrl: data.logo_url ?? null,
    reeup: data.reeup ?? null,
    nit: data.nit ?? null,
  };
}
