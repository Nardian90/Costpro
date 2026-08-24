/**
 * Simulate a Telegram webhook POST to PRODUCTION Vercel with "Hola" message.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const PRODUCTION_API = 'https://costpro4.vercel.app';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: cfg } = await client
    .from('telegram_configs')
    .select('bot_user_id, webhook_secret, group_chat_id')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();

  console.log('Bot ID:', cfg.bot_user_id);
  console.log('Webhook URL:', `${PRODUCTION_API}/api/telegram/webhook?bot_id=${cfg.bot_user_id}`);

  // Build fake Telegram update
  const update = {
    update_id: Math.floor(Math.random() * 1000000000),
    message: {
      message_id: 9999, // fake
      from: {
        id: 5395964439, // Adrian Pompa (real user)
        is_bot: false,
        first_name: 'Adrian',
        username: 'AdrianPompa',
        language_code: 'es',
      },
      chat: {
        id: cfg.group_chat_id,
        title: 'Ener-Vida (VITALLCONS S.U.R.L)',
        type: 'supergroup',
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Hola',
    },
  };

  console.log('\n=== Sending fake Telegram update to PRODUCTION webhook ===');
  const resp = await fetch(`${PRODUCTION_API}/api/telegram/webhook?bot_id=${cfg.bot_user_id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': cfg.webhook_secret,
    },
    body: JSON.stringify(update),
  });
  console.log('HTTP status:', resp.status, '(expected 403 — IP allowlist blocks non-Telegram IPs)');
  console.log('Response:', await resp.text());
  console.log('\nNote: production endpoint will reject with 403 because our IP is not Telegram\'s.');
  console.log('To do a REAL E2E test, send "Hola" to @VITALLCONS_bot in Telegram.');
  console.log('Then check telegram_messages table in DB for the AI response.');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
