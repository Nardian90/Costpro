import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { disconnectStore } from '@/lib/whatsapp/baileys-client';

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:disconnect:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json().catch(() => ({}));
  const storeId = body.store_id;
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  disconnectStore(storeId);
  return NextResponse.json({ success: true });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/disconnect');
