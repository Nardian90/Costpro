import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

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
 *
 * Devuelve:
 *   - data: UnifiedReceivable[]
 *   - kpis: { totalOverdue, totalUpcoming, totalPending, totalPaid } en CUP
 *   - summary: totales por estado de pago
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
  balance_cup: number;
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

    // Calcular aging buckets y filtrar por tab
    const now = new Date();
    const receivables: UnifiedReceivable[] = [];

    for (const order of orders || []) {
      const budgetTotal = Number(order.budget_total || 0);
      const paidAmount = Number(order.paid_amount || 0);
      const balance = Math.max(0, budgetTotal - paidAmount);

      // Solo incluir si hay saldo pendiente o si tab='paid'
      const isPaid = balance <= 0.01;
      if (tab === 'paid' && !isPaid) continue;
      if (tab !== 'paid' && isPaid) continue;

      // Convertir balance a CUP
      const balanceCup = order.budget_currency === 'CUP' ? balance : balance * 450;

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
        payment_status: order.payment_status || 'unpaid',
        status: order.status,
        order_date: order.order_date || order.created_at,
        created_at: order.created_at,
        age_days: ageDays,
        aging_bucket: agingBucket,
      });
    }

    // KPIs
    const kpis = {
      totalOverdue: receivables.filter(r => r.age_days > 30).reduce((s, r) => s + r.balance_cup, 0),
      totalUpcoming: receivables.filter(r => r.age_days <= 30).reduce((s, r) => s + r.balance_cup, 0),
      totalPending: receivables.reduce((s, r) => s + r.balance_cup, 0),
      totalPaid: 0, // se calcularía separadamente si se necesita
    };

    // Summary por aging bucket
    const summary = {
      '0-30d': receivables.filter(r => r.aging_bucket === '0-30d').reduce((s, r) => s + r.balance_cup, 0),
      '31-60d': receivables.filter(r => r.aging_bucket === '31-60d').reduce((s, r) => s + r.balance_cup, 0),
      '61-90d': receivables.filter(r => r.aging_bucket === '61-90d').reduce((s, r) => s + r.balance_cup, 0),
      '91-120d': receivables.filter(r => r.aging_bucket === '91-120d').reduce((s, r) => s + r.balance_cup, 0),
      '+120d': receivables.filter(r => r.aging_bucket === '+120d').reduce((s, r) => s + r.balance_cup, 0),
      count: receivables.length,
    };

    return NextResponse.json({
      data: receivables,
      kpis,
      summary,
      count: receivables.length,
    });
  } catch (error: any) {
    console.error('[accounts-receivable] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
