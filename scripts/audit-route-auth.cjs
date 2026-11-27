#!/usr/bin/env node
/**
 * audit-route-auth.cjs — Control automatizado SEC-003 (CP-BRA-001):
 * "Autenticación fail-closed server-side con wrappers únicos" —
 * la regla de aceptación "SIN WRAPPER = NO MERGE" se aplica en CI.
 *
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 FASE 2 (§4).
 *
 * Clasificación de cada route.ts bajo src/app/api (una clase OBLIGATORIA):
 *   WRAPPER  — usa conAuth/withRole/withStoreAccess (HOF canónica).
 *   SESSION  — getServerSession + 401 fail-closed (mecanismo propio).
 *   CRON     — CRON_SECRET / x-vercel-signature con rechazo fail-closed.
 *   WEBHOOK  — verificación de firma (Stripe / Telegram secret token).
 *   PUBLIC   — allowlist explícita con razón documentada (this script's
 *              ROUTE_AUTH_PUBLIC_ALLOWLIST: público por diseño, con
 *              rate-limit cuando el rationale lo exige).
 *
 * Exit codes: 0 = cobertura completa; 1 = ruta sin clase (BLOQUEA el build).
 * Re-ejecutable y determinista (solo lee el árbol src/app/api).
 *
 * Uso: node scripts/audit-route-auth.cjs
 */
const fs = require('fs');
const path = require('path');

const API_BASE = path.join(__dirname, '..', 'src', 'app', 'api');

// ── Allowlist de rutas PÚBLICAS por diseño (fail-closed con evidencia) ──
// Toda entrada necesita: reason (por qué es pública), added_by, expires y
// rate_limit=true cuando la protección es el rate limit (no el auth).
const ROUTE_AUTH_PUBLIC_ALLOWLIST = [
  { route: 'health', reason: 'healthcheck del servicio (GET /api/health) — público por diseño; expone solo status ok (CP-INFRA arranque PM2/healthcheck)', added_by: 'CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 SEC-003', expires: '2027-06-30', rate_limit: false },
  { route: 'help-docs', reason: 'documentación de ayuda pública — sin datos de negocio (comentario documentado en el propio archivo)', added_by: 'CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 SEC-003', expires: '2027-06-30', rate_limit: false },
  { route: 'storefront/[slug]', reason: 'superficie pública de tiendas (vista) — CP-SEC-027: anon ya no tiene acceso a la API; rate limit anti-scraping (FIX-AUDIT-4)', added_by: 'CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 SEC-003', expires: '2027-06-30', rate_limit: true },
  { route: 'bot/chat', reason: 'chat del bot público con rate limit por sesión/IP (clientId) — sin datos de negocio en la respuesta', added_by: 'CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 SEC-003', expires: '2027-06-30', rate_limit: true },
  { route: 'logs', reason: 'ingesta de logs de cliente con rate limit por IP bajo (BUG-027) — payload limitado y validado', added_by: 'CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 SEC-003', expires: '2027-06-30', rate_limit: true },
];

function walkRouteFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkRouteFiles(p));
    else if (e.isFile() && e.name === 'route.ts') out.push(p);
  }
  return out;
}

function classify(relPath, text) {
  const checks = {
    WRAPPER: /withAuth\s*\(|withRole\s*\(|withStoreAccess\s*\(/.test(text),
    SESSION: /getServerSession\s*\(/.test(text) && /401/.test(text),
    CRON: (/CRON_SECRET/.test(text) || /x-vercel-signature/.test(text)) && /401|Unauthorized/i.test(text),
    WEBHOOK: /verifyWebhookSignature|stripe-signature|validateWebhookSecret|X-Telegram-Bot-Api-Secret-Token/.test(text),
  };
  for (const [k, v] of Object.entries(checks)) if (v) return k;
  return null;
}

const files = walkRouteFiles(API_BASE).sort();
const rows = [];
const problems = [];

for (const f of files) {
  const rel = path.relative(API_BASE, f).replace(/\/route\.ts$/, '').replace(/\\/g, '/');
  const routeKey = rel === 'route.ts' ? '' : rel;
  const text = fs.readFileSync(f, 'utf8');
  let cls = classify(routeKey, text);
  if (!cls) {
    const allow = ROUTE_AUTH_PUBLIC_ALLOWLIST.find((a) => a.route === routeKey);
    if (allow) {
      if (allow.rate_limit && !/rateLimit|rate-limit|Rate limit/i.test(text)) {
        problems.push(`PUBLIC ${routeKey}: su rationale exige rate-limit pero el archivo no lo aplica`);
      }
      cls = 'PUBLIC';
    } else {
      problems.push(`SIN CLASE: /api/${routeKey || ''} no usa wrappers canónicos (withAuth/withRole/withStoreAccess), ni mecanismo propio verificable (getServerSession+401 / CRON_SECRET / firma de webhook), ni está en la allowlist PUBLIC documentada — SEC-003 "sin wrapper = no merge"`);
      rows.push({ route: routeKey || '/', cls: 'NINGUNA' });
      continue;
    }
  }
  rows.push({ route: routeKey || '/', cls });
}

// ── Salida ──
const byClass = {};
for (const r of rows) byClass[r.cls] = (byClass[r.cls] || 0) + 1;

console.log('=== SEC-003 · Cobertura de autenticación de rutas API (fail-closed) ===');
console.log(`Total de rutas: ${rows.length}`);
for (const [k, v] of Object.entries(byClass)) console.log(`  ${k.padEnd(8)} ${v}`);
console.log('');
console.log('Allowlist PUBLIC documentada:');
for (const a of ROUTE_AUTH_PUBLIC_ALLOWLIST) console.log(`  /api/${a.route} — ${a.reason} (expires ${a.expires})`);

if (problems.length) {
  console.log('\n=== HALLAZGOS BLOQUEANTES ===');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\nSEC-003 AUDIT: FAIL — ${problems.length} hallazgo(s). Una ruta nueva SIN wrapper ni mecanismo propio no puede fusionarse ("sin wrapper = no merge").`);
  process.exit(1);
}

console.log('\nSEC-003 AUDIT: PASS — cobertura completa (wrapper canónico, mecanismo propio verificado o público documentado).');
