/**
 * MISIÓN CORRECTIVA 2026-10-16 — PRUEBA I (regresión de la causa raíz).
 *
 * PostgREST (Supabase) trunca en silencio las consultas a 1000 filas cuando
 * no se pagina: la API del IPV descargaba stock_movements sin `.range()` y
 * ENERVIDA-VITALLCONS ya tenía 1123 movimientos → las ventas del 14-15/10/2026
 * (entre ellas la del SKU 142: 2 u × 2000 CUP = 4.000) nunca llegaron a
 * computeIpv → "importe sin cantidad", Ei/Ef falsos (26 vs 21) y alertas
 * RECONCILIATION/PRE_LEDGER espurias.
 *
 * fetchAllRows() debe descargar TODAS las páginas y fallar explícitamente si
 * no puede — jamás devolver un subconjunto silencioso.
 */
import { describe, it, expect } from 'vitest';
import {
  fetchAllRows,
  FetchAllIncompleteError,
  POSTGREST_DEFAULT_MAX_ROWS,
  type FetchAllBuilderLike,
} from '@/lib/supabase-fetch-all';

interface Mov { id: number; q: number }

/** Emulador de PostgREST: db-max-rows=1000 con paginación por Range. */
function makePostgrestLike(totalRows: number, cap = POSTGREST_DEFAULT_MAX_ROWS) {
  const ranges: Array<[number, number]> = [];
  const all: Mov[] = Array.from({ length: totalRows }, (_, i) => ({ id: i + 1, q: -1 }));
  const builder = {
    ranges,
    // El builder real es encadenable; range() devuelve un thenable que resuelve
    // con la "página" (slice) — igual que supabase-js.
    range(from: number, to: number) {
      ranges.push([from, to]);
      const slice = all.slice(from, to + 1);
      return Promise.resolve({ data: slice, error: null });
    },
  };
  return { builder: builder as unknown as FetchAllBuilderLike<Mov>, ranges, all };
}

describe('fetchAllRows — regresión del truncado PostgREST (1000 filas)', () => {
  it('documento del incidente: una consulta sin paginar devuelve solo 1000 de 1123 filas', () => {
    const { builder, all } = makePostgrestLike(1123);
    // Emulación EXACTA de lo que hacía la API: range(0, 999) implícito del servidor.
    const single = builder.range(0, POSTGREST_DEFAULT_MAX_ROWS - 1);
    return single.then((page) => {
      expect(page.data).toHaveLength(1000);
      expect(all.length).toBe(1123);
      // Las 123 filas más recientes (ventas del 14-15/10) quedaban fuera → incidente.
      expect(all.length - (page.data?.length ?? 0)).toBe(123);
    });
  });

  it('Prueba I: fetchAllRows descarga las 1123 filas paginando (nada truncado)', async () => {
    const { builder, ranges } = makePostgrestLike(1123);
    const rows = await fetchAllRows(builder);
    expect(rows).toHaveLength(1123);
    expect(rows[0].id).toBe(1);
    expect(rows[1122].id).toBe(1123);
    // Páginas: 0-999 y 1000-1999 (parcial → termina)
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('consulta pequeña (1 página parcial) → una sola petición', async () => {
    const { builder, ranges } = makePostgrestLike(671);
    const rows = await fetchAllRows(builder);
    expect(rows).toHaveLength(671);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('límite exacto múltiplo del pageSize (2000 filas) → 2 páginas completas + 1 vacía-implícita', async () => {
    // 2000 = 2 páginas exactas; la 2ª página devuelve 1000 (no parcial) →
    // se pide una 3ª que devuelve 0 < pageSize → fin.
    const { builder, ranges } = makePostgrestLike(2000);
    const rows = await fetchAllRows(builder);
    expect(rows).toHaveLength(2000);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('error de una página → falla explícito (nunca subconjunto silencioso)', async () => {
    const boom: FetchAllBuilderLike<Mov> = {
      range: () => Promise.resolve({ data: null, error: { message: 'RLS denegó la lectura' } }),
    };
    await expect(fetchAllRows(boom)).rejects.toThrow(/RLS denegó la lectura/);
  });

  it('tope de seguridad de páginas → FetchAllIncompleteError (sin truncado silencioso)', async () => {
    const infinito: FetchAllBuilderLike<Mov> = {
      range: () => Promise.resolve({ data: Array.from({ length: 1000 }, () => ({ id: 1, q: 1 })), error: null }),
    };
    await expect(fetchAllRows(infinito, { pageSize: 1000, maxPages: 3 })).rejects.toBeInstanceOf(FetchAllIncompleteError);
  });

  it('pageSize personalizado respeta el tope del servidor si es menor', async () => {
    const { builder, ranges } = makePostgrestLike(450, 1000);
    const rows = await fetchAllRows(builder, { pageSize: 200 });
    expect(rows).toHaveLength(450);
    expect(ranges).toEqual([[0, 199], [200, 399], [400, 599]]);
  });
});
