/**
 * stock-export.ts — Exportación COMPLETA del Stock actual (misión 2026-11-06).
 *
 * PROBLEMA RAÍZ que corrige: el Excel del tab «Stock actual» tomaba los datos
 * del estado `products` de la vista (páginas acumuladas por React Query con
 * scroll infinito, 20/página). Si el usuario no había scrolleado, el archivo
 * solo contenía los registros VISUALES — una exportación silenciosamente
 * incompleta, prohibida por la regla del incidente IPV (ninguna agregación o
 * exportación puede depender de lo cargado en pantalla).
 *
 * SOLUCIÓN: descargar el conjunto COMPLETO desde la MISMA fuente canónica que
 * pinta la tabla (RPC `get_paginated_products`, con los MISMOS filtros
 * server-side de búsqueda/categoría), ciclando por offset hasta cubrir `total`.
 * Los filtros client-side (estado de stock y FC) se aplican con los MISMOS
 * predicados de la vista → coherencia pantalla ↔ exportación. La inyección de
 * `fetchPage` permite probar el ciclo en unit tests sin Supabase real.
 */

import { supabase } from '@/lib/supabaseClient';
import { resolveProductFC, type FCResolutionResult } from '@/lib/integration/fc-automation';
import type { Product, ProductFCStatus } from '@/types';

/** Lote por llamada RPC durante la exportación (vs 20/página del scroll). */
export const EXPORT_PAGE_SIZE = 500;

/** Tope de seguridad: 400 lotes × 500 = 200 000 productos. */
export const EXPORT_MAX_PAGES = 400;

/** Fila mínima necesaria para la exportación (campos de la vista Stock actual). */
export interface StockExportProduct {
  id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  min_stock: number | null;
  price: number;
  precio_empresa: number | null;
  cost_price: number;
  cost_average: number | null;
  category: string | null;
  store_id?: string | null;
  source?: string | null;
}

export type StockFilterValue = 'with_stock' | 'all' | 'normal' | 'low' | 'out';

export class StockExportIncompleteError extends Error {
  constructor(pages: number, pageSize: number) {
    super(
      `Exportación de stock: se alcanzó el tope de seguridad de ${pages} lotes × ${pageSize} filas ` +
      'sin agotar el inventario. La exportación NO se genera con datos incompletos.',
    );
    this.name = 'StockExportIncompleteError';
  }
}

/** Resultado crudo de la RPC (subset de los campos que consume la vista). */
interface RpcRow extends StockExportProduct {
  total_count?: number;
  total?: number;
}

/** Dependencias inyectables para pruebas unitarias. */
export interface StockFetcherDeps {
  fetchPage: (offset: number, limit: number) => Promise<{ rows: RpcRow[]; total: number }>;
  pageSize?: number;
  maxPages?: number;
}

/**
 * Descarga TODO el stock actual de la tienda ciclando la RPC paginada oficial
 * con los MISMOS filtros server-side de la vista (búsqueda + categoría).
 * Falla EXPLÍCITAMENTE si el tope de seguridad se alcanza sin cubrir `total`
 * — nunca devuelve un subconjunto silencioso.
 */
export async function fetchAllStockForExport(deps: StockFetcherDeps): Promise<StockExportProduct[]> {
  const pageSize = deps.pageSize ?? EXPORT_PAGE_SIZE;
  const maxPages = deps.maxPages ?? EXPORT_MAX_PAGES;
  const all: RpcRow[] = [];
  let expectedTotal: number | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const { rows, total } = await deps.fetchPage(offset, pageSize);
    if (rows.length > 0 && (typeof total === 'number' && Number.isFinite(total))) {
      expectedTotal = total;
    }
    all.push(...rows);
    if (rows.length < pageSize) break; // lote parcial → fin del resultado
    if (expectedTotal !== null && all.length >= expectedTotal) break; // total cubierto
  }

  if (expectedTotal !== null && all.length < expectedTotal) {
    throw new StockExportIncompleteError(maxPages, pageSize);
  }

  // Dedup defensivo por id (por si la RPC intersectara lotes en escrituras concurrentes)
  const seen = new Set<string>();
  const out: StockExportProduct[] = [];
  for (const row of all) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      name: row.name,
      sku: row.sku,
      stock_current: Number(row.stock_current ?? 0),
      min_stock: row.min_stock ?? null,
      price: Number(row.price ?? 0),
      precio_empresa: row.precio_empresa ?? null,
      cost_price: Number(row.cost_price ?? 0),
      cost_average: row.cost_average ?? null,
      category: row.category ?? null,
      store_id: row.store_id ?? null,
      source: row.source ?? null,
    });
  }
  return out;
}

/** Descarga real vía Supabase RPC (misma fuente canónica de la vista). */
export async function fetchAllStockFromSupabase(
  storeId: string,
  searchTerm: string,
  category: string,
): Promise<StockExportProduct[]> {
  return fetchAllStockForExport({
    fetchPage: async (offset, limit) => {
      const { data, error } = await supabase.rpc('get_paginated_products', {
        p_limit: limit,
        p_offset: offset,
        p_store_id: storeId,
        p_search_term: searchTerm,
        p_category: category,
      });
      if (error) throw new Error(`get_paginated_products: ${error.message}`);
      const rows = (data || []) as RpcRow[];
      const total = rows.length > 0
        ? Number((rows[0] as RpcRow).total_count ?? (rows[0] as RpcRow).total ?? 0)
        : 0;
      return { rows, total };
    },
  });
}

/**
 * Predicado de estado de stock — EXTRAÍDO de la vista para que la exportación
 * aplique EXACTAMENTE el mismo criterio que `filteredProducts` en pantalla.
 */
export function matchesStockFilter(
  product: Pick<StockExportProduct, 'stock_current' | 'min_stock'>,
  filter: StockFilterValue,
): boolean {
  if (filter === 'all') return true;
  const stock = product.stock_current ?? 0;
  const min = product.min_stock ?? 0;
  if (filter === 'with_stock') return stock > 0;
  if (filter === 'out') return stock <= 0;
  if (filter === 'low') return stock > 0 && min > 0 && stock <= min;
  // 'normal'
  return stock > 0 && (min <= 0 || stock > min);
}

/**
 * Resuelve el estado FC para TODOS los productos exportados (incluidos los no
 * cargados en pantalla). Requiere traer las FC de la tienda completas +
 * plantilla activa — mismo motor `resolveProductFC` del hook de la vista.
 */
export async function resolveExportFCStatuses(
  products: StockExportProduct[],
  storeId: string,
): Promise<Map<string, ProductFCStatus>> {
  interface SheetRow {
    id: string; product_id: string; store_id: string; template_id: string;
    modalidad: string; calculated_data: Record<string, unknown>;
    cost_price: number; cost_price_updated_at: string; sync_status: string;
    created_at: string; updated_at: string; deleted_at: string | null;
  }
  const [sheetsRes, tplRes] = await Promise.all([
    supabase
      .from('product_cost_sheets')
      .select('id, product_id, store_id, template_id, modalidad, calculated_data, cost_price, cost_price_updated_at, sync_status, created_at, updated_at, deleted_at')
      .eq('store_id', storeId)
      .is('deleted_at', null),
    supabase
      .from('store_cost_templates')
      .select('store_id, template_id, template_data, modalidad, pdf_format, is_active')
      .eq('store_id', storeId)
      .maybeSingle(),
  ]);
  if (sheetsRes.error) throw new Error(`product_cost_sheets: ${sheetsRes.error.message}`);

  const sheetsByProduct = new Map<string, SheetRow>();
  for (const cs of (sheetsRes.data || []) as SheetRow[]) {
    if (!sheetsByProduct.has(cs.product_id)) sheetsByProduct.set(cs.product_id, cs);
  }

  const tpl = (tplRes.data || null) as {
    template_id: string; template_data: Record<string, unknown> | null;
    modalidad: string; pdf_format: string; is_active: boolean;
  } | null;
  const templateInput = tpl
    ? {
        template_id: tpl.template_id,
        template_data: tpl.template_data,
        modalidad: tpl.modalidad as 'produccion' | 'servicios' | 'comercializacion',
        pdf_format: tpl.pdf_format as 'res148',
        is_active: tpl.is_active,
      }
    : null;

  const map = new Map<string, ProductFCStatus>();
  for (const product of products) {
    const sheet = sheetsByProduct.get(product.id) ?? null;
    const productInput = {
      id: product.id,
      store_id: product.store_id ?? storeId,
      cost_sheet_id: sheet?.id ?? null,
      fc_auto_enabled: true,
      cost_price: Number(product.cost_price ?? 0),
      name: product.name,
    };
    const sheetInput = sheet
      ? {
          id: sheet.id,
          product_id: sheet.product_id,
          store_id: sheet.store_id,
          template_id: sheet.template_id,
          modalidad: sheet.modalidad as 'produccion' | 'servicios' | 'comercializacion',
          calculated_data: sheet.calculated_data,
          cost_price: sheet.cost_price,
          cost_price_updated_at: sheet.cost_price_updated_at,
          sync_status: sheet.sync_status as 'pending' | 'synced' | 'conflict',
          created_at: sheet.created_at,
          updated_at: sheet.updated_at,
          deleted_at: sheet.deleted_at,
        }
      : null;
    const resolution: FCResolutionResult = resolveProductFC(productInput, sheetInput, templateInput);
    let status: ProductFCStatus = 'sin_fc';
    if (resolution.status === 'existing') status = resolution.fc_status;
    else if (resolution.status === 'needs_calculation') status = 'pendiente';
    map.set(product.id, status);
  }
  return map;
}

/** Descripción legible de los filtros activos (para el encabezado del PDF). */
export function describeStockFilters(
  searchTerm: string,
  category: string,
  stockFilter: StockFilterValue,
  fcFilter: string,
): string {
  const parts: string[] = [];
  if (searchTerm.trim()) parts.push(`Búsqueda: «${searchTerm.trim()}»`);
  if (category) parts.push(`Categoría: ${category}`);
  // El estado de stock SIEMPRE se anuncia (incluido el default 'with_stock'):
  // la exportación excluye agotados cuando está activo y el documento debe
  // dejarlo explícito para no inducir a error.
  const stockLabels: Record<StockFilterValue, string> = {
    all: 'Todos los estados de stock',
    normal: 'Stock normal',
    low: 'Stock bajo',
    out: 'Agotados',
    with_stock: 'Con stock (excluye agotados)',
  };
  parts.push(stockLabels[stockFilter]);
  if (fcFilter !== 'all') {
    const labels: Record<string, string> = { vigente: 'FC vigente', pendiente: 'FC pendiente', sin_fc: 'Sin FC' };
    parts.push(labels[fcFilter] ?? fcFilter);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Todos los productos del inventario de la tienda';
}

/** Tipo auxiliar para tipar entradas del PDF/Excel desde la vista (Product real). */
export type StockExportInput = Pick<
  Product,
  'id' | 'name' | 'sku' | 'stock_current' | 'min_stock' | 'price' | 'precio_empresa' | 'cost_price' | 'cost_average' | 'category'
>;
