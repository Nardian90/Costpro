/**
 * Final webhook health check + check for recent Telegram delivery errors.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
  const { data: config } = await client
    .from('telegram_configs')
    .select('bot_token, bot_user_id, webhook_url')
    .eq('store_id', STORE_ID)
    .maybeSingle();

  console.log('=== getWebhookInfo (final state) ===');
  const resp = await fetch(`https://api.telegram.org/bot${config.bot_token}/getWebhookInfo`);
  const json = await resp.json();
  console.log(JSON.stringify(json.result, null, 2));

  // If pending_update_count > 0, that means Telegram is trying to deliver but
  // Render is not returning 200. If last_error_message is set, that's the
  // specific error.

  if (json.result?.pending_update_count > 0) {
    console.log('\n⚠️ Telegram has ' + json.result.pending_update_count + ' pending updates.');
    console.log('   The webhook is NOT processing them — Render must be returning non-200.');
    if (json.result.last_error_message) {
      console.log('   Last error:', json.result.last_error_message);
      console.log('   Last error date:', new Date(json.result.last_error_date * 1000).toISOString());
    }
  } else {
    console.log('\n✓ pending_update_count = 0 (no backlog)');
  }

  // Try a direct test: simulate a Telegram update via curl from a Telegram IP
  // (We can't spoof IPs from here, but we can check if the endpoint at least
  // responds correctly to a request with the secret token)
  console.log('\n=== Direct endpoint test (will fail IP check, but shows route exists) ===');
  const smokeResp = await fetch(config.webhook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'fake-secret-to-test-route',
    },
    body: JSON.stringify({ update_id: 999999 }),
  });
  console.log('Status:', smokeResp.status);
  console.log('Body:', await smokeResp.text());

  // Check Render's logs by hitting the health endpoint
  console.log('\n=== Render health endpoint ===');
  const healthResp = await fetch('https://costpro.onrender.com/api/health');
  console.log('Status:', healthResp.status);
  console.log('Body:', await healthResp.text().catch(() => ''));
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
