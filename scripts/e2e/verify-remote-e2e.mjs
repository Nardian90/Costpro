#!/usr/bin/env node
/**
 * CP-INFRA-011 — Verificación REST del proyecto E2E aislado para CI.
 * SOLO lectura vía REST (PostgREST) con la service_role key del entorno
 * `e2e-isolated` — sin Management API, sin acceso directo a la BD, sin
 * secretos del propietario. CI nunca aplica migraciones: la preparación la
 * realiza el apilador local del propietario/agente (mandato FASE 7 §8.2:
 * el workflow VERIFICA el proyecto remoto, no lo construye).
 *
 * Verifica:
 *   1. Identidad: ref de la URL == E2E_ALLOWED_REMOTE_REF (igualdad exacta,
 *      ≠ producción wthkddeleylijmonclxg) — sin conectar a producción.
 *   2. Centinela: POST /rest/v1/rpc/e2e_is_isolated_db === true.
 *   3. Sanidad REST: la raíz de la API responde (200/401 — nunca 5xx).
 *
 * Uso: node scripts/e2e/verify-remote-e2e.mjs  (exit 0 = base preparada)
 */
const PROD = 'wthkddeleylijmonclxg';
const url = (process.env.E2E_SUPABASE_URL || '').trim();
const key = (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '').trim();
const allowed = (process.env.E2E_ALLOWED_REMOTE_REF || '').trim();

function fail(msg) {
  console.error(`[verify-remote-e2e] FALLO: ${msg}`);
  process.exit(1);
}
if (!url) fail('FALTA E2E_SUPABASE_URL (secret del Environment e2e-isolated).');
if (!key) fail('FALTA E2E_SUPABASE_SERVICE_ROLE_KEY (secret del Environment e2e-isolated).');
if (!allowed) fail('FALTA E2E_ALLOWED_REMOTE_REF (secret del Environment e2e-isolated).');
if (url.includes(PROD) || allowed === PROD) fail('la configuración apunta a PRODUCCIÓN — ABORT INMEDIATO (sin conectar).');
const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (ref !== allowed) fail(`el ref de la URL (${ref || '?'}) no coincide EXACTAMENTE con E2E_ALLOWED_REMOTE_REF (igualdad exacta, sin comparaciones parciales).`);

const r1 = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, { headers: { apikey: key } });
if (r1.status >= 500) fail(`la API REST responde HTTP ${r1.status} — ¿proyecto detenido/pausado?`);

const r2 = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/e2e_is_isolated_db`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}',
});
if (r2.status === 404) fail('la RPC public.e2e_is_isolated_db NO existe: la base aislada NO está preparada. Ejecute la preparación (docs/e2e/E2E_AISLADO.md §preparación-inicial) — CI no construye la base (PENDING_OWNER si falta preparación).');
if (!r2.ok) fail(`el centinela responde HTTP ${r2.status}.`);
const data = await r2.json();
if (data !== true) fail(`el centinela NO devolvió true (obtuvo: ${JSON.stringify(data)}). Destino no certificado — fail-closed.`);
console.log(`[verify-remote-e2e] OK — ref=${ref} verificado, centinela=true, REST ${r1.status}. Base aislada PREPARADA.`);
process.exit(0);
