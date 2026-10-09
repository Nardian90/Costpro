import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { disconnectStore } from '@/lib/whatsapp/baileys-client';

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
    if (!validateOrigin(req)) { return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 }); }
  const { allowed } = await rateLimit(`wa:disconnect:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json().catch(() => ({}));

  // REM-COSTPRO4-CI: contrato del body con Zod (requeridad de store_id la
  // aplica el check de abajo con el error de contrato).
  const StoreActionSchema = z.object({ store_id: z.string().optional() }).passthrough();
  const parsedBody = StoreActionSchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }

  const storeId = body.store_id;
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  disconnectStore(storeId);
  return NextResponse.json({ success: true });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/disconnect');
