import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/transaction — crear transacción manual
 * PUT  /api/wallet/transaction — editar transacción
 * DELETE /api/wallet/transaction?id=xxx — eliminar transacción
 */

async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { date, bank, operation, amount, currency, service, category, note, counterparty } = body;

    if (!date || !operation || !amount) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    const { data, error } = await admin.from('wallet_transactions').insert({
      user_id: session.user.id,
      date,
      bank: bank || 'MANUAL',
      operation,
      amount: Math.abs(parseFloat(amount)),
      currency: currency || 'CUP',
      service: service || (operation === 'CR' ? 'Ingreso manual' : 'Gasto manual'),
      category: category || 'Otros',
      note: note || '',
      counterparty: counterparty || '',
      trm_transaction_id: `manual-${Date.now()}`,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logger.info('WALLET', `Manual tx created by ${session.user.id}: ${operation} ${amount}`);
    return NextResponse.json({ success: true, transaction: data });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

async function putHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { id, category, note, amount, date } = body;
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    const updates: any = {};
    if (category !== undefined) updates.manual_category = category;
    if (note !== undefined) updates.note = note;
    if (amount !== undefined) updates.amount = Math.abs(parseFloat(amount));
    if (date !== undefined) updates.date = date;

    const { error } = await admin.from('wallet_transactions').update(updates).eq('id', id).eq('user_id', session.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

async function deleteHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    const { error } = await admin.from('wallet_transactions').delete().eq('id', id).eq('user_id', session.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logger.info('WALLET', `Tx deleted by ${session.user.id}: ${id}`);
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export const POST = postHandler;
export const PUT = putHandler;
export const DELETE = deleteHandler;
