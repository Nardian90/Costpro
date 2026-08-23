import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishProductToTelegram } from '@/lib/telegram/publish';

/**
 * GET /api/cron/telegram-auto-publish
 *
 * Cron job that runs every hour. Finds stores with auto-publish enabled,
 * checks if their interval has elapsed, and publishes a product to Telegram.
 *
 * This endpoint is called by Vercel Cron (configured in vercel.json).
 * It uses the service_role key — no auth required (cron is server-side).
 *
 * Critical: this uses the SAME publishProductToTelegram() helper as the
 * manual /api/telegram/publish-product endpoint, so the message body and
 * Vitrina-rule enforcement are identical.
 */
export async function GET() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Find all stores with auto-publish enabled
    const { data: configs, error } = await adminClient
      .from('telegram_configs')
      .select('store_id, auto_publish_interval_hours, last_publish_at')
      .eq('is_active', true)
      .eq('auto_publish_enabled', true)
      .not('bot_token', 'is', null)
      .not('group_chat_id', 'is', null);

    if (error || !configs) {
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    const results = [];

    for (const config of configs) {
      // 2. Check if interval has elapsed (idempotency — also checked inside helper,
      //    but we pre-check here so we don't even wake up publishProductToTelegram)
      if (config.last_publish_at) {
        const hoursSince =
          (Date.now() - new Date(config.last_publish_at).getTime()) / 3600000;
        if (hoursSince < config.auto_publish_interval_hours) {
          results.push({
            storeId: config.store_id,
            skipped: true,
            reason: 'interval_not_elapsed',
            hoursSince: Math.round(hoursSince * 100) / 100,
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
            hoursSince: result.hoursSince,
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
        results.push({
          storeId: config.store_id,
          status: 'error',
          error: e.message,
        });
      }
    }

    return NextResponse.json({ processed: configs.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
