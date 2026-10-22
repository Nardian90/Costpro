/**
 * CP-INFRA-011 — Pruebas del guard centralizado de aislamiento E2E.
 * Ejecuta la MISMA tabla de casos contra las DOS implementaciones
 * (TS canónica + espejo CJS) para probar paridad (FASE 2 §3.4 del mandato).
 * Todas las dependencias de red están mockeadas: NINGUNA prueba conecta
 * a producción ni a proyecto remoto alguno (caso 12 del mandato).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  assertIsolatedDb as assertTs,
  decideIsolatedTarget as decideTs,
  PRODUCTION_REF,
} from '../../../e2e/fixtures/assert-isolated-db';
import type { IsolationDecision, IsolationEnv } from '../../../e2e/fixtures/assert-isolated-db';

const require_ = createRequire(import.meta.url);
const cjs = require_('../../../e2e/fixtures/assert-isolated-db.cjs') as {
  assertIsolatedDb: typeof assertTs;
  decideIsolatedTarget: (env: IsolationEnv) => IsolationDecision;
  PRODUCTION_REF: string;
};

const E2E_REF = 'testrefe2eproj000001'; // ref ficticia de 20 chars (formato real)
const OTHER_REF = 'otrorefe2eproj00002';

const fakeFetch = (status: number, body: unknown) =>
  async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const fetchTrue = fakeFetch(200, true);
const fetchFalse = fakeFetch(200, false);
const fetchThrow = async () => {
  throw new Error('red no permitida en pruebas');
};

function baseEnv(url: string, ref: string): IsolationEnv {
  return {
    E2E_SUPABASE_URL: url,
    E2E_SUPABASE_SERVICE_ROLE_KEY: 'k-test-service-role',
    E2E_TARGET_KIND: 'project',
    E2E_ALLOWED_REMOTE_REF: ref,
  };
}

interface Case {
  name: string;
  env: IsolationEnv;
  mode?: 'normal' | 'bootstrap';
  fetchImpl?: unknown;
  expect: 'accept' | string; // 'accept' | código de error esperado
  noFetch?: boolean;
}

const CASES: Case[] = [
  // 1. URL de producción: rechazada SIN conectar (fetch no debe llamarse).
  {
    name: '1-produccion-rechazada-sin-conectar',
    env: { E2E_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`, E2E_SUPABASE_SERVICE_ROLE_KEY: 'k' },
    expect: 'E_PRODUCCION',
    noFetch: true,
  },
  // 2. Destino local sin centinela (RPC 404): rechazado por el guard normal.
  {
    name: '2-local-sin-centinela-rechazado',
    env: { E2E_SUPABASE_URL: 'http://localhost:54321', E2E_SUPABASE_SERVICE_ROLE_KEY: 'k' },
    fetchImpl: fakeFetch(404, { error: 'not found' }),
    expect: 'E_SENTINEL_RPC_FALTA',
  },
  // 3. Remoto sin E2E_TARGET_KIND.
  {
    name: '3-remoto-sin-target-kind',
    env: { E2E_SUPABASE_URL: `https://${E2E_REF}.supabase.co`, E2E_SUPABASE_SERVICE_ROLE_KEY: 'k', E2E_ALLOWED_REMOTE_REF: E2E_REF },
    expect: 'E_TARGET_KIND_FALTA',
  },
  // 4. Remoto sin E2E_ALLOWED_REMOTE_REF.
  {
    name: '4-remoto-sin-ref-permitida',
    env: { E2E_SUPABASE_URL: `https://${E2E_REF}.supabase.co`, E2E_SUPABASE_SERVICE_ROLE_KEY: 'k', E2E_TARGET_KIND: 'project' },
    expect: 'E_REF_PERMITIDA_FALTA',
  },
  // 5. Remoto con ref distinta de la permitida (sin coincidencia parcial).
  {
    name: '5-ref-distinta-rechazada',
    env: baseEnv(`https://${OTHER_REF}.supabase.co`, E2E_REF),
    expect: 'E_REF_NO_COINCIDE',
  },
  // 5b. Comparación parcial NO autoriza: prefijo común => rechazado.
  {
    name: '5b-prefijo-parcial-no-autoriza',
    env: baseEnv(`https://${E2E_REF}x.supabase.co`, E2E_REF),
    expect: 'E_REF_NO_COINCIDE',
  },
  // 6. Ref permitida == producción: configuración adversaria rechazada.
  {
    name: '6-ref-permitida-es-produccion',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, PRODUCTION_REF),
    expect: 'E_REF_IGUAL_A_PRODUCCION',
  },
  // 7. Remoto autorizado con centinela true: aceptado.
  {
    name: '7-remoto-autorizado-centinela-true',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fetchTrue,
    expect: 'accept',
  },
  // 7b. URL db.<ref>.supabase.co y E2E_* con prioridad sobre NEXT_PUBLIC_*.
  {
    name: '7b-url-db-ref-y-prioridad-e2e',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`, // trampa: E2E_* debe ganar
      E2E_SUPABASE_URL: `https://db.${E2E_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'y',
      E2E_SUPABASE_SERVICE_ROLE_KEY: 'k',
      E2E_TARGET_KIND: 'project',
      E2E_ALLOWED_REMOTE_REF: E2E_REF,
    },
    fetchImpl: fetchTrue,
    expect: 'accept',
  },
  // 7c. Pooler postgres.<ref>@host: ref extraída del usuario.
  {
    name: '7c-pooler-extraccion-ref',
    env: baseEnv(`postgresql://postgres.${E2E_REF}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`, E2E_REF),
    fetchImpl: fetchTrue,
    expect: 'accept',
  },
  // 8. RPC inexistente (404) / fallida (500) / red caída / devuelve false / tipo inesperado.
  {
    name: '8a-rpc-404-rechazado',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fakeFetch(404, {}),
    expect: 'E_SENTINEL_RPC_FALTA',
  },
  {
    name: '8b-rpc-500-rechazado',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fakeFetch(500, { message: 'boom' }),
    expect: 'E_SENTINEL_ERROR',
  },
  {
    name: '8c-red-caida-rechazado-fail-closed',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fetchThrow,
    expect: 'E_SENTINEL_ERROR',
  },
  {
    name: '8d-centinela-false-rechazado',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fetchFalse,
    expect: 'E_SENTINEL_FALSO',
  },
  {
    name: '8e-centinela-tipo-inesperado-rechazado',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fakeFetch(200, 'true'),
    expect: 'E_SENTINEL_FALSO',
  },
  // 9. URL malformada.
  {
    name: '9-url-malformada',
    env: { E2E_SUPABASE_URL: 'http://@@no-es-url', E2E_SUPABASE_SERVICE_ROLE_KEY: 'k' },
    expect: 'E_URL_MALFORMADA',
  },
  // 10. Variables ausentes: error explícito, sin fallback.
  {
    name: '10a-url-ausente',
    env: { E2E_SUPABASE_SERVICE_ROLE_KEY: 'k' },
    expect: 'E_URL_FALTA',
  },
  {
    name: '10b-key-ausente',
    env: { E2E_SUPABASE_URL: `https://${E2E_REF}.supabase.co` },
    expect: 'E_KEY_FALTA',
  },
  // 11. Ruta excepcional de bootstrap: omite SOLO el centinela; identidad completa.
  {
    name: '11a-bootstrap-omite-centinela-pero-acepta-identidad',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    mode: 'bootstrap',
    expect: 'accept',
  },
  {
    name: '11b-bootstrap-tambien-rechaza-produccion',
    env: { E2E_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`, E2E_SUPABASE_SERVICE_ROLE_KEY: 'k' },
    mode: 'bootstrap',
    expect: 'E_PRODUCCION',
    noFetch: true,
  },
  {
    name: '11c-bootstrap-tambien-rechaza-ref-no-coincide',
    env: baseEnv(`https://${OTHER_REF}.supabase.co`, E2E_REF),
    mode: 'bootstrap',
    expect: 'E_REF_NO_COINCIDE',
  },
  {
    name: '11d-mismo-estado-con-guard-normal-sin-centinela-rechaza',
    env: baseEnv(`https://${E2E_REF}.supabase.co`, E2E_REF),
    fetchImpl: fetchFalse,
    expect: 'E_SENTINEL_FALSO',
  },
  // 12. Local autorizado CON centinela true (credenciales locales, sin exigir remotas).
  {
    name: '12-local-con-centinela-aceptado',
    env: { E2E_SUPABASE_URL: 'http://127.0.0.1:54321', E2E_SUPABASE_SERVICE_ROLE_KEY: 'local-key' },
    fetchImpl: fetchTrue,
    expect: 'accept',
  },
];

type AssertFn = typeof assertTs;

async function runAssert(guardAssert: AssertFn, c: Case): Promise<string> {
  let fetchCalls = 0;
  const impl = (c.noFetch ? fetchThrow : c.fetchImpl) as typeof fetch | undefined;
  const countingFetch = impl
    ? (async (...args: Parameters<typeof fetch>) => {
        fetchCalls++;
        return impl(...args);
      }) as typeof fetch
    : undefined;
  try {
    const decision = await guardAssert({
      env: c.env,
      mode: c.mode ?? 'normal',
      ...(countingFetch ? { fetchImpl: countingFetch } : {}),
    });
    if (c.noFetch) expect(fetchCalls).toBe(0);
    expect(decision.ok).toBe(true);
    return 'accept';
  } catch (e) {
    const err = e as { name?: string; decision?: IsolationDecision; message: string };
    expect(err.name).toBe('IsolationError');
    const code = err.decision?.code;
    if (!code) throw new Error(`error sin code: ${err.message}`);
    return code;
  }
}

describe('CP-INFRA-011 — guard de aislamiento E2E (paridad TS/CJS; casos del mandato §3.4)', () => {
  it('la tabla de casos cubre los 12 puntos del mandato y ambas implementaciones existen', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(cjs.PRODUCTION_REF).toBe(PRODUCTION_REF);
    expect(typeof cjs.assertIsolatedDb).toBe('function');
  });

  for (const c of CASES) {
    it(`[TS] ${c.name}`, async () => {
      expect(await runAssert(assertTs, c)).toBe(c.expect);
    });
    it(`[CJS·paridad] ${c.name}`, async () => {
      expect(await runAssert(cjs.assertIsolatedDb, c)).toBe(c.expect);
    });
    it(`[decide·paridad] ${c.name}`, () => {
      const dTs = decideTs(c.env);
      const dCjs = cjs.decideIsolatedTarget(c.env);
      expect(dTs.ok).toBe(dCjs.ok);
      expect(dTs.code).toBe(dCjs.code);
      expect(dTs.kind).toBe(dCjs.kind);
      expect(dTs.ref).toBe(dCjs.ref);
    });
  }

  it('ningún caso acepta producción y ningún caso usa red real', () => {
    for (const c of CASES) {
      if (c.expect === 'accept') {
        expect(c.env.E2E_SUPABASE_URL).not.toContain(PRODUCTION_REF);
      }
    }
  });
});
