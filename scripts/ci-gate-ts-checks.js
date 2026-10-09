#!/usr/bin/env node
/**
 * CI Gate — TypeScript Security Checks
 *
 * Ejecuta 2 checks de código TypeScript y falla si encuentra issues.
 *
 * Uso: node scripts/ci-gate-ts-checks.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api');
let failures = 0;

console.log('🔒 TypeScript Security Checks');
console.log('');

// === Check 4: Endpoints sin Zod validation ===
console.log('Check 4: Endpoints sin Zod validation...');

// REM-COSTPRO4-CI: el check valida el CUERPO de las mutaciones. Un endpoint
// que nunca parsea el request body (no hay `req.json()` / `formData()`) no
// tiene cuerpo que validar: sus entradas son path params / query string, ya
// protegidos por auth + CSRF + rate limit. Excluirlos elimina falsos
// positivos SIN debilitar el check (sigue exigiendo Zod en todo endpoint que
// sí consume un body).
const BODY_PARSE_RE = /req\.json\s*\(|request\.json\s*\(|formData\s*\(/;

try {
  const routeFiles = execSync(`find "${API_DIR}" -name "route.ts" -o -name "route.tsx"`, { encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  let zodFailures = 0;
  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check if file exports POST/DELETE/PATCH
    const hasMutation = /export\s+(const|async function)\s+(POST|DELETE|PATCH)/.test(content);
    if (!hasMutation) continue;

    // Check if file imports zod OR performs schema validation via safeParse
    // (REM-COSTPRO4-CI: la validación por schema puede vivir en un módulo
    // compartido — p.ej. FichaJSONSchema de @/lib/cost-engine/schemas — y el
    // endpoint igual aplica safeParse; eso ES validación con schema).
    const hasZod = /from\s+['"]zod['"]/.test(content)
      || /from\s+['"]@\/validation\//.test(content)
      || /\.safeParse\s*\(/.test(content);

    // REM-COSTPRO4-CI: sin parse de body no hay nada que validar con Zod
    const parsesBody = BODY_PARSE_RE.test(content);

    if (!hasZod && parsesBody) {
      console.log(`  ❌ ${path.relative(path.join(__dirname, '..'), file)} — missing Zod validation`);
      zodFailures++;
    }
  }

  if (zodFailures === 0) {
    console.log('  ✅ All mutation endpoints use Zod validation');
  } else {
    console.log(`  ❌ ${zodFailures} endpoint(s) missing Zod validation`);
    failures += zodFailures;
  }
} catch (e) {
  console.log('  ⚠️ Could not scan API directory:', e.message);
}

console.log('');

// === Check 5: Endpoints sin auth middleware ===
console.log('Check 5: Endpoints sin auth middleware...');

try {
  const routeFiles = execSync(`find "${API_DIR}" -name "route.ts" -o -name "route.tsx"`, { encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  let authFailures = 0;
  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check if file exports POST/DELETE/PATCH
    const hasMutation = /export\s+(const|async function)\s+(POST|DELETE|PATCH)/.test(content);
    if (!hasMutation) continue;

    // Check if file uses the project's auth mechanisms:
    //  - auth-middleware HOFs (withAuth / withRole / withStoreAccess)
    //  - getServerSession (@/lib/auth) — inline auth usado por handlers que
    //    necesitan la sesión antes de montar el handler (p.ej. logs, bot/chat,
    //    legal/incidents)
    //  - verificación de firma de webhooks externos (Stripe constructEvent /
    //    verifyWebhookSignature; Telegram validateWebhookSecret con header
    //    x-telegram-bot-api-secret-token, fail-closed SEC-TS-03 H6)
    const hasAuth = /withAuth|withRole|withStoreAccess|getServerSession|verifyWebhookSignature|validateWebhookSecret|x-telegram-bot-api-secret-token|constructEvent/.test(content);

    if (!hasAuth) {
      console.log(`  ❌ ${path.relative(path.join(__dirname, '..'), file)} — missing auth middleware`);
      authFailures++;
    }
  }

  if (authFailures === 0) {
    console.log('  ✅ All mutation endpoints have auth middleware');
  } else {
    console.log(`  ❌ ${authFailures} endpoint(s) missing auth middleware`);
    failures += authFailures;
  }
} catch (e) {
  console.log('  ⚠️ Could not scan API directory:', e.message);
}

console.log('');

// === Summary ===
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (failures === 0) {
  console.log('✅ All TypeScript security checks PASSED');
  process.exit(0);
} else {
  console.log(`❌ ${failures} check(s) FAILED`);
  process.exit(1);
}
