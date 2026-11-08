#!/usr/bin/env node
/**
 * CP-DOC-SC-DATA-MAPPING-006 — Verificación E2E de las migraciones
 * 20261108200000 (store_code) y 20261108201000 (receipt document_number)
 * contra el proyecto AISLADO E2E. Jamás toca producción: pasa por el guard
 * fail-closed CP-INFRA-019 (assertNotProduction con la URL real destino).
 *
 * Pruebas (misión §12):
 *   A. Regularización: todas las tiendas existentes recibieron store_code,
 *      sin duplicados por tenant, orden de creación (más antigua = 1) y
 *      auditoría STORE_CODE_REGULARIZED en audit_logs.
 *   B. Concurrencia de códigos: N inserciones simultáneas de tiendas del
 *      mismo tenant → códigos únicos y consecutivos (trigger + advisory).
 *   C. Código explícito se conserva: fila creada CON store_code no se toca.
 *   D. Integración create_store_with_membership: el RPC (con su advisory
 *      lock por tenant) devuelve tienda con código asignado.
 *   E. Concurrencia de números de entrada: N recepciones 'active'
 *      simultáneas → document_number ENT-NNNNNN-AAAA únicos por tienda.
 *   F. Históricas sin retro-numerar: las recepciones previas siguen NULL.
 *   G. Limpieza: elimina SOLO las filas creadas por este script.
 *
 * Salida: resumen PASS/FAIL en consola y JSON en /home/z/my-project/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertNotProduction } from './lib/assert-not-production.mjs';
// Guard de aislamiento CP-INFRA-011 (fail-closed): E2E_TARGET_KIND +
// E2E_ALLOWED_REMOTE_REF exacto != producción + centinela e2e_is_isolated_db().
import { assertIsolatedDb } from '../e2e/fixtures/assert-isolated-db.cjs';

// ── Credenciales locales (gitignored) ──
const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}
const URL = (process.env.E2E_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SRK = (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!URL || !SRK) { console.error('FALLO: faltan E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// Guard CP-INFRA-019: destino real identificado por ref; E2E conocido pasa libre.
assertNotProduction({ mode: 'write', url: URL, context: 'scripts/sc006-e2e-verification.mjs' });
// Guard CP-INFRA-011: el destino debe ser el proyecto AISLADO E2E (centinela incluido).
await assertIsolatedDb({ env: process.env });

const sb = createClient(URL, SRK, { auth: { persistSession: false } });
const resultados = [];
const ok = (name, pass, detail) => {
  resultados.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name} — ${detail}`);
};

// ── Datos base: una tienda activa y su tenant ──
const { data: storesAll, error: eStores } = await sb
  .from('stores')
  .select('id, name, tenant_id, created_at, store_code, is_active, is_archived')
  .order('created_at', { ascending: true });
if (eStores) { console.error('Lectura de stores falló:', eStores.message); process.exit(1); }
const base = storesAll.find((s) => s.is_active !== false && !s.is_archived) || storesAll[0];
// El RPC create_store_with_membership exige tenant real (ERR_NO_TENANT con
// NULL): para la prueba D se usa el tenant de cualquier tienda con tenant_id.
const tenantBase = storesAll.find((s) => s.tenant_id)?.tenant_id ?? base?.tenant_id ?? null;
console.log(`Tienda base: ${base?.name} (tenant=${tenantBase ?? 'NULL'}, store_code=${base?.store_code})`);
const creados = { stores: [], receipts: [] };

try {
  // ── A. Regularización ──
  const sinCodigo = storesAll.filter((s) => s.store_code === null || s.store_code === undefined);
  ok('A1 regularización: ninguna tienda sin código', sinCodigo.length === 0,
    `${storesAll.length} tiendas; sin código: ${sinCodigo.length}`);

  const buckets = new Map();
  let duplicados = 0;
  for (const s of storesAll) {
    const key = s.tenant_id ?? '00000000-0000-0000-0000-000000000000';
    const set = buckets.get(key) ?? new Set();
    if (set.has(s.store_code)) duplicados += 1;
    set.add(s.store_code);
    buckets.set(key, set);
  }
  ok('A2 unicidad por tenant', duplicados === 0, `duplicados: ${duplicados} en ${buckets.size} ámbito(s)`);

  // Orden de creación dentro del tenant base: códigos ascendentes por created_at
  const delTenant = storesAll.filter((s) => (s.tenant_id ?? null) === tenantBase);
  const ordenOk = delTenant.every((s, i) => i === 0 || s.store_code > delTenant[i - 1].store_code);
  const lista = delTenant.map((s) => `${s.store_code}:${s.name}`).join(' | ');
  ok('A3 orden de creación (antigua=1)', ordenOk && delTenant.length > 0,
    `${delTenant.length} tiendas del tenant → ${lista}`);

  const { count: auditCount, error: eAudit } = await sb
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', 'STORE_CODE_REGULARIZED');
  ok('A4 auditoría de regularización', !eAudit && (auditCount ?? 0) >= 1,
    `audit_logs STORE_CODE_REGULARIZED: ${auditCount ?? 'ERROR ' + eAudit?.message} (asignaciones de la migración)`);

  // ── B. Concurrencia de códigos (6 inserciones simultáneas, mismo tenant) ──
  const N = 6;
  const filas = Array.from({ length: N }, (_, i) => ({
    name: `QA SC006 Concurrencia ${i + 1} ${Date.now()}`,
    tenant_id: tenantBase,
    is_active: false, // tienda de prueba inactiva desde el inicio
    address: 'Fila de prueba CP-DOC-SC-DATA-MAPPING-006',
  }));
  const ins = await Promise.all(filas.map((f) => sb.from('stores').insert(f).select('id, name, store_code').single()));
  const nuevos = ins.map((r) => r.data).filter(Boolean);
  creados.stores.push(...nuevos.map((s) => s.id));
  const codigos = nuevos.map((s) => s.store_code).filter((c) => c !== null);
  const unicos = new Set(codigos);
  const erroresIns = ins.filter((r) => r.error).map((r) => r.error.message);
  ok('B concurrencia códigos: únicos y completos',
    erroresIns.length === 0 && codigos.length === N && unicos.size === N,
    `códigos=${codigos.join(',')} errores=${erroresIns.length || 'ninguno'}`);

  // ── C. Código explícito se conserva ──
  // Código único por corrida: los códigos JAMÁS se reutilizan (las tiendas
  // archivadas de corridas anteriores conservan el suyo y bloquean el duplicado).
  const maxCodigo = Math.max(...storesAll.filter((s) => (s.tenant_id ?? null) === tenantBase).map((s) => s.store_code ?? 0));
  const explicita = maxCodigo + 100000;
  const { data: sExp, error: eExp } = await sb
    .from('stores')
    .insert({ name: `QA SC006 código explícito ${Date.now()}`, tenant_id: tenantBase, is_active: false, store_code: explicita })
    .select('id, store_code')
    .single();
  if (sExp) creados.stores.push(sExp.id);
  ok('C código explícito intacto', !eExp && sExp?.store_code === explicita,
    `store_code=${sExp?.store_code ?? 'ERROR ' + eExp?.message}`);

  // ── D. Integración con create_store_with_membership (RPC del flujo real) ──
  // El RPC exige created_by real (user_store_memberships.user_id NOT NULL):
  // se toma un miembro de una tienda del tenant elegido.
  let createdBy = null;
  const storeDelTenant = storesAll.find((s) => s.tenant_id === tenantBase);
  if (storeDelTenant) {
    const { data: miembro } = await sb
      .from('user_store_memberships')
      .select('user_id')
      .eq('store_id', storeDelTenant.id)
      .limit(1);
    createdBy = miembro?.[0]?.user_id ?? null;
  }
  const { data: rpcRes, error: eRpc } = await sb.rpc('create_store_with_membership', {
    p_name: `QA SC006 RPC ${Date.now()}`,
    p_address: 'Prueba CP-DOC-SC-DATA-MAPPING-006',
    p_created_by: createdBy,
    p_max_stores: 999,
    p_tenant_id: tenantBase,
  });
  let rpcOk = false;
  let rpcDetail = 'sin respuesta';
  if (eRpc) {
    rpcDetail = `RPC error: ${eRpc.message} (si es cuota/permiso del plan, el trigger queda validado por B)`;
  } else {
    const payload = typeof rpcRes === 'string' ? JSON.parse(rpcRes) : rpcRes;
    const newId = payload?.store_id || payload?.store?.id || payload?.id;
    if (newId) {
      creados.stores.push(newId);
      const { data: sRpc } = await sb.from('stores').select('store_code').eq('id', newId).single();
      rpcOk = sRpc?.store_code !== null && sRpc?.store_code !== undefined;
      rpcDetail = `store_code=${sRpc?.store_code}`;
    } else {
      rpcDetail = JSON.stringify(payload).slice(0, 160);
    }
  }
  ok('D create_store_with_membership asigna código', rpcOk, rpcDetail);

  // ── E. Concurrencia de números de entrada (8 recepciones simultáneas) ──
  const R = 8;
  const { count: beforeNull } = await sb
    .from('receipts')
    .select('id', { count: 'exact', head: true })
    .is('document_number', null);
  const recs = Array.from({ length: R }, (_, i) => ({
    store_id: base.id,
    status: 'active',
    total_cost: 0,
    supplier: 'Proveedor Prueba SC006',
    reference_doc: `FAC-SC006-${i + 1}`,
    reception_date: new Date().toISOString().slice(0, 10),
  }));
  const insRec = await Promise.all(recs.map((r) => sb.from('receipts').insert(r).select('id, document_number').single()));
  const nuevas = insRec.map((r) => r.data).filter(Boolean);
  creados.receipts.push(...nuevas.map((r) => r.id));
  const nums = nuevas.map((r) => r.document_number).filter(Boolean);
  const patron = /^ENT-\d{6}-\d{4}$/;
  const erroresRec = insRec.filter((r) => r.error).map((r) => r.error.message);
  ok('E concurrencia entradas: formato ENT-NNNNNN-AAAA único',
    erroresRec.length === 0 && nums.length === R && new Set(nums).size === R && nums.every((n) => patron.test(n)),
    `números=${nums.join(',') || '—'} errores=${erroresRec.length || 'ninguno'}`);

  // ── F. Históricas sin retro-numerar ──
  const { count: afterNull } = await sb
    .from('receipts')
    .select('id', { count: 'exact', head: true })
    .is('document_number', null);
  ok('F históricas sin retro-numeración', afterNull === beforeNull,
    `NULL antes=${beforeNull} después=${afterNull} (solo las ${R} nuevas recibieron número)`);
} finally {
  // ── G. Limpieza (solo filas creadas por este script) ──
  if (creados.receipts.length) {
    const { error } = await sb.from('receipts').delete().in('id', creados.receipts);
    console.log(`Limpieza: ${creados.receipts.length} recepciones de prueba — ${error ? 'ERROR ' + error.message : 'eliminadas'}`);
  }
  if (creados.stores.length) {
    // El trigger de auditoría de stores impide el DELETE duro (inserta en
    // audit_logs con FK store_id que viola al eliminar la fila referenciada):
    // la app real tampoco elimina tiendas (archivado soft). Limpieza = archivar.
    await sb.from('audit_logs').delete().in('store_id', creados.stores);
    const { error: eDel } = await sb.from('stores').delete().in('id', creados.stores);
    if (eDel) {
      const { error: eArch } = await sb
        .from('stores')
        .update({ is_archived: true, archived_at: new Date().toISOString(), is_active: false })
        .in('id', creados.stores);
      console.log(`Limpieza: ${creados.stores.length} tiendas de prueba — archivadas (${eArch ? 'ERROR ' + eArch.message : 'ok'}); DELETE duro no soportado por el trigger de auditoría`);
    } else {
      console.log(`Limpieza: ${creados.stores.length} tiendas de prueba — eliminadas`);
    }
  }
  // Restos de ejecuciones anteriores de esta misma prueba (marcadas QA SC006).
  const { data: restos } = await sb
    .from('stores')
    .select('id')
    .like('name', 'QA SC006%')
    .eq('is_archived', false);
  if (restos && restos.length) {
    await sb
      .from('stores')
      .update({ is_archived: true, archived_at: new Date().toISOString(), is_active: false })
      .in('id', restos.map((r) => r.id));
    console.log(`Limpieza: ${restos.length} tiendas de pruebas anteriores archivadas`);
  }
}

const fallidos = resultados.filter((r) => !r.pass);
const resumen = {
  mision: 'CP-DOC-SC-DATA-MAPPING-006',
  destino: URL,
  fecha: new Date().toISOString(),
  total: resultados.length,
  fallidos: fallidos.length,
  resultados,
};
writeFileSync('/home/z/my-project/sc006-e2e-results.json', JSON.stringify(resumen, null, 2));
console.log(`\nRESULTADO: ${resultados.length - fallidos.length}/${resultados.length} pruebas OK — detalle en /home/z/my-project/sc006-e2e-results.json`);
process.exit(fallidos.length ? 1 : 0);
