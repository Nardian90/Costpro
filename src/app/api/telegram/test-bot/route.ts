import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { generateResponse } from '@/lib/telegram/glm-orchestrator';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

/**
 * POST /api/telegram/test-bot
 * Simulador: prueba el bot GLM sin enviar mensaje real por Telegram.
 * Espejo de whatsapp/test-bot.
 */
const testSchema = z.object({
  store_id: z.string().uuid(),
  message: z.string().min(1).max(4096),
  contact_name: z.string().optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`telegram:test:${session.user.id}`, {
    windowMs: 60_000, maxRequests: 10,
  });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = testSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { store_id, message, contact_name } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data: config } = await admin
    .from('telegram_configs')
    .select('system_prompt, model_name, temperature, max_tokens, context_window, is_active')
    .eq('store_id', store_id)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ error: 'Bot no configurado' }, { status: 404 });
  }

  // Generar respuesta con GLM (sin guardar en BD — es solo simulación)
  const response = await generateResponse(
    store_id,
    null, // sin contact_id → sin historial
    0,    // telegram_user_id ficticio
    message,
    contact_name
  );

  return NextResponse.json({ data: response });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/telegram/test-bot');
