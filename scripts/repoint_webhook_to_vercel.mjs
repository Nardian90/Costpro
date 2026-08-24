/**
 * Re-register webhook on Vercel production URL.
 * Also adds diagnostic logs.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const NEW_BASE_URL = 'https://costpro4.vercel.app';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Load bot config
  const { data: config } = await client
    .from('telegram_configs')
    .select('bot_token, bot_user_id, bot_username')
    .eq('store_id', STORE_ID)
    .maybeSingle();

  console.log('Bot:', config.bot_username, '(id:', config.bot_user_id + ')');

  // 2. Generate new webhook secret
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  console.log('New secret length:', secret.length);

  // 3. Build webhook URL on Vercel
  const webhookUrl = `${NEW_BASE_URL}/api/telegram/webhook?bot_id=${config.bot_user_id}`;
  console.log('New webhook URL:', webhookUrl);

  // 4. Flush pending stale updates on Render webhook
  console.log('\n=== Step A: deleteWebhook on Render (drop pending) ===');
  const delResp = await fetch(`https://api.telegram.org/bot${config.bot_token}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: true }),
  });
  const delJson = await delResp.json();
  console.log(JSON.stringify(delJson, null, 2));

  // 5. Register new webhook on Vercel
  console.log('\n=== Step B: setWebhook on Vercel ===');
  const regResp = await fetch(`https://api.telegram.org/bot${config.bot_token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: false,
      max_connections: 40,
    }),
  });
  const regJson = await regResp.json();
  console.log(JSON.stringify(regJson, null, 2));

  if (!regJson.ok) {
    console.error('FAILED');
    process.exit(1);
  }

  // 6. Update DB
  console.log('\n=== Step C: update DB ===');
  const { error } = await client
    .from('telegram_configs')
    .update({
      webhook_url: webhookUrl,
      webhook_secret: secret,
      webhook_registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', STORE_ID);
  if (error) {
    console.error('DB update failed:', error);
    process.exit(1);
  }
  console.log('✓ DB updated');

  // 7. Verify
  console.log('\n=== Step D: getWebhookInfo ===');
  const infoResp = await fetch(`https://api.telegram.org/bot${config.bot_token}/getWebhookInfo`);
  const infoJson = await infoResp.json();
  console.log(JSON.stringify(infoJson.result, null, 2));
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
