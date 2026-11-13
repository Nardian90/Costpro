/**
 * API CP-FIN — Documentos recientes por tipo (selector del simulador).
 * GET /api/fin/documents?store_id=...&doctype=VENTA&limit=20
 *
 * Solo lectura sobre las tablas fuente, con el cliente de SESIÓN (RLS de cada
 * tabla filtra por tienda; ningún dato sale fuera del alcance del usuario).
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

const FIELDS: Record<string, { table: string; number: string; date: string; total: string; status: string }> = {
  VENTA: { table: 'transactions', number: 'invoice_number', date: 'created_at', total: 'total_amount', status: 'status' },
  DEVOLUCION_VENTA: { table: 'devolutions', number: 'devolution_number', date: 'processed_at', total: 'total_amount', status: 'status' },
  RECEPCION: { table: 'receipts', number: 'document_number', date: 'reception_date', total: 'total_cost', status: 'status' },
  SERVICIO_RECIBIDO: { table: 'received_services', number: 'service_number', date: 'service_date', total: 'total_amount', status: 'status' },
  VALE_SALIDA: { table: 'issue_slips', number: 'slip_number', date: 'created_at', total: 'total_cost', status: 'status' },
  AJUSTE_INVENTARIO: { table: 'inventory_adjustments', number: 'id', date: 'confirmed_at', total: 'id', status: 'status' },
  COMISION: { table: 'commission_payments', number: 'id', date: 'paid_at', total: 'final_amount', status: 'status' },
  NOMINA: { table: 'payrolls', number: 'payroll_number', date: 'period_end', total: 'total_gross', status: 'status' },
  FLUJO_CAJA: { table: 'cash_flow_documents', number: 'id', date: 'operation_date', total: 'amount', status: 'status' },
};

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const doctype = searchParams.get('doctype') ?? '';
  const limit = Math.min(Number(searchParams.get('limit') ?? 20) || 20, 50);

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }
  const cfg = FIELDS[doctype];
  if (!cfg) {
    return NextResponse.json({ error: 'doctype no soportado por el selector' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  const numberField = cfg.number === 'id' ? 'id' : cfg.number;
  const totalField = cfg.total === 'id' ? 'id' : cfg.total;
  const cols = ['id', numberField, cfg.date, totalField, cfg.status];
  const uniqueCols = [...new Set(cols)];

  let query = supabase
    .from(cfg.table)
    .select(uniqueCols.join(','))
    .eq('store_id', storeId)
    .order(cfg.date, { ascending: false })
    .limit(limit)
    .not(cfg.date, 'is', null);

  // Solo documentos en estado económico (los borradores no contabilizan)
  if (cfg.table === 'transactions') query = query.eq('status', 'completed');
  if (cfg.table === 'receipts') query = query.eq('status', 'active');
  if (cfg.table === 'received_services') query = query.eq('status', 'active');
  if (cfg.table === 'issue_slips') query = query.eq('status', 'completed');
  if (cfg.table === 'inventory_adjustments') query = query.eq('status', 'confirmed');
  if (cfg.table === 'commission_payments') query = query.eq('status', 'paid');
  if (cfg.table === 'payrolls') query = query.in('status', ['confirmed', 'paid']);
  if (cfg.table === 'cash_flow_documents') query = query.eq('status', 'confirmado');

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return NextResponse.json({
    doctype,
    documents: rows.map((row) => ({
      id: row.id,
      number: row[numberField] ?? row.id,
      date: row[cfg.date],
      total: row[totalField],
      status: row[cfg.status],
    })),
  });
}

export const GET = withAuth(getHandler);
