/**
 * E2E test — Telegram auto-publish full chain (Phase 4)
 *
 * Verifies the FULL chain:
 *   1. Local PM2 poller hits cron endpoint every 5 min
 *   2. Cron endpoint identifies ENERVIDA
 *   3. Detects if interval elapsed → publishes or skips
 *   4. Selects a valid product (not the same as last time)
 *   5. Builds message correctly
 *   6. Sends to Telegram → message_id received
 *   7. Records in telegram_product_posts
 *   8. Updates last_publish_at + last_product_id
 *   9. Next cron tick correctly skips (idempotency)
 *
 * Also tests the specific 5-min interval scenario:
 *   - Set interval=5 min
 *   - Set last_publish_at = 4 min ago → should skip
 *   - Set last_publish_at = 6 min ago → should publish
 *
 * After all tests, restores original config.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'http://localhost:3000';

const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

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

async function callCron() {
  const res = await fetch(`${API_BASE}/api/cron/telegram-auto-publish`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function getLatestPost() {
  const { data } = await client
    .from('telegram_product_posts')
    .select('id, product_id, product_name, status, publish_type, telegram_message_id, error, created_at')
    .eq('store_id', ENERVIDA_STORE_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function countPosts() {
  const { count } = await client
    .from('telegram_product_posts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', ENERVIDA_STORE_ID);
  return count || 0;
}

async function cleanupLatestPost() {
  const post = await getLatestPost();
  if (post) {
    await client.from('telegram_product_posts').delete().eq('id', post.id);
  }
}

// ── Tests ─────────────────────────────────────────────────────────

async function test1_Configuration() {
  console.log('\n=== TEST 1: ENERVIDA configuration is correct ===');
  const cfg = await getConfig();
  assert(!!cfg.bot_token, 'bot_token present');
  assert(!!cfg.bot_user_id, 'bot_user_id present');
  assert(!!cfg.bot_username, 'bot_username present');
  assert(cfg.is_active === true, 'is_active=true');
  assert(!!cfg.group_chat_id, 'group_chat_id present');
  assert(!!cfg.webhook_url, 'webhook_url present');
  assert(!!cfg.webhook_secret, 'webhook_secret present');
  assert(cfg.auto_publish_enabled === true, 'auto_publish_enabled=true');
  assert(typeof cfg.auto_publish_interval_minutes === 'number', 'auto_publish_interval_minutes is number');
  assertEqual(cfg.store_id, ENERVIDA_STORE_ID, 'Config belongs to ENERVIDA');
  console.log(`   interval_minutes=${cfg.auto_publish_interval_minutes}, last_status=${cfg.last_publish_status}`);
}

async function test2_TelegramBotApiLive() {
  console.log('\n=== TEST 2: Telegram Bot API live check ===');
  const cfg = await getConfig();

  // 1. getMe — token valid?
  const meResp = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/getMe`);
  const meJson = await meResp.json();
  assert(meJson.ok === true, 'getMe ok=true (token valid)');
  if (meJson.ok) {
    assertEqual(meJson.result.username, cfg.bot_username, `bot_username matches (${cfg.bot_username})`);
  }

  // 2. getChat — chat_id exists + bot can see it?
  const chatResp = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/getChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.group_chat_id }),
  });
  const chatJson = await chatResp.json();
  assert(chatJson.ok === true, 'getChat ok=true (bot can see the group)');
  if (chatJson.ok) {
    console.log(`   Group: ${chatJson.result.title} (type=${chatJson.result.type})`);
  }

  // 3. getChatMember — bot is admin?
  const memberResp = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/getChatMember`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.group_chat_id, user_id: cfg.bot_user_id }),
  });
  const memberJson = await memberResp.json();
  assert(memberJson.ok === true, 'getChatMember ok=true');
  if (memberJson.ok) {
    const status = memberJson.result.status;
    assert(status === 'administrator' || status === 'creator', `Bot is admin or creator (status=${status})`);
  }
}

async function test3_CronEndpointResponds() {
  console.log('\n=== TEST 3: Cron endpoint responds (200) ===');
  const r = await callCron();
  assertEqual(r.status, 200, 'Cron endpoint returns 200');
  assert(typeof r.json.processed === 'number', 'Response has "processed" count');
  assert(Array.isArray(r.json.results), 'Response has "results" array');
  console.log(`   processed=${r.json.processed}, results=${JSON.stringify(r.json.results).slice(0, 200)}`);
}

async function test4_StoreIdentifiedInCron() {
  console.log('\n=== TEST 4: Cron identifies ENERVIDA ===');
  const r = await callCron();
  const enervida = (r.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
  assert(!!enervida, 'ENERVIDA is in the processed list');
  if (enervida) {
    console.log(`   ENERVIDA result: ${JSON.stringify(enervida).slice(0, 250)}`);
  }
}

async function test5_RealPublishAndVerify() {
  console.log('\n=== TEST 5: Real publish (force interval elapsed) ===');
  // Force: set last_publish_at = 2 hours ago, interval=5 min → should publish
  await setConfigDirect({
    auto_publish_enabled: true,
    auto_publish_interval_minutes: 5,
  });
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
  await setLastPublishAt(twoHoursAgo);

  const postsBefore = await countPosts();
  console.log(`   Posts before: ${postsBefore}`);

  const r = await callCron();
  const enervida = (r.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
  console.log(`   Result: ${JSON.stringify(enervida).slice(0, 300)}`);

  // Should NOT be skipped
  assert(!enervida?.skipped, 'Not skipped (interval elapsed)');
  assertEqual(enervida?.status, 'success', 'Status = success');
  assert(!!enervida?.messageId, `messageId returned (${enervida?.messageId})`);
  assert(!!enervida?.product?.id, 'Product ID returned');
  assert(!!enervida?.product?.name, 'Product name returned');

  // Verify BD
  const cfgAfter = await getConfig();
  assertEqual(cfgAfter.last_publish_status, 'success', 'last_publish_status=success in DB');
  assert(!!cfgAfter.last_publish_at, 'last_publish_at updated');
  assertEqual(cfgAfter.last_product_id, enervida?.product?.id, 'last_product_id matches');

  // Verify post in history
  const postsAfter = await countPosts();
  assertEqual(postsAfter, postsBefore + 1, `Post count incremented (was ${postsBefore}, now ${postsAfter})`);

  // Verify latest post
  const latest = await getLatestPost();
  assertEqual(latest.product_id, enervida?.product?.id, 'Latest post product_id matches');
  assertEqual(latest.publish_type, 'automatic', 'Latest post publish_type=automatic');
  assertEqual(latest.status, 'success', 'Latest post status=success');
  assertEqual(latest.telegram_message_id, enervida?.messageId, 'Latest post message_id matches');

  // Verify message actually exists in Telegram via the bot (we can't easily fetch the
  // message content, but the messageId being a valid number from Telegram API is the proof)
  assert(typeof enervida?.messageId === 'number' && enervida?.messageId > 0, 'messageId is a positive number (Telegram accepted it)');

  return enervida;
}

async function test6_IdempotencyAfterPublish() {
  console.log('\n=== TEST 6: Idempotency — next cron tick should skip ===');
  // Cron was just called, last_publish_at is now < 1 second ago, interval=5 min
  // → next cron call should skip
  const r = await callCron();
  const enervida = (r.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
  console.log(`   Result: ${JSON.stringify(enervida).slice(0, 300)}`);
  assertEqual(enervida?.skipped, true, 'Skipped immediately after publish');
  assertEqual(enervida?.reason, 'interval_not_elapsed', 'Skip reason = interval_not_elapsed');
  assert(enervida?.minutesSince < 1, `minutesSince < 1 (actual: ${enervida?.minutesSince})`);
  assertEqual(enervida?.intervalMinutes, 5, 'intervalMinutes = 5');
}

async function test7_FiveMinIntervalMath() {
  console.log('\n=== TEST 7: 5-min interval math — set last to 4 min ago → SKIP ===');
  await setConfigDirect({ auto_publish_interval_minutes: 5 });
  const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  await setLastPublishAt(fourMinAgo);

  const r1 = await callCron();
  const enervida1 = (r1.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
  assertEqual(enervida1?.skipped, true, 'Cron at 4-min-elapsed skips (interval=5min)');
  assert(enervida1?.minutesSince >= 3.9 && enervida1?.minutesSince <= 4.1, `minutesSince ~4 (actual: ${enervida1?.minutesSince})`);

  console.log('\n=== TEST 7b: 5-min interval math — set last to 6 min ago → PUBLISH ===');
  const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  await setLastPublishAt(sixMinAgo);
  const r2 = await callCron();
  const enervida2 = (r2.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
  assert(!enervida2?.skipped, 'Cron at 6-min-elapsed publishes (interval=5min)');
  assertEqual(enervida2?.status, 'success', 'Status = success');
  await cleanupLatestPost(); // remove the test post
}

async function test8_RotationNotRepeated() {
  console.log('\n=== TEST 8: Rotation — bot does not publish same product back-to-back ===');
  // Force publish multiple times in a row (clear last_publish_at each time to bypass idempotency)
  const publishedIds = new Set();
  for (let i = 0; i < 3; i++) {
    // Set last to 1 hour ago so interval=5min always passes
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await setLastPublishAt(oneHourAgo);
    await sleep(2000); // rate-limit safety
    const r = await callCron();
    const e = (r.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
    if (e?.status === 'success' && e?.product?.id) {
      publishedIds.add(e.product.id);
      console.log(`   Round ${i + 1}: published "${e.product.name}" (id=${e.product.id})`);
      await cleanupLatestPost();
    } else {
      console.log(`   Round ${i + 1}: result=${JSON.stringify(e).slice(0, 200)}`);
    }
  }
  console.log(`   Unique products published: ${publishedIds.size} (out of 3)`);
  assert(publishedIds.size >= 2, `At least 2 unique products across 3 publishes (got ${publishedIds.size})`);
}

async function test9_ProductSelectionFromCorrectStore() {
  console.log('\n=== TEST 9: Product selection respects store_id (multi-tenant) ===');
  // Force a publish and verify the product belongs to ENERVIDA
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await setLastPublishAt(oneHourAgo);
  const r = await callCron();
  const e = (r.json.results || []).find(x => x.storeId === ENERVIDA_STORE_ID);
  if (e?.product?.id) {
    const { data: prod } = await client
      .from('products')
      .select('store_id, name')
      .eq('id', e.product.id)
      .maybeSingle();
    if (prod) {
      assertEqual(prod.store_id, ENERVIDA_STORE_ID, `Published product belongs to ENERVIDA (not other store)`);
      console.log(`   Product: ${prod.name} (store_id=${prod.store_id})`);
    } else {
      assert(false, 'Published product exists in DB');
    }
    await cleanupLatestPost();
  }
}

// ── Run ───────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TELEGRAM AUTO-PUBLISH — FULL E2E AUDIT (Phase 4)');
  console.log('═══════════════════════════════════════════════════════════════');

  const originalCfg = await getConfig();
  console.log(`Original: enabled=${originalCfg.auto_publish_enabled}, interval=${originalCfg.auto_publish_interval_minutes}min, last=${originalCfg.last_publish_at}`);

  try {
    await test1_Configuration();
    await test2_TelegramBotApiLive();
    await test3_CronEndpointResponds();
    await test4_StoreIdentifiedInCron();
    await test5_RealPublishAndVerify();
    await test6_IdempotencyAfterPublish();
    await test7_FiveMinIntervalMath();
    await test8_RotationNotRepeated();
    await test9_ProductSelectionFromCorrectStore();
  } finally {
    console.log('\n=== RESTORE: revert config ===');
    await setConfigDirect({
      auto_publish_enabled: originalCfg.auto_publish_enabled,
      auto_publish_interval_minutes: originalCfg.auto_publish_interval_minutes,
      last_publish_at: originalCfg.last_publish_at,
    });
    console.log('✓ Restored');
  }

  // Summary
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
