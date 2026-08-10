#!/usr/bin/env node
/**
 * READ-ONLY audit: query LIVE kardex_entries to inspect distribution.
 * Used for PR-4 audit. Does NOT modify any data.
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

const queries = {
  by_movement_type: `SELECT
  movement_type,
  COUNT(*) AS count,
  MIN(unit_cost) AS min_cost,
  MAX(unit_cost) AS max_cost,
  AVG(unit_cost) AS avg_cost
FROM public.kardex_entries
GROUP BY movement_type
ORDER BY count DESC;`,
  negative_costs: `SELECT COUNT(*) AS negative_costs FROM public.kardex_entries WHERE unit_cost < 0;`,
  suspicious_small: `SELECT COUNT(*) AS suspicious_small FROM public.kardex_entries WHERE unit_cost > 0 AND unit_cost < 1;`,
  total: `SELECT COUNT(*) AS total FROM public.kardex_entries;`,
  zero_cost_count: `SELECT movement_type, COUNT(*) AS zero_count
FROM public.kardex_entries
WHERE unit_cost = 0
GROUP BY movement_type
ORDER BY zero_count DESC;`,
  by_reference_type: `SELECT
  reference_type,
  COUNT(*) AS count,
  MIN(unit_cost) AS min_cost,
  MAX(unit_cost) AS max_cost
FROM public.kardex_entries
GROUP BY reference_type
ORDER BY count DESC;`,
  recent_sample: `SELECT id, movement_type, reference_type, unit_cost, total_value, balance_unit_cost,
       balance_quantity, created_at
FROM public.kardex_entries
ORDER BY created_at DESC
LIMIT 10;`,
  duplicate_check: `SELECT
  reference_type,
  reference_id,
  product_id,
  COUNT(*) AS duplicate_count
FROM public.kardex_entries
WHERE reference_type IN ('reversal', 'devolution', 'stock_movement')
GROUP BY reference_type, reference_id, product_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;`,
  register_reception_kardex: `SELECT ke.movement_type, ke.unit_cost, ke.total_value, ke.reference_type,
       ke.reference_id, sm.unit_cost AS sm_unit_cost, sm.movement_type AS sm_movement_type,
       ke.created_at
FROM public.kardex_entries ke
LEFT JOIN public.stock_movements sm ON sm.id = ke.reference_id
WHERE ke.reference_type = 'stock_movement'
  AND sm.movement_type = 'purchase'
ORDER BY ke.created_at DESC
LIMIT 10;`
};

(async () => {
  for (const [name, sql] of Object.entries(queries)) {
    console.log(`\n========== ${name} ==========`);
    console.log(`SQL: ${sql}`);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        try {
          const data = JSON.parse(text);
          console.log(JSON.stringify(data, null, 2));
        } catch (e) {
          console.log(`Raw: ${text.substring(0, 2000)}`);
        }
      } else {
        console.log(`Error: ${text.substring(0, 1000)}`);
      }
    } catch (e) {
      console.log(`Exception: ${e.message}`);
    }
  }
})();
