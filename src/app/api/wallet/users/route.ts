import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/users
 *
 * Lista todos los usuarios que tienen datos en wallet_accounts (con cuenta creada).
 * Solo accesible para admins (role='admin' en profiles).
 *
 * Response: { users: [{ user_id, full_name, email, accounts_count, transactions_count }] }
 *
 * FIX-ADMIN-VIEW (2026-07-06): endpoint para poblar el <select> de usuarios
 * en el WalletView cuando el usuario logueado es admin.
 */
async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const isAdmin = (session.user as any).role === 'admin' ||
                    ((session.user as any).roles || []).includes('admin');
    if (!isAdmin) {
      logger.warn('WALLET', `Non-admin ${session.user.id} tried to access /api/wallet/users`);
      return NextResponse.json({ error: 'Forbidden — se requiere rol admin' }, { status: 403 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Listar usuarios que tienen al menos una cuenta en wallet_accounts
    const { data, error } = await admin
      .from('wallet_accounts')
      .select('user_id')
      .order('user_id', { ascending: true });

    if (error) {
      logger.error('WALLET', `Error listing wallet users: ${error.message}`);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    // Obtener user_ids únicos
    const userIds = [...new Set((data || []).map(r => r.user_id))];
    if (userIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Para cada usuario, obtener profile + counts
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    // Conteo de transacciones por usuario
    const { data: txCounts } = await admin
      .from('wallet_transactions')
      .select('user_id')
      .in('user_id', userIds);

    const txCountMap: Record<string, number> = {};
    for (const t of txCounts || []) {
      txCountMap[t.user_id] = (txCountMap[t.user_id] || 0) + 1;
    }

    const accountCountMap: Record<string, number> = {};
    for (const r of data || []) {
      accountCountMap[r.user_id] = (accountCountMap[r.user_id] || 0) + 1;
    }

    // Construir respuesta
    const users = userIds.map(uid => {
      const profile = (profiles || []).find(p => p.id === uid);
      return {
        user_id: uid,
        full_name: profile?.full_name || '(sin nombre)',
        email: profile?.email || '(sin email)',
        accounts_count: accountCountMap[uid] || 0,
        transactions_count: txCountMap[uid] || 0,
      };
    });

    // Ordenar: primero el admin mismo, luego alfabético
    users.sort((a, b) => {
      if (a.user_id === session.user.id) return -1;
      if (b.user_id === session.user.id) return 1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    return NextResponse.json({ users });
  } catch (error: unknown) {
    logger.error('WALLET', `Users list error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const GET = getHandler;
