/**
 * Test the ZAI SDK directly with a "Hola" message + ENERVIDA's exact config
 * to capture the actual error (which the catch block hides).
 */
import ZAI from 'z-ai-web-dev-sdk';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('=== Loading ENERVIDA telegram config ===');
  const { data: config, error } = await client
    .from('telegram_configs')
    .select('system_prompt, model_name, temperature, max_tokens, context_window')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();
  if (error) {
    console.error('DB error:', error);
    process.exit(1);
  }
  console.log('Config:', JSON.stringify(config, null, 2));

  // Build the messages array exactly like the Telegram handler does
  const messages = [
    { role: 'system', content: config.system_prompt || 'Eres un asistente de ventas amable' },
    { role: 'user', content: 'Hola' },
  ];

  console.log('\n=== Creating ZAI client ===');
  let zaiClient;
  try {
    zaiClient = await ZAI.create();
    console.log('ZAI client created OK');
  } catch (e) {
    console.error('ZAI.create() FAILED:', e.message);
    process.exit(1);
  }

  console.log('\n=== Calling zai.chat.completions.create() with model:', config.model_name, '===');
  const startTime = Date.now();
  try {
    const response = await zaiClient.chat.completions.create({
      model: config.model_name,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    });
    const elapsed = Date.now() - startTime;
    console.log('✓ SUCCESS in', elapsed, 'ms');
    console.log('Full response:', JSON.stringify(response, null, 2));
    console.log('Text:', response.choices?.[0]?.message?.content);
    console.log('Tokens:', response.usage?.total_tokens);
  } catch (e) {
    const elapsed = Date.now() - startTime;
    console.error('✗ FAILED in', elapsed, 'ms');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Error stack:', e.stack);
    if (e.cause) {
      console.error('Cause:', e.cause);
    }
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
