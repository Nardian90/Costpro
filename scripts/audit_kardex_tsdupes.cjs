#!/usr/bin/env node
/**
 * READ-ONLY audit: detect duplicate kardex writes by created_at timestamp.
 * Trigger fires on stock_movements INSERT, creating a kardex with the same
 * created_at as the stock_movement. Direct INSERTs in reverse_* RPCs use NOW()
 * so they should match within ms.
 */
const fs = require('fs');

const envContent = fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

(async () => {
  console.log('\n========== FETCHING ALL ROWS ==========');
  const sampleRes = await fetch(
    `${SUPABASE_URL}/rest/v1/kardex_entries?select=id,movement_type,reference_type,reference_id,product_id,unit_cost,total_value,quantity,created_at&order=created_at.desc&limit=1000`,
    { method: 'GET', headers }
  );
  const rows = await sampleRes.json();
  console.log(`Fetched: ${rows.length}`);

  // Group by created_at (exact match) + product_id
  const byTsProduct = {};
  for (const r of rows) {
    const key = `${r.created_at}|${r.product_id}`;
    if (!byTsProduct[key]) byTsProduct[key] = [];
    byTsProduct[key].push(r);
  }

  const dupes = Object.entries(byTsProduct)
    .filter(([k, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\nDuplicate (created_at + product_id) groups: ${dupes.length}`);
  console.log(`Total rows in duplicates: ${dupes.reduce((s, [k, v]) => s + v.length, 0)}`);

  console.log(`\n--- First 15 duplicate groups ---`);
  for (const [k, v] of dupes.slice(0, 15)) {
    console.log(`\n[${k}]`);
    for (const r of v) {
      console.log(`  id=${r.id?.substring(0, 8)} mt=${r.movement_type} ref_type=${r.reference_type} uc=${r.unit_cost} qty=${r.quantity} tv=${r.total_value}`);
    }
  }

  // Group by created_at (5-second window) + product_id to catch near-duplicates
  const bySecProduct = {};
  for (const r of rows) {
    const sec = r.created_at?.substring(0, 19); // strip ms
    const key = `${sec}|${r.product_id}`;
    if (!bySecProduct[key]) bySecProduct[key] = [];
    bySecProduct[key].push(r);
  }
  const dupesSec = Object.entries(bySecProduct)
    .filter(([k, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n\n=== By second + product_id ===`);
  console.log(`Groups: ${dupesSec.length}`);
  console.log(`Total rows in groups: ${dupesSec.reduce((s, [k, v]) => s + v.length, 0)}`);
  console.log(`\nFirst 10:`);
  for (const [k, v] of dupesSec.slice(0, 10)) {
    console.log(`\n[${k}] (${v.length} entries)`);
    for (const r of v) {
      console.log(`  id=${r.id?.substring(0, 8)} mt=${r.movement_type} rt=${r.reference_type} uc=${r.unit_cost} qty=${r.quantity} tv=${r.total_value} ts=${r.created_at?.substring(20, 28)}`);
    }
  }
})();
