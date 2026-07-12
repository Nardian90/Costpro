import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
// FIX-AUDIT-MSTORE-02 (P1): CSRF validation — same pattern as reset/route.ts
import { validateOrigin } from '@/lib/csrf';
// FIX-AUDIT-MSTORE-03 (P1): rate limit + createApiError — same pattern as reset/route.ts
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
// FIX-AUDIT-MSTORE-04 (P2): idempotency para evitar doble-tap
import { withIdempotency } from '@/lib/idempotency';

/**
 * POST /api/stores/[id]/restore
 * Restaura una tienda archivada: is_archived=false + is_active=true.
 *
 * AUTORIZACIÓN (FIX-AUDIT-R5):
 *   Mismo fix que archive/route.ts — usar canManageStore(session.user, storeId)
 *   en vez de chequear solo el rol global. Ver archive/route.ts para detalles.
 *
 * FIX-AUDIT-MSTORE-02 (P1-CSRF): añade validateOrigin(req).
 * FIX-AUDIT-MSTORE-03 (P1-rate-limit/errores): añade rateLimit() (10 req/min) +
 *   createApiError para no filtrar error.message crudo.
 * FIX-AUDIT-MSTORE-04 (P2-idempotency): acepta header Idempotency-Key (TTL 24h).
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // Rate limit: 10 restores per minute (simétrico con archive)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rlKey = `stores:restore:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

  // CSRF validation
  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  const pathParts = new URL(req.url).pathname.split('/');
  const storeId = pathParts[pathParts.indexOf('stores') + 1];

  if (!storeId) {
    return NextResponse.json(createApiError('INVALID_STORE_ID'), { status: 400 });
  }

  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(
      { ...createApiError('FORBIDDEN'), message: 'No tienes permisos para restaurar esta tienda' },
      { status: 403 }
    );
  }

  // FIX-AUDIT-NEW-2: Use service-role client (same fix as archive route).
  // See archive/route.ts for full rationale.
  // FIX-DRY: Use the shared getSupabaseAdminSafe() factory instead of inline createClient.
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  // FIX-AUDIT-MSTORE-04 (P2): idempotency con misma key pattern que archive
  const idemKeyRaw = req.headers.get('idempotency-key');
  const idemKey = idemKeyRaw ? `restore:${session.user.id}:${storeId}:${idemKeyRaw}` : null;

  const { status: idemStatus, body: idemBody, replayed } = await withIdempotency<Record<string, unknown>>(
    idemKey,
    24 * 60 * 60, // 24h
    async () => {
      const { error } = await supabase
        .from('stores')
        .update({
          is_active: true,
          is_archived: false,
          archived_at: null,
          archived_by: null,
        })
        .eq('id', storeId);

      if (error) {
        // FIX-AUDIT-MSTORE-03: nunca devolver error.message crudo al cliente
        logger.error('DATABASE', 'STORE_RESTORE_FAILED', { storeId, userId: session.user.id, error });
        return { status: 500, body: createApiError('STORE_UPDATE_FAILED') };
      }

      logger.info('DATABASE', 'STORE_RESTORED', { storeId, userId: session.user.id });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Tienda restaurada. Ya está activa y visible en el dashboard.',
          storeId,
        },
      };
    }
  );

  return NextResponse.json(idemBody, {
    status: idemStatus,
    ...(replayed ? { headers: { 'X-Idempotent-Replay': 'true' } } : {}),
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/stores/[id]/restore');
