#!/usr/bin/env node
/**
 * DIAGNÓSTICO DE RECUPERACIÓN — COSTPRO 2026-10-19 (READ-ONLY, sin escrituras).
 *
 * Determina el estado REAL de la BD viva (Supabase wthkddeleylijmonclxg) para
 * distinguir los TRES ESTADOS INDEPENDIENTES:
 *   1. PR fusionado (GitHub)      — verificado vía API fuera de este script.
 *   2. Migración APLICADA en BD   — registro supabase_migrations + comportamiento.
 *   3. Exposición corregida       — prueba efectiva con clave anon.
 *
 * Consultas EXCLUSIVAMENTE de solo lectura (SELECT sobre catálogos y GET HTTP).
 * Uso: SUPABASE_ANON_KEY=... SUPABASE_ACCESS_TOKEN=... node diag_estado_produccion_costpro.js
 */
const REF = 'wthkddeleylijmonclxg';
const BASE = `https://${REF}.supabase.co`;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ANON || !TOKEN) { console.error('FATAL: faltan SUPABASE_ANON_KEY/SUPABASE_ACCESS_TOKEN'); process.exit(2); }

const evidence = { ts: new Date().toISOString(), tipo: 'read-only', ref: REF };

async function sql(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function anonGet(path, extraHeaders = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, ...extraHeaders },
  });
  let body = null;
  try { body = await res.json(); } catch { /* vacío */ }
  return { status: res.status, body };
}

(async () => {
  const out = (k, v) => { evidence[k] = v; console.log(`\n── ${k} ──`); console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1).slice(0, 1500)); };

  // ── 1. Registro de migraciones aplicadas ──────────────────────────────
  try {
    const reg = await sql(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 12`);
    out('migraciones_registradas_ultimas12', reg.map(r => r.version));
    const ambos = await sql(`SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('20261018000000','20261019000001')`);
    out('migraciones_objetivo_registradas', ambos.length ? ambos.map(r => r.version) : 'NINGUNA de las dos está registrada');
  } catch (e) { out('ERROR_consulta_migraciones', String(e)); }

  // ── 2. ¿20261018000000 aplicada por COMPORTAMIENTO? (gate temporal) ───
  try {
    const fdef = await sql(`SELECT pg_get_functiondef('public.validate_operation_date(timestamp with time zone, uuid)'::regprocedure) AS def`);
    const def = fdef[0]?.def || '';
    const tieneMarker = def.includes('MISI\u00d3N POL\u00cdTICA TEMPORAL (2026-10-18)');
    const topeHoy = /v_max_date_business\s*:=\s*v_today_business\s*;/.test(def);
    const topeHoyMas1 = /v_max_date_business\s*:=\s*v_today_business\s*\+\s*1\s*;/.test(def);
    out('validar_gate_temporal', {
      funcion_existe: !!def,
      marker_mision_20261018_presente: tieneMarker,
      tope_hoy_estRICTO_aplicado: topeHoy,
      tope_hoy_mas1_viejo_persiste: topeHoyMas1,
      conclusion: topeHoy ? 'MIGRACIÓN 20261018000000 APLICADA (cuerpo vivo con tope HOY)'
             : topeHoyMas1 ? 'MIGRACIÓN 20261018000000 NO APLICADA (cuerpo viejo hoy+1 vivo)'
             : 'INDETERMINADO: cuerpo no coincide con ninguna versión conocida',
      extracto: def.split('\n').filter(l => /v_max_date_business\s*:=/.test(l)).map(l => l.trim()),
    });
  } catch (e) { out('ERROR_consulta_funcion', String(e)); }

  // ── 3. ¿20261019000001 aplicada? (vistas + policies + grants) ─────────
  try {
    const vistas = await sql(`SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname IN ('public_catalog_v','public_storefronts_v','public_variants_v')`);
    out('vistas_publicas_en_bd', vistas.length ? vistas.map(v => v.viewname) : 'NO EXISTEN (migración no aplicada)');
    const pols = await sql(`SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname='public' AND ((tablename IN ('products','stores') AND policyname IN ('products_public_read_anon','stores_select_anon')) OR (tablename='product_variants' AND policyname LIKE 'Variantes p%'))`);
    out('policies_anon_vivas', pols.map(p => `${p.tablename}.${p.policyname} [${String(p.roles).replace(/[{}]/g,'')}]`));
    const gTablas = await sql(`SELECT table_name FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name IN ('products','stores','product_variants') AND privilege_type='SELECT'`);
    out('grants_select_anon_tablas', gTablas.length ? gTablas.map(g => g.table_name) : 'NINGUNO');
  } catch (e) { out('ERROR_consulta_policies', String(e)); }

  // ── 4. Prueba efectiva de exposición (clave publishable, desde fuera) ─
  try {
    const prods = await anonGet('products?select=id,cost_average&limit=500');
    let conCosto = 0, total = null;
    if (Array.isArray(prods.body)) {
      total = prods.body.length;
      conCosto = prods.body.filter(p => p.cost_average !== null && Number(p.cost_average) !== 0).length;
      evidence.muestra_costos = 'VALORES NO IMPRESOS (sensibles); solo conteos';
    }
    out('exposicion_products_anon', { http: prods.status, total_filas: total, filas_con_cost_average_no_cero: conCosto,
      veredicto: prods.status === 200 ? 'EXPOSICIÓN ACTIVA: anon lee costos' : 'sin exposición' });
    const stores = await anonGet('stores?select=id,tenant_id&limit=50');
    out('exposicion_stores_anon', { http: stores.status, filas: Array.isArray(stores.body) ? stores.body.length : null,
      veredicto: stores.status === 200 ? 'EXPOSICIÓN ACTIVA: anon lee tenant_id de tiendas' : 'sin exposición' });
    const vc = await anonGet('public_catalog_v?select=id&limit=1');
    out('vista_public_catalog_v', { http: vc.status, veredicto: vc.status === 200 ? 'vista existe y legible' : 'vista NO disponible' });
  } catch (e) { out('ERROR_prueba_anon', String(e)); }

  // ── 5. david9999 — confirmación read-only de que NO se escribió ────────
  try {
    const d = await sql(`SELECT id, email, tenant_id, updated_at FROM public.profiles WHERE email='david9999@gmail.com'`);
    out('david9999_estado_fila', d.length ? { id: d[0].id, tenant_id: d[0].tenant_id, updated_at: d[0].updated_at,
      veredicto: d[0].tenant_id === null ? 'SIN ESCRITURA: tenant_id sigue NULL (backfill NO ejecutado — correcto)' : 'ATENCIÓN: tenant_id tiene valor' } : 'fila no encontrada');
    const aud = await sql(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action LIKE 'dt03_backfill%'`);
    out('audit_logs_dt03_backfill', { registros: aud[0].n, veredicto: aud[0].n === 0 ? 'cero rastros: backfill nunca ejecutado' : 'existen rastros de backfill' });
  } catch (e) { out('ERROR_consulta_david9999', String(e)); }

  // ── 6. Perfiles tenant-NULL (estado de los 11) ─────────────────────────
  try {
    const n = await sql(`SELECT count(*)::int AS n FROM public.profiles WHERE tenant_id IS NULL`);
    out('perfiles_tenant_null', { total: n[0].n, nota: 'debe ser 11 según clasificación DT-03; cualquier otro valor indicaría escritura no autorizada' });
  } catch (e) { out('ERROR_consulta_perfiles', String(e)); }

  // ── Guardar evidencia ────────────────────────────────────────────────
  const fs = require('fs');
  const dir = '/home/z/my-project/download/diagnostico-recuperacion-20261019';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/raw_estado_produccion_readonly.json`, JSON.stringify(evidence, null, 2));
  console.log(`\n══ Evidencia guardada: ${dir}/raw_estado_produccion_readonly.json ══`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
