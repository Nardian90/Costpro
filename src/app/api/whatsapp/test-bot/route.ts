import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { generateResponse } from '@/lib/whatsapp/glm-orchestrator';

const testSchema = z.object({
  store_id: z.string().uuid(),
  message: z.string().min(1).max(4096),
  contact_name: z.string().optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:test:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = testSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
  }

  const { store_id, message, contact_name } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // Generar respuesta con GLM sin enviar por WhatsApp
  const response = await generateResponse(
    store_id,
    null, // sin contact_id (no persistir)
    'test@s.whatsapp.net',
    message,
    contact_name
  );

  return NextResponse.json({
    data: {
      text: response.text,
      tokensUsed: response.tokensUsed,
      responseTimeMs: response.responseTimeMs,
    }
  });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/test-bot');
