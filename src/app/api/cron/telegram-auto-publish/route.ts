import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishProductToTelegram } from '@/lib/telegram/publish';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/telegram-auto-publish
 *
 * Cron job that runs every 5 minutes (see vercel.json + local PM2 poller
 * in scripts/telegram-cron-poller.sh). Finds stores with auto-publish
 * enabled, checks if their interval has elapsed, and publishes a product
 * to Telegram.
 *
 * This endpoint is PUBLIC (no auth) — it relies on the cron being internal.
 * If you need to call it from outside, consider adding a CRON_SECRET.
 *
 * Critical: this uses the SAME publishProductToTelegram() helper as the
 * manual /api/telegram/publish-product endpoint, so the message body and
 * Vitrina-rule enforcement are identical.
 */
export async function GET() {
  const startTime = Date.now();
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    logger.error('DATABASE', 'CRON_MISSING_ENV', {});
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logger.info('DATABASE', 'CRON_TICK_START', {
    timestamp: new Date().toISOString(),
  });

  try {
    // 1. Find all stores with auto-publish enabled
    const { data: configs, error } = await adminClient
      .from('telegram_configs')
      .select('store_id, auto_publish_interval_minutes, last_publish_at')
      .eq('is_active', true)
      .eq('auto_publish_enabled', true)
      .not('bot_token', 'is', null)
      .not('group_chat_id', 'is', null);

    if (error || !configs) {
      logger.error('DATABASE', 'CRON_CONFIG_QUERY_FAILED', {
        error: error?.message ?? 'no configs returned',
      });
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    logger.info('DATABASE', 'CRON_CONFIGS_FOUND', {
      count: configs.length,
      stores: configs.map(c => ({
        storeId: c.store_id,
        interval: c.auto_publish_interval_minutes,
        lastPublishAt: c.last_publish_at,
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
          logger.info('DATABASE', 'CRON_STORE_SKIP_INTERVAL', {
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

      // 3. Delegate to shared helper (uses Vitrina rules + same formatter as preview)
      try {
        const result = await publishProductToTelegram({
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
          });
        } else if (result.success) {
          results.push({
            storeId: config.store_id,
            status: 'success',
            product: result.product,
            messageId: result.telegram_message_id,
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
        logger.error('DATABASE', 'CRON_STORE_EXCEPTION', {
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

    const durationMs = Date.now() - startTime;
    logger.info('DATABASE', 'CRON_TICK_END', {
      durationMs,
      processed: configs.length,
      successCount: results.filter(r => r.status === 'success').length,
      skipCount: results.filter(r => r.skipped).length,
      failCount: results.filter(r => r.status === 'failed' || r.status === 'error').length,
    });

    return NextResponse.json({ processed: configs.length, results });
  } catch (error: any) {
    logger.error('DATABASE', 'CRON_FATAL', {
      error: error.message,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
