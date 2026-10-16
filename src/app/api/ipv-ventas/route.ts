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
  type IpvDevolutionLineRow,
  type IpvProductRow,
} from '@/lib/ipv-ventas/compute';

/**
 * GET /api/ipv-ventas?from=<ISO>&to=<ISO>[&store_id=<uuid>]
 *
 * IPV — INGRESOS POR VENTAS (MISIÓN 2026-10-16).
 * Reporte de conciliación por producto: existencia inicial (reconstruida del
 * ledger a la víspera del período) → movimientos del período (ventas, vales de
 * salida, entradas, devoluciones, ajustes, transferencias) → existencia final,
 * más la columna "Ventas en importe" (CUP contable con tasa histórica de cada
 * venta + USD nativo informativo).
 *
 * Seguridad (MISIÓN §12):
 *  · withAuth: sesión obligatoria; cliente Supabase DE SESIÓN → RLS respetada.
 *  · store_id explícito → canViewStore (lectura); si no, tienda activa del
 *    perfil. Nunca se acepta una tienda sin membresía activa.
 *  · Parámetros validados en servidor (ISO, orden, tope de 366 días, UUID);
 *    sin secretos en los errores.
 *  · SOLO LECTURA: ninguna ruta del IPV escribe en datos comerciales.
 *
 * Rendimiento: 5 consultas acotadas por tienda (una por fuente), agregación
 * en Node — el volumen del ledger está acotado por la regla de operación
 * retrodatable ≤ 6 meses de COSTPRO. Sin consulta por producto.
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
    const [productsRes, movementsRes, inventoryRes, salesRes, devolutionsRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, sku, name, unit_of_measure')
        .eq('store_id', storeIdFinal),
      supabase
        .from('stock_movements')
        .select('product_id, movement_type, quantity_change, movement_date')
        .eq('store_id', storeIdFinal),
      supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('store_id', storeIdFinal),
      supabase
        .from('transaction_items')
        .select('product_id, quantity, price_at_sale, price_at_sale_cup, price_currency, exchange_rate, transactions!inner(status, store_id, completed_at, sale_exchange_rate)')
        .eq('transactions.status', 'completed')
        .eq('transactions.store_id', storeIdFinal)
        .gte('transactions.completed_at', fromISO)
        .lte('transactions.completed_at', toISO),
      supabase
        .from('devolution_items')
        .select('product_id, quantity, unit_price, devolutions!inner(status, store_id, created_at)')
        .eq('devolutions.status', 'completed')
        .eq('devolutions.store_id', storeIdFinal)
        .gte('devolutions.created_at', fromISO)
        .lte('devolutions.created_at', toISO),
    ]);

    const firstError = productsRes.error || movementsRes.error || inventoryRes.error || salesRes.error || devolutionsRes.error;
    if (firstError) {
      console.error('[ipv-ventas] Error de consulta:', firstError.message);
      return NextResponse.json({ error: 'No se pudieron consultar los datos del reporte' }, { status: 500 });
    }

    const result: IpvResult = computeIpv({
      window: { fromISO, toISO },
      movements: (movementsRes.data ?? []) as unknown as IpvMovementRow[],
      inventory: (inventoryRes.data ?? []) as unknown as IpvInventoryRow[],
      salesLines: (salesRes.data ?? []) as unknown as IpvSalesLineRow[],
      devolutionLines: (devolutionsRes.data ?? []) as unknown as IpvDevolutionLineRow[],
      products: (productsRes.data ?? []) as unknown as IpvProductRow[],
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
    return NextResponse.json({ error: 'Error interno al generar el IPV' }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
