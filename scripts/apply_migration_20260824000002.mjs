/**
 * Apply migration 20260824000002_telegram_show_price_units.sql
 * Adds show_price + show_physical_units columns to telegram_configs.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log('=== Migration 20260824000002 ===');
  console.log('Target:', SUPABASE_URL);

  // Use raw SQL via rpc('to_jsonb', ...) is not possible; use Supabase's
  // REST SQL endpoint by issuing direct column-add via .rpc.
  // Instead, use the pg-meta REST endpoint or run psql-equivalent via fetch.

  // We'll use the SQL HTTP endpoint directly.
  const sql = `
    ALTER TABLE public.telegram_configs
      ADD COLUMN IF NOT EXISTS show_price text DEFAULT 'according_to_storefront'
        CHECK (show_price IN ('according_to_storefront', 'show', 'hide')),
      ADD COLUMN IF NOT EXISTS show_physical_units boolean DEFAULT false;

    UPDATE public.telegram_configs
      SET show_price = COALESCE(show_price, 'according_to_storefront'),
          show_physical_units = COALESCE(show_physical_units, false)
      WHERE show_price IS NULL OR show_physical_units IS NULL;

    COMMENT ON COLUMN telegram_configs.show_price IS
      'How Telegram publishes price: according_to_storefront (follow Vitrina), show (still respects Vitrina), hide (always)';
    COMMENT ON COLUMN telegram_configs.show_physical_units IS
      'Whether Telegram shows physical units. Even when true, respects stock_visible (Vitrina rules).';
  `;

  // @ts-expect-error – supabase-js exposes .rpc() with raw SQL via 'pg-meta' or
  // we use fetch() to the /rest/v1/rpc endpoint. The simplest cross-version
  // approach is to hit the SQL endpoint directly.
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!resp.ok) {
    // Most projects don't expose exec_sql — fall back to issuing individual
    // ALTER statements via the data API is not possible. Instead, log and
    // instruct the user to run the migration manually via psql.
    const txt = await resp.text();
    console.error('exec_sql endpoint not available:', resp.status, txt);
    console.error('\nManual fallback — run this in Supabase SQL Editor:\n');
    console.error(sql);
    process.exit(1);
  }

  const data = await resp.json();
  console.log('✓ Migration applied:', data);
}

run().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
