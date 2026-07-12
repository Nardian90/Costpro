import { NextResponse, type NextRequest } from 'next/server';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
// FIX-AUDIT-MSTORE-03 (P1): rate limit + createApiError — same pattern as reset/route.ts
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/**
 * GET /api/stores/check-slug?slug=mi-slug&exclude_store_id=uuid
 *
 * Verifica si un slug está disponible. Solo devuelve true/false.
 * No expone qué tienda tiene el slug (previene fuga cross-tenant).
 *
 * FIX-AUDIT-MSTORE-03 (P1-rate-limit): añade rateLimit() (20 req/min por usuario+IP).
 *   Es una comprobación de disponibilidad que se llama seguido al escribir el nombre
 *   de tienda — no bajar demasiado el límite o rompe la UX.
 *   Reemplaza { error: 'Error checking slug' } por createApiError('STORE_FETCH_FAILED').
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  // Rate limit: 20 check-slug per minute (UX-friendly, anti-enumeration)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rlKey = `stores:check-slug:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 20 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

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

  // FIX-AUDIT: Validate excludeStoreId is a proper UUID before using it in the query.
  // Without this, an attacker could send an arbitrary string and provoke a SQL error
  // in Supabase (PostgREST returns 500 with internal details).
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeExcludeStoreId = excludeStoreId && UUID_REGEX.test(excludeStoreId) ? excludeStoreId : null;
  if (excludeStoreId && !safeExcludeStoreId) {
    return NextResponse.json(
      { ...createApiError('INVALID_STORE_ID'), message: 'exclude_store_id must be a valid UUID' },
      { status: 400 }
    );
  }

  // FIX-AUDIT-4: Use service-role client for GLOBAL slug uniqueness.
  // Previously used getSupabaseAuthClient(session.token) which is subject to RLS —
  // if RLS filters stores by tenant, a user from tenant A couldn't see tenant B's
  // slug, leading to silent collisions (both register same slug, storefront URL conflicts).
  // The storefront is public, so slugs must be globally unique across all tenants.
  // FIX-DRY: Use the shared getSupabaseAdminSafe() factory instead of inline createClient.
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  let query = admin.from('stores').select('id').eq('slug', slug).limit(1);

  if (safeExcludeStoreId) {
    query = query.neq('id', safeExcludeStoreId);
  }

  const { data, error } = await query;

  if (error) {
    // FIX-AUDIT-MSTORE-03: log interno + error genérico al cliente (sin fuga de details)
    logger.error('DATABASE', 'CHECK_SLUG_QUERY_FAILED', { slug, error });
    return NextResponse.json(createApiError('STORE_FETCH_FAILED'), { status: 500 });
  }

  return NextResponse.json({
    available: !data || data.length === 0,
    slug,
  });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/stores/check-slug');
