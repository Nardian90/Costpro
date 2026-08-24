/**
 * Simulate a Telegram webhook POST locally with "Hola" message.
 * This lets us test the handler end-to-end without actually sending
 * from Telegram.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const LOCAL_API = 'http://localhost:3000';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Load config to get bot_user_id + webhook_secret
  const { data: cfg } = await client
    .from('telegram_configs')
    .select('bot_user_id, webhook_secret, group_chat_id, bot_username')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();

  console.log('Bot ID:', cfg.bot_user_id, 'Group:', cfg.group_chat_id);

  // Build a fake Telegram Update that looks like a real "Hola" message
  // sent by user Adrian Pompa (id 5395964439) to the Ener-Vida group
  const update = {
    update_id: Math.floor(Math.random() * 1000000000),
    message: {
      message_id: 999, // fake
      from: {
        id: 5395964439,
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

  console.log('\n=== Sending fake Telegram update to local webhook ===');
  console.log('  URL:', `${LOCAL_API}/api/telegram/webhook?bot_id=${cfg.bot_user_id}`);
  console.log('  text: "Hola"');
  console.log('  chat.id:', cfg.group_chat_id);
  console.log('  from.id:', 5395964439);

  // POST to local webhook (will get 403 due to IP allowlist + dev bypass)
  // But isTelegramIp returns true in non-production, so it should pass.
  const resp = await fetch(`${LOCAL_API}/api/telegram/webhook?bot_id=${cfg.bot_user_id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': cfg.webhook_secret,
    },
    body: JSON.stringify(update),
  });
  console.log('\nHTTP status:', resp.status);
  console.log('Response body:', await resp.text());

  // Wait for async processing (waitUntilCompat runs in background)
  console.log('\n=== Waiting 10 seconds for async processing... ===');
  await new Promise(r => setTimeout(r, 10000));

  // Check telegram_messages table for new outgoing message
  const tenSecondsAgo = new Date(Date.now() - 30_000).toISOString();
  const { data: recentMessages, error } = await client
    .from('telegram_messages')
    .select('id, direction, content, created_at, tokens_used, response_time_ms')
    .eq('store_id', ENERVIDA_STORE_ID)
    .gte('created_at', tenSecondsAgo)
    .order('created_at', { ascending: true });

  console.log('\n=== Messages created in last 30s ===');
  if (error) console.error('Error:', error);
  if (!recentMessages || recentMessages.length === 0) {
    console.log('  (none — handler may not have run)');
  } else {
    for (const m of recentMessages) {
      console.log(`  [${m.direction}] tokens=${m.tokens_used} ms=${m.response_time_ms}`);
      console.log(`    "${(m.content || '').slice(0, 200)}"`);
    }
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
