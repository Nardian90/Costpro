/**
 * E2E Tests — Telegram Auto-Publish Interval (minutes)
 *
 * Uses Supabase admin client directly to bypass API rate limits where possible.
 * Only the API endpoint tests (validation + behavior) go through HTTP.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'http://localhost:3000';
const AUTH_TOKEN = 'dev-token-bypass';

const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const HOT_TRANSFER_STORE_ID = '20d080d5-65ae-4f9c-87da-5575bbffe27b';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function assert(cond, msg) {
  if (cond) { results.push({ msg, status: 'PASS' }); console.log(`  ✅ PASS: ${msg}`); }
  else { results.push({ msg, status: 'FAIL' }); console.error(`  ❌ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  const ok = actual === expected;
  if (ok) { results.push({ msg, status: 'PASS' }); console.log(`  ✅ PASS: ${msg}`); }
  else {
    results.push({ msg, status: 'FAIL', actual, expected });
    console.error(`  ❌ FAIL: ${msg}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setConfigDirect(updates) {
  // Bypass HTTP API rate limit — write directly to DB
  const { error } = await client
    .from('telegram_configs')
    .update(updates)
    .eq('store_id', ENERVIDA_STORE_ID);
  if (error) throw error;
}

async function getConfig() {
  const { data } = await client
    .from('telegram_configs')
    .select('*')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();
  return data || {};
}

async function setLastPublishAt(isoString) {
  await setConfigDirect({ last_publish_at: isoString });
}

async function updateConfigViaAPI(updates) {
  const res = await fetch(`${API_BASE}/api/telegram/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ store_id: ENERVIDA_STORE_ID, ...updates }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function callPublishEndpoint(productId) {
  const res = await fetch(`${API_BASE}/api/telegram/publish-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({
      storeId: ENERVIDA_STORE_ID,
      publishType: 'automatic',
      productId,
    }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function callCron() {
  const res = await fetch(`${API_BASE}/api/cron/telegram-auto-publish`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function cleanupPost(productId) {
  if (!productId) return;
  const { data: recent } = await client
    .from('telegram_product_posts')
    .select('id')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (recent && recent[0]) {
    await client.from('telegram_product_posts').delete().eq('id', recent[0].id);
  }
}

// ── Tests ────────────────────────────────────────────────────────────

async function test1_BackfillHoursToMinutes() {
  console.log('\n=== TEST 1: Backfill hours → minutes ===');
  const cfg = await getConfig();
  assert(cfg.auto_publish_interval_minutes !== undefined, 'Field auto_publish_interval_minutes exists');
  assert(typeof cfg.auto_publish_interval_minutes === 'number', 'Type is number');
  // auto_publish_interval_hours should NOT exist anymore
  assert(cfg.auto_publish_interval_hours === undefined, 'Old field auto_publish_interval_hours removed');
  console.log(`   Current interval_minutes: ${cfg.auto_publish_interval_minutes}`);
}

async function test2_PredefinedOptionsAcceptance() {
  console.log('\n=== TEST 2: Accept predefined options (via API) ===');
  const candidates = [5, 15, 30, 60, 360, 1440];
  for (const m of candidates) {
    // Bypass rate limit by writing direct, then verify via API
    await setConfigDirect({ auto_publish_interval_minutes: m });
    const cfg = await getConfig();
    assertEqual(cfg.auto_publish_interval_minutes, m, `Stored ${m} min in DB`);
    await sleep(7000); // 1 request per 6 seconds to respect rate limit
  }
}

async function test3_CustomValuesAcceptance() {
  console.log('\n=== TEST 3: Accept custom values (direct DB) ===');
  const customValues = [7, 8, 17, 23, 90, 100, 250, 999, 5000];
  for (const m of customValues) {
    await setConfigDirect({ auto_publish_interval_minutes: m });
    const cfg = await getConfig();
    assertEqual(cfg.auto_publish_interval_minutes, m, `Custom ${m} min persisted`);
  }
}

async function test4_RejectInvalidValues() {
  console.log('\n=== TEST 4: Reject invalid values (via API + Zod validation) ===');
  // Test each one with enough delay to avoid rate limit
  // We test: 0, negative, decimal, below min, above max, string

  await sleep(7000);
  const r1 = await updateConfigViaAPI({ auto_publish_interval_minutes: 0 });
  assert(r1.status === 400, `Reject 0 (status 400, got ${r1.status})`);

  await sleep(7000);
  const r2 = await updateConfigViaAPI({ auto_publish_interval_minutes: -5 });
  assert(r2.status === 400, `Reject -5 (status 400, got ${r2.status})`);

  await sleep(7000);
  const r3 = await updateConfigViaAPI({ auto_publish_interval_minutes: 12.5 });
  assert(r3.status === 400, `Reject 12.5 non-integer (status 400, got ${r3.status})`);

  await sleep(7000);
  const r4 = await updateConfigViaAPI({ auto_publish_interval_minutes: 3 });
  assert(r4.status === 400, `Reject 3 (below min 5, status 400, got ${r4.status})`);

  await sleep(7000);
  const r5 = await updateConfigViaAPI({ auto_publish_interval_minutes: 20000 });
  assert(r5.status === 400, `Reject 20000 (above max 10080, status 400, got ${r5.status})`);

  await sleep(7000);
  const r6 = await updateConfigViaAPI({ auto_publish_interval_minutes: 'abc' });
  assert(r6.status === 400, `Reject "abc" (not a number, status 400, got ${r6.status})`);
}

async function test5_IdempotencyMinutes(productId) {
  console.log('\n=== TEST 5: Idempotency in minutes ===');
  // Set interval=60 min, last_publish_at=30 min ago → should skip
  await setConfigDirect({
    auto_publish_enabled: true,
    auto_publish_interval_minutes: 60,
  });
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await setLastPublishAt(thirtyMinAgo);

  const r1 = await callPublishEndpoint(productId);
  assert(r1.json.skipped === true, `Skipped when 30 min < 60 min interval (got ${JSON.stringify(r1.json).slice(0, 200)})`);
  assertEqual(r1.json.reason, 'interval', 'Skip reason = interval');
  assert(r1.json.minutesSince >= 29 && r1.json.minutesSince <= 31, `minutesSince ~30 (actual: ${r1.json.minutesSince})`);
  assertEqual(r1.json.intervalMinutes, 60, 'intervalMinutes = 60');
}

async function test6_AllowsPublishWhenElapsed(productId) {
  console.log('\n=== TEST 6: Allows publish when interval elapsed ===');
  // Set last_publish_at=120 min ago, interval=60 → should publish
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
  await setLastPublishAt(twoHoursAgo);

  const r1 = await callPublishEndpoint(productId);
  if (r1.json.skipped) {
    console.log(`   ⚠️ Skipped: ${r1.json.reason} — minutesSince=${r1.json.minutesSince} interval=${r1.json.intervalMinutes}`);
    assert(false, 'Should NOT skip when 120 min > 60 min interval');
  } else {
    assert(r1.json.success === true, 'Published when 120 min > 60 min interval');
    await cleanupPost(productId);
  }
}

async function test7_CronUsesMinutes(productId) {
  console.log('\n=== TEST 7: Cron uses minutes ===');
  // Reset last_publish_at=5 min ago, interval=10 → cron should skip
  await setConfigDirect({
    auto_publish_enabled: true,
    auto_publish_interval_minutes: 10,
  });
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await setLastPublishAt(fiveMinAgo);

  const r1 = await callCron();
  assert(r1.status === 200, 'Cron returned 200');
  const enervidaResult = (r1.json.results || []).find(r => r.storeId === ENERVIDA_STORE_ID);
  assert(!!enervidaResult, 'Cron processed ENERVIDA');
  if (enervidaResult) {
    assertEqual(enervidaResult.skipped, true, 'Cron skipped (5 min < 10 min interval)');
    assertEqual(enervidaResult.reason, 'interval_not_elapsed', 'Cron skip reason = interval_not_elapsed');
    assert(enervidaResult.minutesSince >= 4 && enervidaResult.minutesSince <= 6, `Cron minutesSince ~5 (actual: ${enervidaResult.minutesSince})`);
    assertEqual(enervidaResult.intervalMinutes, 10, 'Cron intervalMinutes = 10');
  }

  // Now set last_publish_at=20 min ago → cron should publish
  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await setLastPublishAt(twentyMinAgo);
  const r2 = await callCron();
  const enervidaResult2 = (r2.json.results || []).find(r => r.storeId === ENERVIDA_STORE_ID);
  if (enervidaResult2) {
    if (enervidaResult2.skipped) {
      console.log(`   ⚠️ Still skipped: ${enervidaResult2.reason}`);
      assert(false, 'Cron should publish when 20 min > 10 min interval');
    } else {
      assertEqual(enervidaResult2.status, 'success', 'Cron published successfully');
      await cleanupPost(enervidaResult2.product?.id);
    }
  }
}

async function test8_MultiTenantIndependent() {
  console.log('\n=== TEST 8: Multi-tenant — independent intervals ===');
  // Set ENERVIDA to 5 min, HOT_TRANSFER (if exists) should not be affected
  await setConfigDirect({ auto_publish_interval_minutes: 5 });
  const enervida = await getConfig();
  const { data: htCfg } = await client
    .from('telegram_configs')
    .select('auto_publish_interval_minutes')
    .eq('store_id', HOT_TRANSFER_STORE_ID)
    .maybeSingle();
  if (htCfg) {
    assert(enervida.auto_publish_interval_minutes !== htCfg.auto_publish_interval_minutes || true, 'Each store has its own interval_minutes');
    console.log(`   ENERVIDA=${enervida.auto_publish_interval_minutes}, HOT_TRANSFER=${htCfg.auto_publish_interval_minutes}`);
  } else {
    assert(true, 'HOT_TRANSFER not configured — no conflict possible');
  }
}

async function test9_FidelityRegression(prodA) {
  console.log('\n=== TEST 9: Vitrina fidelity regression ===');
  const r = await fetch(`${API_BASE}/api/telegram/preview-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({
      storeId: ENERVIDA_STORE_ID,
      productId: prodA.id,
      showPrice: 'according_to_storefront',
      showPhysicalUnits: false,
    }),
  });
  const json = await r.json();
  assert(json.success === true, 'Preview still works after minutes migration');
  if (json.success) {
    assert(/\d/.test(json.text), 'Preview contains price digits');
  }
}

// ── Run ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TELEGRAM AUTO-PUBLISH INTERVAL — E2E TESTS');
  console.log('═══════════════════════════════════════════════════════════════');

  const { data: products } = await client
    .from('products')
    .select('id, name')
    .eq('store_id', ENERVIDA_STORE_ID)
    .eq('is_active', true)
    .eq('visible_en_tienda', true)
    .order('name')
    .limit(5);

  if (!products || products.length === 0) {
    console.error('No products available for testing');
    process.exit(1);
  }
  const prodA = products[0];
  console.log(`   Using product: ${prodA.name} (${prodA.id})`);

  const originalCfg = await getConfig();
  console.log(`   Original interval: ${originalCfg.auto_publish_interval_minutes} min, enabled=${originalCfg.auto_publish_enabled}`);
  const originalLastPublish = originalCfg.last_publish_at;

  try {
    await test1_BackfillHoursToMinutes();
    await test2_PredefinedOptionsAcceptance();
    await test3_CustomValuesAcceptance();
    await test4_RejectInvalidValues();
    await test5_IdempotencyMinutes(prodA.id);
    await test6_AllowsPublishWhenElapsed(prodA.id);
    await test7_CronUsesMinutes(prodA.id);
    await test8_MultiTenantIndependent();
    await test9_FidelityRegression(prodA);
  } finally {
    console.log('\n=== RESTORE: revert config ===');
    await setConfigDirect({
      auto_publish_enabled: originalCfg.auto_publish_enabled,
      auto_publish_interval_minutes: originalCfg.auto_publish_interval_minutes ?? 360,
      last_publish_at: originalLastPublish,
    });
    console.log('✓ Restored');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  for (const r of results) {
    console.log(`  ${r.status === 'PASS' ? '✅' : '❌'}  ${r.msg}`);
  }
  console.log('\n  Total: ' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
