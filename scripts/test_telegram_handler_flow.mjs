/**
 * Reproduce the EXACT Telegram handler flow locally to find the real error.
 * Simulates: incoming "Hola" → load config → load history → call GLM → return response.
 */
import ZAI from 'z-ai-web-dev-sdk';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let zaiClient = null;
async function getZAIClient() {
  if (!zaiClient) {
    zaiClient = await ZAI.create();
  }
  return zaiClient;
}

async function main() {
  console.log('=== Reproducing telegram handler flow ===\n');

  // 1. Load config (same query as handlers.ts → glm-orchestrator.ts:97-101)
  const { data: configData, error: cfgErr } = await client
    .from('telegram_configs')
    .select('system_prompt, model_name, temperature, max_tokens, context_window')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();
  if (cfgErr) {
    console.error('Config load error:', cfgErr);
    process.exit(1);
  }
  console.log('1. Config loaded:', JSON.stringify(configData, null, 2));

  // 2. Find the contact for "Hola" sender (telegram_user_id of the user)
  // For testing, use the contact from latest incoming "Hola"
  const { data: lastIncoming } = await client
    .from('telegram_messages')
    .select('id, contact_id, telegram_chat_id, content, created_at')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('2. Last incoming message:', JSON.stringify(lastIncoming, null, 2));

  const contactId = lastIncoming?.contact_id;
  if (!contactId) {
    console.error('No contact_id found');
    process.exit(1);
  }

  // 3. Load history (same as glm-orchestrator.ts:114-124)
  const { data: historyRows } = await client
    .from('telegram_messages')
    .select('direction, content')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(configData.context_window);
  const history = (historyRows || []).reverse();
  console.log('3. History (', history.length, 'messages):');
  for (const h of history) {
    console.log('   [', h.direction, ']', (h.content || '').slice(0, 80));
  }

  // 4. Build messages array (same as glm-orchestrator.ts:156-163)
  const systemContent = configData.system_prompt || 'Eres un asistente de ventas amable';
  const userContent = 'Hola';
  const messages = [
    { role: 'system', content: systemContent },
    ...history.map(m => ({
      role: m.direction === 'incoming' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userContent },
  ];
  console.log('\n4. Messages array:');
  for (const m of messages) {
    console.log('   [', m.role, ']', (m.content || '').slice(0, 100));
  }

  // 5. Call ZAI (same as glm-orchestrator.ts:166-194)
  console.log('\n5. Calling ZAI...');
  const startTime = Date.now();
  try {
    const zaiClient = await getZAIClient();
    const response = await zaiClient.chat.completions.create({
      model: configData.model_name,
      messages,
      temperature: configData.temperature,
      max_tokens: configData.max_tokens,
    });
    const elapsed = Date.now() - startTime;
    console.log('✓ SUCCESS in', elapsed, 'ms');
    console.log('Response text:', response.choices?.[0]?.message?.content);
    console.log('Tokens:', response.usage?.total_tokens);
  } catch (e) {
    const elapsed = Date.now() - startTime;
    console.error('✗ FAILED in', elapsed, 'ms');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Error stack:', e.stack?.slice(0, 800));
    if (e.cause) console.error('Cause:', e.cause);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
