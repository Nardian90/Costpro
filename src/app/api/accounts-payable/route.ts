import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

/**
 * GET /api/accounts-payable
 *
 * Endpoint consolidado para Cuentas por Pagar.
 * Consulta receipts + received_services (Fase 3: + commission_payments),
 * normaliza campos, calcula aging buckets server-side, y devuelve:
 *   - data: UnifiedPayable[] (array de obligaciones normalizadas)
 *   - kpis: { totalOverdue, totalUpcoming, totalPending, totalPaid } en CUP
 *   - summary: totales por tipo de documento
 *
 * Query params:
 *   - store_id: UUID (requerido)
 *   - tab: 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid' (default: 'all')
 *   - method: 'cash' | 'transfer' | 'zelle' (filtro por método de pago)
 *   - currency: 'CUP' | 'USD' | 'MLC' (filtro por moneda del documento)
 *   - search: string (búsqueda por proveedor)
 *
 * FASE 1 (2026-07-13): receipts + received_services
 * FASE 3 (próximo): + commission_payments (comisiones approved)
 */

// FIX (2026-07-14): usar uuidLoose (regex simple) en vez de z.string().uuid()
// porque el store_id de Tienda Central Costpro (d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576)
// no es UUID v4 estricto y z.string().uuid() lo rechaza.
import { uuidLoose } from '@/validation/api-schemas';

const querySchema = z.object({
  store_id: uuidLoose,
  tab: z.enum(['all', 'overdue', '30', '60', '90', '120', 'paid']).default('all'),
  method: z.enum(['cash', 'transfer', 'zelle']).optional(),
  currency: z.string().optional(),
  search: z.string().optional(),
  mode: z.enum(['list', 'grouped']).default('list'),
  limit: z.coerce.number().min(1).max(500).default(200),
  offset: z.coerce.number().min(0).default(0),
});

interface UnifiedPayable {
  id: string;
  ref_type: 'receipt' | 'service' | 'commission';
  ref_id: string;
  supplier: string | null;
  reference: string | null;
  total: number;
  total_cup: number;
  paid_amount: number;
  paid_cup: number;
  balance: number;
  balance_cup: number;
  currency: string;
  exchange_rate: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method: string | null;
  due_date: string | null;
  days_until_due: number | null;
  is_overdue: boolean;
  aging_bucket: 'current' | '30' | '60' | '90' | '120' | '120+' | 'paid';
  created_at: string;
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      store_id: searchParams.get('store_id'),
      tab: searchParams.get('tab') || 'all',
      method: searchParams.get('method') || undefined,
      currency: searchParams.get('currency') || undefined,
      search: searchParams.get('search') || undefined,
      mode: searchParams.get('mode') || 'list',  // FIX-AUD4-2: mode no se parseaba
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { store_id, tab, method, currency, search, mode, limit, offset } = parsed.data;
    const supabase = getSupabaseForSession(session);

    // ── Fecha de hoy en zona horaria del servidor (UTC) ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Consultar receipts ──
    let receiptsQuery = supabase
      .from('receipts')
      .select('id, supplier, total_cost, paid_amount, due_date, payment_status, payment_method, reference_doc, status, created_at')
      .eq('store_id', store_id)
      .neq('status', 'voided')
      .order('due_date', { ascending: true, nullsFirst: false });

    // ── Consultar received_services ──
    let servicesQuery = supabase
      .from('received_services')
      .select('id, supplier, total_amount, paid_amount, due_date, payment_status, payment_method, reference_doc, status, currency, exchange_rate, created_at')
      .eq('store_id', store_id)
      .neq('status', 'voided')
      .order('due_date', { ascending: true, nullsFirst: false });

    // Filtro por búsqueda de proveedor
    if (search) {
      receiptsQuery = receiptsQuery.ilike('supplier', `%${search}%`);
      servicesQuery = servicesQuery.ilike('supplier', `%${search}%`);
    }

    // Filtro por moneda
    if (currency) {
      if (currency === 'CUP') {
        servicesQuery = servicesQuery.eq('currency', 'CUP');
        // Comisiones siempre son CUP, no filtrar
      } else {
        // receipts no tienen currency en header (siempre CUP), excluir si filtra por otra moneda
        receiptsQuery = receiptsQuery.eq('supplier', '__NONEXISTENT__');
        servicesQuery = servicesQuery.eq('currency', currency);
        // Comisiones son CUP, excluir si filtra por otra moneda
      }
    }

    // ── FASE 3: Consultar commission_payments (comisiones approved o paid) ──
    // R2: comisiones se pagan completo en CUP (efectivo/transferencia/mixto)
    // status 'approved' = pendiente de pago, 'paid' = pagada
    let commissionsQuery = supabase
      .from('commission_payments')
      .select(`
        id,
        worker_id,
        period_start,
        period_end,
        due_date,
        final_amount,
        calculated_amount,
        status,
        payment_method,
        payment_reference,
        paid_at,
        created_at,
        worker:workers!inner(first_name, last_name, ci)
      `)
      .eq('store_id', store_id)
      .in('status', ['approved', 'paid'])
      .order('due_date', { ascending: true, nullsFirst: false });

    // Excluir comisiones si filtra por moneda no-CUP
    if (currency && currency !== 'CUP') {
      commissionsQuery = commissionsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }

    // FIX-AUD5-M1: aplicar paginación a cada query
    const [receiptsResult, servicesResult, commissionsResult] = await Promise.all([
      receiptsQuery.range(offset, offset + limit - 1),
      servicesQuery.range(offset, offset + limit - 1),
      commissionsQuery.range(offset, offset + limit - 1),
    ]);

    if (receiptsResult.error) {
      console.error('[accounts-payable] Error receipts:', receiptsResult.error);
      return NextResponse.json({ error: receiptsResult.error.message }, { status: 500 });
    }
    if (servicesResult.error) {
      console.error('[accounts-payable] Error services:', servicesResult.error);
      return NextResponse.json({ error: servicesResult.error.message }, { status: 500 });
    }
    if (commissionsResult.error) {
      console.error('[accounts-payable] Error commissions:', commissionsResult.error);
      return NextResponse.json({ error: commissionsResult.error.message }, { status: 500 });
    }

    // ── Normalizar a UnifiedPayable[] ──
    const payables: UnifiedPayable[] = [];

    // Procesar receipts (CUP, exchange_rate=1)
    for (const r of receiptsResult.data || []) {
      const total = Number(r.total_cost) || 0;
      const paid = Number(r.paid_amount) || 0;
      const balance = total - paid;
      const dueDate = r.due_date ? new Date(r.due_date) : null;
      const daysUntilDue = dueDate
        ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
        : null;
      const isOverdue = dueDate ? dueDate < today && r.payment_status !== 'paid' : false;

      let agingBucket: UnifiedPayable['aging_bucket'] = 'current';
      if (r.payment_status === 'paid') {
        agingBucket = 'paid';
      } else if (isOverdue) {
        const overdueDays = daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;
        if (overdueDays > 120) agingBucket = '120+';
        else if (overdueDays > 90) agingBucket = '120';
        else if (overdueDays > 60) agingBucket = '90';
        else if (overdueDays > 30) agingBucket = '60';
        else agingBucket = '30';
      }

      payables.push({
        id: `receipt-${r.id}`,
        ref_type: 'receipt',
        ref_id: r.id,
        supplier: r.supplier,
        reference: r.reference_doc,
        total,
        total_cup: total,
        paid_amount: paid,
        paid_cup: paid,
        balance,
        balance_cup: balance,
        currency: 'CUP',
        exchange_rate: 1.0,
        payment_status: r.payment_status || 'unpaid',
        payment_method: r.payment_method,
        due_date: r.due_date,
        days_until_due: daysUntilDue,
        is_overdue: isOverdue,
        aging_bucket: agingBucket,
        created_at: r.created_at,
      });
    }

    // Procesar received_services (tienen currency y exchange_rate en header)
    for (const s of servicesResult.data || []) {
      const total = Number(s.total_amount) || 0;
      const paid = Number(s.paid_amount) || 0;
      const balance = total - paid;
      const exRate = Number(s.exchange_rate) || 1.0;
      const cur = s.currency || 'CUP';
      const totalCup = cur === 'CUP' ? total : total * exRate;
      const paidCup = cur === 'CUP' ? paid : paid * exRate;
      const balanceCup = totalCup - paidCup;
      const dueDate = s.due_date ? new Date(s.due_date) : null;
      const daysUntilDue = dueDate
        ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
        : null;
      const isOverdue = dueDate ? dueDate < today && s.payment_status !== 'paid' : false;

      let agingBucket: UnifiedPayable['aging_bucket'] = 'current';
      if (s.payment_status === 'paid') {
        agingBucket = 'paid';
      } else if (isOverdue) {
        const overdueDays = daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;
        if (overdueDays > 120) agingBucket = '120+';
        else if (overdueDays > 90) agingBucket = '120';
        else if (overdueDays > 60) agingBucket = '90';
        else if (overdueDays > 30) agingBucket = '60';
        else agingBucket = '30';
      }

      payables.push({
        id: `service-${s.id}`,
        ref_type: 'service',
        ref_id: s.id,
        supplier: s.supplier,
        reference: s.reference_doc,
        total,
        total_cup: totalCup,
        paid_amount: paid,
        paid_cup: paidCup,
        balance,
        balance_cup: balanceCup,
        currency: cur,
        exchange_rate: exRate,
        payment_status: s.payment_status || 'unpaid',
        payment_method: s.payment_method,
        due_date: s.due_date,
        days_until_due: daysUntilDue,
        is_overdue: isOverdue,
        aging_bucket: agingBucket,
        created_at: s.created_at,
      });
    }

    // ── FASE 3: Procesar commission_payments ──
    // R2: comisiones en CUP, pago completo, efectivo/transferencia/mixto
    // status 'approved' → unpaid (pendiente), 'paid' → paid
    for (const c of commissionsResult.data || []) {
      const total = Number(c.final_amount) || 0;
      const paid = c.status === 'paid' ? total : 0;
      const balance = total - paid;
      const workerData = Array.isArray(c.worker) ? c.worker[0] : c.worker;
      const workerName = workerData
        ? `${workerData.first_name || ''} ${workerData.last_name || ''}`.trim()
        : 'Trabajador desconocido';
      const dueDate = c.due_date ? new Date(c.due_date) : null;
      const daysUntilDue = dueDate
        ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
        : null;
      const isOverdue = dueDate ? dueDate < today && c.status !== 'paid' : false;
      const paymentStatus = c.status === 'paid' ? 'paid' : 'unpaid';

      let agingBucket: UnifiedPayable['aging_bucket'] = 'current';
      if (c.status === 'paid') {
        agingBucket = 'paid';
      } else if (isOverdue) {
        const overdueDays = daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;
        if (overdueDays > 120) agingBucket = '120+';
        else if (overdueDays > 90) agingBucket = '120';
        else if (overdueDays > 60) agingBucket = '90';
        else if (overdueDays > 30) agingBucket = '60';
        else agingBucket = '30';
      }

      payables.push({
        id: `commission-${c.id}`,
        ref_type: 'commission',
        ref_id: c.id,
        supplier: workerName,
        reference: `Comisión ${c.period_start} a ${c.period_end}`,
        total,
        total_cup: total, // comisiones siempre CUP
        paid_amount: paid,
        paid_cup: paid,
        balance,
        balance_cup: balance,
        currency: 'CUP',
        exchange_rate: 1.0,
        payment_status: paymentStatus,
        payment_method: c.payment_method,
        due_date: c.due_date,
        days_until_due: daysUntilDue,
        is_overdue: isOverdue,
        aging_bucket: agingBucket,
        created_at: c.created_at,
      });
    }

    // ── Filtrar por método de pago ──
    // Para comisiones, payment_method puede ser 'mixed' — incluir si filtra por cash o transfer
    let filtered = payables;
    if (method) {
      filtered = filtered.filter(p => {
        if (p.ref_type === 'commission') {
          // Comisiones: 'mixed' contiene ambos métodos
          return p.payment_method === method || p.payment_method === 'mixed';
        }
        return p.payment_method === method;
      });
    }

    // ── Filtrar por tab ──
    if (tab === 'all') {
      filtered = filtered.filter(p => p.payment_status !== 'paid');
    } else if (tab === 'overdue') {
      filtered = filtered.filter(p => p.is_overdue);
    } else if (tab === 'paid') {
      filtered = filtered.filter(p => p.payment_status === 'paid');
    } else {
      filtered = filtered.filter(p => p.aging_bucket === tab && p.payment_status !== 'paid');
    }

    // ── KPIs (sobre TODOS los payables, no los filtrados por tab) ──
    const kpis = {
      totalOverdue: payables
        .filter(p => p.is_overdue && p.payment_status !== 'paid')
        .reduce((s, p) => s + p.balance_cup, 0),
      totalUpcoming: payables
        .filter(p => !p.is_overdue && p.payment_status !== 'paid' && p.days_until_due !== null && p.days_until_due <= 7)
        .reduce((s, p) => s + p.balance_cup, 0),
      totalPending: payables
        .filter(p => p.payment_status !== 'paid')
        .reduce((s, p) => s + p.balance_cup, 0),
      totalPaid: payables
        .filter(p => p.payment_status === 'paid')
        .reduce((s, p) => s + p.total_cup, 0),
    };

    // ── Summary por tipo ──
    const summary = {
      receipts: {
        count: payables.filter(p => p.ref_type === 'receipt').length,
        balance_cup: payables
          .filter(p => p.ref_type === 'receipt' && p.payment_status !== 'paid')
          .reduce((s, p) => s + p.balance_cup, 0),
      },
      services: {
        count: payables.filter(p => p.ref_type === 'service').length,
        balance_cup: payables
          .filter(p => p.ref_type === 'service' && p.payment_status !== 'paid')
          .reduce((s, p) => s + p.balance_cup, 0),
      },
      commissions: {
        count: payables.filter(p => p.ref_type === 'commission').length,
        balance_cup: payables
          .filter(p => p.ref_type === 'commission' && p.payment_status !== 'paid')
          .reduce((s, p) => s + p.balance_cup, 0),
      },
    };

    // ── FIX-EXCEL-VIEW: mode='grouped' agrupa por proveedor con columnas aging ──
    // Estructura estilo Excel: una fila por proveedor, columnas por rango de vencimiento.
    // Columnas: Proveedor | Total | Pagado | Saldo | 0-30d | 31-60d | 61-90d | 91-120d | 120+ | Vencido
    if (mode === 'grouped') {
      const supplierMap = new Map<string, {
        supplier: string;
        total_cup: number;
        paid_cup: number;
        balance_cup: number;
        aging: {
          current: number;  // no vencido, > 7 días (próximo)
          overdue: number;  // vencido (cualquier antigüedad)
          '30': number;     // vencido 0-30d
          '60': number;     // vencido 31-60d
          '90': number;     // vencido 61-90d
          '120': number;    // vencido 91-120d
          '120+': number;   // vencido +120d
        };
        count: number;
      }>();

      for (const p of payables) {
        if (p.payment_status === 'paid') continue; // excluir pagados del aging

        const key = p.supplier || 'Sin proveedor';
        if (!supplierMap.has(key)) {
          supplierMap.set(key, {
            supplier: key,
            total_cup: 0,
            paid_cup: 0,
            balance_cup: 0,
            aging: { current: 0, overdue: 0, '30': 0, '60': 0, '90': 0, '120': 0, '120+': 0 },
            count: 0,
          });
        }

        const entry = supplierMap.get(key)!;
        entry.total_cup += p.total_cup;
        entry.paid_cup += p.paid_cup;
        entry.balance_cup += p.balance_cup;
        entry.count += 1;

        // Distribuir el saldo en la columna de aging correspondiente
        if (p.is_overdue) {
          entry.aging.overdue += p.balance_cup;
          // Bucket específico de vencido
          if (p.aging_bucket === '30') entry.aging['30'] += p.balance_cup;
          else if (p.aging_bucket === '60') entry.aging['60'] += p.balance_cup;
          else if (p.aging_bucket === '90') entry.aging['90'] += p.balance_cup;
          else if (p.aging_bucket === '120') entry.aging['120'] += p.balance_cup;
          else if (p.aging_bucket === '120+') entry.aging['120+'] += p.balance_cup;
        } else {
          // No vencido = "corriente" (próximo a vencer o sin vencimiento)
          entry.aging.current += p.balance_cup;
        }
      }

      const groupedData = Array.from(supplierMap.values()).sort((a, b) => b.balance_cup - a.balance_cup);

      // Totales generales (fila de totales)
      const totals = {
        total_cup: groupedData.reduce((s, g) => s + g.total_cup, 0),
        paid_cup: groupedData.reduce((s, g) => s + g.paid_cup, 0),
        balance_cup: groupedData.reduce((s, g) => s + g.balance_cup, 0),
        aging: {
          current: groupedData.reduce((s, g) => s + g.aging.current, 0),
          overdue: groupedData.reduce((s, g) => s + g.aging.overdue, 0),
          '30': groupedData.reduce((s, g) => s + g.aging['30'], 0),
          '60': groupedData.reduce((s, g) => s + g.aging['60'], 0),
          '90': groupedData.reduce((s, g) => s + g.aging['90'], 0),
          '120': groupedData.reduce((s, g) => s + g.aging['120'], 0),
          '120+': groupedData.reduce((s, g) => s + g.aging['120+'], 0),
        },
      };

      return NextResponse.json({
        data: groupedData,
        totals,
        kpis,
        summary,
        count: groupedData.length,
        mode: 'grouped',
      });
    }

    return NextResponse.json({
      data: filtered,
      kpis,
      summary,
      count: filtered.length,
      mode: 'list',
      pagination: { limit, offset, has_more: filtered.length === limit },  // FIX-AUD5-M1
    });
  } catch (error: any) {
    console.error('[accounts-payable] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
