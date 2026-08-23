import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * GET /api/telegram/posts?store_id=UUID&limit=50
 *
 * Returns publication history for this store (most recent first).
 * Used by the publication history table in TelegramConfigView.
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es obligatorio' }, { status: 400 });
  }
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Config error' }, { status: 500 });

  const { data, error } = await admin
    .from('telegram_product_posts')
    .select(
      'id, product_id, product_name, product_price, product_currency, telegram_chat_id, telegram_message_id, status, error, publish_type, published_by, created_at',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data || [] });
}

export const GET = withAuth(handler as any);
