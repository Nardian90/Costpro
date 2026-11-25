#!/usr/bin/env node
/**
 * sr-create-flow-e2e.mjs — SR-CREATE-BLOCK-20261125 · Fase 5 (prueba funcional).
 * ───────────────────────────────────────────────────────────────────────────
 * Ejecuta el flujo REAL de «Confirmar servicio» contra el servidor local
 * (que debe estar con el .env intercambiado a la BD AISLADA — ver orquestación
 * en docs/audits/SR-CREATE-BLOCK-20261125/INFORME.md) usando un JWT real:
 *
 *   1. SETUP   : tienda+miembro del aislado → crea service_type + supplier de prueba.
 *   2. SESIÓN  : magic link (Admin API) → verifyOtp → access_token real.
 *   3. SNAP    : contadores baseline (net-zero posterior).
 *   4. CONFIRM : POST /api/received-services (ruta REAL desplegada) → 201.
 *   5. REPLAY  : mismo creation_key → MISMO id (idempotencia ADN-008/CP-OPS).
 *   6. NEGATIVO: total_amount=0 → error de negocio, sin escritura.
 *   7. LIMPIEZA: borrado integral (servicio, asientos fin, audit, supplier, tipo).
 *   8. VERIFICACIÓN: contadores == baseline (net-zero).
 *
 * Solo escribe en la BD AISLADA (guard: ref E2E conocido). Re-ejecutable:
 * usa claves únicas por corrida y limpia lo que crea.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const E2E_URL = process.env.E2E_SUPABASE_URL || '';
const E2E_ANON = process.env.E2E_SUPABASE_ANON_KEY || '';
const E2E_ADMIN = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '';
const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/sr-fix-20261125';

if (!E2E_URL || !E2E_ANON || !E2E_ADMIN) {
  console.error('FALLO: faltan E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}
const e2eRef = E2E_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
assertNotProduction({ mode: 'write', projectRef: e2eRef, context: 'sr-create-flow-e2e.mjs' }); // ref E2E conocido: paso libre

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(E2E_URL, E2E_ADMIN, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(E2E_URL, E2E_ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` — ${detail}` : ''}`); };
const stamp = Date.now().toString(36);
const STORE = '9635e633-387f-411d-bc15-7d2b6179aae4'; // Enervida (aislada)
const SUP_NAME = `Proveedor Prueba F5 ${stamp}`;
const TYPE_NAME = 'Prueba SR Create F5';
const TYPE_CODE = `SR-F5-${stamp}`;
const CREATION_KEY = `sr-create-block-f5-${stamp}-${stamp}`;

try {
  // ── 0. BASELINE previo a CUALQUIER inserción (net-zero honesto) ─────────
  const t0 = new Date(Date.now() - 2000).toISOString();
  const count = async (table, col, val) => {
    const { count: c } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, val);
    return c ?? 0;
  };
  const base = {
    received: await count('received_services', 'store_id', STORE),
    fin: await count('fin_entries', 'store_id', STORE),
    audit: await count('audit_logs', 'store_id', STORE),
    types: await count('service_types', 'store_id', STORE),
    sups: await count('suppliers', 'store_id', STORE),
  };
  console.log(`Baseline (pre-insert): ${JSON.stringify(base)}`);

  // ── 1. SETUP: miembro de la tienda + tipo de servicio + proveedor local ──
  // El gate F3-P0-02 (correcto) exige admin/manager/encargado: promuevo
  // TEMPORALMENTE el rol del miembro en el AISLADO y lo restauro en limpieza.
  const { data: mem, error: memErr } = await admin.from('user_store_memberships').select('user_id, role').eq('store_id', STORE).limit(1);
  check('Setup: tienda con miembro', !memErr && !!mem?.length, memErr?.message ?? '');
  const userId = mem[0].user_id;
  const originalRole = mem[0].role;
  const { error: roleErr } = await admin.from('user_store_memberships').update({ role: 'encargado' }).eq('user_id', userId).eq('store_id', STORE);
  check(`Setup: rol temporal encargado (era ${originalRole}, se restaura al final)`, !roleErr, roleErr?.message ?? '');

  const { data: users, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  const member = (users?.users || []).find((u) => u.id === userId);
  check('Setup: email del miembro', !!member?.email, member?.email ?? usersErr?.message);

  const { data: typeRow, error: typeErr } = await admin
    .from('service_types')
    .insert({ store_id: STORE, name: TYPE_NAME, code: TYPE_CODE, is_active: true })
    .select('id')
    .single();
  check('Setup: service_type creado (aislado)', !typeErr && !!typeRow?.id, typeErr?.message ?? typeRow?.id);

  const { data: supRow, error: supErr } = await admin
    .from('suppliers')
    .insert({ store_id: STORE, name: SUP_NAME })
    .select('id')
    .single();
  check('Setup: proveedor local creado (aislado)', !supErr && !!supRow?.id, supErr?.message ?? supRow?.id);

  // ── 2. SESIÓN real (mismo mecanismo que usa el navegador) ────────────────
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: member.email });
  check('Sesión: magic link emitido', !linkErr, linkErr?.message ?? '');
  const otp = link?.properties?.email_otp;
  const { data: sess, error: sessErr } = await anon.auth.verifyOtp({ email: member.email, token: otp, type: 'magiclink' });
  const token = sess?.session?.access_token;
  check('Sesión: JWT real obtenido', !sessErr && !!token, sessErr?.message ?? 'bearer ***');

  // ── 3. (baseline ya tomado en fase 0) ──────────────────────────────────

  // ── 4. CONFIRM vía la RUTA API REAL (el camino exacto del botón) ─────────
  const post = async (body) => fetch(`${BASE}/api/received-services`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const body = {
    store_id: STORE,
    supplier: SUP_NAME,
    supplier_id: supRow.id,
    total_amount: 100,
    service_type_id: typeRow.id,
    service_type_name: TYPE_NAME,
    currency: 'CUP',
    exchange_rate: 1.0,
    payment_terms_days: 30,
    distribution_method: 'amount',
    reference_doc: 'F-F5-20261125',
    observations: 'Prueba funcional SR-CREATE-BLOCK-20261125 (aislada)',
    save_as_draft: false,
    creation_key: CREATION_KEY,
  };
  const r1 = await post(body);
  const j1 = await r1.json().catch(() => ({}));
  const sid = j1?.data?.id;
  check('CONFIRM: 201 creado vía ruta real', r1.status === 201 && !!sid, `HTTP ${r1.status} · ${JSON.stringify(j1).slice(0, 160)}`);
  check('CONFIRM: número de servicio emitido', !!j1?.data?.service_number, j1?.data?.service_number ?? '');
  check('CONFIRM: sin warning de identidad', !j1?.data?.identity_warning && !j1?.warning, JSON.stringify(j1).slice(0, 120));

  // ── 5. REPLAY con la misma creation_key → MISMO id ────────────────────────
  const r2 = await post({ ...body });
  const j2 = await r2.json().catch(() => ({}));
  check('REPLAY: idempotente (mismo id, sin duplicado)', r2.status === 201 && j2?.data?.id === sid, `HTTP ${r2.status} · id=${j2?.data?.id?.slice(0, 8) ?? 'n/d'} · dup=${j2?.data?.duplicate}`);

  // ── 6. NEGATIVO: importe 0 → error de negocio, SIN escritura ─────────────
  const r3 = await post({ ...body, total_amount: 0, creation_key: `${CREATION_KEY}-neg` });
  check('NEGATIVO: importe 0 rechazado (>=400)', r3.status >= 400, `HTTP ${r3.status}`);
  const { count: afterNeg } = await admin.from('received_services').select('id', { count: 'exact', head: true }).eq('store_id', STORE);
  check('NEGATIVO: sin escritura residual', afterNeg === base.received + 1, `filas=${afterNeg} (baseline+1)`);

  // ── 7. LIMPIEZA integral ──────────────────────────────────────────────────
  // 7a. asientos contables creados por el trigger durante la prueba
  const { data: finNew } = await admin.from('fin_entries').select('id').eq('store_id', STORE).gte('created_at', t0);
  if (finNew?.length) await admin.from('fin_entries').delete().in('id', finNew.map((x) => x.id));
  // 7b. auditoría ligada al servicio (el barrido por VENTANA va al FINAL,
  //     después de restaurar el rol: su restore dispara otro membership_update)
  if (sid) {
    await admin.from('audit_logs').delete().eq('record_id', sid);
    await admin.from('service_reception_links').delete().eq('service_id', sid);
    await admin.from('service_production_order_links').delete().eq('service_id', sid);
  }
  // 7d. servicio (solo si la creación llegó a producir id)
  if (sid) {
    const { error: delSvcErr } = await admin.from('received_services').delete().eq('id', sid);
    check('LIMPIEZA: servicio eliminado', !delSvcErr, delSvcErr?.message ?? '');
  }
  // 7e. proveedor y tipo de prueba
  await admin.from('suppliers').delete().eq('id', supRow.id);
  await admin.from('service_types').delete().eq('id', typeRow.id);
  // 7f. ROL RESTAURADO al original
  const { error: roleRestoreErr } = await admin.from('user_store_memberships').update({ role: originalRole }).eq('user_id', userId).eq('store_id', STORE);
  check('LIMPIEZA: rol del miembro restaurado', !roleRestoreErr, roleRestoreErr?.message ?? originalRole);
  // 7g. barrido FINAL de auditoría por ventana (incluye el membership_update
  //     del restore de 7f y cualquier otra fila creada dentro de la prueba)
  await admin.from('audit_logs').delete().eq('store_id', STORE).gte('created_at', t0);

  // ── 8. NET-ZERO ───────────────────────────────────────────────────────────
  const postCounts = {
    received: await count('received_services', 'store_id', STORE),
    fin: await count('fin_entries', 'store_id', STORE),
    audit: await count('audit_logs', 'store_id', STORE),
    types: await count('service_types', 'store_id', STORE),
    sups: await count('suppliers', 'store_id', STORE),
  };
  const netZero = JSON.stringify(postCounts) === JSON.stringify(base);
  check('NET-ZERO: contadores == baseline', netZero, `${JSON.stringify(base)} → ${JSON.stringify(postCounts)}`);

  const allOk = results.every((r) => r.ok);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/evidencia-f5-flujo-funcional.json`, JSON.stringify({ stamp, store: STORE, results, baseline: base, postCounts, verdict: allOk ? 'PASS' : 'FAIL', at: new Date().toISOString() }, null, 2));
  console.log(allOk ? '\nFLUJO FUNCIONAL COMPLETO: PASS (evidencia en download/sr-fix-20261125/)' : '\nFLUJO FUNCIONAL: FAIL (ver detalles)');
  process.exit(allOk ? 0 : 1);
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
  writeFileSync(`${OUT}/evidencia-f5-flujo-funcional.json`, JSON.stringify({ stamp, results, error: e.message, verdict: 'ERROR' }, null, 2)).catch(() => {});
  process.exit(1);
}
