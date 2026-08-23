/**
 * Verify migration: confirm column renamed + backfill + check ENERVIDA value.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
  const { data, error } = await client
    .from('telegram_configs')
    .select('store_id, is_active, auto_publish_enabled, auto_publish_interval_minutes, show_price, show_physical_units, last_publish_at, last_publish_status, webhook_url, webhook_secret')
    .eq('store_id', STORE_ID)
    .maybeSingle();
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}
main();
