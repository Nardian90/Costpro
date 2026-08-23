/**
 * Debug script — check what the publish endpoint returns when interval not elapsed.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'http://localhost:3000';
const AUTH_TOKEN = 'dev-token-bypass';

const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Set interval=60 min + auto_publish_enabled=true
  console.log('=== Setting interval=60 min, enabled=true, last_publish_at=30 min ago ===');
  await new Promise(r => setTimeout(r, 3000)); // rate-limit safety

  const cfgRes = await fetch(`${API_BASE}/api/telegram/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({
      store_id: ENERVIDA_STORE_ID,
      auto_publish_enabled: true,
      auto_publish_interval_minutes: 60,
    }),
  });
  console.log('Config PUT status:', cfgRes.status);
  console.log('Config PUT body:', JSON.stringify(await cfgRes.json().catch(() => ({})), null, 2));

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { error: updErr } = await client
    .from('telegram_configs')
    .update({ last_publish_at: thirtyMinAgo })
    .eq('store_id', ENERVIDA_STORE_ID);
  if (updErr) console.error('DB update error:', updErr);
  console.log('Set last_publish_at =', thirtyMinAgo);

  // 2. Verify config
  const cfgGetRes = await fetch(`${API_BASE}/api/telegram/config?store_id=${ENERVIDA_STORE_ID}`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  const cfgGet = await cfgGetRes.json();
  console.log('Verified config:', JSON.stringify({
    auto_publish_enabled: cfgGet.data?.auto_publish_enabled,
    auto_publish_interval_minutes: cfgGet.data?.auto_publish_interval_minutes,
    last_publish_at: cfgGet.data?.last_publish_at,
  }, null, 2));

  // 3. Pick a product
  const { data: products } = await client
    .from('products')
    .select('id, name')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('is_active', true)
    .eq('visible_en_tienda', true)
    .limit(1);
  const prodId = products?.[0]?.id;
  console.log('Product:', prodId);

  // 4. Call publish endpoint with publishType=automatic
  await new Promise(r => setTimeout(r, 2000));
  const pubRes = await fetch(`${API_BASE}/api/telegram/publish-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({
      storeId: ENERVIDA_STORE_ID,
      publishType: 'automatic',
      productId: prodId,
    }),
  });
  console.log('\nPublish status:', pubRes.status);
  console.log('Publish body:', JSON.stringify(await pubRes.json(), null, 2));
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
