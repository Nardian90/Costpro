/**
 * useProductKardex — Motor de Kardex por producto con período (Trazabilidad).
 *
 * ARQUITECTURA — UNA SOLA FUENTE DE VERDAD (§34 del requisito):
 * - Lee la MISMA tabla `stock_movements` que el RPC del Kardex existente
 *   (`get_product_stock_ledger_paginated`).
 * - El saldo oficial de cada movimiento es `balance_after` calculado
 *   server-side (mismo contrato que FIX H-12 en useKardex).
 * - NO recalcula existencias: saldo inicial = balance_after del último
 *   movimiento ANTES del período; saldo final = balance_after del último
 *   movimiento DENTRO del período.
 *
 * Consultas:
 *  1. Saldo inicial (§10): último movimiento antes de `dateFrom` (limit 1).
 *  2. Movimientos del período (§11): product_id + store_id + rango de
 *     fechas, orden ASC (created_at, id) — determinista (§21/§22),
 *     por lotes de 1000 filas (§31 rendimiento).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging, getCleanStoreId } from './base';
import {
  calcularResumenPeriodo,
  ordenarCronologico,
  type KardexMovementLike,
  type ResumenPeriodo,
} from '@/lib/inventory/kardexPeriod';

const BATCH_SIZE = 1000;
/** Techo de seguridad (§31): evita consultas descontroladas; si se alcanza,
 * se marca `isTruncated` y la UI lo informa sin ocultar el problema. */
const MAX_MOVEMENTS = 10000;

export interface ProductKardexResult {
  /** Existencia acumulada antes del primer movimiento del período. */
  saldoInicial: number;
  /** Movimientos del período en orden cronológico ascendente. */
  movimientos: KardexMovementLike[];
  /** Resumen del período: entradas, salidas, saldo final, conteo. */
  resumen: ResumenPeriodo;
  /** true si se alcanzó el techo MAX_MOVEMENTS (período demasiado amplio). */
  isTruncated: boolean;
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
        };
      }

      // ── Consulta 1: saldo inicial (§10) ────────────────────────────────
      // Último movimiento ANTES del inicio del período → balance_after.
      // Si no hay movimientos previos, nada movió la existencia: 0.
      let saldoInicial = 0;
      if (dateFrom) {
        let prevQuery = supabase
          .from('stock_movements')
          .select('balance_after')
          .eq('product_id', productId)
          .lt('created_at', dateFrom)
          .order('created_at', { ascending: false })
          .limit(1);
        if (cleanStoreId) prevQuery = prevQuery.eq('store_id', cleanStoreId);

        // withTableLogging lanza error tipado y retorna directamente los datos
        const prevData = await withTableLogging('select', 'stock_movements', () => prevQuery);
        if (prevData && prevData.length > 0 && prevData[0].balance_after !== null) {
          saldoInicial = Number(prevData[0].balance_after) || 0;
        }
      }

      // ── Consulta 2: movimientos del período, por lotes (§31) ───────────
      const movimientos: KardexMovementLike[] = [];
      let isTruncated = false;

      for (let offset = 0; offset < MAX_MOVEMENTS; offset += BATCH_SIZE) {
        let q = supabase
          .from('stock_movements')
          .select(
            'id, created_at, movement_type, quantity_change, balance_after, reference_doc, reference_type, created_by'
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
          reference_type: (row.reference_type as string | null) ?? null,
          created_by: (row.created_by as string | null) ?? null,
        }));

        movimientos.push(...rows);

        if (rows.length < BATCH_SIZE) break;
        if (movimientos.length >= MAX_MOVEMENTS) {
          isTruncated = true;
          break;
        }
      }

      // Orden cronológico ascendente determinista (§21/§22) — el saldo
      // mostrado de cada fila sigue siendo el balance_after de la BD.
      const ordenados = ordenarCronologico(movimientos);
      const resumen = calcularResumenPeriodo(ordenados, saldoInicial);

      return { saldoInicial, movimientos: ordenados, resumen, isTruncated };
    },
    enabled: !!productId,
    staleTime: 15 * 1000,
  });
}
