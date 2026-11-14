#!/usr/bin/env node
// m052c — Ejecuta la batería SQL T12 (supabase/tests/...) vía CLIENTE pg contra
// la BD E2E aislada (transporte alternativo al Management API). Solo lectura de
// archivo + ejecución; el SQL es el de la batería oficial (sin transformaciones).
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !m[1].startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: decodeURIComponent(env.E2E_SUPABASE_DB_URL.match(/:\/\/[^:]+:([^@]+)@/)[1]),
  ssl: { rejectUnauthorized: false } };

// sentinela fail-closed
const { assertIsolatedDb } = await import('../e2e/fixtures/assert-isolated-db.cjs').catch(() => ({}));
if (typeof assertIsolatedDb === 'function') await assertIsolatedDb();
else {
  const r = await fetch(`${env.E2E_SUPABASE_URL}/rest/v1/rpc/e2e_is_isolated_db`,
    { method: 'POST', headers: { apikey: env.E2E_SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.E2E_SUPABASE_SERVICE_ROLE_KEY }, body: '{}' });
  if ((await r.text()).trim() !== 'true') throw new Error('SENTINELA != true');
}

const sqlTxt = readFileSync(resolve(process.cwd(), 'supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql'), 'utf8');
const db = new pg.Client(POOLER);
await db.connect();
try {
  await db.query(sqlTxt);
  console.log('M052C: batería SQL T12 ejecutada vía pg — PASS (sin excepciones)');
} catch (e) {
  console.error('M052C: FAIL →', String(e.message).slice(0, 400));
  process.exitCode = 1;
} finally { await db.end(); }
