#!/usr/bin/env node
/**
 * rem-inv-6r-zero-touch.cjs — REM-INV-6R Gate S: zero-touch proof (READ-ONLY)
 * Snapshot of business data for the protected stores (ENERVIDA-VITALLCONS,
 * Puerto Padre VITALLCONS): per-table row counts + md5 of the ordered row JSON.
 * Usage: node scripts/rem-inv-6r-zero-touch.cjs pre|post <outfile>
 */
const REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('need SUPABASE_ACCESS_TOKEN'); process.exit(2); }
const STORES = ['43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', '5e6fe821-5465-48b1-b3f1-3aa3182edc38'];

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 200));
  return JSON.parse(t);
}

// store-filtered tables (store_id) + transfers (origin/destination) + audit via store_id
const storeTables = ['inventory', 'stock_movements', 'transactions', 'receipts', 'payment_transactions', 'devolutions', 'production_orders', 'audit_logs', 'transfer_items'];

async function main() {
  const mode = process.argv[2] || 'pre';
  const out = { mode, captured_at: new Date().toISOString(), stores: STORES, tables: {} };
  const inList = `(${STORES.map(s => `'${s}'`).join(',')})`;
  for (const t of storeTables) {
    try {
      const rows = await q(`select count(*)::int as n, coalesce(md5(string_agg(row_to_json(x)::text, '|' order by id)), 'EMPTY') as hash
        from (select * from public.${t} where store_id in ${inList}) x`);
      out.tables[t] = { count: rows[0].n, hash: rows[0].hash };
    } catch (e) { out.tables[t] = { error: e.message.slice(0, 120) }; }
  }
  try {
    const rows = await q(`select count(*)::int as n, coalesce(md5(string_agg(row_to_json(x)::text, '|' order by id)), 'EMPTY') as hash
      from (select * from public.transfers where origin_store_id in ${inList} or destination_store_id in ${inList}) x`);
    out.tables.transfers = { count: rows[0].n, hash: rows[0].hash };
  } catch (e) { out.tables.transfers = { error: e.message.slice(0, 120) }; }
  // profiles/users touch (memberships of the stores)
  try {
    const rows = await q(`select count(*)::int as n, coalesce(md5(string_agg(row_to_json(x)::text, '|' order by id)), 'EMPTY') as hash
      from (select * from public.user_store_memberships where store_id in ${inList}) x`);
    out.tables.user_store_memberships = { count: rows[0].n, hash: rows[0].hash };
  } catch (e) { out.tables.user_store_memberships = { error: e.message.slice(0, 120) }; }

  const file = process.argv[3] || `/tmp/6r-zerotouch-${mode}.json`;
  require('fs').writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.tables, null, 1));
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
