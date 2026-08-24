/**
 * Verify the cron endpoint actually published to Telegram.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Get latest config
  const { data: cfg } = await client
    .from('telegram_configs')
    .select('last_publish_at, last_product_id, last_publish_status, last_publish_error, auto_publish_interval_minutes')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();

  console.log('=== Config after cron run ===');
  console.log(JSON.stringify(cfg, null, 2));

  // 2. Get latest post in history
  const { data: posts } = await client
    .from('telegram_product_posts')
    .select('id, product_id, product_name, status, publish_type, telegram_message_id, error, created_at')
    .eq('store_id', ENERVIDA_STORE_ID)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\n=== Latest 3 posts ===');
  for (const p of posts || []) {
    console.log(`  [${p.created_at}] ${p.status} ${p.publish_type}: ${p.product_name} msg_id=${p.telegram_message_id}${p.error ? ' err=' + p.error : ''}`);
  }

  // 3. Verify with Telegram: getChat to confirm message exists
  const { data: fullCfg } = await client
    .from('telegram_configs')
    .select('bot_token, group_chat_id')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();

  // Use forwardMessage to a dummy chat would fail, but we can use getChat to verify the bot can still see the group
  console.log('\n=== getChat (verify bot can see the group) ===');
  const chatResp = await fetch(`https://api.telegram.org/bot${fullCfg.bot_token}/getChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: fullCfg.group_chat_id }),
  });
  const chatJson = await chatResp.json();
  console.log(JSON.stringify(chatJson, null, 2));

  // 4. Bot is admin?
  console.log('\n=== getChatMember (bot is admin?) ===');
  const { data: cfgBot } = await client
    .from('telegram_configs')
    .select('bot_token, bot_user_id, group_chat_id')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();
  const memberResp = await fetch(`https://api.telegram.org/bot${cfgBot.bot_token}/getChatMember`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfgBot.group_chat_id, user_id: cfgBot.bot_user_id }),
  });
  const memberJson = await memberResp.json();
  console.log('Bot status in group:', memberJson.result?.status);

  // 5. Math check: when is next publish?
  console.log('\n=== Interval math ===');
  if (cfg.last_publish_at) {
    const lastTime = new Date(cfg.last_publish_at).getTime();
    const now = Date.now();
    const minutesSince = (now - lastTime) / 60000;
    const interval = cfg.auto_publish_interval_minutes;
    const nextAt = new Date(lastTime + interval * 60 * 1000);
    console.log(`last_publish_at:    ${cfg.last_publish_at}`);
    console.log(`now:                ${new Date(now).toISOString()}`);
    console.log(`minutesSince:       ${minutesSince.toFixed(2)}`);
    console.log(`interval (min):     ${interval}`);
    console.log(`shouldPublish now?  ${minutesSince >= interval ? 'YES' : 'NO'}`);
    console.log(`next eligible at:  ${nextAt.toISOString()}`);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
