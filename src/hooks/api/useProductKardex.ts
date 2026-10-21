/**
 * useProductKardex — Motor de Kardex por producto con período (Trazabilidad).
 *
 * ARQUITECTURA — UNA SOLA FUENTE DE VERDAD (§34 del requisito):
 * - Lee la MISMA tabla `stock_movements` que el RPC del Kardex existente
 *   (`get_product_stock_ledger_paginated`).
 * - Los movimientos y sus `quantity_change` son los de la BD — jamás se
 *   recalculan client-side.
 * - El SALDO CORRIDO se DERIVA cronológicamente desde el origen (§34-bis):
 *   saldo inicial = Σ quantity_change de los movimientos ANTES del período;
 *   saldo de cada fila = saldo anterior + entrada − salida en el orden
 *   canónico (created_at ASC, id ASC). CORRECCIÓN DEL DEFECTO SKU 15
 *   (2026-10-21): el `balance_after` almacenado se encadena por ORDEN DE
 *   INSERCIÓN (trigger) y los escritores sellan `created_at` con fechas
 *   operativas retro-datables ⇒ mostrar `balance_after` en orden cronológico
 *   produce saltos imposibles (41 − 1 → 55). La suma previa al período y la
 *   derivación por fila son independientes del orden de inserción.
 * - `sumaTotal` (Σ de TODO el ledger del producto+tienda) permite conciliar
 *   el submayor con la existencia autoritativa (`inventory.quantity` /
 *   `products.stock_current`) y detectar huecos de datos.
 *
 * Consultas:
 *  1. Saldo inicial (§10): Σ quantity_change de los movimientos antes de
 *     `dateFrom` (por lotes de 1000, columna única).
 *  2. Movimientos del período (§11): product_id + store_id + rango de
 *     fechas, orden ASC (created_at, id) — determinista (§21/§22),
 *     por lotes de 1000 filas (§31 rendimiento).
 *  3. Suma total del ledger (sin fechas): para conciliación con la
 *     existencia autoritativa.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging, getCleanStoreId } from './base';
import {
  calcularResumenPeriodo,
  derivarSaldosCronologicos,
  ordenarCronologico,
  type KardexMovementLike,
  type ResumenPeriodo,
} from '@/lib/inventory/kardexPeriod';

const BATCH_SIZE = 1000;
/** Techo de seguridad (§31): evita consultas descontroladas; si se alcanza,
 * se marca `isTruncated` y la UI lo informa sin ocultar el problema. */
const MAX_MOVEMENTS = 10000;

export interface ProductKardexResult {
  /** Existencia acumulada antes del primer movimiento del período (§10):
   *  Σ quantity_change de los movimientos previos al período. */
  saldoInicial: number;
  /** Movimientos del período en orden cronológico ascendente, cada uno con
   *  su saldo corrido derivado (`saldo`). */
  movimientos: Array<KardexMovementLike & { saldo: number }>;
  /** Resumen del período: entradas, salidas, saldo final, conteo. */
  resumen: ResumenPeriodo;
  /** true si se alcanzó el techo MAX_MOVEMENTS (período demasiado amplio). */
  isTruncated: boolean;
  /** Σ quantity_change de TODOS los movimientos del producto+tienda (sin
   *  filtro de período) para conciliar con la existencia autoritativa.
   *  null si el techo impidió computarla exactamente. */
  sumaTotal: number | null;
}

/**
 * Suma `quantity_change` de los movimientos de un producto+tienda (opcionalmente
 * acotados por fecha superior), por lotes y con techo de seguridad. Devuelve
 * null si el techo se alcanza (suma no exacta — la UI no debe fingirla).
 */
async function sumarCantidadCambios(
  productId: string,
  cleanStoreId: string | null,
  dateLt?: string
): Promise<number | null> {
  let suma = 0;
  let total = 0;
  for (let offset = 0; offset < MAX_MOVEMENTS; offset += BATCH_SIZE) {
    let q = supabase
      .from('stock_movements')
      .select('quantity_change')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (cleanStoreId) q = q.eq('store_id', cleanStoreId);
    if (dateLt) q = q.lt('created_at', dateLt);

    const data = await withTableLogging('select', 'stock_movements', () => q);
    const rows = (data || []) as Record<string, unknown>[];
    for (const r of rows) suma += Number(r.quantity_change) || 0;
    total += rows.length;

    if (rows.length < BATCH_SIZE) return suma;
    if (total >= MAX_MOVEMENTS) return null; // techo: suma no garantizada
  }
  return null;
}

export function useProductKardex(
  productId: string | null | undefined,
  storeId?: string | null,
  dateFrom?: string,
  dateTo?: string
) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['product-kardex', productId, cleanStoreId, dateFrom ?? null, dateTo ?? null],
    queryFn: async (): Promise<ProductKardexResult> => {
      if (!productId) {
        return {
          saldoInicial: 0,
          movimientos: [],
          resumen: calcularResumenPeriodo([], 0),
          isTruncated: false,
          sumaTotal: null,
        };
      }

      // ── Consulta 1: saldo inicial (§10) ────────────────────────────────
      // Σ quantity_change de los movimientos ANTES del inicio del período.
      // Independiente del orden: una suma no depende del orden de inserción
      // ni del encadenamiento del trigger (CORRECCIÓN SKU 15: leer el
      // `balance_after` del «último movimiento anterior» daba el saldo del
      // encadenado de INSERCIÓN, no el acumulado cronológico real).
      // Si no hay movimientos previos, nada movió la existencia: 0.
      let saldoInicial = 0;
      if (dateFrom) {
        const sumaPre = await sumarCantidadCambios(productId, cleanStoreId, dateFrom);
        saldoInicial = sumaPre ?? 0;
      }

      // ── Consulta 2: movimientos del período, por lotes (§31) ───────────
      const movimientos: KardexMovementLike[] = [];
      let isTruncated = false;

      for (let offset = 0; offset < MAX_MOVEMENTS; offset += BATCH_SIZE) {
        // FIX 42703: la tabla `stock_movements` NO tiene columna
        // `reference_type` (schema real: id, store_id, product_id, variant_id,
        // movement_type, quantity_change, balance_after, reference_id,
        // reference_doc, movement_date, unit_cost, unit_price, created_by,
        // created_at). Solicitarla provocaba error PGRST204/42703 y la
        // búsqueda de producto fallaba completa. La detección de reversión
        // (badge) se hace por `movement_type` en la capa de presentación.
        let q = supabase
          .from('stock_movements')
          .select(
            'id, created_at, movement_type, quantity_change, balance_after, reference_doc, created_by'
          )
          .eq('product_id', productId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + BATCH_SIZE - 1);

        if (cleanStoreId) q = q.eq('store_id', cleanStoreId);
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999');

        const data = await withTableLogging('select', 'stock_movements', () => q);

        const rows = ((data || []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id),
          created_at: String(row.created_at),
          movement_type: String(row.movement_type || ''),
          quantity_change: Number(row.quantity_change) || 0,
          balance_after: row.balance_after === null || row.balance_after === undefined
            ? null
            : Number(row.balance_after),
          reference_doc: (row.reference_doc as string | null) ?? null,
          // La columna no existe en la tabla (ver FIX 42703 arriba): se
          // normaliza a null para mantener el tipo KardexMovementLike. Los
          // checks cosméticos `=== 'reversal'` quedan como no-ops seguros.
          reference_type: null,
          created_by: (row.created_by as string | null) ?? null,
        }));

        movimientos.push(...rows);

        if (rows.length < BATCH_SIZE) break;
        if (movimientos.length >= MAX_MOVEMENTS) {
          isTruncated = true;
          break;
        }
      }

      // ── Consulta 3: Σ total del ledger (conciliación con existencia) ────
      const sumaTotal = await sumarCantidadCambios(productId, cleanStoreId);

      // Orden cronológico ascendente determinista (§21/§22) + saldo corrido
      // DERIVADO desde el origen (§34-bis): saldo de cada fila = saldo
      // anterior + entrada − salida en el orden canónico — independiente
      // del orden de inserción del `balance_after` almacenado.
      const ordenados = ordenarCronologico(movimientos);
      const conSaldo = derivarSaldosCronologicos(ordenados, saldoInicial);
      const resumen = calcularResumenPeriodo(ordenados, saldoInicial);

      return { saldoInicial, movimientos: conSaldo, resumen, isTruncated, sumaTotal };
    },
    enabled: !!productId,
    staleTime: 15 * 1000,
  });
}
