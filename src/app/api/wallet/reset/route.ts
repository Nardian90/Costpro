import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/wallet/reset — borra TODAS las transacciones y cuentas del usuario
 */
async function deleteHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Borrar transacciones
    const { error: txErr } = await admin.from('wallet_transactions')
      .delete()
      .eq('user_id', session.user.id);

    if (txErr) {
      logger.error('WALLET', `Reset tx error: ${txErr.message}`);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    // Borrar cuentas
    const { error: accErr } = await admin.from('wallet_accounts')
      .delete()
      .eq('user_id', session.user.id);

    if (accErr) {
      logger.error('WALLET', `Reset accounts error: ${accErr.message}`);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    logger.info('WALLET', `Reset complete for user ${session.user.id}`);
    return NextResponse.json({ success: true, message: 'Datos eliminados correctamente' });
  } catch (error: unknown) {
    logger.error('WALLET', `Reset error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const DELETE = deleteHandler;
