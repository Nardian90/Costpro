import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishProductToWhatsApp } from '@/lib/whatsapp/publish';
import { verifyCronAuthorization } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/whatsapp-auto-publish
 *
 * Cron job — runs DAILY on Vercel Hobby plan (free tier limit).
 * For sub-daily frequencies (5/15/30/60 min), the local PM2 poller
 * in scripts/whatsapp-cron-poller.sh hits this endpoint every 5 min
 * (enviando Authorization: Bearer ${CRON_SECRET}).
 *
 * CRITICAL DIFFERENCE vs Telegram:
 *   - Telegram can publish anywhere with a bot token (no session needed)
 *   - WhatsApp requires an active Baileys session (live WebSocket)
 *   - This endpoint will skip stores without an active session
 *
 * This endpoint is idempotent: each store only publishes when its own
 * interval_minutes has elapsed since last_publish_at AND anti-ban allows.
 *
 * SEC-TS-02 · H3 — autenticación fail-closed (patrón FIX C5+C6 de
 * cron/usage-sync y cron/exchange-rates): solo JWT de Vercel Cron
 * (x-vercel-signature) o Bearer CRON_SECRET. Un llamante anónimo ya no
 * puede disparar la publicación ni leer datos multi-tienda: la respuesta
 * es agregada (sin storeId/producto/messageId/errores por tienda — el
 * detalle operacional sigue en los logs del servidor).
 */
export async function GET(req: NextRequest) {
  const auth = await verifyCronAuthorization(req);
  if (!auth.authorized) {
    logger.warn('DATABASE', 'WA_CRON_UNAUTHORIZED', {});
    return NextResponse.json(
      { error: 'Unauthorized', hint: 'Incluye Authorization: Bearer <CRON_SECRET>, o usa x-vercel-signature JWT (con VERCEL_PROJECT_ID configurado)' },
      { status: 401 },
    );
  }

  const startTime = Date.now();
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    logger.error('DATABASE', 'WA_CRON_MISSING_ENV', {});
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logger.info('DATABASE', 'WA_CRON_TICK_START', {
    timestamp: new Date().toISOString(),
  });

  try {
    // 1. Find all stores with auto-publish enabled
    const { data: configs, error } = await adminClient
      .from('whatsapp_configs')
      .select('store_id, auto_publish_interval_minutes, last_publish_at, phone_number')
      .eq('is_active', true)
      .eq('auto_publish_enabled', true)
      .not('phone_number', 'is', null);

    if (error || !configs) {
      logger.error('DATABASE', 'WA_CRON_CONFIG_QUERY_FAILED', {
        error: error?.message ?? 'no configs returned',
      });
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    logger.info('DATABASE', 'WA_CRON_CONFIGS_FOUND', {
      count: configs.length,
      stores: configs.map(c => ({
        storeId: c.store_id,
        interval: c.auto_publish_interval_minutes,
        lastPublishAt: c.last_publish_at,
        hasPhoneNumber: !!c.phone_number,
      })),
    });

    const results = [];

    for (const config of configs) {
      // 2. Check if interval has elapsed (idempotency — in MINUTES)
      if (config.last_publish_at) {
        const minutesSince =
          (Date.now() - new Date(config.last_publish_at).getTime()) / 60000;
        const intervalMinutes: number = config.auto_publish_interval_minutes ?? 360;
        if (minutesSince < intervalMinutes) {
          logger.info('DATABASE', 'WA_CRON_STORE_SKIP_INTERVAL', {
            storeId: config.store_id,
            minutesSince: Math.round(minutesSince * 100) / 100,
            intervalMinutes,
          });
          results.push({
            storeId: config.store_id,
            skipped: true,
            reason: 'interval_not_elapsed',
            minutesSince: Math.round(minutesSince * 100) / 100,
            intervalMinutes,
          });
          continue;
        }
      }

      // 3. Delegate to shared helper
      try {
        const result = await publishProductToWhatsApp({
          storeId: config.store_id,
          publishType: 'automatic',
          userId: null,
        });

        if (result.skipped) {
          results.push({
            storeId: config.store_id,
            skipped: true,
            reason: result.reason,
            minutesSince: result.minutesSince,
            intervalMinutes: result.intervalMinutes,
            error: result.error,
          });
        } else if (result.success) {
          results.push({
            storeId: config.store_id,
            status: 'success',
            product: result.product,
            messageId: result.whatsapp_message_id,
          });
        } else {
          results.push({
            storeId: config.store_id,
            status: 'failed',
            error: result.error,
            product: result.product,
          });
        }
      } catch (e: any) {
        logger.error('DATABASE', 'WA_CRON_STORE_EXCEPTION', {
          storeId: config.store_id,
          error: e.message,
        });
        results.push({
          storeId: config.store_id,
          status: 'error',
          error: e.message,
        });
      }
    }

    const durationMs = Date.now();
    const successCount = results.filter(r => r.status === 'success').length;
    const skipCount = results.filter(r => r.skipped).length;
    const failCount = results.filter(r => r.status === 'failed' || r.status === 'error').length;

    logger.info('DATABASE', 'WA_CRON_TICK_END', {
      durationMs,
      processed: configs.length,
      successCount,
      skipCount,
      failCount,
    });

    // SEC-TS-02 · H3: respuesta agregada — sin results[] ni datos por tienda
    // (el detalle operacional queda en los logs del servidor).
    return NextResponse.json({
      success: true,
      auth_method: auth.method,
      processed: configs.length,
      published: successCount,
      skipped: skipCount,
      failed: failCount,
      duration_ms: durationMs,
    });
  } catch (error: any) {
    logger.error('DATABASE', 'WA_CRON_FATAL', {
      error: error.message,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
