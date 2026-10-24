// Reproduce the production bug in the ISOLATED DB, then verify the corrected query
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision' });
await c.connect();

console.log('=== 1. REPRO (buggy select from route.ts:303) ===');
try {
  await c.query(`SELECT id, amount, amount_cup, currency, exchange_rate, payment_method, status, paid_at, paid_by, notes
    FROM public.commission_payments WHERE store_id = '00000000-0000-0000-0000-000000000000' LIMIT 1`);
  console.log('UNEXPECTED: no error');
} catch (e) {
  console.log('PG ERROR:', e.code, '→', e.message);
}

console.log('\n=== 2. FIXED select (final_amount + manual_adjustment_reason + payment_reference) ===');
const r = await c.query(`SELECT id, final_amount, amount_cup, currency, exchange_rate, payment_method, status, paid_at, paid_by, manual_adjustment_reason, payment_reference
  FROM public.commission_payments LIMIT 1`);
console.log('OK — columns exist, rows:', r.rowCount);

console.log('\n=== 3. Column inventory of commission_payments (isolated == production) ===');
const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='commission_payments' ORDER BY ordinal_position`);
console.log(cols.rows.map(x => x.column_name).join(', '));
await c.end();
