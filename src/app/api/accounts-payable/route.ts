import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import {
  computeAccountsPayable,
  havanaDate,
  type PayableReceiptRow,
  type PayableServiceRow,
  type PayableCommissionRow,
  type PayableTxnRow,
} from '@/lib/accounts-payable/calculator';

/**
 * GET /api/accounts-payable
 *
 * Endpoint consolidado para Cuentas por Pagar — CP-AP-FORENSIC-RECONCILIATION-001.
 *
 * FUENTE ÚNICA DE VERDAD: toda la aritmética (KPIs, aging, agrupación por
 * proveedor, conciliación Total−Pagado=Saldo) la realiza el calculador puro
 * `src/lib/accounts-payable/calculator.ts` — la misma que usa la exportación
 * Excel. Esta ruta solo: valida, consulta y pagina.
 *
 * Contrato contable (misión §4.1):
 *   - Total   = Σ importes originales de las obligaciones incluidas en el filtro.
 *   - Pagado  = Σ pagos APLICADOS a esas obligaciones a la fecha de corte
 *               (Σ neta de payment_transactions con reversión; comisiones por
 *               su canal propio status/paid_at).
 *   - Saldo   = Total − Pagado. La antigüedad distribuye el SALDO, nunca el total.
 *
 * Fecha de corte (misión §6.2): date_to ?? hoy (día de negocio America/Havana).
 * Los pagos ≤ corte cuentan aunque sean anteriores a date_from; los posteriores
 * al corte no afectan la reconstrucción histórica.
 *
 * Query params:
 *   - store_id: UUID (requerido)
 *   - tab: 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid' (default 'all')
 *     NOTA: 'all' incluye documentos totalmente pagados — es lo que hace
 *     verificable Total − Pagado = Saldo contra el indicador «Pagado».
 *   - category: 'all' | 'receipts' | 'services' | 'commissions' (default 'all')
 *   - method: 'cash' | 'transfer' | 'zelle' | 'external_transfer' (zelle/external
 *     se expanden a ambos — CP-FIN-004)
 *   - currency: 'CUP' | 'USD' | 'MLC'
 *   - search: texto (proveedor, contiene insensible)
 *   - supplier: proveedor EXACTO (drill-down desde Por proveedor)
 *   - date_from / date_to: 'YYYY-MM-DD' — período de DOCUMENTOS por fecha
 *     contable (receipts.reception_date, received_services.service_date,
 *     comisiones created_at). date_to = fecha de corte.
 *   - mode: 'list' | 'grouped' (default 'list')
 *   - limit / offset: paginación SOLO del resultado en modo list (los KPIs y la
 *     agrupación siempre se calculan sobre el alcance completo del filtro).
 */

// FIX (2026-07-14, conservado): regex simple en vez de uuidLoose porque el
// store_id de Tienda Central Costpro no es UUID v4 estricto.
const uuidLooseRegex = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'UUID inválido',
);

const dateRegex = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Fecha inválida (formato esperado YYYY-MM-DD)',
);

const querySchema = z
  .object({
    store_id: uuidLooseRegex,
    tab: z.enum(['all', 'overdue', '30', '60', '90', '120', 'paid']).default('all'),
    category: z.enum(['all', 'receipts', 'services', 'commissions']).default('all'),
    // CP-FIN-004: canónico external_transfer + heredado zelle.
    method: z.enum(['cash', 'transfer', 'external_transfer', 'zelle']).optional(),
    currency: z.string().optional(),
    search: z.string().optional(),
    supplier: z.string().optional(),
    date_from: dateRegex.optional(),
    date_to: dateRegex.optional(),
    mode: z.enum(['list', 'grouped']).default('list'),
    limit: z.coerce.number().min(1).max(500).default(200),
    offset: z.coerce.number().min(0).default(0),
  })
  .refine(q => !q.date_from || !q.date_to || q.date_from <= q.date_to, {
    message: 'La fecha inicial no puede ser posterior a la fecha final',
    path: ['date_from'],
  });

interface ChunkRow { [k: string]: unknown }

/**
 * Fetch paginado COMPLETO por chunks (1000 filas) — elimina el defecto D5 de
 * la versión anterior (range() por fuente truncaba silenciosamente a 200 filas
 * y `has_more` quedaba roto: 3 fuentes × limit). Los KPIs exigen el alcance
 * completo del filtro; la paginación del RESULTADO se aplica después.
 */
async function fetchAll(
  supabase: ReturnType<typeof getSupabaseForSession>,
  table: string,
  select: string,
  eq: Record<string, string>,
  neq: Record<string, string> | null,
  notIn?: { column: string; values: string[] },
): Promise<ChunkRow[]> {
  const out: ChunkRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    if (neq) for (const [k, v] of Object.entries(neq)) q = q.neq(k, v);
    // CP-AP-ACCOUNTING-INTEGRITY-001: exclusión por conjunto (notIn) para
    // reflejar EXACTAMENTE los gates de pago del backend.
    if (notIn) q = q.not(notIn.column, 'in', `(${notIn.values.map(v => `"${v}"`).join(',')})`);
    const { data, error } = await q;
    if (error) throw new Error(`[${table}] ${error.message}`);
    const rows = (data || []) as unknown as ChunkRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      store_id: searchParams.get('store_id'),
      tab: searchParams.get('tab') || 'all',
      category: searchParams.get('category') || 'all',
      method: searchParams.get('method') || undefined,
      currency: searchParams.get('currency') || undefined,
      search: searchParams.get('search') || undefined,
      supplier: searchParams.get('supplier') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      mode: searchParams.get('mode') || 'list',
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { store_id, tab, category, method, currency, search, supplier, date_from, date_to, mode, limit, offset } =
      parsed.data;
    // CP-FIN-004: el filtro de Transf. Exterior cubre ambos identificadores.
    const methodFilter =
      method === 'zelle' || method === 'external_transfer'
        ? ['zelle', 'external_transfer']
        : method
          ? [method]
          : undefined;

    const supabase = getSupabaseForSession(session);

    // ── Consulta de las 3 fuentes de obligaciones + transacciones de pago ──
    // (RLS activo: cliente con el JWT de la sesión; store_id obligatorio.)
    // CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 7:
    // los filtros de estado replican EXACTAMENTE los gates de pago del
    // backend (register_supplier_payment / register_supplier_payment_multi):
    // · receipts: todo salvo voided/reversed (antes solo se excluía voided —
    //   una recepción reversed figuraba como obligación pagable que el RPC
    //   de pago rechazaba con ERR_RECEIPT_NOT_PAYABLE).
    // · services: SOLO active (antes solo se excluía voided — servicios
    //   cancelled/draft figuraban como obligaciones que el RPC rechazaba
    //   con ERR_SERVICE_NOT_ACTIVE). Paridad total con el gate de pago.
    const [receiptsRaw, servicesRaw, commissionsRaw, txnsRaw] = await Promise.all([
      fetchAll(supabase, 'receipts',
        'id, supplier, total_cost, paid_amount, payment_status, payment_method, reference_doc, due_date, reception_date, created_at, status',
        { store_id }, null, { column: 'status', values: ['voided', 'reversed'] }),
      fetchAll(supabase, 'received_services',
        'id, supplier, total_amount, paid_amount, payment_status, payment_method, reference_doc, due_date, service_date, currency, exchange_rate, created_at, status',
        { store_id, status: 'active' }, null),
      fetchAll(supabase, 'commission_payments',
        'id, final_amount, status, due_date, paid_at, payment_method, period_start, period_end, created_at, worker:workers!inner(first_name, last_name)',
        { store_id }, null),
      fetchAll(supabase, 'payment_transactions',
        'ref_type, ref_id, amount_cup, currency, payment_method, direction, payment_date, reference',
        { store_id }, null),
    ]);

    // Comisiones: solo approved/paid (pendiente de pago o pagada) — misma
    // selección histórica de la vista.
    const commissions: PayableCommissionRow[] = (commissionsRaw as unknown as Array<Record<string, unknown>>)
      .filter(c => c.status === 'approved' || c.status === 'paid')
      .map(c => {
        const worker = Array.isArray(c.worker) ? c.worker[0] : c.worker;
        const w = (worker ?? {}) as { first_name?: string | null; last_name?: string | null };
        return {
          id: String(c.id),
          final_amount: c.final_amount as number | null,
          status: c.status as string | null,
          due_date: (c.due_date as string | null) ?? null,
          paid_at: (c.paid_at as string | null) ?? null,
          payment_method: (c.payment_method as string | null) ?? null,
          period_start: (c.period_start as string | null) ?? null,
          period_end: (c.period_end as string | null) ?? null,
          worker_name: `${w.first_name || ''} ${w.last_name || ''}`.trim() || null,
          created_at: (c.created_at as string | null) ?? null,
        };
      });

    // payment_transactions: la tabla es compartida con POS/producción — solo
    // las de proveedores (receipt/service) alimentan Cuentas por Pagar.
    const txns: PayableTxnRow[] = (txnsRaw as unknown as Array<Record<string, unknown>>)
      .filter(t => t.ref_type === 'receipt' || t.ref_type === 'service')
      .map(t => ({
        ref_type: t.ref_type as 'receipt' | 'service',
        ref_id: String(t.ref_id),
        amount_cup: t.amount_cup as number,
        currency: (t.currency as string | null) ?? null,
        payment_method: (t.payment_method as string | null) ?? null,
        direction: (t.direction as string | null) ?? null,
        payment_date: String(t.payment_date),
        reference: (t.reference as string | null) ?? null,
      }));

    // ── Cálculo único (fuente de verdad compartida con el export) ──
    const result = computeAccountsPayable(
      receiptsRaw as unknown as PayableReceiptRow[],
      servicesRaw as unknown as PayableServiceRow[],
      commissions,
      txns,
      {
        tab,
        category,
        method: methodFilter,
        currency,
        search,
        supplier,
        date_from,
        date_to,
        now: havanaDate(), // día de negocio Habana (corte por defecto)
      },
    );

    // ── Respuesta ──
    if (mode === 'grouped') {
      return NextResponse.json({
        data: result.grouped,
        totals: result.totals,
        kpis: result.kpis,
        summary: result.summary,
        count: result.grouped.length,
        mode: 'grouped',
        meta: result.meta,
      });
    }

    // Paginación del resultado FINAL (no por fuente): pedir limit+1 para
    // calcular has_more sin una consulta extra.
    const page = result.payables.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;

    return NextResponse.json({
      data: page.slice(0, limit),
      kpis: result.kpis,
      summary: result.summary,
      count: result.payables.length,
      mode: 'list',
      meta: result.meta,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
        total: result.payables.length,
      },
    });
  } catch (error: any) {
    console.error('[accounts-payable] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
