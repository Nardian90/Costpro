/**
 * Register webhook on Render production URL with secret token.
 * Then verify with getWebhookInfo.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PRODUCTION_BASE_URL = 'https://costpro.onrender.com';
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

async function main() {
  // 1. Load config to get bot_token + bot_user_id
  const { data: config, error } = await client
    .from('telegram_configs')
    .select('bot_token, bot_user_id, bot_username')
    .eq('store_id', STORE_ID)
    .maybeSingle();
  if (error || !config) {
    console.error('Failed to load config:', error);
    process.exit(1);
  }
  console.log('=== Bot:', config.bot_username, 'id:', config.bot_user_id, '===');

  // 2. Generate webhook secret
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  console.log('Generated secret (length=' + secret.length + ')');

  // 3. Construct webhook URL
  const webhookUrl = `${PRODUCTION_BASE_URL}/api/telegram/webhook?bot_id=${config.bot_user_id}`;
  console.log('Webhook URL:', webhookUrl);

  // 4. First, flush pending updates by calling deleteWebhook with drop_pending_updates=true
  //    This ensures we start clean — old updates (from when webhook was broken)
  //    are discarded so we can verify new messages actually arrive.
  console.log('\n=== Step A: Flush pending updates (deleteWebhook with drop_pending_updates) ===');
  const delResp = await fetch(`https://api.telegram.org/bot${config.bot_token}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: true }),
  });
  const delJson = await delResp.json();
  console.log(JSON.stringify(delJson, null, 2));

  // 5. Now register the new webhook
  console.log('\n=== Step B: Register webhook on Render production URL ===');
  const regResp = await fetch(`https://api.telegram.org/bot${config.bot_token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: false, // don't drop new ones
      max_connections: 40,
    }),
  });
  const regJson = await regResp.json();
  console.log(JSON.stringify(regJson, null, 2));

  if (!regJson.ok) {
    console.error('FAILED to register webhook');
    process.exit(1);
  }

  // 6. Update DB with new webhook info
  console.log('\n=== Step C: Update telegram_configs in DB ===');
  const { error: updErr } = await client
    .from('telegram_configs')
    .update({
      webhook_url: webhookUrl,
      webhook_secret: secret,
      webhook_registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', STORE_ID);
  if (updErr) {
    console.error('DB update failed:', updErr);
    process.exit(1);
  }
  console.log('✓ DB updated');

  // 7. Verify with getWebhookInfo
  console.log('\n=== Step D: getWebhookInfo (verify) ===');
  const infoResp = await fetch(`https://api.telegram.org/bot${config.bot_token}/getWebhookInfo`);
  const infoJson = await infoResp.json();
  console.log(JSON.stringify(infoJson, null, 2));

  // 8. Quick smoke test: hit the URL ourselves (will get 403 due to IP allowlist)
  console.log('\n=== Step E: Smoke test webhook endpoint (will be 403 due to IP allowlist) ===');
  const smokeResp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: 0 }),
  });
  console.log('Smoke test status:', smokeResp.status);
  const smokeText = await smokeResp.text();
  console.log('Smoke test body:', smokeText);

  // 9. GET health check (should be 200)
  console.log('\n=== Step F: GET health check ===');
  const getResp = await fetch(webhookUrl);
  console.log('GET status:', getResp.status);
  console.log('GET body:', await getResp.text());
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
