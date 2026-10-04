#!/usr/bin/env node
/**
 * E2E-RUNNER-ISOLATION — PRUEBA DE CONCURRENCIA (FASES 9 y 10)
 * ============================================================================
 * Demuestra (o refuta) que DOS ejecuciones E2E simultáneas — cada una con su
 * identidad de run (usuarios/tenant/pilotos propios, provisionados por su
 * propio global-setup en modo aislado) — coexisten SIN contaminarse:
 *
 *   RUN A ────────────────>
 *   RUN B ────────────────>   (simultáneos, dos procesos Playwright)
 *
 * Qué verifica mientras ambos corren (FASE 9):
 *   - conteo de tiendas activas por tenant (A y B son tenants distintos);
 *   - active_store de cada admin (nunca apunta a tiendas del otro run);
 *   - las tiendas de PRUEBA de otros tenants (incluye T0 legacy) no cambian
 *     de estado (los barridos de un run no archivan los fixtures del otro).
 *
 * Qué verifica al terminar cada run (FASE 10 — cleanup cruzado):
 *   - teardown de RUN A: tenant A sin residuo activo, usuarios desactivados;
 *   - RUN B INTACTO (pilotos activos, datos presentes) tras el cleanup de A;
 *   - teardown de RUN B: tenant B sin residuo;
 *   - tiendas protegidas (TIENDA CENTRAL / Puerto Padre / ENERVIDA / pilotos
 *     legacy) idénticas al estado inicial (snapshot antes/después).
 *
 * Uso:  node e2e/scripts/concurrency-proof.cjs
 * Requisitos: servidor en localhost:3000 (pm2) + .env con credenciales
 * Supabase (service-role). Escribe evidencia en
 * test-results/concurrency-proof-evidence.json (los context files de los
 * runs viven en .e2e-run-contexts/, a salvo de la limpieza de Playwright).
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
loadEnvFile(path.join(REPO_ROOT, '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const TEST_RESULTS = path.join(REPO_ROOT, 'test-results');
// Los context files de los runs viven FUERA de test-results/ (Playwright lo
// vacía al iniciar cada corrida — borraría el context de un runner paralelo).
const RUN_CONTEXTS_DIR = path.join(REPO_ROOT, '.e2e-run-contexts');
const PLAYWRIGHT_CLI = path.join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

const PROTECTED_NAMES = [
  'TIENDA CENTRAL COSTPRO',
  'Puerto Padre VITALLCONS',
  'ENERVIDA-VITALLCONS',
  'E2E PILOT A CostPro',
  'E2E PILOT B CostPro',
];

const POLL_INTERVAL_MS = 5_000;
const OVERALL_TIMEOUT_MS = 20 * 60 * 1000;

// ── helpers ────────────────────────────────────────────────────────────────

function loadEnvFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch { /* sin .env — la validación de prerrequisitos aborta */ }
}

async function svcGet(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`SELECT falló (${res.status}): ${query.slice(0, 120)}`);
  return res.json();
}

function slug(runId) {
  return runId.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function contextPathFor(runId) {
  return path.join(RUN_CONTEXTS_DIR, `e2e-run-context-${slug(runId)}.json`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function activeStoresOfTenant(tenantId) {
  if (!tenantId) return [];
  const rows = await svcGet(`stores?select=id,name,tenant_id&is_active=eq.true&tenant_id=eq.${tenantId}`);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function protectedSnapshot() {
  const rows = await svcGet(
    `stores?select=id,name,is_active,is_archived&name=in.(${PROTECTED_NAMES.map((n) => `"${n}"`).join(',')})`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, is_active: r.is_active, is_archived: r.is_archived }));
}

function sameProtected(a, b) {
  if (a.length !== b.length) return false;
  const ka = new Map(a.map((r) => [r.id, JSON.stringify(r)]));
  return b.every((r) => ka.get(r.id) === JSON.stringify(r));
}

function log(msg) {
  console.log(`[concurrency-proof] ${msg}`);
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const evidence = {
    startedAt: new Date().toISOString(),
    runs: {},
    protectedBefore: null,
    protectedAfter: null,
    foreignTestStores: [],
    violations: [],
    runA: null,
    runB: null,
    verdict: null,
  };

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('FALTAN NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abort.');
    process.exit(1);
  }
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Servidor ${BASE_URL} no responde /api/health — arranca pm2 antes de la prueba.`);
    process.exit(1);
  }
  if (!fs.existsSync(PLAYWRIGHT_CLI)) {
    console.error('No se encontró node_modules/@playwright/test/cli.js — ejecutar bun install.');
    process.exit(1);
  }

  log(`Supabase: ${SUPABASE_URL.replace(/(https:\/\/[a-z0-9]{4})[a-z0-9]*/, '$1***')} · Servidor: ${BASE_URL} OK`);

  evidence.protectedBefore = await protectedSnapshot();
  log(`Tiendas protegidas (snapshot inicial): ${evidence.protectedBefore.length} filas`);

  const runAId = process.env.E2E_RUN_A_ID || `E2E-${ymd()}-${rand(3)}`;
  const runBId = process.env.E2E_RUN_B_ID || `E2E-${ymd()}-${rand(3)}`;
  evidence.runs[runAId] = { peer: runBId };
  evidence.runs[runBId] = { peer: runAId };

  log(`Lanzando RUN A=${runAId} y RUN B=${runBId} simultáneamente…`);

  const childA = launchRun(runAId, runBId);
  const childB = launchRun(runBId, runAId);
  evidence.runA = { id: runAId, pid: childA.pid, exitCode: null };
  evidence.runB = { id: runBId, pid: childB.pid, exitCode: null };

  const started = Date.now();
  const exited = new Map();
  const seen = { foreign: null };
  let capturedCtxA = null;
  let capturedCtxB = null;

  function launchRun(runId, peerRunId) {
    const env = {
      ...process.env,
      E2E_RUN_ID: runId,
      E2E_PEER_RUN_CONTEXT: contextPathFor(peerRunId),
      CI: 'true', // reporter line, sin retries
    };
    const child = spawn(process.execPath, [PLAYWRIGHT_CLI, 'test', 'e2e/isolation-proof.spec.ts', '--reporter=line'], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => process.stdout.write(`[RUN ${runId}] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[RUN ${runId}] ${d}`));
    child.on('exit', (code) => {
      exited.set(runId, code);
      log(`RUN ${runId} terminó (exit=${code})`);
    });
    return child;
  }

  function ymd() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
  function rand(bytes) {
    return require('crypto').randomBytes(bytes).toString('hex').toUpperCase();
  }

  // ── Monitor: mientras ambos corren, snapshots de contaminación ──────────
  while (exited.size < 2 && Date.now() - started < OVERALL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const ctxA = readJson(contextPathFor(runAId));
      const ctxB = readJson(contextPathFor(runBId));
      // Los context files se eliminan en el teardown — capturar en memoria
      // para las verificaciones post-run (FASE 10).
      if (ctxA) capturedCtxA = ctxA;
      if (ctxB) capturedCtxB = ctxB;
      const storesA = await activeStoresOfTenant(ctxA?.tenantId);
      const storesB = await activeStoresOfTenant(ctxB?.tenantId);
      evidence.runs[runAId].tenantId = ctxA?.tenantId || null;
      evidence.runs[runBId].tenantId = ctxB?.tenantId || null;

      const idsB = new Set(storesB.map((s) => s.id));
      const idsA = new Set(storesA.map((s) => s.id));
      // Contaminación directa: tiendas de A aparecen en el tenant de B (y viceversa)
      if (ctxA?.tenantId && ctxB?.tenantId && ctxA.tenantId !== ctxB.tenantId) {
        for (const s of storesA) {
          if (idsB.has(s.id)) evidence.violations.push(`store ${s.id} presente en AMBOS tenants`);
        }
      } else if (ctxA?.tenantId && ctxB?.tenantId) {
        evidence.violations.push('tenantId de A y B coinciden — no hay aislamiento de tenant');
      }

      // active_store cruzado
      if (ctxA?.users?.admin?.id && ctxB?.users?.admin?.id) {
        const profiles = await svcGet(
          `profiles?select=id,active_store_id&id=in.("${ctxA.users.admin.id}","${ctxB.users.admin.id}")`,
        );
        for (const p of profiles) {
          const isA = p.id === ctxA.users.admin.id;
          if (p.active_store_id && idsB.has(p.active_store_id)) {
            evidence.violations.push(`active_store del admin A apunta a tienda del run B (${p.active_store_id})`);
          }
          if (p.active_store_id && idsA.has(p.active_store_id) && !isA) {
            evidence.violations.push(`active_store del admin B apunta a tienda del run A (${p.active_store_id})`);
          }
        }
      }

      // Barridos: las tiendas de PRUEBA de terceros (T0 legacy) no cambian
      const foreign = await svcGet(
        `stores?select=id,is_active&is_active=eq.true&tenant_id=neq.${ctxA?.tenantId || '00000000-0000-0000-0000-000000000000'}&tenant_id=neq.${ctxB?.tenantId || '11111111-1111-1111-1111-111111111111'}&name=like.E2E*`,
      );
      const fk = foreign.map((r) => r.id).sort().join(',');
      if (seen.foreign === null) seen.foreign = fk;
      else if (seen.foreign !== fk) {
        evidence.violations.push(`el conjunto de tiendas de prueba ajenas cambió durante la corrida (${seen.foreign} → ${fk})`);
        seen.foreign = fk; // reportar una vez por cambio
      }

      log(
        `A: ${storesA.length} activas · B: ${storesB.length} activas · ajenas activas: ${foreign.length}` +
        ` · exit: ${[...exited.entries()].map(([k, v]) => `${k.slice(-6)}=${v}`).join(' ') || 'corriendo'}`,
      );
    } catch (e) {
      log(`(monitor) ${e.message}`);
    }
  }

  if (exited.size < 2) {
    childA.kill('SIGKILL');
    childB.kill('SIGKILL');
    evidence.violations.push('TIMEOUT global de la prueba de concurrencia');
  }
  evidence.runA.exitCode = exited.get(runAId) ?? 'killed';
  evidence.runB.exitCode = exited.get(runBId) ?? 'killed';

  // ── FASE 10: cleanup cruzado — A limpio, B intacto; luego B limpio ─────
  // Usa los contextos capturados DURANTE la corrida (el teardown borra los files)
  const ctxA = capturedCtxA;
  const ctxB = capturedCtxB;

  if (ctxA && ctxB) {
    const storesBAfterA = await activeStoresOfTenant(ctxB.tenantId);
    evidence.afterTeardownA = {
      tenantBActiveStores: storesBAfterA.map((s) => s.name),
      tenantBIntact:
        storesBAfterA.some((s) => s.id === ctxB.pilotStoreA.id) &&
        storesBAfterA.some((s) => s.id === ctxB.pilotStoreB.id),
    };
    if (!evidence.afterTeardownA.tenantBIntact) {
      evidence.violations.push('el teardown de RUN A dañó las tiendas de RUN B (cleanup cruzado)');
    }

    const residueA = await activeStoresOfTenant(ctxA.tenantId);
    evidence.afterTeardownA.tenantAActiveStores = residueA.map((s) => s.name);
    if (residueA.length > 0) {
      evidence.violations.push(`RUN A dejó residuo activo: ${residueA.map((s) => s.name).join(', ')}`);
    }

    const residueB = await activeStoresOfTenant(ctxB.tenantId);
    evidence.afterTeardownB = { tenantBActiveStores: residueB.map((s) => s.name) };
    if (residueB.length > 0) {
      evidence.violations.push(`RUN B dejó residuo activo: ${residueB.map((s) => s.name).join(', ')}`);
    }
  } else {
    evidence.violations.push('no se pudieron leer los contextos de ambos runs (provisionamiento fallido)');
  }

  // ── Tiendas protegidas ───────────────────────────────────────────────────
  evidence.protectedAfter = await protectedSnapshot();
  if (!sameProtected(evidence.protectedBefore, evidence.protectedAfter)) {
    evidence.violations.push('las tiendas protegidas cambiaron de estado durante la prueba');
  }

  evidence.finishedAt = new Date().toISOString();
  evidence.durationMs = Date.now() - started;
  const testsPassed =
    evidence.runA.exitCode === 0 && evidence.runB.exitCode === 0;

  evidence.verdict =
    evidence.violations.length === 0 && testsPassed
      ? 'PASS — E2E RUNNER ISOLATION PROVEN (concurrency + cross-cleanup)'
      : 'FAIL — CROSS-RUN CONTAMINATION DETECTED (ver violations)';

  fs.mkdirSync(TEST_RESULTS, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_RESULTS, 'concurrency-proof-evidence.json'),
    JSON.stringify(evidence, null, 2),
  );

  console.log('\n══════════ RESUMEN DE LA PRUEBA DE CONCURRENCIA ══════════');
  console.log(`RUN A (${runAId}): exit=${evidence.runA.exitCode}`);
  console.log(`RUN B (${runBId}): exit=${evidence.runB.exitCode}`);
  console.log(`Tenants: A=${evidence.runs[runAId].tenantId || 'n/d'} B=${evidence.runs[runBId].tenantId || 'n/d'}`);
  console.log(`RUN A tras teardown de A: ${JSON.stringify(evidence.afterTeardownA?.tenantAActiveStores || [])}`);
  console.log(`RUN B tras teardown de A (debe estar intacto): ${JSON.stringify(evidence.afterTeardownA?.tenantBActiveStores || [])}`);
  console.log(`RUN B tras teardown de B: ${JSON.stringify(evidence.afterTeardownB?.tenantBActiveStores || [])}`);
  console.log(`Protegidas idénticas: ${sameProtected(evidence.protectedBefore, evidence.protectedAfter)}`);
  if (evidence.violations.length > 0) {
    console.log('VIOLACIONES:');
    for (const v of [...new Set(evidence.violations)]) console.log(`  - ${v}`);
  }
  console.log(`VERDICT: ${evidence.verdict}`);
  console.log(`Evidencia: test-results/concurrency-proof-evidence.json`);

  process.exit(evidence.verdict.startsWith('PASS') ? 0 : 1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
