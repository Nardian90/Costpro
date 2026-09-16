#!/usr/bin/env node
/**
 * r2-exec-zero-touch.cjs — REM-R2-READ-EXEC · zero-touch counters (SELECT-only)
 *
 * Uso: node r2-exec-zero-touch.cjs PRE|POST
 * Output: /home/z/my-project/scripts/r2-exec-zero-touch-<phase>.json
 *
 * Count + md5(ids) de los 2 tenants protegidos (ENERVIDA-VITALLCONS,
 * Puerto Padre VITALLCONS) en 7 tablas — misma métrica que R1.
 * CERO escrituras.
 */
const fs = require('fs');

const env = {};
for (const line of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PROJECT_REF = env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PHASE = (process.argv[2] || '').toUpperCase();
if (!['PRE', 'POST'].includes(PHASE)) { console.error('Uso: r2-exec-zero-touch.cjs PRE|POST'); process.exit(2); }

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAILED:', r.status, t.slice(0, 500)); process.exit(4); }
  return JSON.parse(t);
}

const SQL = `
WITH protected AS (
  SELECT id, name FROM public.stores WHERE name ILIKE '%VITALLCONS%'
)
SELECT s.name AS store,
  (SELECT COUNT(*) FROM public.inventory i WHERE i.store_id = s.id) AS inventory_n,
  (SELECT COUNT(*) FROM public.stock_movements m WHERE m.store_id = s.id) AS stock_movements_n,
  (SELECT COUNT(*) FROM public.transactions t WHERE t.store_id = s.id) AS transactions_n,
  (SELECT COUNT(*) FROM public.receipts r WHERE r.store_id = s.id) AS receipts_n,
  (SELECT COUNT(*) FROM public.payment_transactions p WHERE p.store_id = s.id) AS payment_transactions_n,
  (SELECT COUNT(*) FROM public.audit_logs a WHERE a.store_id = s.id) AS audit_logs_n,
  (SELECT COUNT(*) FROM public.user_store_memberships mem WHERE mem.store_id = s.id) AS memberships_n,
  md5(COALESCE(string_agg(x.id::text, ',' ORDER BY x.id), '')) AS ids_hash
FROM stores s
LEFT JOIN LATERAL (
  SELECT i.id FROM public.inventory i WHERE i.store_id = s.id
  UNION ALL SELECT m.id FROM public.stock_movements m WHERE m.store_id = s.id
  UNION ALL SELECT t.id FROM public.transactions t WHERE t.store_id = s.id
  UNION ALL SELECT r.id FROM public.receipts r WHERE r.store_id = s.id
  UNION ALL SELECT p.id FROM public.payment_transactions p WHERE p.store_id = s.id
  UNION ALL SELECT a.id FROM public.audit_logs a WHERE a.store_id = s.id
  UNION ALL SELECT mem.id FROM public.user_store_memberships mem WHERE mem.store_id = s.id
) x ON true
GROUP BY s.id, s.name
ORDER BY s.name;`;

(async () => {
  console.log(`zero-touch ${PHASE} — LIVE ${PROJECT_REF} (SELECT-only)`);
  const rows = await q(SQL);
  const out = { at: new Date().toISOString(), phase: PHASE, project_ref: PROJECT_REF, rows };
  for (const r of rows) {
    console.log(`  ${r.store}: inv=${r.inventory_n} mov=${r.stock_movements_n} txn=${r.transactions_n} rcpt=${r.receipts_n} pay=${r.payment_transactions_n} audit=${r.audit_logs_n} mem=${r.memberships_n} md5=${r.ids_hash.slice(0, 12)}…`);
  }
  fs.writeFileSync(`/home/z/my-project/scripts/r2-exec-zero-touch-${PHASE.toLowerCase()}.json`, JSON.stringify(out, null, 1));
  console.log(`→ r2-exec-zero-touch-${PHASE.toLowerCase()}.json`);
})();
