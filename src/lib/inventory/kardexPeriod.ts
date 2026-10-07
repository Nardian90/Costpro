/**
 * Lógica pura del Kardex por producto (Trazabilidad).
 *
 * Regla de oro (§34 del requisito): UNA SOLA FUENTE DE VERDAD.
 * - El saldo oficial de cada movimiento es `balance_after`, calculado
 *   server-side en la tabla `stock_movements`.
 * - Estas funciones NUNCA recalculan saldos: solo ordenan, filtran,
 *   suman entradas/salidas del período y toman el saldo final del
 *   último movimiento del período tal como la BD lo registró.
 *
 * Funciones puras y testeables (sin dependencias de React ni Supabase).
 */

/** Forma mínima de un movimiento de stock para el Kardex. */
export interface KardexMovementLike {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  balance_after: number | null;
  reference_doc?: string | null;
  reference_type?: string | null;
  created_by?: string | null;
}

/** Producto mínimo necesario para buscar y listar coincidencias. */
export interface ProductSearchLike {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  unit_of_measure?: string | null;
  stock_current?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — BÚSQUEDA INTELIGENTE: ranking de coincidencias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prioriza coincidencias de forma profesional:
 *   0. coincidencia exacta de código (SKU)
 *   1. comienza por el código
 *   2. contiene el código
 *   3. coincidencia exacta de nombre
 *   4. comienza por el nombre
 *   5. contiene el nombre
 *   6. contiene la descripción (si existe)
 * Desempate estable: orden alfabético por nombre.
 */
export function rankearCoincidencias<T extends ProductSearchLike>(items: T[], term: string): T[] {
  const t = term.trim().toLowerCase();
  if (!t) return items;

  const score = (p: T): number => {
    const sku = (p.sku || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();

    if (sku === t) return 0;
    if (sku.startsWith(t)) return 1;
    if (sku.includes(t)) return 2;
    if (name === t) return 3;
    if (name.startsWith(t)) return 4;
    if (name.includes(t)) return 5;
    if (desc && desc.includes(t)) return 6;
    return 7;
  };

  return [...items].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return (a.name || '').localeCompare(b.name || '');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §10/§23 — RESUMEN DEL PERÍODO con saldo inicial, entradas, salidas, saldo final
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenPeriodo {
  /** Existencia acumulada antes del primer movimiento del período (§10). */
  saldoInicial: number;
  /** Σ entradas del período. */
  entradas: number;
  /** Σ salidas del período (valor absoluto). */
  salidas: number;
  /** balance_after del último movimiento del período; saldoInicial si no hay movimientos. */
  saldoFinal: number;
  /** Cantidad de movimientos del período. */
  cantidadMovimientos: number;
}

/**
 * Calcula el resumen del período a partir de los movimientos del período
 * (ordenados cronológicamente ascendente) y el saldo inicial precalculado.
 *
 * - Entrada/Salida de cada movimiento se derivan del SIGNO de
 *   `quantity_change` (misma convención que el motor RPC de Kardex:
 *   entry = max(0, qc); exit = min(0, qc) * -1).
 * - `saldoFinal` se toma SIEMPRE del `balance_after` registrado por la BD
 *   del último movimiento — jamás se recalcula client-side.
 */
export function calcularResumenPeriodo(
  movimientos: KardexMovementLike[],
  saldoInicial: number
): ResumenPeriodo {
  let entradas = 0;
  let salidas = 0;

  for (const m of movimientos) {
    const qc = m.quantity_change ?? 0;
    if (qc > 0) entradas += qc;
    else if (qc < 0) salidas += Math.abs(qc);
  }

  const ultimo = movimientos.length > 0 ? movimientos[movimientos.length - 1] : null;
  const saldoFinal =
    ultimo && ultimo.balance_after !== null && ultimo.balance_after !== undefined
      ? ultimo.balance_after
      : saldoInicial;

  return {
    saldoInicial,
    entradas,
    salidas,
    saldoFinal,
    cantidadMovimientos: movimientos.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §40 — FORMATO DE CANTIDADES sin alterar el valor real
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formatea una cantidad de inventario preservando sus decimales reales
 * (65.5 → "65.5", 0.5 → "0.5", 10.125 → "10.125", 100 → "100").
 * - No redondea arbitrariamente: recorta SOLO el ruido de coma flotante
 *   hasta 4 decimales y elimina ceros finales.
 * - Separador punto (coherente con el resto de la aplicación).
 */
export function formatearCantidad(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  // Elimina ruido de coma flotante (0.30000000000000004 → 0.3)
  const limpio = parseFloat(n.toFixed(4));
  return String(limpio);
}

// ─────────────────────────────────────────────────────────────────────────────
// §21/§22 — ORDEN CRONOLÓGICO DETERMINISTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ordena cronológicamente ascendente (más antiguo → más reciente) con
 * criterio determinista para movimientos de la misma fecha:
 * `created_at` ascendente, luego `id` ascendente.
 * El saldo corrido mostrado corresponde al `balance_after` de cada
 * movimiento registrado por la BD.
 */
export function ordenarCronologico<T extends KardexMovementLike>(movimientos: T[]): T[] {
  return [...movimientos].sort((a, b) => {
    const ta = new Date(a.created_at).getTime() || 0;
    const tb = new Date(b.created_at).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
