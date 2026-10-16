/**
 * fetchAllRows — paginación transparente para PostgREST/Supabase.
 *
 * MISIÓN CORRECTIVA 2026-10-16 — INCIDENTE_IPV_CANTIDADES_VENTAS_Y_RECONSTRUCCION_HISTORICA
 *
 * CAUSA RAÍZ DEL INCIDENTE: PostgREST aplica db-max-rows=1000 por defecto.
 * Una consulta `.select()` sin paginación devuelve SILENCIOSAMENTE las primeras
 * 1000 filas. ENERVIDA-VITALLCONS superó las 1000 en stock_movements (1123 al
 * 16/10) y las filas más recientes — incluidas las ventas del 14 y 15/10 —
 * nunca llegaron al cálculo del IPV: importes completos (transaction_items
 * tenía 671 filas) pero cantidades faltantes, Ei/Ef inflados (26 vs 21) y
 * alertas RECONCILIATION/PRE_LEDGER falsas.
 *
 * Regla del incidente: NINGUNA consulta de agregación puede truncar en
 * silencio. Este helper pagina con `.range()` (clave de orden estable
 * `order('id')` provista por el llamador) hasta agotar el resultado, y FALLA
 * DE FORMA EXPLÍCITA si alcanza el tope de seguridad de páginas — nunca
 * devuelve un subconjunto silencioso.
 */

/** Límite de filas por consulta que aplica PostgREST en Supabase por defecto. */
export const POSTGREST_DEFAULT_MAX_ROWS = 1000;

/** Tope de seguridad: 500 páginas × 1000 = 500 000 filas por consulta. */
export const FETCH_ALL_MAX_PAGES = 500;

export interface FetchAllPage<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** Subconjunto mínimo de un PostgrestBuilder encadenable con `.range()`. */
export interface FetchAllBuilderLike<T> {
  range: (from: number, to: number) => PromiseLike<FetchAllPage<T>>;
}

export class FetchAllIncompleteError extends Error {
  constructor(pages: number, pageSize: number) {
    super(
      `fetchAllRows: se alcanzó el tope de seguridad de ${pages} páginas × ${pageSize} filas sin agotar el resultado. ` +
      'El subconjunto NO se devuelve para nunca calcular un informe con datos truncados en silencio.',
    );
    this.name = 'FetchAllIncompleteError';
  }
}

/**
 * Descarga TODAS las filas de una consulta paginando por `pageSize`.
 * El llamador DEBE encadenar `.order('id')` (o una clave única estable) para
 * que la paginación sea determinista bajo escrituras concurrentes.
 */
export async function fetchAllRows<T>(
  builder: FetchAllBuilderLike<T>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? POSTGREST_DEFAULT_MAX_ROWS;
  const maxPages = options.maxPages ?? FETCH_ALL_MAX_PAGES;
  if (pageSize < 1) throw new RangeError('fetchAllRows: pageSize debe ser ≥ 1');

  const out: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await builder.range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllRows: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out; // página parcial → fin del resultado
  }
  throw new FetchAllIncompleteError(maxPages, pageSize);
}
