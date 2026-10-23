// E2E: the EXACT production incident route, driven through the LOCAL server
// (fixed code) against REAL production data — READ-ONLY.
import { readFileSync } from 'node:fs';
const { token } = JSON.parse(readFileSync('/home/z/my-project/scripts/e2e-token.json', 'utf8'));
const ENERVIDA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

// 1. Login via the app's own auth route (session cookie for browser flows)
const loginRes = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.com', password: 'demo123' }),
});
console.log('app login:', loginRes.status);

// 2. THE INCIDENT ROUTE: GET /api/cash-flow/ledger for ENERVIDA
const r = await fetch(`http://localhost:3000/api/cash-flow/ledger?store_id=${ENERVIDA}&limit=100`, {
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});
console.log('\n=== GET /api/cash-flow/ledger (ENERVIDA) ===');
console.log('HTTP', r.status, r.ok ? '✅ (antes del fix: 500 «No se pudo cargar el libro de caja»)' : '❌');
const body = await r.json();
if (r.ok) {
  console.log('net CUP:', body.currency_summary_now?.net?.CUP, '· net USD:', body.currency_summary_now?.net?.USD);
  console.log('balance_now:', JSON.stringify(body.balance_now));
  console.log('rows:', body.count, '· truncated:', body.truncated);
  const commRows = body.rows.filter(x => x.movement_type === 'comision');
  console.log('filas de comisión presentes:', commRows.length, commRows.length ? '(ej: ' + JSON.stringify(commRows[0]).slice(0, 180) + ')' : '');
  const types = {};
  for (const row of body.rows) types[row.movement_type] = (types[row.movement_type] ?? 0) + 1;
  console.log('desglose por tipo:', JSON.stringify(types));
} else {
  console.log('ERROR BODY:', JSON.stringify(body).slice(0, 300));
}
