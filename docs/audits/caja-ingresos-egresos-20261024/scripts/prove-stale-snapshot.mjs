// Deterministic proof of the advisory-lock stale-snapshot window (READ COMMITTED).
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
const S1 = 'aaaaaaa1-0000-4000-8000-000000000001';
const U_ENCAR = 'bbbbbbb2-0000-4000-8000-000000000002';
const CONN = 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision';

const c0 = new Client({ connectionString: CONN });
await c0.connect();
await c0.query(`INSERT INTO public.stores (id, name) VALUES ('${S1}','QA') ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, full_name, role) VALUES ('${U_ENCAR}','E','encargado') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES ('${U_ENCAR}','${S1}','encargado') ON CONFLICT DO NOTHING;
  INSERT INTO public.exchange_rates (rate_date, currency, source, rate) VALUES (CURRENT_DATE, 'USD', 'elToque', 480);`);
await c0.query(`SELECT public.open_cash_shift(p_store_id := $1, p_opening_balance_cup := 0, p_user_id := $2)`, [S1, U_ENCAR]);
await c0.query(`SELECT public.create_cash_flow_document(p_store_id := $1, p_doc_type := 'ingreso', p_concept := 'constitucion_fondo', p_amount := 10000, p_currency := 'CUP', p_justification := 'seed', p_user_id := $2)`, [S1, U_ENCAR]);

// ── T1: abre transacción manual y toma el advisory lock EXACTAMENTE como el RPC ──
const t1 = new Client({ connectionString: CONN });
await t1.connect();
await t1.query('BEGIN');
await t1.query(`SELECT pg_advisory_xact_lock(hashtext('${S1}'))`);
// T1 simula un egreso concurrente completado DENTRO de su transacción (aún sin commit)
await t1.query(`INSERT INTO public.payment_transactions (store_id, ref_type, ref_id, amount, payment_method, currency, exchange_rate, payment_date, direction)
  VALUES ('${S1}', 'cash_flow', gen_random_uuid(), 6500, 'cash', 'CUP', 1, now(), 'out')`);

// ── T2: dispara el RPC ahora — su statement arranca ANTES del commit de T1 ──
const t2 = new Client({ connectionString: CONN });
await t2.connect();
const t2Promise = t2.query(`SELECT public.create_cash_flow_document(
  p_store_id := '${S1}', p_doc_type := 'egreso', p_concept := 'otro_egreso',
  p_amount := 6500, p_currency := 'CUP', p_justification := 'T2-stale', p_user_id := '${U_ENCAR}') AS r`);
await new Promise(r => setTimeout(r, 400)); // T2 ya tomó su snapshot y espera el lock

// ── T1 commitea (libera el lock) ──
await t1.query('COMMIT');

let t2res = 'RECHAZADO';
try { const r = await t2Promise; t2res = 'ACEPTADO doc=' + (r.rows[0].r?.document_number ?? '?'); } catch (e) { t2res = 'RECHAZADO: ' + e.message.slice(0, 90); }
console.log('T2 (egreso 6500 con disponible real 3500 tras T1):', t2res);

const net = await c0.query(`SELECT public.get_cash_currency_summary('${S1}', NULL, NULL) AS r`);
console.log('NET CUP final:', net.rows[0].r.net.CUP, '→ doble gasto si < 0 (10000−6500−6500 = −3000)');
await t1.end(); await t2.end(); await c0.end();
