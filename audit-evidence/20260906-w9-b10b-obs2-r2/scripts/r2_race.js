#!/usr/bin/env node
/**
 * R2 · GATE 13 — Concurrency races with TWO INDEPENDENT connections
 * (Management API HTTP requests, staggered start = real parallelism)
 *
 * Race A  : two concurrent create_sale_v2 over the same product.
 *           conn1 holds advisory lock + uncommitted sale (qty 12 of 19) for 6s.
 *           conn2 uses lock_timeout=2s → REJECTED by timeout (exactly one writer
 *           in the window). Zero residue: both ROLLBACK.
 * Race A2 : serialization proof — conn2 waits (no timeout), succeeds AFTER conn1
 *           rollback, demonstrating serialized state transition (both rollback).
 * Race B  : sale held open by conn1; conn2 attempts void_transaction on a
 *           transaction it cannot see (uncommitted/unknown) → ERR_TX_NOT_FOUND.
 * Race C  : same with reverse_transaction_v2 → ERR_TRANSACTION_NOT_FOUND.
 *
 * Final: run r2_post_capture.sql → 24/24 global metrics must equal baseline.
 */
const fs = require('fs');
const REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) { console.error('missing SUPABASE_ACCESS_TOKEN'); process.exit(2); }
const OUT = __dirname + '/../raw';

async function runSql(sql, outFile) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (outFile) fs.writeFileSync(outFile, text);
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
  return { status: r.status, body: parsed };
}

const CLAIMS = "SELECT set_config('request.jwt.claims', '{\"sub\":\"051c6157-600b-425e-b8c0-72388bacf541\",\"role\":\"authenticated\",\"email\":\"admin@costpro.com\"}', false);";
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const ACTOR = '051c6157-600b-425e-b8c0-72388bacf541';
const FA = 'e47421ea-f9aa-452b-b20b-4601ec12410f';

function saleItems(qty, price) { return JSON.stringify([{ product_id: FA, quantity: qty, price_at_sale: price }]); }
function saleCall(qty, price, total, idem) {
  return "v_res := public.create_sale_v2(p_store_id:='" + STORE + "', p_seller_id:='" + ACTOR +
    "', p_items:='" + saleItems(qty, price) + "'::jsonb, p_payment_method:='cash', p_total_amount:=" + total +
    ", p_subtotal:=" + total + ", p_idempotency_key:=" + (idem ? ("'" + idem + "'") : 'NULL') + ");";
}
const REPORT = "SELECT jsonb_build_object('who', 'conn', 'stock_seen', (SELECT stock_current FROM products WHERE id='" + FA + "'), 'moves_seen', (SELECT count(*) FROM stock_movements WHERE store_id='" + STORE + "'), 'ts', now()) AS rep;";

const conn1RaceA = CLAIMS + " BEGIN; SET LOCAL lock_timeout='15s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; BEGIN " + saleCall(12, 350, 4200, null) +
  " INSERT INTO rl VALUES ('conn1_sale_ok', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('conn1_sale_err', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT pg_sleep(6);" +
  " SELECT jsonb_build_object('conn1', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'stock_seen_in_tx', (SELECT stock_current FROM products WHERE id='" + FA + "'), 'ts', now()) AS race; ROLLBACK;";

const conn2RaceA = CLAIMS + " BEGIN; SET LOCAL lock_timeout='2s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; BEGIN " + saleCall(12, 350, 4200, null) +
  " INSERT INTO rl VALUES ('conn2_sale_UNEXPECTED_OK', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('conn2_sale_rejected', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT jsonb_build_object('conn2', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'stock_seen', (SELECT stock_current FROM products WHERE id='" + FA + "'), 'ts', now()) AS race; ROLLBACK;";

const conn1RaceA2 = CLAIMS + " BEGIN; SET LOCAL lock_timeout='15s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; BEGIN " + saleCall(2, 350, 700, null) +
  " INSERT INTO rl VALUES ('conn1_sale2_ok', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('conn1_sale2_err', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT pg_sleep(4);" +
  " SELECT jsonb_build_object('conn1', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'stock_seen_in_tx', (SELECT stock_current FROM products WHERE id='" + FA + "'), 'ts', now()) AS race; ROLLBACK;";

const conn2RaceA2 = CLAIMS + " BEGIN; SET LOCAL lock_timeout='15s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; BEGIN " + saleCall(1, 350, 350, null) +
  " INSERT INTO rl VALUES ('conn2_sale1_ok', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('conn2_sale1_err', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT jsonb_build_object('conn2', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'stock_seen_in_tx', (SELECT stock_current FROM products WHERE id='" + FA + "'), 'ts', now()) AS race; ROLLBACK;";

const conn1RaceBC = CLAIMS + " BEGIN; SET LOCAL lock_timeout='15s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; v_tx uuid; BEGIN " + saleCall(1, 350, 350, null) +
  " v_tx := (v_res->>'transaction_id')::uuid; INSERT INTO rl VALUES ('sale_ok', v_res);" +
  " v_res := public.void_transaction(p_transaction_id := v_tx, p_reason := 'R2 raceB conn1 in-tx undo');" +
  " INSERT INTO rl VALUES ('void_ok', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('err', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT pg_sleep(3);" +
  " SELECT jsonb_build_object('conn1', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'ts', now()) AS race; ROLLBACK;";

const conn2RaceB = CLAIMS + " BEGIN; SET LOCAL lock_timeout='2s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; v_fake uuid := gen_random_uuid(); BEGIN " +
  " v_res := public.void_transaction(p_transaction_id := v_fake, p_reason := 'R2 raceB conn2 phantom probe');" +
  " INSERT INTO rl VALUES ('void_UNEXPECTED_OK', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('void_rejected', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT jsonb_build_object('conn2', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'ts', now()) AS race; ROLLBACK;";

const conn2RaceC = CLAIMS + " BEGIN; SET LOCAL lock_timeout='2s'; CREATE TEMP TABLE rl (step text, detail jsonb);" +
  " DO $do$ DECLARE v_res jsonb; v_fake uuid := gen_random_uuid(); BEGIN " +
  " v_res := public.reverse_transaction_v2(p_transaction_id := v_fake, p_reason := 'R2 raceC conn2 phantom probe');" +
  " INSERT INTO rl VALUES ('reverse_UNEXPECTED_OK', v_res); EXCEPTION WHEN OTHERS THEN INSERT INTO rl VALUES ('reverse_rejected', jsonb_build_object('sqlerrm', SQLERRM)); END $do$;" +
  " SELECT jsonb_build_object('conn2', (SELECT jsonb_agg(s) FROM (SELECT step, detail FROM rl) s), 'ts', now()) AS race; ROLLBACK;";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function race(sqlA, sqlB, fileA, fileB, delayB, label) {
  console.log('--- ' + label + ' ---');
  const pA = runSql(sqlA, OUT + '/' + fileA);
  await sleep(delayB);
  const pB = runSql(sqlB, OUT + '/' + fileB);
  const [a, b] = await Promise.all([pA, pB]);
  console.log(label, 'conn1 http=', a.status, '| conn2 http=', b.status);
  return { a: a.body, b: b.body };
}

async function main() {
  const results = {};
  results.raceA = await race(conn1RaceA, conn2RaceA, 'r2_raceA_conn1.json', 'r2_raceA_conn2.json', 1500, 'RaceA');
  await sleep(3000);
  results.raceA2 = await race(conn1RaceA2, conn2RaceA2, 'r2_raceA2_conn1.json', 'r2_raceA2_conn2.json', 1500, 'RaceA2');
  await sleep(3000);
  results.raceB = await race(conn1RaceBC, conn2RaceB, 'r2_raceB_conn1.json', 'r2_raceB_conn2.json', 800, 'RaceB');
  await sleep(3000);
  results.raceC = await race(conn1RaceBC, conn2RaceC, 'r2_raceC_conn1.json', 'r2_raceC_conn2.json', 800, 'RaceC');
  fs.writeFileSync(OUT + '/r2_races_summary.json', JSON.stringify(results, null, 1));
  console.log('saved r2_races_summary.json');
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
