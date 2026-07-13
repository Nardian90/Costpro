import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import * as XLSX from '@e965/xlsx';

/**
 * GET /api/accounts-payable/export
 *
 * Exporta la antigüedad de saldos (Cuentas por Pagar) a Excel.
 * Genera un archivo .xlsx con:
 *   - Hoja 1: Resumen por proveedor (estilo Excel con columnas aging)
 *   - Hoja 2: Detalle por documento
 *
 * Query params:
 *   - store_id: UUID (requerido)
 *
 * FASE 4.1 (2026-07-13): exportación Excel del aging consolidado.
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const store_id = searchParams.get('store_id');

    if (!store_id) {
      return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Consultar las 3 fuentes
    const [receiptsResult, servicesResult, commissionsResult] = await Promise.all([
      supabase
        .from('receipts')
        .select('id, supplier, total_cost, paid_amount, due_date, payment_status, payment_method, reference_doc, status, created_at')
        .eq('store_id', store_id)
        .neq('status', 'voided')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('received_services')
        .select('id, supplier, total_amount, paid_amount, due_date, payment_status, payment_method, reference_doc, status, currency, exchange_rate, created_at')
        .eq('store_id', store_id)
        .neq('status', 'voided')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('commission_payments')
        .select('id, period_start, period_end, due_date, final_amount, status, payment_method, created_at, worker:workers!inner(first_name, last_name)')
        .eq('store_id', store_id)
        .in('status', ['approved', 'paid'])
        .order('due_date', { ascending: true, nullsFirst: false }),
    ]);

    interface Row {
      proveedor: string;
      tipo: string;
      total: number;
      pagado: number;
      saldo: number;
      moneda: string;
      vencimiento: string;
      dias_vencido: number;
      rango: string;
      estado: string;
    }

    const rows: Row[] = [];

    for (const r of receiptsResult.data || []) {
      const total = Number(r.total_cost) || 0;
      const paid = Number(r.paid_amount) || 0;
      const balance = total - paid;
      const dueDate = r.due_date ? new Date(r.due_date) : null;
      const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000) : null;
      const isOverdue = dueDate ? dueDate < today && r.payment_status !== 'paid' : false;

      let rango = 'Corriente';
      if (r.payment_status === 'paid') rango = 'Pagado';
      else if (isOverdue) {
        const od = daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;
        if (od > 120) rango = '+120d';
        else if (od > 90) rango = '91-120d';
        else if (od > 60) rango = '61-90d';
        else if (od > 30) rango = '31-60d';
        else rango = '0-30d';
      }

      rows.push({
        proveedor: r.supplier || 'Sin proveedor',
        tipo: 'Recepción',
        total, pagado: paid, saldo: balance,
        moneda: 'CUP',
        vencimiento: r.due_date || '',
        dias_vencido: daysUntilDue ?? 0,
        rango,
        estado: r.payment_status || 'unpaid',
      });
    }

    for (const s of servicesResult.data || []) {
      const total = Number(s.total_amount) || 0;
      const paid = Number(s.paid_amount) || 0;
      const balance = total - paid;
      const dueDate = s.due_date ? new Date(s.due_date) : null;
      const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000) : null;
      const isOverdue = dueDate ? dueDate < today && s.payment_status !== 'paid' : false;

      let rango = 'Corriente';
      if (s.payment_status === 'paid') rango = 'Pagado';
      else if (isOverdue) {
        const od = daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;
        if (od > 120) rango = '+120d';
        else if (od > 90) rango = '91-120d';
        else if (od > 60) rango = '61-90d';
        else if (od > 30) rango = '31-60d';
        else rango = '0-30d';
      }

      rows.push({
        proveedor: s.supplier || 'Sin proveedor',
        tipo: 'Servicio',
        total, pagado: paid, saldo: balance,
        moneda: s.currency || 'CUP',
        vencimiento: s.due_date || '',
        dias_vencido: daysUntilDue ?? 0,
        rango,
        estado: s.payment_status || 'unpaid',
      });
    }

    for (const c of commissionsResult.data || []) {
      const total = Number(c.final_amount) || 0;
      const paid = c.status === 'paid' ? total : 0;
      const balance = total - paid;
      const workerName = c.worker ? `${c.worker.first_name} ${c.worker.last_name}`.trim() : 'Trabajador';
      const dueDate = c.due_date ? new Date(c.due_date) : null;
      const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000) : null;
      const isOverdue = dueDate ? dueDate < today && c.status !== 'paid' : false;

      let rango = 'Corriente';
      if (c.status === 'paid') rango = 'Pagado';
      else if (isOverdue) {
        const od = daysUntilDue !== null ? Math.abs(daysUntilDue) : 0;
        if (od > 120) rango = '+120d';
        else if (od > 90) rango = '91-120d';
        else if (od > 60) rango = '61-90d';
        else if (od > 30) rango = '31-60d';
        else rango = '0-30d';
      }

      rows.push({
        proveedor: workerName,
        tipo: 'Comisión',
        total, pagado: paid, saldo: balance,
        moneda: 'CUP',
        vencimiento: c.due_date || '',
        dias_vencido: daysUntilDue ?? 0,
        rango,
        estado: c.status === 'paid' ? 'paid' : 'unpaid',
      });
    }

    // Hoja 1: Resumen por proveedor
    const supplierMap = new Map<string, any>();
    for (const r of rows) {
      if (r.estado === 'paid') continue;
      const key = r.proveedor;
      if (!supplierMap.has(key)) {
        supplierMap.set(key, {
          Proveedor: key, Docs: 0, Total: 0, Pagado: 0, Saldo: 0,
          Corriente: 0, '0-30d': 0, '31-60d': 0, '61-90d': 0, '91-120d': 0, '+120d': 0,
        });
      }
      const e = supplierMap.get(key)!;
      e.Total += r.total; e.Pagado += r.pagado; e.Saldo += r.saldo; e.Docs += 1;
      if (r.rango === 'Corriente') e.Corriente += r.saldo;
      else if (r.rango === '0-30d') e['0-30d'] += r.saldo;
      else if (r.rango === '31-60d') e['31-60d'] += r.saldo;
      else if (r.rango === '61-90d') e['61-90d'] += r.saldo;
      else if (r.rango === '91-120d') e['91-120d'] += r.saldo;
      else if (r.rango === '+120d') e['+120d'] += r.saldo;
    }

    const summaryData = Array.from(supplierMap.values()).sort((a, b) => b.Saldo - a.Saldo);
    summaryData.push({
      Proveedor: 'TOTALES',
      Docs: summaryData.reduce((s, g) => s + g.Docs, 0),
      Total: summaryData.reduce((s, g) => s + g.Total, 0),
      Pagado: summaryData.reduce((s, g) => s + g.Pagado, 0),
      Saldo: summaryData.reduce((s, g) => s + g.Saldo, 0),
      Corriente: summaryData.reduce((s, g) => s + g.Corriente, 0),
      '0-30d': summaryData.reduce((s, g) => s + g['0-30d'], 0),
      '31-60d': summaryData.reduce((s, g) => s + g['31-60d'], 0),
      '61-90d': summaryData.reduce((s, g) => s + g['61-90d'], 0),
      '91-120d': summaryData.reduce((s, g) => s + g['91-120d'], 0),
      '+120d': summaryData.reduce((s, g) => s + g['+120d'], 0),
    });

    // Hoja 2: Detalle
    const detailData = rows.map(r => ({
      Proveedor: r.proveedor,
      Tipo: r.tipo,
      Total: r.total,
      Pagado: r.pagado,
      Saldo: r.saldo,
      Moneda: r.moneda,
      Vencimiento: r.vencimiento,
      'Días hasta vencimiento': r.dias_vencido,
      'Rango Aging': r.rango,
      Estado: r.estado === 'paid' ? 'Pagado' : r.estado === 'partial' ? 'Parcial' : 'Pendiente',
    }));

    // Generar Excel
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    ws1['!cols'] = [
      { wch: 30 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por Proveedor');

    const ws2 = XLSX.utils.json_to_sheet(detailData);
    ws2['!cols'] = [
      { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const dateStr = new Date().toISOString().slice(0, 10);
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

export const GET = withAuth(getHandler);
