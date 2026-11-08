/**
 * PRICE LIST · Modelo y plan de página (misión CP-SALES-PRICE-LIST-001).
 *
 * `buildPriceListModel` transforma la fuente REAL (filas de
 * get_products_for_pos + tienda activa + filtros) en el modelo del documento:
 * filas con stock > 0 ordenadas por SKU (numéricos por valor, luego
 * alfanuméricos), precio de venta con su moneda explícita y metadatos.
 *
 * `planPriceListPages` — DISEÑO ESPECIAL §7: doble columna por página.
 * Función PURA e inyectable (medidor de líneas) que divide las filas en
 * páginas de dos bloques independientes: llena la columna IZQUIERDA de
 * arriba hacia abajo, continúa en la DERECHA y pagina al completar ambas.
 * Cada bloque repite su encabezado de tabla; ninguna fila se parte entre
 * columnas o páginas. El plan expone `totalPages` para numerar
 * «Página X de N» sin segundas pasadas.
 */

import { orderProductsBySku, type SkuFilter } from './sku-order';
import { formatLabeledCurrency } from '@/lib/utils';

/** Fila de origen (campos del RPC get_products_for_pos que usa el listado). */
export interface PriceListSourceItem {
  id: string;
  sku: string | null | undefined;
  name: string;
  description?: string | null;
  price: number | null | undefined;
  price_currency?: string | null;
  stock_current: number | null | undefined;
  is_active?: boolean | null;
  is_service?: boolean | null;
}

/** Fila lista para dibujar (el SKU original se conserva intacto). */
export interface PriceListRow {
  id: string;
  skuLabel: string;            // SKU original o «—» (nunca la clave auxiliar)
  description: string;         // descripción comercial (name + description)
  priceLabel: string;          // «$ 38,50 CUP» — moneda explícita, sin conversión
  lines: number;               // líneas que ocupará la descripción (layout)
}

export interface PriceListStoreInfo {
  id: string;
  name: string;
  logoUrl?: string | null;
  reeup?: string | null;
  nit?: string | null;
}

export interface PriceListModel {
  store: PriceListStoreInfo;
  /** Fecha de generación (dd/MM/yyyy) y hora (HH:mm). */
  dateLabel: string;
  timeLabel: string;
  rows: PriceListRow[];
  /** Resumen compacto de la selección (interfaz §5). */
  meta: {
    totalProducts: number;      // productos incluidos
    totalRaw: number;           // productos con stock>0 antes del rango
    rangeFrom: bigint | null;
    rangeTo: bigint | null;
    currencies: string[];       // monedas presentes (sin mezclar: cada fila lleva la suya)
  };
}

/** Moneda por defecto del sistema (products.price_currency NOT NULL DEFAULT 'CUP'). */
const DEFAULT_CURRENCY = 'CUP';

/** Descripción comercial: nombre + descripción complementaria si existe. */
function commercialDescription(item: PriceListSourceItem): string {
  const extra = (item.description ?? '').trim();
  return extra !== '' ? `${item.name} — ${extra}` : item.name;
}

/**
 * Filtra (stock estrictamente > 0, producto activo), ordena por SKU y arma
 * las filas del documento. `measureLines` cuenta cuántas líneas ocupa la
 * descripción (inyectable para tests; el PDF usa splitTextToSize real).
 */
export function buildPriceListModel(opts: {
  items: readonly PriceListSourceItem[];
  store: PriceListStoreInfo;
  range: SkuFilter;
  generatedAt: Date;
  measureLines?: (description: string) => number;
}): PriceListModel {
  const { items, store, range, generatedAt } = opts;
  const measureLines = opts.measureLines ?? (() => 1);

  // Criterio de inclusión OBLIGATORIO (misión §3): stock estrictamente mayor
  // que cero y producto activo. Ni cero, ni negativo, ni otras tiendas (las
  // filas ya llegan scoping por tienda desde el RPC bajo RLS).
  const available = items.filter(
    (item) => item.is_active !== false && (item.stock_current ?? 0) > 0,
  );
  const totalRaw = available.length;

  // Reglas de SKU (§4.2): numéricos por valor, alfanuméricos después.
  const ordered = orderProductsBySku(available, range);

  const dateLabel = `${String(generatedAt.getDate()).padStart(2, '0')}/${String(generatedAt.getMonth() + 1).padStart(2, '0')}/${generatedAt.getFullYear()}`;
  const timeLabel = `${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`;

  const rows: PriceListRow[] = ordered.map((item) => ({
    id: item.id,
    skuLabel: (item.sku ?? '').trim() !== '' ? String(item.sku).trim() : '—',
    description: commercialDescription(item),
    priceLabel: formatLabeledCurrency(item.price ?? 0, (item.price_currency ?? DEFAULT_CURRENCY) || DEFAULT_CURRENCY),
    lines: 1, // se recalcula con la geometría real en planPriceListPages
  })).map((row) => ({ ...row, lines: measureLines(row.description) }));

  const currencies = [...new Set(ordered.map((i) => ((i.price_currency ?? DEFAULT_CURRENCY) || DEFAULT_CURRENCY).toUpperCase()))];

  return {
    store,
    dateLabel,
    timeLabel,
    rows,
    meta: {
      totalProducts: rows.length,
      totalRaw,
      rangeFrom: range?.from ?? null,
      rangeTo: range?.to ?? null,
      currencies,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// PLAN DE PÁGINAS — doble columna (misión §7)
// ────────────────────────────────────────────────────────────────────────

export interface PriceListGeometry {
  /** Alto útil por columna, en mm, desde el primer encabezado de tabla. */
  columnHeightMm: number;
  /** Alto de la fila de encabezado de cada bloque (se repite por columna). */
  headerRowMm: number;
  /** Alto mínimo de fila (1 línea de descripción). */
  rowBaseMm: number;
  /** Alto de cada línea adicional de descripción. */
  rowExtraLineMm: number;
  /** Medidor de líneas de descripción (ancho real de la columna descripción). */
  measureLines: (description: string) => number;
}

export interface PriceListColumnPlan {
  /** Índices (sobre model.rows) de las filas del bloque. */
  rowIndices: number[];
  /** Alto consumido (encabezado + filas), mm. */
  heightMm: number;
}
export interface PriceListPagePlan {
  left: PriceListColumnPlan;
  right: PriceListColumnPlan;
}
export interface PriceListPlan {
  pages: PriceListPagePlan[];
  totalPages: number;
}

/** Alto de una fila según sus líneas de descripción (nunca se parte). */
function rowHeightMm(lines: number, geom: PriceListGeometry): number {
  const extra = Math.max(0, lines - 1) * geom.rowExtraLineMm;
  return geom.rowBaseMm + extra;
}

/**
 * Divide las filas en páginas de dos columnas independientes.
 * Determinista y pura: el mismo modelo + geometría producen el MISMO plan
 * (la previsualización y la exportación comparten este plan).
 */
export function planPriceListPages(model: PriceListModel, geom: PriceListGeometry): PriceListPlan {
  const pages: PriceListPagePlan[] = [];
  let current: PriceListPagePlan | null = null;
  let currentColumn: PriceListColumnPlan | null = null;
  let consumed = 0;

  const closePage = () => {
    if (current) pages.push(current);
    current = null;
    currentColumn = null;
    consumed = 0;
  };
  const openColumn = () => {
    if (!current) {
      current = {
        left: { rowIndices: [], heightMm: geom.headerRowMm },
        right: { rowIndices: [], heightMm: geom.headerRowMm },
      };
    }
    currentColumn = current.left.rowIndices.length === 0 && current.right.rowIndices.length === 0
      ? current.left
      : current.right.rowIndices.length === 0
        ? current.right
        : null;
    if (!currentColumn) {
      closePage();
      return openColumn();
    }
    consumed = currentColumn.heightMm; // arranca con su encabezado de tabla
  };

  for (let i = 0; i < model.rows.length; i += 1) {
    const lines = geom.measureLines(model.rows[i].description);
    const height = rowHeightMm(lines, geom);
    if (!currentColumn) openColumn();
    // La fila entra completa o pasa a la siguiente columna/página (no se parte).
    if (consumed + height > geom.columnHeightMm) {
      openColumn();
    }
    currentColumn!.rowIndices.push(i);
    currentColumn!.heightMm += height;
    consumed += height;
  }
  closePage();

  return { pages, totalPages: pages.length };
}
