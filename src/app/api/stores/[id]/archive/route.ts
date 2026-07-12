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
 * POST /api/stores/[id]/archive
 * Archiva una tienda: is_archived=true + is_active=false.
 * Preserva todos los datos (ventas, inventario, configuración).
 *
 * AUTORIZACIÓN (FIX-AUDIT-R5):
 *   Antes se chequeaba solo `session.user.role` global (admin | manager), lo que
 *   permitía a un manager archivar CUALQUIER tienda de cualquier tenant conociendo
 *   el UUID. Ahora se usa `canManageStore(session.user, storeId)` que valida
 *   membership activa en la tienda específica (o admin global). Consistente con
 *   PATCH/DELETE de /api/stores/route.ts y con el contrato documentado en
 *   store-rls-isolation.test.ts.
 *
 * FIX-AUDIT-MSTORE-02 (P1-CSRF): añade validateOrigin(req) igual que reset/route.ts.
 *   withAuth NO cubre CSRF — un atacante puede hacer cross-site POST si el usuario
 *   está logueado y tiene cookie de sesión.
 *
 * FIX-AUDIT-MSTORE-03 (P1-rate-limit/errores): añade rateLimit() (10 req/min por
 *   usuario+IP) y reemplaza { error: error.message } (que filtra internals de
 *   Postgres/PostgREST) por createApiError('STORE_UPDATE_FAILED').
 *
 * FIX-AUDIT-MSTORE-04 (P2-idempotency): acepta header Idempotency-Key para evitar
 *   que un retry de red dispare el archive dos veces. Retrocompatible: sin header,
 *   comportamiento idéntico al anterior.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // Rate limit: 10 archives per minute (operación poco frecuente pero no tan rara como reset)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rlKey = `stores:archive:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) {
    return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
  }

  // CSRF validation — critical for state-changing operations
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
      { ...createApiError('FORBIDDEN'), message: 'No tienes permisos para archivar esta tienda' },
      { status: 403 }
    );
  }

  // FIX-AUDIT-NEW-2: Use service-role client instead of getSupabaseAuthClient(session.token).
  // The columns is_archived, archived_at, archived_by are NEW (from migration 20260628000001)
  // and existing RLS policies on stores likely don't cover UPDATE on these columns for
  // manager role. With the user's JWT, the UPDATE could silently fail with 500.
  // The other write routes (/api/stores/route.ts POST/PATCH/DELETE) already use the
  // service-role client — this route should do the same for consistency and reliability.
  // FIX-DRY: Use the shared getSupabaseAdminSafe() factory instead of inline createClient.
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '')
    ? session.user.id : null;

  // FIX-AUDIT-MSTORE-04 (P2): envolver la mutación con idempotency.
  // Key combina userId + storeId + idempotency-key del cliente para evitar colisiones
  // entre usuarios y entre tiendas. TTL 24h (mismo que bulk, restore).
  const idemKeyRaw = req.headers.get('idempotency-key');
  const idemKey = idemKeyRaw ? `archive:${session.user.id}:${storeId}:${idemKeyRaw}` : null;

  const { status: idemStatus, body: idemBody, replayed } = await withIdempotency<Record<string, unknown>>(
    idemKey,
    24 * 60 * 60, // 24h
    async () => {
      const reqBody = await req.json().catch(() => ({}));
      const { reason } = reqBody;

      const { error } = await supabase
        .from('stores')
        .update({
          is_active: false,
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: userId,
        })
        .eq('id', storeId);

      if (error) {
        // FIX-AUDIT-MSTORE-03: nunca devolver error.message crudo al cliente
        logger.error('DATABASE', 'STORE_ARCHIVE_FAILED', { storeId, userId: session.user.id, error });
        return { status: 500, body: createApiError('STORE_UPDATE_FAILED') };
      }

      logger.info('DATABASE', 'STORE_ARCHIVED', { storeId, userId: session.user.id });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Tienda archivada. Todos los datos se conservan.',
          storeId,
          reason: reason || null,
        },
      };
    }
  );

  const response = NextResponse.json(idemBody, {
    status: idemStatus,
    ...(replayed ? { headers: { 'X-Idempotent-Replay': 'true' } } : {}),
  });
  return response;
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/stores/[id]/archive');
