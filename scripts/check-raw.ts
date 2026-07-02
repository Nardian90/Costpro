import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function check() {
  // Verificar si hay mensajes del grupo (chat_id = -1003816115625)
  console.log('=== Mensajes del grupo (chat_id = -1003816115625) ===');
  const { data: groupMsgs } = await supabase
    .from('telegram_messages')
    .select('*')
    .eq('telegram_chat_id', -1003816115625);
  console.log('Count:', groupMsgs?.length || 0);
  console.table(groupMsgs || []);

  // Verificar todos los mensajes recientes
  console.log('\n=== Todos los mensajes recientes ===');
  const { data: allMsgs } = await supabase
    .from('telegram_messages')
    .select('id, direction, content, telegram_chat_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.table(allMsgs || []);
}

check().catch(console.error);
