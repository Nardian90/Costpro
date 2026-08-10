#!/usr/bin/env node
/**
 * READ-ONLY audit via PostgREST table endpoint.
 * No exec_sql available; uses /rest/v1/kardex_entries?select=...
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

(async () => {
  // 1. Get total count
  console.log('\n========== TOTAL COUNT ==========');
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/kardex_entries?select=id&limit=1`, {
    method: 'GET',
    headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0' },
  });
  console.log(`Status: ${countRes.status}`);
  console.log(`Content-Range: ${countRes.headers.get('content-range')}`);

  // 2. Fetch ALL rows (or up to 5000) to compute aggregates client-side
  console.log('\n========== FETCHING SAMPLE (first 1000 rows) ==========');
  const sampleRes = await fetch(
    `${SUPABASE_URL}/rest/v1/kardex_entries?select=id,movement_type,reference_type,unit_cost,total_value,balance_unit_cost,balance_quantity,created_at&order=created_at.desc&limit=1000`,
    { method: 'GET', headers }
  );
  console.log(`Status: ${sampleRes.status}`);
  const sampleText = await sampleRes.text();
  let rows = [];
  try { rows = JSON.parse(sampleText); } catch (e) { console.log(`Parse error: ${e.message}`); }
  console.log(`Fetched rows: ${rows.length}`);

  if (rows.length > 0) {
    // Compute aggregates by movement_type
    const byMovement = {};
    const byReference = {};
    let negativeCount = 0;
    let zeroCount = 0;
    let smallCount = 0;
    let totalUnitCost = 0;
    let costRows = 0;

    for (const r of rows) {
      const mt = r.movement_type || 'NULL';
      const rt = r.reference_type || 'NULL';
      const uc = parseFloat(r.unit_cost || 0);
      if (!byMovement[mt]) byMovement[mt] = { count: 0, min: Infinity, max: -Infinity, sum: 0, zeroCount: 0 };
      byMovement[mt].count++;
      byMovement[mt].min = Math.min(byMovement[mt].min, uc);
      byMovement[mt].max = Math.max(byMovement[mt].max, uc);
      byMovement[mt].sum += uc;
      if (uc === 0) byMovement[mt].zeroCount++;
      if (!byReference[rt]) byReference[rt] = { count: 0, min: Infinity, max: -Infinity };
      byReference[rt].count++;
      byReference[rt].min = Math.min(byReference[rt].min, uc);
      byReference[rt].max = Math.max(byReference[rt].max, uc);
      if (uc < 0) negativeCount++;
      if (uc === 0) zeroCount++;
      if (uc > 0 && uc < 1) smallCount++;
      totalUnitCost += uc;
      costRows++;
    }

    console.log('\n--- By movement_type (sample of 1000) ---');
    console.log(JSON.stringify(byMovement, null, 2));
    console.log('\n--- By reference_type ---');
    console.log(JSON.stringify(byReference, null, 2));
    console.log(`\nnegative_costs (sample): ${negativeCount}`);
    console.log(`zero_costs (sample): ${zeroCount}`);
    console.log(`suspicious_small (0 < uc < 1) (sample): ${smallCount}`);
    console.log(`avg unit_cost (sample): ${totalUnitCost / costRows}`);

    // Duplicate check: group by reference_type + reference_id + product_id
    console.log('\n--- Duplicate reference_id check (sample) ---');
    const dupes = {};
    for (const r of rows) {
      const key = `${r.reference_type}|${r.reference_id}`;
      if (!dupes[key]) dupes[key] = 0;
      dupes[key]++;
    }
    const dupeList = Object.entries(dupes).filter(([k, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log(`Duplicate keys found: ${dupeList.length}`);
    for (const [k, v] of dupeList) {
      console.log(`  ${k}: ${v}`);
    }

    // Show sample rows
    console.log('\n--- First 5 rows ---');
    console.log(JSON.stringify(rows.slice(0, 5), null, 2));
  }
})();
