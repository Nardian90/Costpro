import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { canViewStore } from '@/lib/roles';
import {
  computeIpv,
  type IpvResult,
  type IpvMovementRow,
  type IpvInventoryRow,
  type IpvSalesLineRow,
  type IpvSalePaymentRow,
  type IpvDevolutionLineRow,
  type IpvProductRow,
} from '@/lib/ipv-ventas/compute';
import { fetchAllRows, type FetchAllBuilderLike } from '@/lib/supabase-fetch-all';
import { fetchSalePaymentsByTx } from '@/lib/cash-report/fetch-sale-payments';

/**
 * GET /api/ipv-ventas?from=<ISO>&to=<ISO>[&store_id=<uuid>]
 *
 * IPV — INGRESOS POR VENTAS (MISIÓN 2026-10-16).
 * Reporte de conciliación por producto: existencia inicial (reconstruida del
 * ledger a la víspera del período) → movimientos del período (ventas, vales de
 * salida, entradas, devoluciones, ajustes, transferencias) → existencia final,
 * más la columna "Ventas en importe": CUP contable (tasa histórica de cada
 * venta) + USD efectivamente cobrados (CORRECCIÓN 2026-11-11: la moneda de
 * cada importe sale del registro REAL de la venta y sus pagos — ver
 * src/lib/ipv-ventas/compute.ts).
 *
 * Seguridad (MISIÓN §12):
 *  · withAuth: sesión obligatoria; cliente Supabase DE SESIÓN → RLS respetada.
 *  · store_id explícito → canViewStore (lectura); si no, tienda activa del
 *    perfil. Nunca se acepta una tienda sin membresía activa.
 *  · Parámetros validados en servidor (ISO, orden, tope de 366 días, UUID);
 *    sin secretos en los errores.
 *  · SOLO LECTURA: ninguna ruta del IPV escribe en datos comerciales.
 *
 * Rendimiento (MISIÓN CORRECTIVA 2026-10-16): las 5 fuentes se descargan con
 * fetchAllRows — paginación .range() completa con `.order('id')` determinista.
 * PostgREST trunca en silencio a 1000 filas por consulta y ENERVIDA superó
 * ese tope en stock_movements (1123): las ventas del 14-15/10/2026 no llegaban
 * al cálculo → cantidades faltantes, Ei/Ef falsos (26 vs 21) y alertas
 * RECONCILIATION/PRE_LEDGER espurias. Ver
 * docs/audits/INCIDENTE_IPV_CANTIDADES_VENTAS_Y_RECONSTRUCCION_HISTORICA_2026-10-16.md
 * Un error de paginación falla explícitamente (500) — NUNCA se calcula el
 * informe sobre un subconjunto silencioso de los datos.
 */

export const dynamic = 'force-dynamic';

const MAX_SPAN_DAYS = 366;

interface IpvQueryParams {
  fromISO: string;
  toISO: string;
  storeId?: string;
}

function parseParams(req: NextRequest): { ok: true; params: IpvQueryParams } | { ok: false; message: string } {
  const { searchParams } = new URL(req.url);
  const fromRaw = searchParams.get('from') ?? '';
  const toRaw = searchParams.get('to') ?? '';
  const storeRaw = searchParams.get('store_id') ?? '';

  const fromDate = new Date(fromRaw);
  const toDate = new Date(toRaw);
  if (!fromRaw || Number.isNaN(fromDate.getTime())) return { ok: false, message: 'Parámetro "from" inválido: se requiere fecha ISO.' };
  if (!toRaw || Number.isNaN(toDate.getTime())) return { ok: false, message: 'Parámetro "to" inválido: se requiere fecha ISO.' };
  if (toDate.getTime() < fromDate.getTime()) return { ok: false, message: 'La fecha inicial no puede ser posterior a la fecha final.' };

  const spanDays = (toDate.getTime() - fromDate.getTime()) / 86400000;
  if (spanDays > MAX_SPAN_DAYS) return { ok: false, message: `El período no puede exceder ${MAX_SPAN_DAYS} días.` };

  if (storeRaw && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeRaw)) {
    return { ok: false, message: 'Parámetro "store_id" inválido.' };
  }

  return { ok: true, params: { fromISO: fromDate.toISOString(), toISO: toDate.toISOString(), storeId: storeRaw || undefined } };
}

/**
 * Puente tipado: el builder encadenable de supabase-js satisface la interfaz
 * mínima FetchAllBuilderLike tras `.order('id')` (clave de paginación estable).
 */
function pageable<T>(builder: unknown): FetchAllBuilderLike<T> {
  return builder as FetchAllBuilderLike<T>;
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const parsed = parseParams(req);
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });
    const { fromISO, toISO, storeId } = parsed.params;

    const supabase = getSupabaseForSession(session);

    // ── Tienda: explícita (validada) o activa del perfil ───────────────────
    let effectiveStoreId = storeId ?? null;
    if (effectiveStoreId) {
      if (!canViewStore(session.user, effectiveStoreId)) {
        return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 });
      }
    } else {
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('active_store_id')
        .eq('id', session.user.id)
        .single();
      if (userError || !userData?.active_store_id) {
        return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
      }
      effectiveStoreId = userData.active_store_id as string;
      if (!canViewStore(session.user, effectiveStoreId)) {
        return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 });
      }
    }
    const storeIdFinal: string = effectiveStoreId;

    // ── Fuentes (una consulta por tabla, acotadas por tienda) ───────────────
    // MISIÓN CORRECTIVA 2026-10-16: paginación OBLIGATORIA en las 5 fuentes.
    // CORRECCIÓN IPV 2026-11-11: las líneas de venta viajan ahora con el
    // desglose del cobro por ítem (cash_paid/currency…) y los pools de la venta
    // (transactions!inner), y se trae el LEDGER de pagos
    // (payment_transactions, ref_type='sale') para reconstruir la moneda REAL
    // de cada importe (misma fuente única del Reporte de Entrega).
    const [products, movements, inventory, salesLines, devolutionLines] = await Promise.all([
      fetchAllRows(
        pageable(supabase
          .from('products')
          .select('id, sku, name, unit_of_measure')
          .eq('store_id', storeIdFinal)
          .order('id')),
      ),
      fetchAllRows(
        pageable(supabase
          .from('stock_movements')
          .select('product_id, movement_type, quantity_change, movement_date')
          .eq('store_id', storeIdFinal)
          .order('id')),
      ),
      fetchAllRows(
        pageable(supabase
          .from('inventory')
          .select('product_id, quantity')
          .eq('store_id', storeIdFinal)
          .order('id')),
      ),
      fetchAllRows(
        pageable(supabase
          .from('transaction_items')
          .select(`transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup,
                   price_currency, currency, exchange_rate,
                   cash_paid, cash_currency, transfer_paid, transfer_currency,
                   zelle_paid, zelle_currency,
                   transactions!inner(status, store_id, completed_at, sale_exchange_rate,
                                       sale_currency, cash_amount, transfer_amount, zelle_amount)`)
          .eq('transactions.status', 'completed')
          .eq('transactions.store_id', storeIdFinal)
          .gte('transactions.completed_at', fromISO)
          .lte('transactions.completed_at', toISO)
          .order('id')),
      ),
      fetchAllRows(
        pageable(supabase
          .from('devolution_items')
          .select('product_id, quantity, unit_price, devolutions!inner(status, store_id, created_at)')
          .eq('devolutions.status', 'completed')
          .eq('devolutions.store_id', storeIdFinal)
          .gte('devolutions.created_at', fromISO)
          .lte('devolutions.created_at', toISO)
          .order('id')),
      ),
    ]);

    // Aplanar la relación embebida `transactions` (PostgREST la anida bajo su
    // clave) hacia el nivel de fila que consume computeIpv — antes los campos
    // de cabecera (sale_exchange_rate) llegaban anidados y el fallback de tasa
    // de cabecera nunca se activaba.
    const salesLinesFlat: IpvSalesLineRow[] = (salesLines as Array<Record<string, unknown>>).map((row) => {
      const t = (row.transactions ?? null) as Record<string, unknown> | null;
      return {
        transaction_id: (row.transaction_id ?? null) as string | null,
        product_id: row.product_id as string,
        quantity: row.quantity as string | number | null,
        price_at_sale: row.price_at_sale as string | number | null,
        price_at_sale_cup: row.price_at_sale_cup as string | number | null,
        price_currency: (row.price_currency ?? null) as string | null,
        currency: (row.currency ?? null) as string | null,
        exchange_rate: row.exchange_rate as string | number | null,
        sale_exchange_rate: (t?.sale_exchange_rate ?? null) as string | number | null,
        cash_paid: (row.cash_paid ?? null) as string | number | null,
        cash_currency: (row.cash_currency ?? null) as string | null,
        transfer_paid: (row.transfer_paid ?? null) as string | number | null,
        transfer_currency: (row.transfer_currency ?? null) as string | null,
        zelle_paid: (row.zelle_paid ?? null) as string | number | null,
        zelle_currency: (row.zelle_currency ?? null) as string | null,
        cash_amount: (t?.cash_amount ?? null) as string | number | null,
        transfer_amount: (t?.transfer_amount ?? null) as string | number | null,
        zelle_amount: (t?.zelle_amount ?? null) as string | number | null,
        sale_currency: (t?.sale_currency ?? null) as string | null,
      };
    });

    // Ledger de pagos de las ventas del período (moneda REAL por componente).
    // Degradación limpia (mismo contrato que /api/cash-report/items-summary):
    // sin ledger la reconstrucción cae al desglose por ítem / heurística legada.
    const txIds = [...new Set(salesLinesFlat
      .map((l) => l.transaction_id)
      .filter((v): v is string => Boolean(v)) as string[])];
    const salesPayments: IpvSalePaymentRow[] = [];
    if (txIds.length > 0) {
      const paymentsByTx = await fetchSalePaymentsByTx(
        (ids) => supabase
          .from('payment_transactions')
          .select('transaction_id, payment_method, currency, amount, exchange_rate')
          .eq('ref_type', 'sale')
          .in('transaction_id', ids),
        txIds,
      );
      for (const [txId, list] of paymentsByTx) {
        for (const p of list) {
          salesPayments.push({
            transaction_id: txId,
            payment_method: p.payment_method,
            currency: p.currency,
            amount: p.amount,
            exchange_rate: p.exchange_rate,
          });
        }
      }
    }

    const result: IpvResult = computeIpv({
      window: { fromISO, toISO },
      movements: movements as unknown as IpvMovementRow[],
      inventory: inventory as unknown as IpvInventoryRow[],
      salesLines: salesLinesFlat,
      salesPayments,
      devolutionLines: devolutionLines as unknown as IpvDevolutionLineRow[],
      products: products as unknown as IpvProductRow[],
    });

    // Nombre de la tienda para el encabezado del informe
    const { data: storeRow } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeIdFinal)
      .single();

    return NextResponse.json({
      store: { id: storeIdFinal, name: storeRow?.name ?? 'Tienda' },
      window: { fromISO, toISO },
      result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ipv-ventas] Error inesperado:', error instanceof Error ? error.message : error);
    // Sin secretos en la respuesta: el detalle (incluida la fuente que falló) queda en logs.
    return NextResponse.json({ error: 'Error interno al generar el IPV' }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
