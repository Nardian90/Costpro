/**
 * Test de contrato automático (CI gate) — BOLA protection en API routes
 *
 * V2.12.38: Verifica que todo endpoint bajo /api/production-orders/[id]/...
 * y /api/accounts-receivable que recibe un ID de recurso multi-tenant
 * contenga el guard explícito:
 *
 *   if (order.store_id !== userData.active_store_id) return 403
 *   o
 *   if (store_id !== userData.active_store_id) return 403
 *
 * Esto cierra el hueco BOLA (Broken Object Level Authorization) que
 * se detectó manualmente por tercera vez. RLS actúa de red de seguridad
 * pero este test asegura defense-in-depth a nivel de aplicación.
 *
 * Ejecución:
 *   node scripts/bola-contract-test.cjs
 *
 * Exit codes:
 *   0 = todos los endpoints pasan
 *   1 = al menos un endpoint falla (build bloqueado)
 */
const fs = require('fs');
const path = require('path');

const API_BASE = path.join(__dirname, '..', 'src', 'app', 'api');

// Endpoints multi-tenant que DEBEN tener BOLA guard
const ENDPOINTS_TO_CHECK = [
  {
    path: 'production-orders/[id]/route.ts',
    description: 'GET/PATCH /api/production-orders/[id]',
    guardPatterns: [
      'order.store_id !== userData.active_store_id',
      'order.store_id !== userData?.active_store_id',
    ],
    minGuards: 2, // GET + PATCH deben tenerlo
  },
  {
    path: 'production-orders/[id]/payments/route.ts',
    description: 'POST /api/production-orders/[id]/payments',
    guardPatterns: [
      'order.store_id !== userData.active_store_id',
      'order.store_id !== userData?.active_store_id',
    ],
    minGuards: 1,
  },
  {
    path: 'production-orders/[id]/void/route.ts',
    description: 'POST /api/production-orders/[id]/void',
    guardPatterns: [
      'order.store_id',
      'membership',
    ],
    minGuards: 1,
  },
  {
    path: 'production-orders/[id]/pdf/route.ts',
    description: 'GET /api/production-orders/[id]/pdf',
    guardPatterns: [
      'membership',
      'order.store_id',
    ],
    minGuards: 1,
  },
  {
    path: 'accounts-receivable/route.ts',
    description: 'GET /api/accounts-receivable',
    guardPatterns: [
      'store_id !== userData.active_store_id',
      'store_id !== userData?.active_store_id',
    ],
    minGuards: 1,
  },
];

let passed = 0;
let failed = 0;
const failures = [];

console.log('═'.repeat(70));
console.log('🔒 BOLA Contract Test — Verificación de store_id guards');
console.log('═'.repeat(70));

for (const endpoint of ENDPOINTS_TO_CHECK) {
  const filePath = path.join(API_BASE, endpoint.path);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  SKIP: ${endpoint.path} (archivo no existe)`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Contar cuántos guards hay
  let guardCount = 0;
  for (const pattern of endpoint.guardPatterns) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) guardCount += matches.length;
  }

  if (guardCount >= endpoint.minGuards) {
    console.log(`  ✅ ${endpoint.description}: ${guardCount} guard(s) encontrado(s)`);
    passed++;
  } else {
    console.log(`  ❌ ${endpoint.description}: solo ${guardCount} guard(s), esperaba ≥${endpoint.minGuards}`);
    failures.push({
      endpoint: endpoint.description,
      file: endpoint.path,
      found: guardCount,
      expected: endpoint.minGuards,
    });
    failed++;
  }
}

console.log('═'.repeat(70));
console.log(`Resultados: ${passed} pasaron, ${failed} fallaron`);

if (failed > 0) {
  console.log('\nEndpoints que fallaron:');
  failures.forEach(f => {
    console.log(`  ❌ ${f.endpoint} (${f.file})`);
    console.log(`     Encontrados: ${f.found}, Esperados: ≥${f.expected}`);
    console.log(`     Fix: añadir 'if (order.store_id !== userData.active_store_id) return 403'`);
  });
  console.log('\n🚫 BUILD BLOQUEADO — fix los guards antes de deployar');
  process.exit(1);
} else {
  console.log('\n✅ Todos los endpoints tienen BOLA guard explícito');
  process.exit(0);
}
