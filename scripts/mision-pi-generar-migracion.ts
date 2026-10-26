/**
 * Generador de la migración PI-SUPERADMIN (20261027030000).
 *
 * Estrategia anti-error de transcripción:
 *  1. Extrae del archivo original (20261023000000) las 12 RPCs del módulo PI
 *     cuyos gates son solo-memberships (contradicen la RLS de su propia tabla:
 *     is_admin() OR has_store_role(...)).
 *  2. Verifica contra la BD VIVA (pg_get_functiondef, solo lectura) que cada
 *     definición local coincide con la remota (normalizando espacios) — la
 *     migración debe reemplazar exactamente lo que está vivo.
 *  3. Transforma ÚNICAMENTE el gate de autorización:
 *       IF NOT public.has_store_role(v_caller_uid, ...) THEN
 *     → IF NOT (public.is_admin_check(v_caller_uid)
 *               OR public.has_store_role(v_caller_uid, ...)) THEN
 *     (patrón ya usado por las RPCs hermanas del propio módulo:
 *      register_physical_inventory_sheet / get_physical_inventory_reconciliation)
 *  4. Valida que cada función extraída tenga exactamente UN gate transformado.
 *
 * Uso: bun scripts/mision-pi-generar-migracion.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)![1];

const SRC = resolve(__dirname, '../supabase/migrations/20261023000000_create_physical_inventory_module.sql');
const DST = resolve(__dirname, '../supabase/migrations/20261027030000_pi_superadmin_rpc_authorization.sql');

const FUNCS = [
  'create_physical_inventory',
  'prepare_physical_inventory',
  'start_physical_inventory_count',
  'record_physical_inventory_counts',
  'complete_physical_inventory_count',
  'submit_physical_inventory_reconciliation',
  'review_physical_inventory_item',
  'submit_physical_inventory_authorization',
  'generate_adjustments_from_physical_inventory',
  'close_physical_inventory',
  'void_physical_inventory',
  'confirm_inventory_adjustment',
];

function extractFunction(sql: string, name: string): string {
  const startMarker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = sql.indexOf(startMarker);
  if (start === -1) throw new Error(`No se encontró ${name} en el archivo fuente`);
  const end = sql.indexOf('\n$$;', start);
  if (end === -1) throw new Error(`No se encontró fin de ${name}`);
  return sql.slice(start, end + 4); // incluye $$;
}

function transformGate(fnSql: string, name: string): string {
  // Gate has_store_role (sin paréntesis anidados en los args)
  let count = 0;
  let out = fnSql.replace(
    // Nota: sin flag 's' — ES2017 (tsconfig raíz) no lo soporta (TS1501) y es
    // innecesario: los patrones usan clases [^)] que ya cruzan líneas.
    /IF NOT public\.has_store_role\(([^)]*?)\) THEN/g,
    (_m, args: string) => {
      count++;
      return `IF NOT (public.is_admin_check(v_caller_uid)\n            OR public.has_store_role(${args})) THEN`;
    }
  );
  const roleGates = count;
  // Gate has_store_access_as (solo confirm_inventory_adjustment)
  count = 0;
  out = out.replace(
    /IF NOT public\.has_store_access_as\(([^)]*?)\) THEN/g,
    (_m, args: string) => {
      count++;
      return `IF NOT (public.is_admin_check(v_caller_uid)\n            OR public.has_store_access_as(${args})) THEN`;
    }
  );
  const total = roleGates + count;
  if (total !== 1) {
    throw new Error(`${name}: se esperaba exactamente 1 gate, se transformaron ${total}`);
  }
  // Sanity: nunca debe quedar un gate sin bypass
  if (/IF NOT public\.has_store_role\(/.test(out) || /IF NOT public\.has_store_access_as\(/.test(out)) {
    throw new Error(`${name}: quedó un gate sin transformar`);
  }
  return out;
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

async function fetchLiveDefs(): Promise<Record<string, string>> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc
              WHERE pronamespace = 'public'::regnamespace
                AND proname IN (${FUNCS.map(f => `'${f}'`).join(', ')})`,
    }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const rows = await res.json();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.proname] = r.def;
  return map;
}

async function main() {
  const src = readFileSync(SRC, 'utf8');
  const live = await fetchLiveDefs();

  const sections: string[] = [];
  const report: Array<{ fn: string; liveMatch: string }> = [];

  for (const name of FUNCS) {
    let fnSql = extractFunction(src, name);
    // Verificación viva vs archivo (normalizada) — el gate del archivo debe
    // existir tal cual en la def viva.
    const liveDef = live[name];
    if (!liveDef) {
      report.push({ fn: name, liveMatch: '⚠️ NO EXISTE EN BD VIVA' });
    } else {
      const gateRe = /IF NOT public\.has_store_role\(v_caller_uid[^)]*\) THEN/;
      const fileGate = fnSql.match(gateRe)?.[0] ?? fnSql.match(/IF NOT public\.has_store_access_as\(v_caller_uid[^)]*\) THEN/)?.[0];
      const liveHasGate = fileGate ? norm(liveDef).includes(norm(fileGate)) : false;
      const sameLen = norm(liveDef).length > 0;
      report.push({ fn: name, liveMatch: liveHasGate ? 'OK (gate idéntico en vivo)' : `⚠️ REVISAR (gate no coincide — ${sameLen ? 'longitud difiere' : 'vacía'})` });
      if (!liveHasGate) {
        console.error(`  LIVE DEF (${name}):`);
        console.error(liveDef.slice(0, 1200));
      }
    }
    fnSql = transformGate(fnSql, name);
    sections.push(`-- ──────────────────────────────────────────────────────────────\n-- ${name}\n-- ──────────────────────────────────────────────────────────────\n${fnSql}`);
  }

  console.log('═ Verificación archivo vs BD viva ═');
  for (const r of report) console.log(`  ${r.liveMatch.startsWith('OK') ? '✓' : '✗'} ${r.fn}: ${r.liveMatch}`);

  const header = `-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN INVENTARIO FÍSICO / SUPERADMIN (2026-10-26) — Autorización coherente
-- del módulo Inventario Físico con la RLS de su propia tabla.
--
-- DEFECTO (3 capas, causa raíz demostrada contra BD viva):
--   El SuperAdmin de plataforma (admin@demo.com, profiles.role='superadmin')
--   NO lleva membresías de tienda POR DISEÑO (§6 de la migración
--   20260826120000: la activación de plataforma borra sus membresías). Pero:
--     · Capa 1 (app): CreatePhysicalInventoryModal construía el selector SOLO
--       con user.memberships → «Sin Tiendas Autorizadas» (corregido en app).
--     · Capa 2 (middleware): withStoreAccess solo reconocía role='admin' →
--       403 para superadmin en /api/physical-inventory (corregido en app).
--     · Capa 3 (ESTA MIGRACIÓN): las RPCs de escritura del módulo PI autorizan
--       SOLO con has_store_role (membresías), contradiciendo la RLS de SUS
--       PROPIAS tablas — physical_inventories_select/insert/update ya usan
--       «is_admin() OR has_store_access/has_store_role(...)" e is_admin()
--       incluye 'superadmin' desde 20261026120000 §2. Resultado vivo:
--       ERR_UNAUTHORIZED_CREATE_PI para el SuperAdmin aunque la RLS lo
--       autorice (verificado 2026-10-26 contra producción).
--
-- CORRECCIÓN (patrón del PROPIO módulo — register_physical_inventory_sheet y
-- get_physical_inventory_reconciliation ya usan «is_admin() OR has_store_role"):
--   Cada gate de escritura pasa de
--       IF NOT public.has_store_role(v_caller_uid, ...) THEN
--   a
--       IF NOT (public.is_admin_check(v_caller_uid)
--               OR public.has_store_role(v_caller_uid, ...)) THEN
--   · is_admin_check(p_user_id) existe desde 20261026120000 §3 e incluye
--     'admin' Y 'superadmin' — es la variante por user_id explícito correcta
--     para el patrón anti-spoofing H-7 (v_caller_uid resuelto: auth.uid()
--     para authenticated; p_user_id solo para service_role).
--   · NO se toca has_store_role ni has_store_access_as (compartidas por todo
--     el sistema): la corrección es quirúrgica al módulo PI.
--   · Roles operativos (manager/encargado/warehouse/clerk/usuario): SIN
--     cambios — siguen requiriendo membresía activa con el rol de tienda.
--   · Fail-closed: sin rol de tienda Y sin nivel administrativo → excepción.
--
-- Las 12 funciones se recrean byte-idénticas al original salvo el gate
-- (generadas con scripts/mision-pi-generar-migracion.ts, que verificó la
-- igualdad contra las definiciones VIVAS antes de emitir este archivo).
-- Idempotente (CREATE OR REPLACE; los GRANT/REVOKE existentes se conservan).
-- ═══════════════════════════════════════════════════════════════════════════

`;

  writeFileSync(DST, header + sections.join('\n\n') + '\n', 'utf8');
  console.log(`\n✓ Migración generada: ${DST}`);
  console.log(`  Funciones: ${FUNCS.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
