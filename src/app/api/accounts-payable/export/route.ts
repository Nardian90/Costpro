import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import * as XLSX from '@e965/xlsx';
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
 * GET /api/accounts-payable/export
 *
 * Exporta la antigüedad de saldos (Cuentas por Pagar) a Excel.
 * CP-AP-FORENSIC-RECONCILIATION-001: usa el MISMO calculador que la vista
 * (fuente única de verdad) — el Excel ya no puede divergir de la pantalla.
 *
 * Hoja 1: Resumen por proveedor (incluye pagados → Total − Pagado = Saldo).
 * Hoja 2: Detalle por documento (fecha contable, vencimiento, aging a corte).
 *
 * Query params:
 *   - store_id: UUID (requerido)
 *   - date_from / date_to: 'YYYY-MM-DD' — período de documentos por fecha
 *     contable; date_to es la fecha de corte de saldos/antigüedad (misma
 *     semántica que la vista).
 */

const uuidLooseRegex = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'UUID inválido',
);
const dateRegex = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

const querySchema = z
  .object({
    store_id: uuidLooseRegex,
    date_from: dateRegex.optional(),
    date_to: dateRegex.optional(),
  })
  .refine(q => !q.date_from || !q.date_to || q.date_from <= q.date_to, {
    message: 'La fecha inicial no puede ser posterior a la fecha final',
    path: ['date_from'],
  });

interface ChunkRow { [k: string]: unknown }

async function fetchAll(
  supabase: ReturnType<typeof getSupabaseForSession>,
  table: string,
  select: string,
  eq: Record<string, string>,
  neq: Record<string, string> | null,
): Promise<ChunkRow[]> {
  const out: ChunkRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    if (neq) for (const [k, v] of Object.entries(neq)) q = q.neq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`[${table}] ${error.message}`);
    const rows = (data || []) as ChunkRow[];
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
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { store_id, date_from, date_to } = parsed.data;

    const supabase = getSupabaseForSession(session);

    const [receiptsRaw, servicesRaw, commissionsRaw, txnsRaw] = await Promise.all([
      fetchAll(supabase, 'receipts',
        'id, supplier, total_cost, paid_amount, payment_status, payment_method, reference_doc, due_date, reception_date, created_at',
        { store_id }, { status: 'voided' }),
      fetchAll(supabase, 'received_services',
        'id, supplier, total_amount, paid_amount, payment_status, payment_method, reference_doc, due_date, service_date, currency, exchange_rate, created_at',
        { store_id }, { status: 'voided' }),
      fetchAll(supabase, 'commission_payments',
        'id, final_amount, status, due_date, paid_at, payment_method, period_start, period_end, created_at, worker:workers!inner(first_name, last_name)',
        { store_id }, null),
      fetchAll(supabase, 'payment_transactions',
        'ref_type, ref_id, amount_cup, currency, payment_method, direction, payment_date, reference',
        { store_id }, null),
    ]);

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

    // Mismo calculador, mismos criterios que la vista (alcance completo).
    const result = computeAccountsPayable(
      receiptsRaw as unknown as PayableReceiptRow[],
      servicesRaw as unknown as PayableServiceRow[],
      commissions,
      txns,
      { tab: 'all', category: 'all', date_from, date_to, now: havanaDate() },
    );

    // ── Hoja 1: Resumen por proveedor (aging del saldo a corte) ──
    const summaryData: Array<Record<string, string | number>> = result.grouped.map(g => ({
      Proveedor: g.supplier,
      Docs: g.count,
      Total: round2(g.total_cup),
      Pagado: round2(g.paid_cup),
      Saldo: round2(g.balance_cup),
      Corriente: round2(g.aging.current),
      'Próx 7d': round2(g.aging.upcoming7),
      '0-30d': round2(g.aging['30']),
      '31-60d': round2(g.aging['60']),
      '61-90d': round2(g.aging['90']),
      '91-120d': round2(g.aging['120']),
      '+120d': round2(g.aging['120+']),
    }));
    summaryData.push({
      Proveedor: 'TOTALES',
      Docs: result.grouped.reduce((s, g) => s + g.count, 0),
      Total: round2(result.totals.total_cup),
      Pagado: round2(result.totals.paid_cup),
      Saldo: round2(result.totals.balance_cup),
      Corriente: round2(result.totals.aging.current),
      'Próx 7d': round2(result.totals.aging.upcoming7),
      '0-30d': round2(result.totals.aging['30']),
      '31-60d': round2(result.totals.aging['60']),
      '61-90d': round2(result.totals.aging['90']),
      '91-120d': round2(result.totals.aging['120']),
      '+120d': round2(result.totals.aging['120+']),
    });

    // ── Hoja 2: Detalle por documento ──
    const TIPO_LABEL: Record<string, string> = { receipt: 'Recepción', service: 'Servicio', commission: 'Comisión' };
    const BUCKET_LABEL: Record<string, string> = {
      current: 'Corriente', upcoming7: 'Próx 7d', '30': '0-30d', '60': '31-60d',
      '90': '61-90d', '120': '91-120d', '120+': '+120d', paid: 'Pagado',
    };
    const detailData = result.payables.map(p => ({
      Proveedor: p.supplier,
      Tipo: TIPO_LABEL[p.ref_type],
      Documento: p.reference || '—',
      'Fecha documento': p.doc_date || '—',
      Vencimiento: p.due_date || '—',
      Total: round2(p.total_cup),
      Pagado: round2(p.paid_cup),
      Saldo: round2(Math.max(0, p.balance_cup)),
      'Rango Aging': BUCKET_LABEL[p.aging_bucket],
      Estado: PAYMENT_STATUS_LABEL[p.payment_status],
    }));

    // ── Generar Excel ──
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    ws1['!cols'] = [
      { wch: 32 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por Proveedor');

    const ws2 = XLSX.utils.json_to_sheet(detailData);
    ws2['!cols'] = [
      { wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const dateStr = result.meta.cutoff;
    const filename = `cuentas_por_pagar_${dateStr}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[accounts-payable/export] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const GET = withAuth(getHandler);
