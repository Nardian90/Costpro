// ═══════════════════════════════════════════════════════════════════════
// MISIÓN P0 «EFECTIVO FANTASMA» — Diagnóstico READ-ONLY de producción.
// No escribe nada: solo RPC STABLE y SELECT de tablas/vistas de sistema.
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
const BASE = /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
const KEY = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)?.[1]?.trim();
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rpc = async (fn, args) => {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : await r.text() };
};
const rest = async (path) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : await r.text() };
};

console.log('═══ 1) get_cash_flow_summary (la cifra fantasma) ═══');
const s = await rpc('get_cash_flow_summary', { p_store_id: STORE, p_date_from: null, p_date_to: null });
if (s.ok) {
  const d = s.data;
  console.log('expected_cash      =', d.expected_cash, 'CUP');
  console.log('has_pending_shift  =', d.has_pending_shift);
  console.log('window_start       =', d.window_start);
  console.log('fondo_vigente      =', d.fondo_vigente);
  console.log('opening_balance    =', d.opening_balance);
  console.log('cash_sales         =', d.cash_sales);
  console.log('cash_flow_in/out   =', d.cash_flow_in, '/', d.cash_flow_out);
  console.log('cash_commissions   =', d.cash_commissions);
  console.log('cash_refunds       =', d.cash_refunds);
  console.log('cash_recoveries    =', d.cash_recoveries, '(clave presente ⇒ migración 20261024400000 viva)');
} else console.log('ERROR', s.status, String(s.data).slice(0, 200));

console.log('\n═══ 2) get_cash_currency_summary (libro físico por moneda) ═══');
const c = await rpc('get_cash_currency_summary', { p_store_id: STORE, p_from: null, p_to: null });
if (c.ok) {
  console.log('net =', JSON.stringify(c.data.net));
  console.log('terms =', JSON.stringify(c.data.terms));
} else console.log('ERROR', c.status, String(c.data).slice(0, 200));

console.log('\n═══ 3) get_cash_shift_expected ═══');
const e = await rpc('get_cash_shift_expected', { p_store_id: STORE });
if (e.ok) {
  console.log('expected_cash      =', e.data.expected_cash, 'CUP');
  console.log('expected_cash_usd  =', e.data.expected_cash_usd, 'USD');
  console.log('has_pending_shift  =', e.data.has_pending_shift);
  console.log('window_start       =', e.data.window_start);
} else console.log('ERROR', e.status, String(e.data).slice(0, 200));

console.log('\n═══ 4) Cierres de caja (ventanas) ═══');
const cl = await rest(`cash_closures?select=id,status,created_at,closed_at,opening_balance,opening_balance_usd,declared_cash,system_expected_total,difference&store_id=eq.${STORE}&order=created_at.desc&limit=5`);
if (cl.ok) {
  for (const row of cl.data) console.log(JSON.stringify(row));
  console.log('total filas mostradas:', cl.data.length);
} else console.log('ERROR', cl.status, String(cl.data).slice(0, 200));

console.log('\n═══ 5) Migraciones aplicadas (schema_migrations) ═══');
const mig = await rest('supabase_migrations.schema_migrations?select=version,name&order=version.desc&limit=12');
if (mig.ok) for (const m of mig.data) console.log(m.version, '·', m.name);
else console.log('No accesible por REST:', mig.status, String(mig.data).slice(0, 120));

console.log('\n═══ 6) Migraciones clave aplicadas ═══');
const migAll = await rest('supabase_migrations.schema_migrations?select=version&order=version.desc&limit=400');
if (migAll.ok) {
  const versions = migAll.data.map(m => m.version);
  const checks = [
    ['20261023230000 (multimoneda v2.24.0)', '20261023230000'],
    ['20261024220000 (saldo físico egresos)', '20261024220000'],
    ['20261024400000 (recuperaciones/reversa)', '20261024400000'],
    ['20261026000000 (serialización commit)', '20261026000000'],
  ];
  for (const [label, v] of checks) console.log(versions.includes(v) ? '✅' : '❌', label);
} else console.log('No accesible:', migAll.status);
