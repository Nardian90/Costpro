/**
 * Test the new glm-orchestrator locally with "Hola" — verify it returns
 * a real AI response (not the generic error).
 */
import { generateResponse } from '../src/lib/telegram/glm-orchestrator';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get a real contact_id from the latest "Hola" message
  const { data: lastIncoming } = await client
    .from('telegram_messages')
    .select('contact_id, telegram_chat_id')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastIncoming?.contact_id) {
    console.error('No contact_id found');
    process.exit(1);
  }

  console.log('Contact ID:', lastIncoming.contact_id);
  console.log('Chat ID:', lastIncoming.telegram_chat_id);
  console.log('\nCalling generateResponse("Hola")...\n');

  const result = await generateResponse(
    ENERVIDA_STORE_ID,
    lastIncoming.contact_id,
    5395964439, // telegram user id (Adrian)
    'Hola',
    'Adrian',
  );

  console.log('Result:');
  console.log('  text:', result.text);
  console.log('  tokensUsed:', result.tokensUsed);
  console.log('  responseTimeMs:', result.responseTimeMs);

  if (result.tokensUsed > 0) {
    console.log('\n✓ SUCCESS — model responded');
  } else {
    console.log('\n✗ FAILED — generic error returned');
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
