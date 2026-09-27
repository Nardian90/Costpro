import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as XLSX from '@e965/xlsx';
import { walletImportExcelSchema, zodError, WALLET_EXCEL_MAX_BASE64_CHARS } from '@/validation/api-schemas';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/wallet/import-excel
 *
 * Importa transacciones desde un archivo Excel (.xlsx).
 * Body: { content: <base64 del archivo> }
 *
 * El Excel debe tener una hoja "Transacciones" con columnas:
 * Fecha, Banco, Operación (Ingreso/Gasto), Monto, Moneda, Servicio,
 * Tipo de Servicio, Categoría, Contraparte, Nota
 *
 * FIX-IMPORT-EXCEL (2026-07-06): importar billetera desde Excel
 * para round-trip con el endpoint /export.
 *
 * SEC-TS-03 · H7: el payload se valida con walletImportExcelSchema
 * (base64 estricto, tope 10 MiB — ver justificación en api-schemas.ts)
 * ANTES de decodificar/parsear: la App Router no impone body-size-limit
 * y el deploy Docker no tiene tope de plataforma. Payload inválido = 400,
 * oversized = 413. El Content-Length declarado se rechaza temprano solo
 * como optimización (no es la barrera — puede faltar o ser mentira).
 */
async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Rechazo temprano si el cliente DECLARA un tamaño ya excesivo — evita
    // bufferizar para clientes honestos. NO es la barrera única: el chequeo
    // real está en el schema sobre el contenido recibido (abajo).
    const declaredLength = parseInt(req.headers.get('content-length') || '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > WALLET_EXCEL_MAX_BASE64_CHARS + 2048) {
      return NextResponse.json({ error: 'El archivo excede el límite de 10 MiB' }, { status: 413 });
    }

    const body = await req.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    // SEC-TS-03 · H7: validación real ANTES de decodificar/parsear — antes
    // cualquier string se decodificaba y XLSX.read parseaba el archivo
    // completo en memoria sin tope.
    const validated = walletImportExcelSchema.safeParse(body);
    if (!validated.success) {
      const tooBig = validated.error.issues.some(i => i.code === 'too_big');
      return NextResponse.json(zodError(validated.error), { status: tooBig ? 413 : 400 });
    }
    const { content } = validated.data;

    // Decodificar base64
    const buf = Buffer.from(content, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Buscar hoja Transacciones
    const sheetName = wb.SheetNames.find(n => /transacc/i.test(n)) || wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: 'No se encontró hoja de transacciones' }, { status: 400 });
    }
    const ws = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El Excel no tiene transacciones' }, { status: 400 });
    }

    logger.info('WALLET', `Excel import by ${session.user.id}: ${rows.length} rows`);

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let txSaved = 0;
    let txSkipped = 0;

    for (const row of rows) {
      try {
        // Normalizar columnas (aceptar varias variantes de header)
        const date = String(row['Fecha'] || row['fecha'] || '').trim();
        const bank = String(row['Banco'] || row['banco'] || 'DESCONOCIDO').trim();
        const opRaw = String(row['Operación'] || row['Operacion'] || row['operación'] || 'Gasto').trim().toLowerCase();
        const operation = opRaw.includes('ingreso') || opRaw === 'cr' ? 'CR' : 'DB';
        const amount = Math.abs(parseFloat(row['Monto'] || row['monto'] || 0));
        const currency = String(row['Moneda'] || row['moneda'] || 'CUP').trim();
        const service = String(row['Servicio'] || row['servicio'] || 'Import Excel').trim();
        const serviceType = String(row['Tipo de Servicio'] || row['tipo_servicio'] || '').trim();
        const category = String(row['Categoría'] || row['Categoria'] || row['categoría'] || 'Otros').trim();
        const counterparty = String(row['Contraparte'] || row['contraparte'] || '').trim() || null;
        const note = String(row['Nota'] || row['nota'] || '').trim() || serviceType;

        if (!date || !amount || amount <= 0) { txSkipped++; continue; }

        // Generar ID único para esta importación
        const trmId = `EXCEL-${session.user.id}-${date}-${txSaved}-${Math.random().toString(36).slice(2, 8)}`;

        const { error } = await admin.from('wallet_transactions').upsert({
          user_id: session.user.id,
          trm_transaction_id: trmId,
          date,
          bank,
          operation,
          amount,
          currency,
          service,
          service_type: serviceType,
          category,
          counterparty,
          note,
          is_statement: false,
        }, { onConflict: 'user_id,trm_transaction_id' });

        if (error) { txSkipped++; logger.error('WALLET', `Excel import row error: ${error.message}`); }
        else txSaved++;
      } catch (e) {
        txSkipped++;
      }
    }

    // Recalcular saldos por banco desde transacciones
    const { data: allTx } = await admin.from('wallet_transactions')
      .select('bank,operation,amount,date')
      .eq('user_id', session.user.id);

    const bankBalances: Record<string, { balance: number; lastDate: string }> = {};
    for (const tx of allTx || []) {
      const bankName = tx.bank || 'DESCONOCIDO';
      const amount = parseFloat(tx.amount) || 0;
      const delta = tx.operation === 'CR' ? amount : -amount;
      if (!bankBalances[bankName]) bankBalances[bankName] = { balance: 0, lastDate: '' };
      bankBalances[bankName].balance += delta;
      if (tx.date > bankBalances[bankName].lastDate) bankBalances[bankName].lastDate = tx.date;
    }

    const { data: accs } = await admin.from('wallet_accounts')
      .select('id, account_number, bank')
      .eq('user_id', session.user.id);

    for (const acc of accs || []) {
      const bal = bankBalances[acc.bank];
      await admin.from('wallet_accounts')
        .update({ current_balance: bal?.balance || 0, last_balance_date: bal?.lastDate || null, updated_at: new Date().toISOString() })
        .eq('id', acc.id);
    }

    logger.info('WALLET', `Excel import done: ${txSaved} saved, ${txSkipped} skipped`);

    return NextResponse.json({
      success: true,
      transactions: txSaved,
      skipped: txSkipped,
    });
  } catch (error: unknown) {
    logger.error('WALLET', `Excel import error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: `Error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

export const POST = postHandler;
