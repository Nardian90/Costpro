import { NextResponse, type NextRequest } from 'next/server';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';

/**
 * GET /api/stores/check-slug?slug=mi-slug&exclude_store_id=uuid
 *
 * Verifica si un slug está disponible. Solo devuelve true/false.
 * No expone qué tienda tiene el slug (previene fuga cross-tenant).
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const excludeStoreId = searchParams.get('exclude_store_id');

  if (!slug || slug.length < 2) {
    return NextResponse.json({ available: false, reason: 'too_short' });
  }

  if (slug.length > 60) {
    return NextResponse.json({ available: false, reason: 'too_long' });
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return NextResponse.json({ available: false, reason: 'invalid_format' });
  }

  // FIX-AUDIT-4: Use service-role client for GLOBAL slug uniqueness.
  // Previously used getSupabaseAuthClient(session.token) which is subject to RLS —
  // if RLS filters stores by tenant, a user from tenant A couldn't see tenant B's
  // slug, leading to silent collisions (both register same slug, storefront URL conflicts).
  // The storefront is public, so slugs must be globally unique across all tenants.
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  let query = admin.from('stores').select('id').eq('slug', slug).limit(1);

  if (excludeStoreId) {
    query = query.neq('id', excludeStoreId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Error checking slug' }, { status: 500 });
  }

  return NextResponse.json({
    available: !data || data.length === 0,
    slug,
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/stores/check-slug');
