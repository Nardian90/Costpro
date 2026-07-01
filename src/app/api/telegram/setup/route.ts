import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { setWebhook, deleteWebhook, getWebhookInfo, getBotInfo } from '@/lib/telegram/bot-client';

/**
 * POST /api/telegram/setup
 *
 * Registra o elimina el webhook en Telegram para un bot de una tienda.
 *
 * Body:
 *   { store_id: UUID, action: 'register' | 'remove' }
 *
 * Acción 'register':
 *   1. Valida que el bot_token existe en telegram_configs
 *   2. Genera un webhook_secret aleatorio (32 bytes hex)
 *   3. Construye la URL del webhook: {NEXTAUTH_URL}/api/telegram/webhook?bot_id={bot_user_id}
 *   4. Llama a setWebhook en Telegram con la URL + secret
 *   5. Actualiza telegram_configs con webhook_url, webhook_secret, webhook_registered_at
 *
 * Acción 'remove':
 *   1. Llama a deleteWebhook en Telegram
 *   2. Limpia webhook_url, webhook_secret, webhook_registered_at en BD
 *
 * Requiere: admin/manager/encargado de la tienda (canManageStore).
 */

const setupSchema = z.object({
  store_id: z.string().uuid(),
  action: z.enum(['register', 'remove']),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`telegram:setup:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json();
  const validated = setupSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { ...createApiError('INVALID_DATA'), details: validated.error.format() },
      { status: 400 }
    );
  }

  const { store_id, action } = validated.data;
  if (!canManageStore(session.user, store_id)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  // Cargar config del bot
  const { data: config, error: configError } = await admin
    .from('telegram_configs')
    .select('*')
    .eq('store_id', store_id)
    .maybeSingle();

  if (configError || !config) {
    return NextResponse.json(
      { error: 'Bot no configurado. Guarda el token primero en /api/telegram/config.' },
      { status: 404 }
    );
  }

  if (!config.bot_token) {
    return NextResponse.json({ error: 'bot_token faltante en config' }, { status: 400 });
  }

  if (action === 'register') {
    // ── Registrar webhook ────────────────────────────────────────────

    // Si no tenemos bot_user_id cacheado, validarlo ahora con getMe
    let botUserId = config.bot_user_id;
    let botUsername = config.bot_username;
    if (!botUserId) {
      try {
        const botInfo = await getBotInfo(config.bot_token);
        botUserId = botInfo.id;
        botUsername = botInfo.username;
      } catch (err: any) {
        return NextResponse.json(
          { error: `Token inválido: ${err.message}` },
          { status: 400 }
        );
      }
    }

    // Generar secret aleatorio (32 bytes hex = 64 chars)
    const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    // Construir URL del webhook
    // Telegram EXIGE HTTPS. Detectamos la URL pública en este orden:
    //   1. NEXTAUTH_URL (si es https y no localhost)
    //   2. VERCEL_URL (Vercel auto-inyecta, formato: project-xxx.vercel.app)
    //   3. Header Host o x-forwarded-host (para previews, Docker, etc.)
    //   4. Header origin (fallback)
    // NEXTAUTH_URL=http://localhost:3000 se ignora porque no sirve para Telegram.
    const candidateUrls = [
      process.env.NEXTAUTH_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      req.headers.get('x-forwarded-host'),
      req.headers.get('host'),
      req.headers.get('origin'),
    ].filter(Boolean) as string[];

    let baseUrl: string | null = null;
    for (const candidate of candidateUrls) {
      // Normalizar: si no tiene protocolo, asumir https
      let url = candidate.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      // Rechazar localhost y HTTP (Telegram exige HTTPS público)
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
        continue;
      }
      if (url.startsWith('http://') && !url.includes('localhost')) {
        // Convertir http:// a https:// si es una URL pública
        url = url.replace('http://', 'https://');
      }
      try {
        new URL(url); // validar formato
        baseUrl = url;
        break;
      } catch {
        continue;
      }
    }

    if (!baseUrl) {
      return NextResponse.json(
        {
          error:
            'No se pudo determinar una URL pública HTTPS para el webhook. ' +
            'Configura NEXTAUTH_URL con tu URL pública (ej: https://mi-app.vercel.app) ' +
            'o accede a la app desde una URL pública.',
        },
        { status: 500 }
      );
    }
    const url = `${baseUrl}/api/telegram/webhook?bot_id=${botUserId}`;
    const webhookUrl = new URL(url).toString(); // normaliza

    // Registrar en Telegram
    try {
      const result = await setWebhook(config.bot_token, webhookUrl, secret);
      logger.info('DATABASE', 'TELEGRAM_WEBHOOK_REGISTERED', {
        store_id, botUserId, webhookUrl, pendingUpdates: result.pending_update_count,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Error registrando webhook: ${err.message}` },
        { status: 502 }
      );
    }

    // Actualizar config en BD
    const { error: updateError } = await admin
      .from('telegram_configs')
      .update({
        bot_user_id: botUserId,
        bot_username: botUsername,
        webhook_url: webhookUrl,
        webhook_secret: secret,
        webhook_registered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', store_id);

    if (updateError) {
      logger.error('DATABASE', 'TELEGRAM_CONFIG_UPDATE_ERROR', {
        store_id, error: updateError.message,
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      webhook_url: webhookUrl,
      bot_username: botUsername,
      bot_user_id: botUserId,
      pending_updates: (await getWebhookInfo(config.bot_token)).pending_update_count,
    });
  } else {
    // ── Eliminar webhook ─────────────────────────────────────────────
    try {
      await deleteWebhook(config.bot_token);
      logger.info('DATABASE', 'TELEGRAM_WEBHOOK_REMOVED', { store_id });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Error eliminando webhook: ${err.message}` },
        { status: 502 }
      );
    }

    await admin
      .from('telegram_configs')
      .update({
        webhook_url: null,
        webhook_secret: null,
        webhook_registered_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', store_id);

    return NextResponse.json({ success: true, message: 'Webhook eliminado' });
  }
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/telegram/setup');
