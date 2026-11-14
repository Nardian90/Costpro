#!/usr/bin/env node
/**
 * rate-limit-concurrency-proof.mjs — CP-SEC-RATELIMIT
 *
 * PRUEBA DE CONCURRENCIA REAL ENTRE PROCESOS (misión §6.11):
 * demuestra que el límite se COMPARTE entre procesos/instancias usando el
 * almacén PostgreSQL (RPC rate_limit_take). Si cada proceso tuviera su
 * propio contador en memoria, el total permitido sería (procesos × límite);
 * con el almacén compartido el total permitido es EXACTAMENTE el límite.
 *
 * Diseño:
 *   · N procesos hijo independientes (child_process.fork) golpean la MISMA
 *     clave con el MISMO límite, en ráfaga concurrente.
 *   · Cada hijo informa de cuántas de sus llamadas fueron permitidas.
 *   · El padre verifica además el estado final en la tabla (count == total
 *     de llamadas) y que el total permitido == límite exacto.
 *
 * Requisitos de entorno (BD aislada E2E — PROHIBIDO producción):
 *   E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY
 *   (o NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY apuntando a la
 *    BD aislada). Fail-closed: si no hay entorno, EXIT 1 con mensaje.
 *
 * Uso: node scripts/rate-limit-concurrency-proof.mjs [procesos] [llamadasPorProceso] [limite]
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

const N_PROCESOS = Number(process.argv[2] || 4);
const LLAMADAS_POR_PROCESO = Number(process.argv[3] || 8);
const LIMITE = Number(process.argv[4] || 10);

const SUPABASE_URL = process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// GUARD CANÓNICO DEL REPO (CP-INFRA-011): fail-closed contra producción.
// Este script ESCRIBE contadores de rate limit: solo BD aislada CostproE2E.
const { assertIsolatedDb } = await import(
  join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs')
);
if (typeof assertIsolatedDb !== 'function') {
  console.error('FALLO DE SEGURIDAD: no se pudo cargar e2e/fixtures/assert-isolated-db.cjs (guard canónico). Abortando.');
  process.exit(2);
}
await assertIsolatedDb();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FALLO: faltan E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
if (N_PROCESOS < 2) {
  console.error('FALLO: la prueba requiere >= 2 procesos (no tendría sentido de concurrencia).');
  process.exit(1);
}

const CLAVE = `concurrencia-prueba:${Date.now()}`;
const totalLlamadas = N_PROCESOS * LLAMADAS_POR_PROCESO;

console.log(`[PROOF] ${N_PROCESOS} procesos × ${LLAMADAS_POR_PROCESO} llamadas, límite ${LIMITE}, clave compartida ${CLAVE}`);
console.log(`[PROOF] Memoria por instancia permitiría ~${N_PROCESOS * LIMITE}; el almacén compartido debe permitir EXACTAMENTE ${LIMITE}.`);

// ── Hijo: hace sus llamadas en ráfaga y reporta cuántas fueron permitidas ──
const CHILD_SOURCE = `
const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
const SERVICE_KEY = ${JSON.stringify(SERVICE_KEY)};
const CLAVE = ${JSON.stringify(CLAVE)};
const LIMITE = ${LIMITE};
const LLAMADAS = ${LLAMADAS_POR_PROCESO};

(async () => {
  let permitidas = 0;
  const promesas = [];
  for (let i = 0; i < LLAMADAS; i++) {
    promesas.push(
      fetch(SUPABASE_URL + '/rest/v1/rpc/rate_limit_take', {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_bucket_key: CLAVE, p_limit: LIMITE, p_window_seconds: 60 }),
      })
        .then(r => r.json())
        .then(j => { if (j && j.allowed) permitidas++; })
        .catch(() => {})
    );
  }
  await Promise.all(promesas);
  process.send({ permitidas });
})();
`;

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const tmpDir = mkdtempSync(join(tmpdir(), 'rl-proof-'));
const childFile = join(tmpDir, 'child.mjs');
writeFileSync(childFile, CHILD_SOURCE);

try {
  const results = await Promise.all(
    Array.from({ length: N_PROCESOS }, () =>
      new Promise((resolve) => {
        const child = fork(childFile, { stdio: 'inherit' });
        child.on('message', resolve);
        child.on('exit', (code) => {
          if (code !== 0) resolve({ permitidas: -1 });
        });
      })
    )
  );

  const permitidasPorProceso = results.map((r) => r?.permitidas ?? -1);
  const totalPermitidas = permitidasPorProceso.reduce((a, b) => a + b, 0);

  console.log(`[PROOF] Permitidas por proceso: ${JSON.stringify(permitidasPorProceso)}`);
  console.log(`[PROOF] Total permitidas: ${totalPermitidas} / ${totalLlamadas} llamadas (límite ${LIMITE})`);

  // Verificación del estado final en la tabla compartida
  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limit_buckets?bucket_key=eq.${encodeURIComponent(CLAVE)}&select=window_start,hits`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const buckets = await check.json();
  const hitsTotal = Array.isArray(buckets) ? buckets.reduce((a, b) => a + Number(b.hits || 0), 0) : -1;
  console.log(`[PROOF] Contador final en la tabla compartida: ${hitsTotal} (esperado ${totalLlamadas})`);

  let exitCode = 0;
  if (totalPermitidas !== LIMITE) {
    console.error(`[PROOF] FALLO: el total permitido (${totalPermitidas}) ≠ límite (${LIMITE}). Si fuera ~${N_PROCESOS * LIMITE}, cada proceso habría contado por separado (limiter NO distribuido).`);
    exitCode = 1;
  }
  if (hitsTotal !== totalLlamadas) {
    console.error(`[PROOF] FALLO: el contador compartido (${hitsTotal}) ≠ total de llamadas (${totalLlamadas}).`);
    exitCode = 1;
  }
  if (permitidasPorProceso.some((p) => p < 0)) {
    console.error('[PROOF] FALLO: algún proceso hijo no completó.');
    exitCode = 1;
  }
  if (exitCode === 0) {
    console.log(`[PROOF] PASS — el límite se comparte entre los ${N_PROCESOS} procesos: exactamente ${LIMITE} permitidas, contador atómico exacto.`);
  }
  process.exit(exitCode);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
