/**
 * PRICE LIST · Filtros de clasificación operativa y estado del precio
 * (misión CP-OPERATIONAL-CLASS-001, §3-§5).
 *
 * Funciones PURAS (sin Supabase/React), aplicables al dataset COMPLETO de la
 * tienda que trae `get_products_for_pos` (cap defensivo preexistente: 3
 * páginas × 5 000 filas — el listado no pagina filas en cliente; el filtro
 * NO se limita a una página visual).
 *
 * SELECCIÓN MULTI-VALOR (§3): sin selección = «Todas»; con selección, cada
 * chip (Venta/Insumo/Activo Fijo/Útil-Herramienta/Sin clasificar) es un
 * valor del conjunto permitido — marcar SOLO «Sin clasificar» muestra
 * exclusivamente los registros pendientes (NULL) de clasificar.
 *
 * Criterio de precio REAL de COSTPRO (misión §4):
 *  · El precio de venta vive en la propia fila del catálogo:
 *    `products.price` (numeric NULL) + `products.price_currency` (NOT NULL
 *    DEFAULT 'CUP'). NO existen tablas de listas de precios: el contexto de
 *    tienda lo fija el scoping del RPC (p.store_id + RLS) y la moneda es por
 *    fila — nunca se mezclan monedas ni tiendas.
 *  · **price NULL = Sin precio** (elemento sin precio configurado).
 *  · **price = 0 = Con precio** (cero legítimo configurado — la misión
 *    prohíbe tratar 0 como «no configurado»).
 *  · La ausencia de precio no se confunde con un producto inactivo: el
 *    criterio de inclusión del listado (is_active !== false && stock > 0) es
 *    el vigente de la misión CP-SALES-PRICE-LIST-001 y NO se altera.
 */

import { OPERATIONAL_CLASS_LABELS } from '@/lib/product-operational-class';
import type { ProductOperationalClass } from '@/types';

/** Estado del precio seleccionable en el Listado de precios. */
export type PricePriceStatus = 'all' | 'with_price' | 'without_price';

/** Marcador de los registros pendientes de clasificar (NULL en BD). */
export const UNCLASSIFIED_FILTER = 'unclassified' as const;

export type PriceClassSelection = ProductOperationalClass | typeof UNCLASSIFIED_FILTER;

export interface OperationalPriceFilter {
  /** Valores seleccionados (multi-select). Array VACÍO = «Todas». */
  classes: PriceClassSelection[];
  priceStatus: PricePriceStatus;
}

/** Filtro neutro: todas las clasificaciones y todos los precios. */
export const NEUTRAL_OPERATIONAL_FILTER: OperationalPriceFilter = {
  classes: [],
  priceStatus: 'all',
};

export function isNeutralOperationalFilter(f: OperationalPriceFilter): boolean {
  return f.classes.length === 0 && f.priceStatus === 'all';
}

/** ¿El elemento tiene al menos un precio válido configurado en su contexto (misión §4)?
 *
 * HALLAZGO VERIFICADO EN POSTGRESQL REAL (CP-OPERATIONAL-CLASS-002, esquema
 * vigente reproducible): `products.price` es `numeric NOT NULL DEFAULT 0`.
 * El sistema NO representa el «precio no configurado» con NULL: lo representa
 * con 0 (el propio RPC is_complete usa `price > 0` como «completo»). Por
 * tanto el criterio honesto y FUNCIONAL es:
 *   · Con precio  → price > 0 (precio configurado y efectivo).
 *   · Sin precio  → price NULL o price ≤ 0 (pendiente de configuración).
 * El null-check se conserva por futuro-proofing: si la columna llegara a ser
 * nullable, NULL seguirá contando como Sin precio.
 */
export function hasConfiguredPrice(item: { price: number | null | undefined }): boolean {
  return item.price !== null && item.price !== undefined && Number(item.price) > 0;
}

/**
 * Aplica el filtro combinado (misión §5): clasificación operativa Y estado
 * del precio simultáneamente, sin alterar el orden de entrada.
 */
export function applyOperationalPriceFilter<T extends {
  price: number | null | undefined;
  operational_class?: ProductOperationalClass | null;
}>(items: readonly T[], filter: OperationalPriceFilter): T[] {
  if (isNeutralOperationalFilter(filter)) return [...items];
  // classes vacío = «Todas» (sin filtro de clase), aunque el estado del
  // precio esté activo. Con selección, cada valor del conjunto cuenta.
  const hasClassSelection = filter.classes.length > 0;
  const wantsUnclassified = filter.classes.includes(UNCLASSIFIED_FILTER);
  const wantedClasses = filter.classes.filter(
    (c): c is ProductOperationalClass => c !== UNCLASSIFIED_FILTER,
  );
  return items.filter((item) => {
    // ── Clasificación operativa ──────────────────────────────────────────
    if (hasClassSelection) {
      // Clasificado: pasa solo si su clase está entre las seleccionadas
      // (con «solo Sin clasificar», wantedClasses queda vacío → excluye).
      // Sin clasificar (NULL): pasa solo si el marcador está seleccionado.
      if (item.operational_class) {
        if (!wantedClasses.includes(item.operational_class)) return false;
      } else if (!wantsUnclassified) {
        return false;
      }
    }
    // ── Estado del precio (NULL = Sin precio; 0 = Con precio) ────────────
    if (filter.priceStatus === 'with_price' && !hasConfiguredPrice(item)) return false;
    if (filter.priceStatus === 'without_price' && hasConfiguredPrice(item)) return false;
    return true;
  });
}

/**
 * Etiqueta compacta del filtro operativo combinado (chips de la vista y pie
 * del PDF). null = filtro neutro (nada que mostrar).
 */
export function operationalFilterLabel(f: OperationalPriceFilter): string | null {
  if (isNeutralOperationalFilter(f)) return null;
  const bits: string[] = [];
  if (f.classes.length > 0) {
    const parts = f.classes.map((c) => (c === UNCLASSIFIED_FILTER ? 'Sin clasificar' : OPERATIONAL_CLASS_LABELS[c]));
    bits.push(`Clasificación: ${parts.join(' + ')}`);
  }
  if (f.priceStatus !== 'all') bits.push(`Precio: ${priceStatusLabel(f.priceStatus)}`);
  return bits.join(' · ');
}

/** Etiqueta del estado del precio para chips/notas. */
export function priceStatusLabel(status: PricePriceStatus): string {
  if (status === 'with_price') return 'Con precio';
  if (status === 'without_price') return 'Sin precio';
  return 'Todos';
}
