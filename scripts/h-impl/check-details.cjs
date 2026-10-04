#!/usr/bin/env node
/** H-IMPL — verificación puntual read-only: índices y columnas críticas. */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const env = {};
for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  return j;
}
(async () => {
  console.log('=== índices transactions (idempotency) ===');
  (await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='transactions' AND indexdef ILIKE '%idempotency%';`))
    .forEach(r => console.log(r.indexdef));
  console.log('=== índices idempotency_registry ===');
  (await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='idempotency_registry';`))
    .forEach(r => console.log(r.indexdef));
  console.log('=== audit_logs columnas ===');
  (await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position;`))
    .forEach(r => console.log(`${r.column_name} ${r.data_type}`));
  console.log('=== exchange_rates LIVE (fuentes globales, frescura) ===');
  (await q(`SELECT currency, source, segment, rate, rate_date, captured_at FROM public.exchange_rates ORDER BY rate_date DESC, captured_at DESC LIMIT 8;`))
    .forEach(r => console.log(JSON.stringify(r)));
  console.log('=== store_exchange_rates LIVE ===');
  (await q(`SELECT store_id, currency, rate, updated_at FROM public.store_exchange_rates ORDER BY updated_at DESC LIMIT 8;`))
    .forEach(r => console.log(JSON.stringify(r)));
  console.log('=== tax_configurations LIVE (debe estar vacía) ===');
  console.log(JSON.stringify(await q(`SELECT count(*) AS c FROM public.tax_configurations;`)));
  console.log('=== transactions_idempotency registros recientes QA ===');
  console.log(JSON.stringify(await q(`SELECT count(*) AS c FROM public.transactions WHERE idempotency_key LIKE 'qa-%';`)));
})().catch(e => { console.error('❌', e.message); process.exit(1); });
