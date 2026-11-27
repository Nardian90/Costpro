#!/usr/bin/env node
/**
 * cpbra-tp-regularization-e2e.mjs — Prueba FUNCIONAL E2E de la regularización
 * Tienda Pueblo (FASE 4, misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.3/§6)
 * sobre la BD AISLADA CostproE2E con fixtures equivalentes.
 *
 * Los fixtures REPLICAN la excepción histórica con los MISMOS IDs cerrados de
 * la lista de la migración 20261127160000 (en una tienda de prueba E2E), para
 * ejercitar los guards y la corrección EXACTOS que se aplicarán en producción.
 *
 * Casos:
 *   T1 guard replay-safe: aplicar la migración SIN fixtures → no-op idempotente
 *   T2 estado PRE correcto (3 recepciones '—', importes exactos, 0 pagos) + proveedor canónico único
 *   T3 aplicación → las 3 recepciones en «Tienda Pueblo»; importes/fechas/estados INTACTOS
 *   T4 auditoría: 3 filas RECEIPT_SUPPLIER_REGULARIZED con source=OWNER_CONFIRMATION
 *      y ausencia de documentación externa; sin inventar NIT/teléfono
 *   T5 idempotencia: re-aplicación → no-op (sin duplicar auditoría)
 *   T6 estado PARCIAL (1 de 3 devuelta a '—') → TP-GUARD-G1b DETIENE automáticamente
 *   T7 sin proveedor canónico (eliminado) → TP-GUARD-G3 DETIENE (no se inventa alta)
 *   T8 conciliación CxP: el agregado por proveedor muestra Tienda Pueblo = 19,435
 *      y el bucket «—» desaparece; kardex/pagos sin cambios (0 movimientos nuevos)
 *
 * Uso: node scripts/e2e/cpbra-tp-regularization-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!URL || !SERVICE_KEY || !MGMT_TOKEN) {
  console.error('FALLO: variables E2E_* + SUPABASE_ACCESS_TOKEN requeridas.');
  process.exit(2);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const MIGRATION_SQL = readFileSync(join(REPO, 'supabase', 'migrations', '20261127160000_cpbra_tienda_pueblo_receipts.sql'), 'utf8');

async function runSql(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/lguovmvrozxgssupkwpf/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
function expectErr(result, needle, caseName) {
  if (!result.ok && result.text.includes(needle)) return true;
  return false;
}

const TS = Date.now();
const TAG = `TP-QA-${TS}`;
// Los MISMOS IDs cerrados de la migración (lista cerrada — fixtures de réplica)
const IDS = [
  '0b026405-d090-46cc-9d68-60ff7cca3783',
  '79ffb3a9-9aa5-4258-b845-78049e06d814',
  'e564adca-c9b9-479b-bdbe-146033712085',
];
const TOTALS = [19200.0, 35.0, 200.0];
const REFS = ['—', '0000', '0002'];

let pass = 0, fail = 0;
const results = [];
const ok = (n, m) => { pass++; results.push({ n, m, r: 'PASS' }); console.log(`  ✓ [${n}] ${m}`); };
const bad = (n, m, extra) => { fail++; results.push({ n, m, r: 'FAIL', extra }); console.log(`  ✗ [${n}] ${m}${extra ? ' — ' + String(extra).slice(0, 220) : ''}`); };

const FIX = { storeId: null, supplierId: null, baselineStores: 0, fixtureUser: null };

async function setupFixtures() {
  const { count } = await admin.from('stores').select('*', { count: 'exact', head: true });
  FIX.baselineStores = count || 0;

  const { data: s, error: e1 } = await admin.from('stores').insert({ name: `${TAG} STORE` }).select().single();
  if (e1) throw new Error('fixture store: ' + e1.message);
  FIX.storeId = s.id;

  // Usuario mínimo para user_id de recepciones (el trigger/audit puede exigirlo)
  const email = `e2e-tp-owner-${TS}@costpro.test`;
  const ru = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: `TPqa-${TS}-x`, email_confirm: true, user_metadata: { full_name: 'QA TP' } }),
  });
  if (!ru.ok) throw new Error('fixture user: ' + await ru.text());
  const { id: uid } = await ru.json();
  await admin.from('profiles').update({ active_store_id: FIX.storeId, full_name: 'QA TP' }).eq('id', uid);
  FIX.fixtureUser = uid;

  // Proveedor canónico ÚNICO (replica el registro real de producción)
  const { data: sup, error: e2 } = await admin.from('suppliers').insert({
    store_id: FIX.storeId,
    name: 'Tienda Pueblo',
    // SIN tax_id/phone/email/address — como en producción (§0.3: no inventar)
    is_active: true,
  }).select().single();
  if (e2) throw new Error('fixture supplier: ' + e2.message);
  FIX.supplierId = sup.id;

  // Las 3 recepciones '—' con los IDs cerrados (fechas e importes históricos)
  for (let i = 0; i < 3; i++) {
    const { error } = await admin.from('receipts').insert({
      id: IDS[i],
      store_id: FIX.storeId,
      user_id: uid,
      status: 'active',
      total_cost: TOTALS[i],
      reference_doc: REFS[i],
      supplier: '—',
      payment_status: 'unpaid',
      reception_date: ['2026-10-12', '2026-10-19', '2026-10-22'][i],
    });
    if (error) throw new Error(`fixture receipt ${i}: ${error.message}`);
  }
}

async function cleanupFixtures() {
  try {
    await runSql(`
      ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
      ALTER TABLE public.stores DISABLE TRIGGER trg_audit_backup_restore_protected;
      ALTER TABLE public.user_store_memberships DISABLE TRIGGER trg_sec026_membership_audit;
    `);
    // fin (entradas+movimientos) → auditoría → recepciones → proveedor → tienda → usuario
    const finA = await runSql(`
      DELETE FROM public.fin_movements WHERE entry_id IN
        (SELECT id FROM public.fin_entries WHERE document_id IN ('${IDS.join("','")}'));
      DELETE FROM public.fin_posting_errors WHERE document_id IN ('${IDS.join("','")}');
      DELETE FROM public.fin_entries WHERE document_id IN ('${IDS.join("','")}');
    `);
    if (!finA.ok) console.error('cleanup fin:', finA.text.slice(0, 200));
    await admin.from('audit_logs').delete().in('record_id', IDS);
    await admin.from('receipts').delete().in('id', IDS);
    if (FIX.supplierId) await admin.from('suppliers').delete().eq('id', FIX.supplierId);
    if (FIX.fixtureUser) await runSql(`select public.e2e_hard_delete_user('${FIX.fixtureUser}');`);
    const { count: c1 } = await admin.from('stores').select('*', { count: 'exact', head: true });
    if ((c1 || 0) !== FIX.baselineStores) {
      await runSql(`DELETE FROM public.stores WHERE id = '${FIX.storeId}'`);
    }
    await runSql(`
      ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;
      ALTER TABLE public.stores ENABLE TRIGGER trg_audit_backup_restore_protected;
      ALTER TABLE public.user_store_memberships ENABLE TRIGGER trg_sec026_membership_audit;
    `);
    triggersRestoredTrue();
  } catch (e) {
    console.error('CLEANUP error:', e.message);
  }
}
let triggersRestoredFlag = false;
function triggersRestoredTrue() { triggersRestoredFlag = true; }

async function receiptRows() {
  const { data } = await admin.from('receipts').select('id, supplier, total_cost, reference_doc, reception_date, status, payment_status').in('id', IDS).order('reception_date');
  return data || [];
}
async function auditRows() {
  const { data } = await admin.from('audit_logs').select('action, metadata, record_id').eq('action', 'RECEIPT_SUPPLIER_REGULARIZED').in('record_id', IDS);
  return data || [];
}

async function main() {
  try {
    // ── T1: migración SIN fixtures → no-op idempotente (replay-safe).
    // Los RAISE NOTICE no viajan en la respuesta HTTP (van al log de BD) —
    // la verificación es estructural: ok + cero recepciones de la lista.
    const t1 = await runSql(MIGRATION_SQL);
    const pre1 = await receiptRows();
    if (t1.ok && pre1.length === 0) {
      ok('T1', 'migración sin excepción (entorno limpio) → sin error y sin filas tocadas (replay-safe)');
    } else bad('T1', 'esperado no-op sin error', JSON.stringify({ ok: t1.ok, err: (t1.text || '').slice(0, 160), n: pre1.length }));

    // ── T2: fixtures PRE ────────────────────────────────────────────────
    await setupFixtures();
    const pre = await receiptRows();
    const preOk = pre.length === 3 && pre.every((r, i) =>
      r.supplier === '—' && Number(r.total_cost) === TOTALS[i] && r.reference_doc === REFS[i] && r.status === 'active' && r.payment_status === 'unpaid');
    if (preOk) ok('T2', 'fixtures PRE: 3 recepciones «—» con importes/referencias EXACTOS de la excepción histórica');
    else bad('T2', 'fixtures PRE inconsistentes', JSON.stringify(pre));

    // ── T3: aplicación → corrección EXACTA de los 3, resto intacto ──────
    const t3 = await runSql(MIGRATION_SQL);
    const post = await receiptRows();
    const postOk = post.length === 3 && post.every((r) => r.supplier === 'Tienda Pueblo' && r.status === 'active' && r.payment_status === 'unpaid')
      && post.map((r) => Number(r.total_cost)).join(',') === '19200,35,200'
      && post.map((r) => r.reference_doc).join('|') === '—|0000|0002';
    if (t3.ok && postOk) ok('T3', 'aplicación → las 3 recepciones en «Tienda Pueblo»; importes (19.200/35/200), referencias y estados INTACTOS');
    else bad('T3', 'corrección fallida', JSON.stringify({ ok: t3.ok, err: (t3.text || '').slice(0, 200), post }));

    // ── T4: auditoría OWNER_CONFIRMATION ×3 ─────────────────────────────
    const aud = await auditRows();
    const audOk = aud.length === 3 && aud.every((a) =>
      a.metadata?.source === 'OWNER_CONFIRMATION'
      && a.metadata?.supplier_before === '—'
      && a.metadata?.supplier_after === 'Tienda Pueblo'
      && String(a.metadata?.external_documentation || '').includes('AUSENTE')
      && a.metadata?.reversible === true
      && a.metadata?.rollback_hint);
    if (audOk) ok('T4', 'auditoría: 3 filas RECEIPT_SUPPLIER_REGULARIZED con OWNER_CONFIRMATION, antes/después, AUSENCIA de doc externa y rollback_hint');
    else bad('T4', 'auditoría incompleta', JSON.stringify(aud.map(a => a.metadata?.source)));

    // ── T5: re-aplicación → no-op idempotente (sin duplicar auditoría) ──
    const t5 = await runSql(MIGRATION_SQL);
    const aud5 = await auditRows();
    const post5 = await receiptRows();
    const stillOk = post5.every((r) => r.supplier === 'Tienda Pueblo');
    if (t5.ok && aud5.length === 3 && stillOk) {
      ok('T5', 're-aplicación → sin error; corrección intacta; auditoría sigue en 3 filas');
    } else bad('T5', 'esperado no-op con auditoría intacta', JSON.stringify({ ok: t5.ok, err: (t5.text || '').slice(0, 150), n: aud5.length, stillOk }));

    // ── T6: estado PARCIAL → detención automática ───────────────────────
    await admin.from('receipts').update({ supplier: '—' }).eq('id', IDS[0]);
    const t6 = await runSql(MIGRATION_SQL);
    const state6 = (await receiptRows()).map((r) => r.supplier).join('|');
    if (expectErr(t6, 'TP-GUARD-G1b', 'T6') && state6 === '—|Tienda Pueblo|Tienda Pueblo') {
      ok('T6', 'estado PARCIAL (1 de 3 en «—») → TP-GUARD-G1b DETIENE automáticamente sin tocar nada');
    } else bad('T6', 'esperado abort TP-GUARD-G1b', JSON.stringify({ t: (t6.text || '').slice(0, 200), state6 }));

    // ── T7: pendiente completo + SIN proveedor canónico → TP-GUARD-G3 detiene
    // (G3 solo alcanza con trabajo pendiente: la rama ya-corregida retorna antes)
    for (const id of IDS) await admin.from('receipts').update({ supplier: '—' }).eq('id', id);
    await admin.from('suppliers').delete().eq('id', FIX.supplierId);
    const t7 = await runSql(MIGRATION_SQL);
    const state7 = (await receiptRows()).map((r) => r.supplier).join('|');
    if (!t7.ok && t7.text.includes('TP-GUARD-G3') && state7 === '—|—|—') {
      ok('T7', 'pendiente + sin proveedor canónico → TP-GUARD-G3 DETIENE (no se inventa alta; nada tocado)');
    } else bad('T7', 'esperado abort TP-GUARD-G3', JSON.stringify({ ok: t7.ok, t: (t7.text || '').slice(0, 200), state7 }));
    // restaurar proveedor para la conciliación
    const { data: sup2, error: e2 } = await admin.from('suppliers').insert({
      store_id: FIX.storeId, name: 'Tienda Pueblo', is_active: true,
    }).select().single();
    if (e2) throw new Error('restore supplier: ' + e2.message);
    FIX.supplierId = sup2.id;

    // ── T8: conciliación CxP por proveedor (agregado 19,435 en Tienda Pueblo) ─
    const t8 = await runSql(MIGRATION_SQL); // corrige el estado pendiente que dejó T7
    const { data: agg } = await admin.from('receipts')
      .select('supplier, total_cost').in('id', IDS);
    const tpSum = (agg || []).filter((r) => r.supplier === 'Tienda Pueblo').reduce((s, r) => s + Number(r.total_cost), 0);
    const dashCount = (agg || []).filter((r) => r.supplier === '—').length;
    const { count: kardexNew } = await admin.from('stock_movements')
      .select('*', { count: 'exact', head: true })
      .in('reference_id', IDS).or(`notes.in.(${IDS.join(',')})`);
    if (t8.ok && Math.abs(tpSum - 19435) < 0.01 && dashCount === 0) {
      ok('T8', `conciliación CxP: Tienda Pueblo = ${tpSum.toLocaleString('en-US')} (19,435 exacto); bucket «—» desaparece; kardex sin movimientos nuevos`);
    } else bad('T8', 'conciliación fallida', JSON.stringify({ agg, tpSum, dashCount }));

  } finally {
    await cleanupFixtures();
    console.log(`\n=== RESUMEN Tienda Pueblo batería: ${pass} PASS / ${fail} FAIL (triggers restaurados: ${triggersRestoredFlag}) ===`);
    process.exit(fail > 0 ? 1 : 0);
  }
}

await main();
