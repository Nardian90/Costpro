#!/usr/bin/env node
/**
 * CP-INFRA-011 — Validador de configuración E2E para CI (sin secretos).
 * Verifica que las variables/secretos LÓGICOS requeridos existan antes de
 * ejecutar cualquier acción que pueda tocar la base. Imprime SOLO nombres
 * lógicos, jamás valores (mandato FASE 7 §8.2).
 *
 * Uso: node scripts/e2e/check-e2e-config.mjs --target project|local
 */
const argv = process.argv.slice(2);
const targetIdx = argv.indexOf('--target');
const target = argv[targetIdx + 1] || 'project';

const PROJECT_REQUIRED = [
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_ANON_KEY',
  'E2E_SUPABASE_SERVICE_ROLE_KEY',
  'E2E_ALLOWED_REMOTE_REF',
];
const LOCAL_REQUIRED = ['E2E_SUPABASE_URL'];

console.log(`[check-e2e-config] target=${target}`);
const faltan = [];
if (target === 'project') {
  for (const n of PROJECT_REQUIRED) {
    if (!(process.env[n] || '').trim()) faltan.push(n);
  }
  const kind = (process.env.E2E_TARGET_KIND || '').trim();
  if (kind !== 'project') {
    console.error(`[check-e2e-config] FALTA/INVÁLIDA variable lógica E2E_TARGET_KIND: se esperaba 'project' (valor exacto).`);
    process.exit(1);
  }
  const ref = (process.env.E2E_ALLOWED_REMOTE_REF || '').trim();
  if (ref === 'wthkddeleylijmonclxg') {
    console.error('[check-e2e-config] E2E_ALLOWED_REMOTE_REF apunta al ref de PRODUCCIÓN — ABORT (configuración adversaria).');
    process.exit(1);
  }
  const url = (process.env.E2E_SUPABASE_URL || '').trim();
  if (url.includes('wthkddeleylijmonclxg')) {
    console.error('[check-e2e-config] E2E_SUPABASE_URL apunta a PRODUCCIÓN — ABORT (sin fallback, fail-closed).');
    process.exit(1);
  }
} else if (target === 'local') {
  for (const n of LOCAL_REQUIRED) {
    if (!(process.env[n] || '').trim()) faltan.push(n);
  }
  const url = (process.env.E2E_SUPABASE_URL || '').trim();
  if (!/^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    console.error('[check-e2e-config] target=local exige una URL LOCAL (localhost/127.0.0.1). Una URL remota en modo local se rechaza fail-closed (mandato FASE 7 §8.2). Si no existe un stack local configurado, ver docs/e2e/E2E_AISLADO.md §ejecución-local (PENDING_OWNER).');
    process.exit(1);
  }
} else {
  console.error(`[check-e2e-config] target inválido: ${target} (project|local)`);
  process.exit(2);
}

if (faltan.length > 0) {
  console.error(`[check-e2e-config] FALTAN las variables lógicas: ${faltan.join(', ')}. Configure los secretos del Environment 'e2e-isolated' de GitHub (ver docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md). Ninguna acción sobre la base se ejecutará.`);
  process.exit(1);
}
console.log('[check-e2e-config] OK — configuración completa (solo nombres lógicos verificados).');
