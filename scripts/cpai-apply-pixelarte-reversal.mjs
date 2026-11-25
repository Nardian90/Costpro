#!/usr/bin/env node
/**
 * cpai-apply-pixelarte-reversal.mjs — CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001
 * FASES 3/9 — Reversión gobernada del pago $1,800 del servicio VOIDED
 * F-23112026 de Pixelarte (SRV-20261123-00146, fedb7c40-8f10-48fd-8356-cc7e6a7ce0e7).
 *
 * Canal canónico: POST /api/payments/[id] (la MISMA ruta que usa el botón
 * «Anular» del historial de pagos) → RPC reverse_supplier_payment
 * (desplegado 2026-11-24, idempotente, transaccional, service_role).
 *
 * Expediente del caso (misión §5.1, verificado 2026-11-26):
 *  · 21:34:48 creacion del servicio (fedb7c40) · 21:34:50 activacion
 *  · 21:34:51 pago 4783f9ae $1,800 CUP cash (direction='in', SIN contra-fila)
 *  · 21:35:09 void del servicio → trigger fin compensó reconocimiento+pago
 *    (entries status='reversed' + asientos anulacion enlazados reversal_of)
 *  · 21:36:09 reemplazo ACTIVO (602eb3c1, mismo F-23112026) pagado $1,800
 *    → el desembolso REAL queda representado UNA sola vez por el reemplazo
 *      (doctrina documentada en 20261124120200: «su reemplazo activo
 *      SRV-20261123-00147 sigue restando exactamente una vez»).
 *  ⇒ Caso 1 de la misión §5.2: pago del anulado sin desembolso propio —
 *    se revierte con el mecanismo oficial; NO se toca el reemplazo.
 *
 * Seguridad de la operación:
 *  · La contra-fila NO genera asiento doble: fin_post_payment_annulment solo
 *    compensa entries 'pago' status='posted' (la del 4783f9ae ya está
 *    'reversed' → no-op idempotente).
 *  · Reportes de caja: el pago del documento anulado YA está excluido y la
 *    contra-fila sobre documento anulado TAMBIÉN (20261124120200 §1) → caja
 *    queda exactamente igual (ni dinero inventado ni borrado).
 *  · Snapshot ANTES/DESPUÉS + verificaciones §5.4 impresas a consola.
 * Idempotencia: re-ejecutar devuelve {'status':'idempotent'} sin efectos.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PAYMENT_ID = '4783f9ae-6121-467e-b95b-1836d51d5d7d';
const SERVICE_ID = 'fedb7c40-8f10-48fd-8356-cc7e6a7ce0e7';
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const REASON = 'Reversión gobernada CP-AP-ACCOUNTING-INTEGRITY-001: pago $1,800 del servicio anulado F-23112026 (SRV-20261123-00146, Pixelarte) registrado antes del void del 23/11 21:35. El desembolso real está representado por el servicio de reemplazo activo (SRV-20261123-00147) con sus asientos posted — caso 1 de la misión §5.2 (sin desembolso propio del documento anulado). Ledger ya compensado al momento del void; esta reversión cancela la aplicación y deja la fila viva en cero.';

const PROD_REF = 'wthkddeleylijmonclxg';
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const TOKEN = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)[1].trim();
const session = JSON.parse(readFileSync('/tmp/bi-session.json', 'utf8'));
const fmt = (n) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

async function snapshot(label) {
  const pay = await runSql(`
    SELECT id, amount, amount_cup, currency, payment_method, direction, reverses_payment_id,
           payment_date, idempotency_key, notes
      FROM payment_transactions
     WHERE id='${PAYMENT_ID}'
        OR reverses_payment_id='${PAYMENT_ID}';`);
  const svc = await runSql(`
    SELECT id, service_number, reference_doc, status, payment_status, paid_amount, total_amount
      FROM received_services WHERE id='${SERVICE_ID}';`);
  const entries = await runSql(`
    SELECT event, status, count(*) AS n
      FROM fin_entries WHERE document_type='SERVICIO_RECIBIDO' AND document_id='${SERVICE_ID}'
     GROUP BY event, status ORDER BY event, status;`);
  const out = { label, at: new Date().toISOString(), pay, svc, entries };
  console.log(`\n═══ SNAPSHOT ${label} (${out.at}) ═══`);
  for (const p of pay) {
    console.log(`  pago ${p.id.slice(0, 8)}: $${fmt(p.amount_cup)} ${p.currency} dir=${p.direction ?? 'in'} reverses=${p.reverses_payment_id ? p.reverses_payment_id.slice(0, 8) : '—'} idem=${p.idempotency_key}`);
  }
  for (const s of svc) console.log(`  servicio: status=${s.status} payment_status=${s.payment_status} paid_amount=${fmt(s.paid_amount)} total=${fmt(s.total_amount)}`);
  for (const e of entries) console.log(`  fin_entries: ${e.event} × ${e.n} (${e.status})`);
  return out;
}

const before = await snapshot('ANTES');

// ── Ejecución por el canal canónico (ruta de la app, sesión admin real) ──
console.log('\n═══ EJECUCIÓN: POST /api/payments/' + PAYMENT_ID + ' ═══');
const apiRes = await fetch(`http://localhost:3000/api/payments/${PAYMENT_ID}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ reason: REASON.slice(0, 300) }),
});
const apiText = await apiRes.text();
console.log(`HTTP ${apiRes.status}: ${apiText.slice(0, 400)}`);
if (!apiRes.ok) {
  console.error('\nFALLO — NO se continuó. El estado queda exactamente como el snapshot ANTES (la ruta es transaccional).');
  process.exit(1);
}

const after = await snapshot('DESPUÉS');

// ── Verificaciones de la misión §5.4 ──
console.log('\n═══ VERIFICACIONES (misión §5.4) ═══');
const checks = [];
const counter = after.pay.find(p => p.reverses_payment_id === PAYMENT_ID);
const original = after.pay.find(p => p.id === PAYMENT_ID);
const svc = after.svc[0];

checks.push(['1. El servicio conserva su anulación histórica (voided)', svc?.status === 'voided']);
checks.push(['2. La obligación quedó cancelada: paid_amount=0 / unpaid', Number(svc?.paid_amount) === 0 && svc?.payment_status === 'unpaid']);
checks.push(['3. El pago ya no está aplicado: existe contra-fila reversal', !!counter && counter.direction === 'reversal']);
checks.push(['4. La contra-fila enlaza al original (reverses_payment_id)', counter?.reverses_payment_id === PAYMENT_ID]);
checks.push(['5. El movimiento original se CONSERVA (no borrado, PT007)', !!original && (original.direction ?? 'in') === 'in']);
checks.push(['6. Importe de la contra-fila espeja el original', counter && Number(counter.amount_cup) === Number(original.amount_cup)]);
const beforePagoPosted = before.entries.find(e => e.event === 'pago' && e.status === 'posted');
const afterPagoPosted = after.entries.find(e => e.event === 'pago' && e.status === 'posted');
checks.push(['7. Sin asientos nuevos: el pago del anulado no tenía entries posted (idempotente)', !beforePagoPosted && !afterPagoPosted]);
const entriesIgual = JSON.stringify(before.entries) === JSON.stringify(after.entries);
checks.push(['8. fin_entries del documento sin cambios', entriesIgual]);

let ok = true;
for (const [name, passed] of checks) {
  console.log(`  ${passed ? '✓' : '✗ FALLO'} — ${name}`);
  if (!passed) ok = false;
}

// Persistir evidencia
mkdirSync(new URL('../download/cpai-evidencia/', import.meta.url), { recursive: true });
writeFileSync(new URL('../download/cpai-evidencia/pixelarte-reversal-evidencia.json', import.meta.url),
  JSON.stringify({ mision: 'CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001', caso: 'F-23112026 Pixelarte $1,800 (caso 1)', payment_id: PAYMENT_ID, service_id: SERVICE_ID, reason: REASON, before, api: { status: apiRes.status, body: apiText.slice(0, 1000) }, after, checks: checks.map(([n, p]) => ({ check: n, pass: p })) }, null, 2));
console.log(`\nEvidencia: download/cpai-evidencia/pixelarte-reversal-evidencia.json`);
console.log(ok ? 'TODAS LAS VERIFICACIONES PASARON' : 'HAY VERIFICACIONES FALLIDAS — revisar');
process.exit(ok ? 0 : 2);
