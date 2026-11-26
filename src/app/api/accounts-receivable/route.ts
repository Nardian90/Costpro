import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import { resolveCanonicalRate, convertBalanceToCup, round2 } from '@/lib/accounts-receivable/rates';

/**
 * GET /api/accounts-receivable
 *
 * Cobros por Antigüedad — espejo de Cuentas por Pagar pero para cobros.
 * Consulta production_orders con saldo pendiente (paid_amount < budget_total)
 * y calcula aging buckets server-side.
 *
 * Fuentes:
 *   - production_orders (order_type IN 'service', 'work') con status != voided
 *   - payment_transactions (ref_type IN 'production_order', 'work') para saldos
 *     (saldo pagado mantenido por el trigger update_payment_status — R-01
 *     remediado en 20261126140000)
 *   - store_exchange_rates para la conversión canónica a CUP (R-02: NUNCA una
 *     tasa fija; sin tasa vigente el saldo se expone en moneda del documento
 *     y NO entra en los totales CUP — FIN-009 «monedas distintas nunca se suman»)
 *
 * Devuelve:
 *   - data: UnifiedReceivable[]
 *   - kpis: { totalOverdue, totalUpcoming, totalPending, totalPaid } en CUP
 *     (solo saldos con tasa canónica disponible)
 *   - summary: totales por estado de pago
 *   - unrated: { count, total_by_currency } — saldos sin tasa canónica (transparencia)
 */

const uuidLooseRegex = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'UUID inválido'
);

const querySchema = z.object({
  store_id: uuidLooseRegex,
  tab: z.enum(['all', 'overdue', '30', '60', '90', '120', 'paid']).default('all'),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(200),
});

interface UnifiedReceivable {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_ci: string | null;
  description: string;
  budget_total: number;
  budget_currency: string;
  paid_amount: number;
  balance: number;
  /** null cuando no hay tasa canónica vigente para la divisa del documento
   *  (R-02: el saldo NO se convierte con constantes ad-hoc). */
  balance_cup: number | null;
  /** Tasa canónica usada para la conversión (null = sin tasa disponible). */
  exchange_rate_used: number | null;
  payment_status: string;
  status: string;
  order_date: string;
  created_at: string;
  age_days: number;
  aging_bucket: string;
}

async function getHandler(request: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      store_id: searchParams.get('store_id'),
      tab: searchParams.get('tab') || 'all',
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || 200,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: parsed.error.format() }, { status: 400 });
    }

    const { store_id, tab, search, limit } = parsed.data;
    const supabase = getSupabaseForSession(session);

    // V2.12.38: BOLA guard — validar que el store_id del query param coincide
    // con el active_store_id del usuario autenticado (no confiar solo en el cliente)
    const { data: userData } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (!userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    if (store_id !== userData.active_store_id) {
      return NextResponse.json({ error: 'No autorizado para esta tienda' }, { status: 403 });
    }

    // Query production_orders with unpaid/partial balance
    let query = supabase
      .from('production_orders')
      .select('id, order_number, customer_name, customer_phone, customer_ci, description, budget_total, budget_currency, paid_amount, payment_status, status, order_date, created_at')
      .eq('store_id', store_id)
      .in('order_type', ['service', 'work'])
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,order_number.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: orders, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // R-02 (CP-BRA-REMEDIATION-001): tasa canónica de la tienda — se resuelve
    // UNA vez por request y NUNCA se convierte con constantes ad-hoc (la tasa
    // fija 450 anterior producía importes distintos para la misma realidad
    // contable — FIN-009/FIN-011). Sin tasa vigente: saldo en moneda original
    // (fail-closed, sin fallback inventado).
    const { data: rateRows } = await supabase
      .from('store_exchange_rates')
      .select('currency, rate')
      .eq('store_id', store_id);
    const storeRates = (rateRows ?? []).map((r: { currency: string; rate: number | string }) => ({
      currency: r.currency,
      rate: Number(r.rate),
    }));

    // Calcular aging buckets y filtrar por tab
    const now = new Date();
    const receivables: UnifiedReceivable[] = [];
    const unratedTotalByCurrency = new Map<string, number>();
    let unratedCount = 0;

    for (const order of orders || []) {
      const budgetTotal = Number(order.budget_total || 0);
      const paidAmount = Number(order.paid_amount || 0);
      const balance = Math.max(0, budgetTotal - paidAmount);

      // Solo incluir si hay saldo pendiente o si tab='paid'
      const isPaid = balance <= 0.01;
      if (tab === 'paid' && !isPaid) continue;
      if (tab !== 'paid' && isPaid) continue;

      // R-02: conversión canónica server-side (tasa de la tienda; CUP → 1).
      const rate = resolveCanonicalRate(storeRates, order.budget_currency);
      const balanceCup = convertBalanceToCup(balance, order.budget_currency, rate);
      if (balanceCup === null) {
        unratedCount++;
        const cur = (order.budget_currency || 'CUP').toUpperCase();
        unratedTotalByCurrency.set(cur, round2((unratedTotalByCurrency.get(cur) ?? 0) + balance));
      }

      // Calcular age_days desde order_date
      const orderDate = new Date(order.order_date || order.created_at);
      const ageDays = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

      // Aging buckets
      let agingBucket = '0-30d';
      if (ageDays <= 30) agingBucket = '0-30d';
      else if (ageDays <= 60) agingBucket = '31-60d';
      else if (ageDays <= 90) agingBucket = '61-90d';
      else if (ageDays <= 120) agingBucket = '91-120d';
      else agingBucket = '+120d';

      // Filtrar por tab de aging
      if (tab === '30' && ageDays > 30) continue;
      if (tab === '60' && (ageDays <= 30 || ageDays > 60)) continue;
      if (tab === '90' && (ageDays <= 60 || ageDays > 90)) continue;
      if (tab === '120' && (ageDays <= 90 || ageDays > 120)) continue;
      if (tab === 'overdue' && ageDays <= 30) continue; // overdue = >30d sin pagar completo

      receivables.push({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name || '—',
        customer_phone: order.customer_phone,
        customer_ci: order.customer_ci,
        description: order.description || '',
        budget_total: budgetTotal,
        budget_currency: order.budget_currency || 'CUP',
        paid_amount: paidAmount,
        balance,
        balance_cup: balanceCup,
        exchange_rate_used: rate,
        payment_status: order.payment_status || 'unpaid',
        status: order.status,
        order_date: order.order_date || order.created_at,
        created_at: order.created_at,
        age_days: ageDays,
        aging_bucket: agingBucket,
      });
    }

    // KPIs — SOLO saldos con tasa canónica (FIN-009: monedas distintas nunca
    // se suman entre sí; los saldos sin tasa se reportan aparte en `unrated`).
    const rated = receivables.filter((r) => r.balance_cup !== null);
    const kpis = {
      totalOverdue: rated.filter(r => r.age_days > 30).reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      totalUpcoming: rated.filter(r => r.age_days <= 30).reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      totalPending: rated.reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      totalPaid: 0, // se calcularía separadamente si se necesita
    };

    // Summary por aging bucket (solo saldos con tasa canónica)
    const summary = {
      '0-30d': rated.filter(r => r.aging_bucket === '0-30d').reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      '31-60d': rated.filter(r => r.aging_bucket === '31-60d').reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      '61-90d': rated.filter(r => r.aging_bucket === '61-90d').reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      '91-120d': rated.filter(r => r.aging_bucket === '91-120d').reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      '+120d': rated.filter(r => r.aging_bucket === '+120d').reduce((s, r) => s + (r.balance_cup ?? 0), 0),
      count: receivables.length,
    };

    // Transparencia R-02: saldos SIN tasa canónica (nunca ocultos, nunca inventados)
    const unrated = {
      count: unratedCount,
      total_by_currency: Object.fromEntries(unratedTotalByCurrency),
    };

    return NextResponse.json({
      data: receivables,
      kpis,
      summary,
      unrated,
      count: receivables.length,
    });
  } catch (error: any) {
    console.error('[accounts-receivable] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
