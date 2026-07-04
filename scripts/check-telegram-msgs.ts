import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function check() {
  console.log('=== telegram_messages (últimos 10) ===');
  const { data: msgs, error: mErr } = await supabase
    .from('telegram_messages')
    .select('id, store_id, contact_id, direction, content, telegram_chat_id, created_at, media_type')
    .order('created_at', { ascending: false })
    .limit(10);
  if (mErr) console.error('Error:', mErr.message);
  console.table(msgs || []);

  console.log('\n=== telegram_contacts (todos) ===');
  const { data: contacts, error: cErr } = await supabase
    .from('telegram_contacts')
    .select('*')
    .order('last_contact', { ascending: false, nullsFirst: false })
    .limit(20);
  if (cErr) console.error('Error:', cErr.message);
  console.table(contacts || []);

  console.log('\n=== telegram_configs ===');
  const { data: configs, error: cfgErr } = await supabase
    .from('telegram_configs')
    .select('store_id, bot_username, is_active, trigger_mode, group_chat_id, webhook_url')
    .eq('bot_user_id', 8886258436);
  if (cfgErr) console.error('Error:', cfgErr.message);
  console.table(configs || []);
}

check().catch(console.error);
