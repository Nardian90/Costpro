import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getBotInfo, getWebhookInfo } from '@/lib/telegram/bot-client';

/**
 * GET /api/telegram/config?store_id=UUID
 * Devuelve la config del bot + status (webhook info, bot info cacheada).
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  const { data: config } = await admin
    .from('telegram_configs')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ data: { configured: false } });
  }

  // Enriquecer con webhook info en vivo (si hay token)
  let webhookInfo = null;
  if (config.bot_token && config.webhook_url) {
    try {
      webhookInfo = await getWebhookInfo(config.bot_token);
    } catch (err: any) {
      logger.warn('DATABASE', 'TELEGRAM_WEBHOOK_INFO_FAILED', { error: err.message });
    }
  }

  // FIX TELEGRAM-SEC-2: enmascarar bot_token en GET. El token se acepta en PUT
  // (write-only) pero nunca se devuelve en texto plano. Solo se devuelve un flag
  // has_token + los primeros 4 caracteres para identificación visual.
  const { bot_token, ...configWithoutToken } = config;
  const botTokenMasked = bot_token
    ? `${bot_token.substring(0, 4)}…${bot_token.substring(bot_token.length - 4)}`
    : null;

  return NextResponse.json({
    data: {
      ...configWithoutToken,
      bot_token_masked: botTokenMasked,
      has_bot_token: !!bot_token,
      configured: true,
      webhook_info: webhookInfo,
    },
  });
}

const putSchema = z.object({
  store_id: z.string().uuid(),
  bot_token: z.string().min(20).optional(),
  is_active: z.boolean().optional(),
  welcome_enabled: z.boolean().optional(),
  welcome_message: z.string().max(500).optional(),
  system_prompt: z.string().max(5000).optional(),
  model_name: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(8192).optional(),
  context_window: z.number().min(1).max(100).optional(),
  trigger_mode: z.enum(['always', 'mention', 'keyword']).optional(),
  trigger_keywords: z.array(z.string()).optional(),
  group_chat_id: z.number().optional(),
  group_title: z.string().optional(),
});

/**
 * PUT /api/telegram/config
 * Crea o actualiza la config del bot. Si se pasa bot_token, valida con getMe
 * y cachea bot_user_id + bot_username.
 */
async function putHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`telegram:config:${session.user.id}`, {
    windowMs: 60_000, maxRequests: 10,
  });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = putSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { store_id, bot_token, ...updates } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });

  // Si se pasa bot_token, validar y cachear info del bot
  let botInfo: { id: number; username: string } | null = null;
  if (bot_token) {
    try {
      botInfo = await getBotInfo(bot_token);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Token inválido: ${err.message}` },
        { status: 400 }
      );
    }
  }

  // Construir payload de upsert
  const payload: Record<string, unknown> = {
    store_id,
    ...updates,
    trigger_keywords: updates.trigger_keywords ? JSON.stringify(updates.trigger_keywords) : undefined,
    updated_at: new Date().toISOString(),
  };
  if (bot_token) {
    payload.bot_token = bot_token;
    if (botInfo) {
      payload.bot_user_id = botInfo.id;
      payload.bot_username = botInfo.username;
    }
  }

  const { data, error } = await admin
    .from('telegram_configs')
    .upsert(payload, { onConflict: 'store_id' })
    .select()
    .single();

  if (error) {
    logger.error('DATABASE', 'TELEGRAM_CONFIG_SAVE_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, success: true });
}

export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/telegram/config');
export const PUT = withTracing(withAuth(putHandler) as any, 'PUT /api/telegram/config');
