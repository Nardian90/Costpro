import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/export?userId=X&format=xlsx
 *
 * Exporta todas las transacciones del usuario (o de otro usuario si es admin)
 * a un archivo Excel (.xlsx) con columnas: fecha, banco, operación, monto,
 * moneda, servicio, tipo_servicio, categoría, contraparte, nota.
 *
 * FIX-EXPORT (2026-07-06): endpoint para exportar billetera a Excel.
 */
async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const requestedUserId = req.nextUrl.searchParams.get('userId');
    const isAdmin = (session.user as any).role === 'admin' ||
                    ((session.user as any).roles || []).includes('admin');
    const targetUserId = (isAdmin && requestedUserId) ? requestedUserId : session.user.id;

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cuentas
    const { data: accounts } = await admin
      .from('wallet_accounts')
      .select('source,bank,account_number,description,movil,current_balance,currency')
      .eq('user_id', targetUserId)
      .order('bank', { ascending: true });

    // Transacciones (todas, sin limit)
    const { data: transactions, error } = await admin
      .from('wallet_transactions')
      .select('date,bank,card,operation,amount,currency,service,service_type,category,manual_category,counterparty,note')
      .eq('user_id', targetUserId)
      .order('date', { ascending: false });

    if (error) {
      logger.error('WALLET', `Export error: ${error.message}`);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    // Crear workbook con 2 hojas: Transacciones y Cuentas
    const wb = XLSX.utils.book_new();

    // Hoja 1: Transacciones
    const txRows = (transactions || []).map((tx: any, i: number) => ({
      '#': i + 1,
      'Fecha': tx.date,
      'Banco': tx.bank,
      'Tarjeta': tx.card || '',
      'Operación': tx.operation === 'CR' ? 'Ingreso' : 'Gasto',
      'Monto': parseFloat(tx.amount) || 0,
      'Moneda': tx.currency || 'CUP',
      'Servicio': tx.service || '',
      'Tipo de Servicio': tx.service_type || '',
      'Categoría': tx.manual_category || tx.category || '',
      'Contraparte': tx.counterparty || '',
      'Nota': tx.note || '',
    }));
    const wsTx = XLSX.utils.json_to_sheet(txRows);
    // Anchos de columna
    wsTx['!cols'] = [
      { wch: 5 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 18 }, { wch: 18 },
      { wch: 20 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsTx, 'Transacciones');

    // Hoja 2: Cuentas
    const accRows = (accounts || []).map((acc: any) => ({
      'Banco': acc.bank,
      'Tarjeta': acc.account_number || '',
      'Source': acc.source,
      'Descripción': acc.description || '',
      'Móvil': acc.movil || '',
      'Saldo Actual': parseFloat(acc.current_balance) || 0,
      'Moneda': acc.currency || 'CUP',
    }));
    const wsAcc = XLSX.utils.json_to_sheet(accRows);
    wsAcc['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsAcc, 'Cuentas');

    // Hoja 3: Resumen
    const summary = {
      'Total Transacciones': txRows.length,
      'Total Ingresos': txRows.filter(r => r['Operación'] === 'Ingreso').reduce((s, r) => s + r['Monto'], 0),
      'Total Gastos': txRows.filter(r => r['Operación'] === 'Gasto').reduce((s, r) => s + r['Monto'], 0),
      'Balance Neto': txRows.reduce((s, r) => s + (r['Operación'] === 'Ingreso' ? r['Monto'] : -r['Monto']), 0),
      'Total Cuentas': accRows.length,
      'Exportado por': session.user.email || session.user.id,
      'Fecha de export': new Date().toISOString(),
    };
    const wsSum = XLSX.utils.json_to_sheet([summary]);
    wsSum['!cols'] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Resumen');

    // Generar buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `billetera-${targetUserId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    logger.info('WALLET', `Export by ${session.user.id}: ${txRows.length} tx, ${accRows.length} accounts`);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    logger.error('WALLET', `Export error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const GET = getHandler;
