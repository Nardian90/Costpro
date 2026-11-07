/**
 * SALDO POSTERIOR HISTÓRICO (misión documentos SC-2-04 / SC-2-12, 2026-11-07)
 * ===========================================================================
 * Regla contable de la misión: el «Saldo en existencia según almacén» que
 * muestran los modelos oficiales es el saldo resultante del almacén
 * INMEDIATAMENTE DESPUÉS de contabilizar la operación del documento:
 *
 *     saldo posterior = saldo anterior del almacén ± cantidad de la operación
 *
 * Fuente de verdad: el submayor REAL de movimientos (`stock_movements`), con la
 * misma doctrina cronológica del kardex del proyecto (src/lib/inventory/
 * kardexPeriod.ts): orden canónico (created_at ASC, id ASC) y saldo corrido
 * derivado — el balance_after almacenado es solo evidencia de auditoría.
 *
 * Enlace documental (NUNCA se infiere solo por SKU o fecha):
 *  - Recepción: los movimientos propios son movement_type='purchase' con
 *    notes = receipt.id (RPC canónica register_reception / confirm_pending_
 *    reception escribe la recepción en `notes` del movimiento).
 *  - Venta: los movimientos propios son movement_type='sale' con
 *    reference_id = transaction.id (create_sale registra la venta en
 *    reference_id del movimiento).
 *
 * Invariantes de la misión:
 *  - No se suma dos veces la cantidad: la cantidad propia sale de Σ de los
 *    movimientos propios reales (o de la proyección cuando aún no existen).
 *  - Recepciones anuladas / documentos en borrador: sus movimientos no existen
 *    (pendiente) o quedan netados por su reversión posterior — el saldo
 *    histórico del documento se calcula en SU momento, por lo que una
 *    reversión posterior no altera la reimpresión (integridad histórica).
 *  - Otros almacenes nunca entran: el ledger se consulta por (product, store).
 *  - Varias líneas del mismo SKU en el documento: se agregan — el saldo
 *    mostrado es el del almacén tras contabilizar TODO el documento.
 *  - Si el documento se genera antes de contabilizarse (pendiente/borrador),
 *    se presenta una PROYECCIÓN (saldo actual ± cantidad pendiente).
 *  - Si no hay forma de determinar el saldo (sin movimientos propios ni
 *    proyección posible), NO se inventa cifra: fuente='limitacion' y el
 *    documento imprime «s/d» más una nota al pie.
 */

/** Fila mínima del submayor stock_movements (columnas tal cual la BD). */
export interface SaldoPosteriorMovement {
  id: string;
  created_at: string;
  /** numeric de PostgreSQL — puede llegar como string desde REST. */
  quantity_change: number | string;
  movement_type: string;
  /** Recepción canónica: notes = receipt.id. */
  notes?: string | null;
  /** Venta: reference_id = transaction.id. */
  reference_id?: string | null;
}

/** De dónde salió el saldo (trazabilidad del dato en el documento). */
export type SaldoPosteriorFuente =
  | 'ledger'      // saldo real derivado del submayor en el momento de la operación
  | 'proyeccion'  // documento pendiente/borrador: saldo actual ± cantidad pendiente
  | 'limitacion'; // historial insuficiente → «s/d» (jamás una cifra inventada)

export interface SaldoPosteriorResultado {
  saldoAnterior: number;
  saldoPosterior: number;
  fuente: SaldoPosteriorFuente;
}

export interface CalcularSaldoPosteriorOpciones {
  /** Ledger completo del producto en ESA tienda (cualquier orden; se ordena aquí). */
  movimientos: SaldoPosteriorMovement[];
  /** Movimientos propios del documento ya filtrados por su enlace documental. */
  movimientosPropios: SaldoPosteriorMovement[];
  /**
   * Delta total del documento para el SKU en unidades de inventario:
   * recepción → +Σ cantidades recibidas; venta → −Σ cantidades vendidas.
   * Solo se usa en la proyección (cuando el documento aún no tiene movimientos).
   */
  deltaDocumento: number;
  /** El documento aún no contabilizó (pendiente/borrador) → proyección. */
  pendienteContabilizar?: boolean;
}

/** Comparación canónica (created_at, id) — igual que el kardex del proyecto. */
function antesDe(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string },
): boolean {
  const ta = new Date(a.created_at).getTime() || 0;
  const tb = new Date(b.created_at).getTime() || 0;
  if (ta !== tb) return ta < tb;
  return a.id < b.id;
}

/** Orden cronológico local (misma doctrina del kardex, sin sus constraints). */
function ordenarSaldo<T extends { created_at: string; id: string }>(movs: T[]): T[] {
  return [...movs].sort((a, b) => (antesDe(a, b) ? -1 : antesDe(b, a) ? 1 : 0));
}

function qc(m: SaldoPosteriorMovement): number {
  return Number(m.quantity_change) || 0;
}

/**
 * Calcula { saldoAnterior, saldoPosterior } de un producto/almacén para un
 * documento, a partir del ledger real. Función PURA (testeable).
 */
export function calcularSaldoPosterior(opts: CalcularSaldoPosteriorOpciones): SaldoPosteriorResultado {
  const ledger = ordenarSaldo(opts.movimientos.map((m) => ({ ...m, quantity_change: qc(m) })));
  const propios = ordenarSaldo(opts.movimientosPropios.map((m) => ({ ...m, quantity_change: qc(m) })));

  // ── Documento ya contabilizado: saldo real en su momento histórico ──
  if (propios.length > 0) {
    const primero = propios[0];
    // Saldo anterior = Σ del ledger estrictamente ANTES del primer movimiento
    // propio (orden canónico created_at, id — misma doctrina del kardex).
    const saldoAnterior = ledger
      .filter((m) => antesDe(m, primero))
      .reduce((s, m) => s + m.quantity_change, 0);
    // Saldo posterior = saldo anterior + Σ de los movimientos propios reales
    // (fórmula de la misión; Σ propios evita dobles conteos: si el documento
    // tuviera reversión incluida en el enlace, netaría solo lo real).
    const deltaPropios = propios.reduce((s, m) => s + m.quantity_change, 0);
    return { saldoAnterior, saldoPosterior: saldoAnterior + deltaPropios, fuente: 'ledger' };
  }

  // ── Documento pendiente/borrador: proyección con el saldo actual ──
  if (opts.pendienteContabilizar) {
    const saldoActual = ledger.reduce((s, m) => s + m.quantity_change, 0);
    return { saldoAnterior: saldoActual, saldoPosterior: saldoActual + opts.deltaDocumento, fuente: 'proyeccion' };
  }

  // ── Sin movimientos propios ni proyección posible: limitación documentada ──
  return { saldoAnterior: NaN, saldoPosterior: NaN, fuente: 'limitacion' };
}

// ────────────────────────────────────────────────────────────────────────────
// Enlaces documentales (reutilizables por SC-2-04 y SC-2-12)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Movimientos PROPIOS de una recepción: entradas ('purchase') cuyo `notes`
 * carries el id de la recepción (RPC canónica register_reception). Una
 * reversión posterior (purchase_reverse) no pertenece a la operación original:
 * el saldo del documento es el de su momento histórico.
 */
export function movimientosDeRecepcion(
  movimientos: SaldoPosteriorMovement[],
  receiptId: string,
): SaldoPosteriorMovement[] {
  return movimientos.filter((m) => m.notes === receiptId && m.movement_type === 'purchase');
}

/**
 * Movimientos PROPIOS de una venta: 'sale' con reference_id = transaction.id.
 * Las reversiones posteriores (sale_reverse/sale_void) no alteran el saldo
 * histórico del documento.
 */
export function movimientosDeVenta(
  movimientos: SaldoPosteriorMovement[],
  transactionId: string,
): SaldoPosteriorMovement[] {
  return movimientos.filter((m) => m.reference_id === transactionId && m.movement_type === 'sale');
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura del ledger bajo RLS (solo lectura, acotada a productos del documento)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Superficie mínima del cliente Supabase usada aquí (cast contenido: el
 * cliente real la cumple; evita la recursión de tipos de PostgrestFilterBuilder
 * con los generics completos de supabase-js).
 */
interface MinimalSupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        in(column: string, values: unknown[]): {
          order(column: string, options: { ascending: boolean }): {
            range(from: number, to: number): Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // 20k movimientos por producto-tienda: techo defensivo

/**
 * Lee el ledger (stock_movements) de los productos indicados en UNA tienda,
 * ordenado cronológicamente, con paginación defensiva. Solo lectura.
 */
export async function fetchMovimientosPorProducto(
  client: unknown,
  productIds: string[],
  storeId: string,
): Promise<Record<string, SaldoPosteriorMovement[]>> {
  const db = client as MinimalSupabaseLike;
  const out: Record<string, SaldoPosteriorMovement[]> = {};
  if (productIds.length === 0 || !storeId) return out;
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from('stock_movements')
      .select('id, product_id, quantity_change, movement_type, notes, reference_id, created_at')
      .eq('store_id', storeId)
      .in('product_id', productIds)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as Array<SaldoPosteriorMovement & { product_id: string }>) || [];
    for (const r of rows) {
      (out[r.product_id] ||= []).push(r);
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}
