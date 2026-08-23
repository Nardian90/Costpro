/**
 * Diagnose Telegram chatbot — getWebhookInfo, getUpdates, etc.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

  // 1. Get bot_token from telegram_configs
  const { data: config, error } = await client
    .from('telegram_configs')
    .select('bot_token, bot_user_id, bot_username, is_active, webhook_url, webhook_secret, webhook_registered_at, group_chat_id, trigger_mode, welcome_enabled, store_id')
    .eq('store_id', STORE_ID)
    .maybeSingle();

  if (error) {
    console.error('DB error:', error);
    process.exit(1);
  }
  if (!config) {
    console.error('No telegram_configs row for ENERVIDA');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TELEGRAM CHATBOT DIAGNOSIS — ENERVIDA');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Stored config:');
  console.log({
    store_id: config.store_id,
    bot_user_id: config.bot_user_id,
    bot_username: config.bot_username,
    is_active: config.is_active,
    group_chat_id: config.group_chat_id,
    trigger_mode: config.trigger_mode,
    welcome_enabled: config.welcome_enabled,
    webhook_url_in_db: config.webhook_url,
    webhook_secret_set: !!config.webhook_secret,
    webhook_registered_at: config.webhook_registered_at,
  });

  // 2. Call Telegram getWebhookInfo
  console.log('\n=== getWebhookInfo (live from Telegram) ===');
  const botToken = config.bot_token;
  if (!botToken) {
    console.error('No bot_token in DB');
    process.exit(1);
  }
  const TG_API = `https://api.telegram.org/bot${botToken}`;
  const resp = await fetch(`${TG_API}/getWebhookInfo`);
  const json = await resp.json();
  console.log(JSON.stringify(json, null, 2));

  // 3. Try getUpdates (will only work if no webhook is set)
  if (!json.result?.url) {
    console.log('\n=== getUpdates (since no webhook is set) ===');
    const updResp = await fetch(`${TG_API}/getUpdates?timeout=0&limit=10`);
    const updJson = await updResp.json();
    console.log('ok:', updJson.ok);
    console.log('result count:', updJson.result?.length || 0);
    if (updJson.result?.length > 0) {
      console.log('Last 3 updates:');
      for (const u of updJson.result.slice(-3)) {
        console.log(JSON.stringify(u, null, 2));
      }
    }
  } else {
    console.log('\n=== Skipping getUpdates (webhook is active — Telegram would reject getUpdates) ===');
  }

  // 4. Verify getMe — make sure the bot is still alive
  console.log('\n=== getMe (verify bot) ===');
  const meResp = await fetch(`${TG_API}/getMe`);
  const meJson = await meResp.json();
  console.log(JSON.stringify(meJson, null, 2));

  // 5. Check the URL where webhook should point
  console.log('\n=== Production URL analysis ===');
  console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
  console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
  console.log('VERCEL_URL:', process.env.VERCEL_URL);
  console.log('NODE_ENV:', process.env.NODE_ENV);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
