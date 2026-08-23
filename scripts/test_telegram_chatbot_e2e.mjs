/**
 * E2E Tests — Telegram Chatbot End-to-End
 *
 * Tests the full chatbot flow:
 *   1. getWebhookInfo (live from Telegram)
 *   2. Production URL accessibility
 *   3. Webhook endpoint responds (403 = IP allowlist active = correct)
 *   4. DB has webhook_url + webhook_secret stored
 *   5. Bot is admin in the configured group
 *   6. Telegram delivers updates to webhook
 *   7. Update is processed (telegram_messages table)
 *   8. AI generates response (GLM call)
 *   9. sendMessage delivers response to user
 *
 * IMPORTANT: This test CANNOT autonomously send a Telegram user message to the
 * bot. Bot API can only send FROM bots, not TO them. To test the full path
 * end-to-end, the user must manually send 'hola' to @VITALLCONS_bot.
 *
 * This script:
 *   1. Polls getWebhookInfo for changes (pending_update_count, last_error)
 *   2. Polls the telegram_messages table for new incoming/outgoing entries
 *   3. Reports verdict based on what it observes
 *
 * USAGE:
 *   1. Run this script: `node scripts/test_telegram_chatbot_e2e.mjs`
 *   2. Watch for the prompt: "Now send 'hola' to @VITALLCONS_bot"
 *   3. Send the message in Telegram
 *   4. Wait for the script to detect + verify
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

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

async function loadConfig() {
  const { data, error } = await client
    .from('telegram_configs')
    .select('bot_token, bot_user_id, bot_username, is_active, webhook_url, webhook_secret, webhook_registered_at, group_chat_id, trigger_mode, store_id')
    .eq('store_id', STORE_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getWebhookInfo(botToken) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  return await resp.json();
}

async function getBotInfo(botToken) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  return await resp.json();
}

async function getChatMember(botToken, chatId, userId) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, user_id: userId }),
  });
  return await resp.json();
}

async function getRecentMessages(since) {
  const { data, error } = await client
    .from('telegram_messages')
    .select('id, direction, content, contact_id, telegram_chat_id, created_at, tokens_used, response_time_ms')
    .eq('store_id', STORE_ID)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;
  return data || [];
}

// ── Tests ────────────────────────────────────────────────────────────

async function test1_GetWebhookInfo(config) {
  console.log('\n=== TEST 1: getWebhookInfo (live from Telegram) ===');
  const info = await getWebhookInfo(config.bot_token);
  assert(info.ok === true, 'Telegram API responded ok=true');

  if (info.ok && info.result) {
    console.log('   URL:', info.result.url);
    console.log('   pending_update_count:', info.result.pending_update_count);
    console.log('   last_error_date:', info.result.last_error_date || '(none)');
    console.log('   last_error_message:', info.result.last_error_message || '(none)');
    console.log('   max_connections:', info.result.max_connections);
    console.log('   ip_address:', info.result.ip_address);

    assert(!!info.result.url, 'Webhook URL is set');
    assertEqual(info.result.url, config.webhook_url, 'Webhook URL matches DB');
    assert(!info.result.last_error_message, `No last_error_message (was: ${info.result.last_error_message || 'none'})`);
  }
  return info;
}

async function test2_ProductionURL(config) {
  console.log('\n=== TEST 2: Production URL accessibility ===');
  // Verify webhook URL is a public production URL
  assert(config.webhook_url !== null, 'webhook_url is set in DB');
  assert(config.webhook_url.startsWith('https://'), 'URL is HTTPS');
  assert(!config.webhook_url.includes('localhost'), 'Not localhost');
  assert(!config.webhook_url.includes('127.0.0.1'), 'Not 127.0.0.1');
  assert(config.webhook_url.includes('costpro.onrender.com'), 'URL points to Render production');

  // GET health check (should be 200)
  const getResp = await fetch(config.webhook_url);
  assertEqual(getResp.status, 200, 'GET health check returns 200');
  const getBody = await getResp.json();
  assertEqual(getBody.service, 'telegram-webhook', 'Service = telegram-webhook');
  assertEqual(getBody.status, 'active', 'Status = active');
}

async function test3_WebhookEndpointResponds(config) {
  console.log('\n=== TEST 3: Webhook endpoint responds to POST ===');
  // POST without secret token (should be 403 Forbidden due to IP allowlist)
  const postResp = await fetch(config.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: 0 }),
  });
  console.log(`   POST status: ${postResp.status}`);
  assertEqual(postResp.status, 403, 'POST returns 403 (IP allowlist blocks non-Telegram IPs)');

  // GET with no bot_id query param (should be 200, health check)
  const urlNoBotId = config.webhook_url.split('?')[0];
  const getResp = await fetch(urlNoBotId);
  assertEqual(getResp.status, 200, 'GET (no bot_id) returns 200 (health check)');
}

async function test4_DBConfigConsistency(config) {
  console.log('\n=== TEST 4: DB config consistency ===');
  assert(!!config.bot_token, 'bot_token set');
  assert(!!config.bot_user_id, 'bot_user_id set');
  assert(!!config.bot_username, 'bot_username set');
  assertEqual(config.is_active, true, 'Bot is active');
  assert(!!config.webhook_secret, 'webhook_secret set');
  assert(!!config.webhook_registered_at, 'webhook_registered_at set');
  assert(!!config.group_chat_id, 'group_chat_id set');
}

async function test5_BotIsAdminInGroup(config) {
  console.log('\n=== TEST 5: Bot is admin in the group ===');
  const memberResp = await getChatMember(config.bot_token, config.group_chat_id, config.bot_user_id);
  console.log('   getChatMember response:', JSON.stringify(memberResp, null, 2));
  assert(memberResp.ok === true, 'getChatMember ok=true');
  if (memberResp.ok && memberResp.result) {
    const status = memberResp.result.status; // 'creator' | 'administrator' | 'member' | 'left' | 'kicked'
    assert(status === 'administrator' || status === 'creator', `Bot is admin or creator (status=${status})`);
  }
}

async function test6_ListenForMessage(config) {
  console.log('\n=== TEST 6: Listen for incoming Telegram message (USER ACTION REQUIRED) ===');
  console.log('   ─────────────────────────────────────────────────────────');
  console.log('   ⚠️  USER ACTION REQUIRED:');
  console.log('   Open Telegram and send "hola" to @VITALLCONS_bot');
  console.log('   Listening for incoming message... (timeout: 90 seconds)');
  console.log('   ─────────────────────────────────────────────────────────');

  const startTime = new Date();
  const timeoutMs = 90000;
  let lastWebhookInfo = null;
  let messagesSeen = [];

  while (Date.now() - startTime.getTime() < timeoutMs) {
    // Poll DB for new messages
    const recent = await getRecentMessages(startTime);
    if (recent.length > 0 && messagesSeen.length === 0) {
      messagesSeen = recent;
      console.log(`\n   ✓ Detected ${recent.length} new message(s) in DB:`);
      for (const m of recent) {
        console.log(`     [${m.direction}] ${m.content?.slice(0, 80)} (chat_id=${m.telegram_chat_id})`);
      }
      break;
    }
    // Poll getWebhookInfo for changes/errors
    const info = await getWebhookInfo(config.bot_token);
    if (info.ok && JSON.stringify(info.result) !== JSON.stringify(lastWebhookInfo)) {
      if (lastWebhookInfo) {
        console.log(`   webhook info changed: pending=${info.result.pending_update_count} last_error=${info.result.last_error_message || 'none'}`);
      }
      lastWebhookInfo = info.result;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (messagesSeen.length === 0) {
    console.log('\n   ⚠️ No message received within timeout. Possible causes:');
    console.log('     - User did not send "hola"');
    console.log('     - Webhook not properly delivering updates');
    console.log('     - Last error from Telegram:');
    if (lastWebhookInfo?.last_error_message) {
      console.log(`       ${lastWebhookInfo.last_error_message}`);
    } else {
      console.log('       (none reported)');
    }
    assert(false, 'Received incoming message within 90s timeout');
    return { incoming: null, outgoing: null };
  }

  // Look for incoming message
  const incoming = messagesSeen.find(m => m.direction === 'incoming');
  const outgoing = messagesSeen.find(m => m.direction === 'outgoing');

  if (incoming) {
    assert(true, `Incoming message received: "${incoming.content?.slice(0, 50)}"`);
  } else {
    assert(false, 'No incoming message in DB (only outgoing)');
  }

  if (outgoing) {
    assert(true, `Outgoing response sent: "${outgoing.content?.slice(0, 50)}"`);
    assert(outgoing.tokens_used !== null && outgoing.tokens_used > 0, `AI used tokens (${outgoing.tokens_used})`);
  } else {
    // Wait a bit more for the outgoing response (AI may take time)
    console.log('   Waiting 15 more seconds for outgoing response...');
    await new Promise(r => setTimeout(r, 15000));
    const recent2 = await getRecentMessages(startTime);
    const outgoing2 = recent2.find(m => m.direction === 'outgoing');
    if (outgoing2) {
      assert(true, `Outgoing response received: "${outgoing2.content?.slice(0, 50)}"`);
      assert(outgoing2.tokens_used > 0, `AI used tokens (${outgoing2.tokens_used})`);
    } else {
      assert(false, 'No outgoing response in DB after waiting');
    }
  }

  return { incoming, outgoing: messagesSeen.find(m => m.direction === 'outgoing') };
}

// ── Run ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TELEGRAM CHATBOT — E2E TEST');
  console.log('═══════════════════════════════════════════════════════════════');

  const config = await loadConfig();
  if (!config) {
    console.error('No config found for ENERVIDA');
    process.exit(1);
  }
  console.log('  Bot:', config.bot_username, '(id:', config.bot_user_id + ')');
  console.log('  Webhook URL:', config.webhook_url);
  console.log('  Group chat ID:', config.group_chat_id);

  await test1_GetWebhookInfo(config);
  await test2_ProductionURL(config);
  await test3_WebhookEndpointResponds(config);
  await test4_DBConfigConsistency(config);
  await test5_BotIsAdminInGroup(config);

  // Test 6 requires user action — always run it
  const { incoming, outgoing } = await test6_ListenForMessage(config);

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

  // Final verdict
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FINAL VERDICT');
  console.log('═══════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log('  🟢 CHATBOT FUNCIONA — full end-to-end flow verified.');
  } else if (incoming && !outgoing) {
    console.log('  🟡 MENSAJE RECIBIDO PERO SIN RESPUESTA — el webhook funciona,');
    console.log('     pero el handler de IA falla o el sendMessage no se envía.');
  } else if (!incoming) {
    console.log('  🟡 WEBHOOK REGISTRADO PERO NO RECIBE MENSAJES — Telegram no');
    console.log('     está entregando updates. Verificar IP allowlist o errores.');
  } else {
    console.log('  🔴 CHATBOT REQUIERE CORRECCIÓN — ver detalles arriba.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
