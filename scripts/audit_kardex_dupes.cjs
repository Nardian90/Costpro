#!/usr/bin/env node
/**
 * READ-ONLY audit - fetch reference_id and product_id to verify duplicate kardex writes.
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
  // Fetch ALL 704 rows with reference_id + product_id
  console.log('\n========== FETCHING ALL ROWS WITH reference_id ==========');
  const sampleRes = await fetch(
    `${SUPABASE_URL}/rest/v1/kardex_entries?select=id,movement_type,reference_type,reference_id,product_id,unit_cost,total_value,quantity,created_at&order=created_at.desc&limit=1000`,
    { method: 'GET', headers }
  );
  console.log(`Status: ${sampleRes.status}`);
  const sampleText = await sampleRes.text();
  let rows = [];
  try { rows = JSON.parse(sampleText); } catch (e) { console.log(`Parse error: ${e.message}`); }
  console.log(`Fetched rows: ${rows.length}`);

  if (rows.length > 0) {
    // Group by reference_id to detect duplicates
    const byRefId = {};
    for (const r of rows) {
      const key = `${r.reference_type}|${r.reference_id}|${r.product_id}`;
      if (!byRefId[key]) byRefId[key] = [];
      byRefId[key].push(r);
    }

    const dupes = Object.entries(byRefId).filter(([k, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
    console.log(`\nDuplicate keys (reference_type + reference_id + product_id): ${dupes.length}`);
    console.log(`Total duplicate rows: ${dupes.reduce((s, [k, v]) => s + v.length, 0)}`);
    console.log(`\nTop 20 duplicates:`);
    for (const [k, v] of dupes.slice(0, 20)) {
      console.log(`  ${k}: ${v.length} entries`);
      for (const row of v) {
        console.log(`    id=${row.id?.substring(0, 8)} mt=${row.movement_type} uc=${row.unit_cost} qty=${row.quantity} tv=${row.total_value}`);
      }
    }

    // Group by reference_id only (any product)
    const byRefIdOnly = {};
    for (const r of rows) {
      const key = `${r.reference_type}|${r.reference_id}`;
      if (!byRefIdOnly[key]) byRefIdOnly[key] = [];
      byRefIdOnly[key].push(r);
    }
    const dupesRef = Object.entries(byRefIdOnly).filter(([k, v]) => v.length > 2).sort((a, b) => b[1].length - a[1].length);
    console.log(`\nReference groups with >2 entries: ${dupesRef.length}`);
    console.log(`Top 10:`);
    for (const [k, v] of dupesRef.slice(0, 10)) {
      console.log(`  ${k}: ${v.length} entries`);
    }

    // Distribution of small unit_costs (potentially raw USD stored as CUP)
    console.log('\n--- Distribution of unit_cost < 100 (potential raw USD) ---');
    const small = rows.filter(r => r.unit_cost > 0 && r.unit_cost < 100);
    console.log(`Count: ${small.length} of ${rows.length}`);
    const smallByMt = {};
    for (const r of small) {
      const mt = r.movement_type;
      if (!smallByMt[mt]) smallByMt[mt] = { count: 0, sample: [] };
      smallByMt[mt].count++;
      if (smallByMt[mt].sample.length < 5) smallByMt[mt].sample.push(r.unit_cost);
    }
    console.log(JSON.stringify(smallByMt, null, 2));

    // Check recent reverse_receipt_v2 entries (purchase_reverse + reference_type=reversal)
    console.log('\n--- purchase_reverse entries (recent) ---');
    const pr = rows.filter(r => r.movement_type === 'purchase_reverse').slice(0, 10);
    console.log(JSON.stringify(pr, null, 2));

    console.log('\n--- sale_reverse entries (recent) ---');
    const sr = rows.filter(r => r.movement_type === 'sale_reverse').slice(0, 10);
    console.log(JSON.stringify(sr, null, 2));
  }
})();
