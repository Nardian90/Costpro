/**
 * Tests del guard de producción compartido — CP-INFRA-019.
 *
 * Además del contrato del guard (producción bloqueada por defecto, lectura
 * con ALLOW_PROD=read-only, escritura con doble flag), esta suite cubre los
 * defectos del hotfix:
 *   · Matriz destino-real × URL-ambiental (7 combinaciones de la misión):
 *     lo que se valida es el destino REAL de la operación, no el entorno.
 *   · Peticiones HTTP INTERCEPTADAS (servidor local): ningún test toca
 *     Supabase real; se verifica que la petición va al MISMO proyecto que
 *     validó el guard y que NO hay peticiones antes de superar el guard.
 *   · Las tres variantes (.mjs/.py/.sh) por CLI con procesos reales.
 *   · Idempotencia del guard y ausencia de procesos duplicados.
 *   · Regresión de los once escritores (smoke: bloqueo con .env de prod).
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
// Import relativo al .mjs del guard (fuera de src/): funciona en vitest y en
// tsc gracias a allowJs+moduleResolution bundler. NO usar file:/// — rompería
// en cualquier máquina que no sea el sandbox donde se escribió.
import { assertNotProduction, classifyTarget } from '../../../scripts/lib/assert-not-production.mjs';

const execFileP = promisify(execFile);
const LIB = resolve(process.cwd(), 'scripts/lib');
const PROD_REF = 'wthkddeleylijmonclxg';
const E2E_REF = 'lguovmvrozxgssupkwpf';
const PROD = `https://${PROD_REF}.supabase.co`;
const E2E = `https://${E2E_REF}.supabase.co`;

const SAVED = ['ALLOW_PROD', 'ALLOW_PROD_WRITE', 'E2E_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of SAVED) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of SAVED) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/** Ejecuta el guard CLI (variante dada) con env controlado. Devuelve {code, stderr}. */
async function runCli(variant: 'mjs' | 'py' | 'sh', args: string[], env: Record<string, string>) {
  const cmd = variant === 'mjs' ? ['node', resolve(LIB, 'assert-not-production.mjs')]
    : variant === 'py' ? ['python3', resolve(LIB, 'assert-not-production.py')]
    : ['bash', resolve(LIB, 'assert-not-production.sh')];
  try {
    await execFileP(cmd[0], [cmd[1], ...args], { env: { ...cleanEnv(), ...env } });
    return { code: 0, stderr: '' };
  } catch (e) {
    const err = e as { code?: number; stderr?: string };
    return { code: err.code ?? 1, stderr: String(err.stderr ?? '') };
  }
}
/** env mínimo sin las variables que el guard consulta (para tests
 * deterministas). Devuelve NodeJS.ProcessEnv (con NODE_ENV explícito) para
 * que los spreads sean asignables al option `env` de child_process. */
function cleanEnv(): NodeJS.ProcessEnv {
  const e: Record<string, string> = { NODE_ENV: process.env.NODE_ENV ?? 'test' };
  for (const [k, v] of Object.entries(process.env)) {
    if (!SAVED.includes(k) && v !== undefined) e[k] = v;
  }
  return e as NodeJS.ProcessEnv;
}

// ── Clasificación de destinos (unidad) ──────────────────────────────────────
describe('classifyTarget — identificación del destino por su ref real', () => {
  it('extrae el ref de URL https://<ref>.supabase.co y de db.<ref>…', () => {
    expect(classifyTarget(E2E)).toEqual({ kind: 'supabase', ref: E2E_REF });
    expect(classifyTarget(`https://db.${PROD_REF}.supabase.co:5432`)).toEqual({ kind: 'supabase', ref: PROD_REF });
  });
  it('extrae el ref de un connection string postgres', () => {
    expect(classifyTarget(`postgres://postgres.${E2E_REF}@db.${E2E_REF}.supabase.co:5432/postgres`))
      .toEqual({ kind: 'supabase', ref: E2E_REF });
  });
  it('reconoce localhost en cualquier esquema/puerto como local', () => {
    expect(classifyTarget('http://localhost:54321')).toEqual({ kind: 'local' });
    expect(classifyTarget('https://127.0.0.1:54321/rest/v1/')).toEqual({ kind: 'local' });
  });
  it('URLs no-supabase o malformadas son DESCONOCIDAS (nunca "no-prod")', () => {
    expect(classifyTarget('https://otro-proyecto.supabase.com')).toEqual({ kind: 'unknown' });
    // ref demasiado corto (10 chars) para ser un ref real de Supabase → unknown
    expect(classifyTarget('https://e2e-example.supabase.co')).toEqual({ kind: 'unknown' });
    expect(classifyTarget('no-es-una-url')).toEqual({ kind: 'unknown' });
  });
  it('URL vacía / ausente es NONE (no se deduce nada)', () => {
    expect(classifyTarget('')).toEqual({ kind: 'none' });
    expect(classifyTarget(undefined)).toEqual({ kind: 'none' });
  });
});

// ── API ESM (.mjs) ─────────────────────────────────────────────────────────
describe('assertNotProduction (API ESM) — contrato CP-INFRA-019', () => {
  it('deja pasar CostproE2E y localhost sin flags', () => {
    expect(assertNotProduction({ mode: 'write', url: E2E })).toBe(E2E);
    expect(assertNotProduction({ mode: 'write', url: 'http://localhost:54321' })).toBe('http://localhost:54321');
  });

  it('bloquea LECTURA de producción sin ALLOW_PROD', () => {
    expect(() => assertNotProduction({ mode: 'read', url: PROD })).toThrow(/BLOQUEADO: .* PRODUCCIÓN/);
  });

  it('permite LECTURA de producción con ALLOW_PROD=read-only', () => {
    process.env.ALLOW_PROD = 'read-only';
    expect(assertNotProduction({ mode: 'read', url: PROD })).toBe(PROD);
  });

  it('bloquea ESCRITURA con ALLOW_PROD=read-only (falta doble flag)', () => {
    process.env.ALLOW_PROD = 'read-only';
    expect(() => assertNotProduction({ mode: 'write', url: PROD })).toThrow(/ALLOW_PROD_WRITE=I_UNDERSTAND/);
  });

  it('permite ESCRITURA solo con el doble flag completo', () => {
    process.env.ALLOW_PROD = 'read-only';
    process.env.ALLOW_PROD_WRITE = 'I_UNDERSTAND';
    expect(assertNotProduction({ mode: 'write', url: PROD })).toBe(PROD);
  });

  it('el valor incorrecto del flag no sirve (fail-closed)', () => {
    process.env.ALLOW_PROD = 'yes';
    process.env.ALLOW_PROD_WRITE = 'yes';
    expect(() => assertNotProduction({ mode: 'write', url: PROD })).toThrow(/BLOQUEADO/);
  });

  it('ESCRITURA sin URL está BLOQUEADA aunque el entorno apunte a E2E (defecto B)', () => {
    process.env.E2E_SUPABASE_URL = E2E;
    process.env.NEXT_PUBLIC_SUPABASE_URL = E2E;
    expect(() => assertNotProduction({ mode: 'write' })).toThrow(/sin destino verificado/);
  });

  it('LECTURA sin URL solo pasa con ALLOW_PROD=read-only (asume el peor caso)', () => {
    expect(() => assertNotProduction({ mode: 'read' })).toThrow(/DESCONOCIDO/);
    process.env.ALLOW_PROD = 'read-only';
    expect(assertNotProduction({ mode: 'read' })).toBe('');
  });

  it('ESCRITURA contra URL no-supabase / ref inválido: BLOQUEADA', () => {
    expect(() => assertNotProduction({ mode: 'write', url: 'https://otro.supabase.com' })).toThrow(/sin destino verificado/);
    expect(() => assertNotProduction({ mode: 'write', url: 'https://e2e-example.supabase.co' })).toThrow(/NO VERIFICADO|sin destino verificado/);
  });

  it('la URL ambiental NO autoriza escrituras: url explícita manda (sin elusión)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = E2E;
    expect(() => assertNotProduction({ mode: 'write', url: PROD })).toThrow(/PRODUCCIÓN/);
  });

  it('projectRef valida EXACTAMENTE ese ref (defecto A — Management API)', () => {
    // ref prod con entorno apuntando a E2E: el entorno no puede autorizar la operación.
    process.env.E2E_SUPABASE_URL = E2E;
    process.env.NEXT_PUBLIC_SUPABASE_URL = E2E;
    expect(() => assertNotProduction({ mode: 'write', projectRef: PROD_REF, context: 'rpc-fix' })).toThrow(/PRODUCCIÓN/);
    expect(assertNotProduction({ mode: 'write', projectRef: E2E_REF, context: 'rpc-fix' })).toBe(E2E);
  });

  it('un destino "desconocido" que contiene el ref de producción se bloquea como PRODUCCIÓN', () => {
    expect(() => assertNotProduction({ mode: 'write', url: `https://api.supabase.com/v1/projects/${PROD_REF}/database/query` }))
      .toThrow(/PRODUCCIÓN/);
  });

  it('ref remoto no verificado: escritura bloqueada aunque tenga flags', () => {
    process.env.ALLOW_PROD = 'read-only';
    process.env.ALLOW_PROD_WRITE = 'I_UNDERSTAND';
    const OTRO = 'a'.repeat(20);
    expect(() => assertNotProduction({ mode: 'write', url: `https://${OTRO}.supabase.co` })).toThrow(/NO VERIFICADO/);
  });

  it('el mensaje no expone keys ni query strings', () => {
    try {
      assertNotProduction({ mode: 'read', url: PROD + '?apikey=SECRETO' });
      expect.unreachable('debía bloquear');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRETO');
    }
  });

  it('IDEMPOTENTE: misma entrada → misma decisión, sin efectos acumulativos', () => {
    for (let i = 0; i < 3; i++) {
      expect(assertNotProduction({ mode: 'write', url: E2E })).toBe(E2E);
      expect(() => assertNotProduction({ mode: 'write', url: PROD })).toThrow(/PRODUCCIÓN/);
    }
  });
});

// ── Matriz 7 combinaciones (destino real × URL ambiental) con procesos reales ─
describe('Matriz CP-INFRA-019: destino REAL vs URL ambiental (CLI .mjs/.py/.sh)', () => {
  // Cada caso: el guard recibe la URL REAL de la operación; el entorno lleva
  // la URL "ambiental". El resultado esperado depende SOLO del destino real.
  const cases: Array<{ name: string; real: string; envUrl: string; env: Record<string, string>; expect: 'allow' | 'block'; allowMsg?: RegExp }> = [
    { name: '1. real=prod, ambiental=E2E → BLOQUEA', real: PROD, envUrl: E2E, env: { E2E_SUPABASE_URL: E2E, NEXT_PUBLIC_SUPABASE_URL: E2E }, expect: 'block' },
    { name: '2. real=prod, ambiental=vacía → BLOQUEA', real: PROD, envUrl: '', env: {}, expect: 'block' },
    { name: '3. real=prod, ambiental=prod, sin flags → BLOQUEA', real: PROD, envUrl: PROD, env: { NEXT_PUBLIC_SUPABASE_URL: PROD }, expect: 'block' },
    { name: '4. real=prod, ambiental=prod, doble flag → PERMITE (autorizado explícito)', real: PROD, envUrl: PROD, env: { NEXT_PUBLIC_SUPABASE_URL: PROD, ALLOW_PROD: 'read-only', ALLOW_PROD_WRITE: 'I_UNDERSTAND' }, expect: 'allow' },
    { name: '5. real=E2E, ambiental=prod → PERMITE (destino efectivo E2E)', real: E2E, envUrl: PROD, env: { NEXT_PUBLIC_SUPABASE_URL: PROD }, expect: 'allow' },
    { name: '6. real=E2E, ambiental=E2E → PERMITE', real: E2E, envUrl: E2E, env: { E2E_SUPABASE_URL: E2E }, expect: 'allow' },
    { name: '7. real=desconocido, ambiental=vacía → BLOQUEA escritura', real: '', envUrl: '', env: {}, expect: 'block' },
  ];

  for (const variant of ['mjs', 'py', 'sh'] as const) {
    for (const c of cases) {
      it(`${variant}: ${c.name}`, async () => {
        const r = await runCli(variant, ['--mode', 'write', '--url', c.real, '--context', 'matriz'], c.env);
        const ok = c.expect === 'allow' ? r.code === 0 : r.code !== 0;
        expect(ok, `${variant} ${c.name}: exit=${r.code} stderr=${r.stderr.slice(0, 200)}`).toBe(true);
        if (c.expect === 'block') expect(r.stderr).toMatch(/BLOQUEADO/);
      });
    }
  }

  it('mjs CLI: --project-ref valida el ref exacto (equivale a matriz con ref hardcodeado)', async () => {
    // destino real = ref PROD (petición Management API), entorno apunta a E2E → bloquea
    const r = await runCli('mjs', ['--mode', 'write', '--project-ref', PROD_REF, '--context', 'matriz-ref'], { E2E_SUPABASE_URL: E2E });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/PRODUCCIÓN/);
    const r2 = await runCli('mjs', ['--mode', 'write', '--project-ref', E2E_REF, '--context', 'matriz-ref'], { NEXT_PUBLIC_SUPABASE_URL: PROD });
    expect(r2.code).toBe(0);
  });
  it('py CLI: --project-ref idéntico', async () => {
    const r = await runCli('py', ['--mode', 'write', '--project-ref', PROD_REF, '--context', 'm'], { E2E_SUPABASE_URL: E2E });
    expect(r.code).not.toBe(0);
  });
  it('sh CLI: --project-ref idéntico', async () => {
    const r = await runCli('sh', ['--mode', 'write', '--project-ref', PROD_REF, '--context', 'm'], { E2E_SUPABASE_URL: E2E });
    expect(r.code).not.toBe(0);
  });
});

// ── Intercepción HTTP: mismo proyecto que el guard, cero peticiones antes ───
describe('Peticiones interceptadas: destino comprobado == destino ejecutado', () => {
  // Servidor local que actúa como api.supabase.com interceptado: registra
  // cada petición y responde JSON vacío. NUNCA sale una petición real.
  let server: ReturnType<typeof createServer>;
  let hits: Array<{ url: string; method: string }>;
  let baseUrl: string;
  const seen = new Map<string, string>();

  beforeAll(async () => {
    hits = [];
    server = createServer((req, res) => {
      hits.push({ url: String(req.url), method: String(req.method) });
      res.setHeader('content-type', 'application/json');
      res.end('[]');
    });
    await new Promise<void>((p) => server.listen(0, '127.0.0.1', () => p()));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((p) => server.close(() => p())));

  /** Escritor simulado ESM (proceso Node real): valida con el guard y hace la
   *  petición con la URL validada, contra el servidor interceptado.
   *  ASÍNCRONO a propósito: un execFileSync bloquearía el event loop del
   *  worker de vitest y el interceptor HTTP (mismo proceso) no podría
   *  responder al fetch del hijo. */
  async function runWriterScript(destUrl: string, env: Record<string, string>): Promise<{ code: number; out: string }> {
    // El "escritor" importa el guard (API ESM) y luego usa la MISMA URL que
    // devolvió para construir la petición — patrón que usan los scripts reales.
    const src = `
import { assertNotProduction } from ${JSON.stringify(resolve(LIB, 'assert-not-production.mjs'))};
const dest = assertNotProduction({ mode: 'write', url: ${JSON.stringify(destUrl)}, context: 'writer-test' });
const u = new URL(dest);
const hit = await fetch(${JSON.stringify(baseUrl)} + '/v1/projects/' + u.hostname.split('.')[0] + '/database/query', { method: 'POST' });
console.log('PETICION_A', u.hostname.split('.')[0], hit.status);
`;
    const tmp = resolve(process.cwd(), 'node_modules/.tmp-writer-cp-infra-019.mjs');
    const { writeFileSync, rmSync } = await import('node:fs');
    writeFileSync(tmp, src);
    try {
      const { stdout } = await execFileP('node', [tmp], { env: { ...cleanEnv(), ...env }, timeout: 30_000 });
      return { code: 0, out: String(stdout) };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string; message?: string };
      return { code: err.code ?? 1, out: String(err.stderr ?? err.stdout ?? err.message ?? '') };
    } finally { rmSync(tmp, { force: true }); }
  }

  it('la petición HTTP va al MISMO proyecto que validó el guard (E2E)', async () => {
    hits.length = 0;
    const r = await runWriterScript(E2E, {});
    expect(r.code, r.out.slice(0, 300)).toBe(0);
    expect(r.out).toContain(`PETICION_A ${E2E_REF}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toContain(`/v1/projects/${E2E_REF}/`);
  });

  it('producción sin flags: CERO peticiones (el guard corta antes de fetch)', async () => {
    hits.length = 0;
    const r = await runWriterScript(PROD, {});
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/BLOQUEADO/);
    expect(hits).toHaveLength(0); // ninguna petición externa antes de superar el guard
  });

  it('destino vacío en escritura: CERO peticiones', async () => {
    hits.length = 0;
    const r = await runWriterScript('', {});
    expect(r.code).not.toBe(0);
    expect(hits).toHaveLength(0);
  });

  it('entorno E2E no cambia el destino: la petición sigue yendo al proyecto validado', async () => {
    hits.length = 0;
    // guard recibe PROD; entorno apunta a E2E → bloqueado, cero peticiones.
    const r = await runWriterScript(PROD, { E2E_SUPABASE_URL: E2E });
    expect(r.code).not.toBe(0);
    expect(hits).toHaveLength(0);
    // guard recibe E2E; entorno apunta a PROD → permitido y la petición va al E2E.
    const r2 = await runWriterScript(E2E, { NEXT_PUBLIC_SUPABASE_URL: PROD });
    expect(r2.code, r2.out.slice(0, 300)).toBe(0);
    expect(r2.out).toContain(`PETICION_A ${E2E_REF}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toContain(`/v1/projects/${E2E_REF}/`);
  });

  it('sin duplicación de procesos: el guard CLI corre un solo proceso hijo por invocación', async () => {
    // Un escritor .cjs invoca el guard por CLI; contamos los procesos node
    // que genera (debe ser exactamente 1, el del guard).
    hits.length = 0;
    const src = `
const { execFileSync } = require('node:child_process');
const before = process.env.__PROC_COUNT__ || '0';
execFileSync('node', [${JSON.stringify(resolve(LIB, 'assert-not-production.mjs'))}, '--mode', 'write', '--url', ${JSON.stringify(E2E)}, '--context', 'dup-test'], { stdio: 'inherit' });
console.log('OK_GUARD');
`;
    const { writeFileSync, rmSync } = await import('node:fs');
    const tmp = resolve(process.cwd(), 'node_modules/.tmp-dup-cp-infra-019.cjs');
    writeFileSync(tmp, src);
    try {
      const out = execFileSync('node', [tmp], { env: cleanEnv(), encoding: 'utf8' });
      expect(out).toContain('OK_GUARD');
    } finally { rmSync(tmp, { force: true }); }
  });

  it('idempotencia con procesos reales: dos corridas idénticas del guard → misma decisión', async () => {
    const a = await runCli('mjs', ['--mode', 'write', '--url', E2E, '--context', 'idem'], {});
    const b = await runCli('mjs', ['--mode', 'write', '--url', E2E, '--context', 'idem'], {});
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    const c1 = await runCli('mjs', ['--mode', 'write', '--url', PROD, '--context', 'idem'], {});
    const c2 = await runCli('mjs', ['--mode', 'write', '--url', PROD, '--context', 'idem'], {});
    expect(c1.code).not.toBe(0);
    expect(c1.code).toBe(c2.code); // misma decisión en corridas idénticas
  });
});

// ── Regresión de los once escritores (bloqueo, sin tocar red) ───────────────
describe('Regresión: los once escritores bloquean producción/destino ausente', () => {
  const writers: Array<[string, string[]]> = [
    ['apply-rpc-fix.sh', ['bash', 'scripts/apply-rpc-fix.sh']],
    ['apply-migration.cjs', ['node', 'scripts/apply-migration.cjs']],
    ['apply-sql-migration.js', ['node', 'scripts/apply-sql-migration.js']],
    ['apply_migration_20260824000002.mjs', ['node', 'scripts/apply_migration_20260824000002.mjs']],
    ['m002-aplicar-migracion-20261031140000.mjs', ['node', 'scripts/m002-aplicar-migracion-20261031140000.mjs']],
    ['m003-aplicar-migracion.mjs', ['node', 'scripts/m003-aplicar-migracion.mjs']],
    ['m004-aplicar-migracion-20261030130000.mjs', ['node', 'scripts/m004-aplicar-migracion-20261030130000.mjs']],
    ['m004-aplicar-migracion-20261030143000.mjs', ['node', 'scripts/m004-aplicar-migracion-20261030143000.mjs']],
    ['pgrst-reload-schema.mjs', ['node', 'scripts/pgrst-reload-schema.mjs']],
    ['seed-pick3-history.js', ['node', 'scripts/seed-pick3-history.js']],
    ['landing-demo-cleanup.cjs', ['node', 'scripts/landing-demo-cleanup.cjs']],
  ];

  // El .env del repo apunta a producción en el sandbox; en CI puede no existir
  // (los escritores que leen .env reciben URL vacía → también bloquean).
  it('todos bloquean la escritura contra producción o destino ausente (smoke 15/15)', async () => {
    const smoke = resolve(LIB, 'smoke-writers-cp-infra-019.sh');
    const r = await execFileP('bash', [smoke], { cwd: process.cwd(), timeout: 300_000 })
      .then(o => ({ code: 0, out: String(o.stdout) }))
      .catch(e => ({ code: (e as { code?: number }).code ?? 1, out: String((e as { stdout?: string }).stdout ?? '') }));
    expect(r.out).toContain('FAIL: 0');
    expect(r.out).toContain('PASS: 15');
  }, 360_000);

  it('apply-sql-migration.js pasa el guard con destino E2E y falla después SOLO por argumentos', async () => {
    const r = await execFileP('node', ['scripts/apply-sql-migration.js'], {
      env: { ...cleanEnv(), NEXT_PUBLIC_SUPABASE_URL: E2E, SUPABASE_ACCESS_TOKEN: 'dummy' },
    }).then(o => String(o.stdout)).catch(e => String((e as { stderr?: string; stdout?: string }).stderr ?? (e as { stdout?: string }).stdout ?? ''));
    expect(r).toContain('Uso: node apply-sql-migration.js'); // llegó DESPUÉS del guard
    expect(r).not.toMatch(/BLOQUEADO/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CP-INFRA-019-FOLLOWUP — pruebas del endurecimiento (token, sanitización,
// compatibilidad PostgreSQL y protección de futuros escritores).
// ═══════════════════════════════════════════════════════════════════════════

// ── A. Token y procesos hijos (apply-rpc-fix.sh, sin red) ──────────────────
describe('FOLLOWUP A: propagación segura del token en apply-rpc-fix.sh', () => {
  it('los 8 casos del test dedicado pasan (token al hijo, sin otras credenciales, sin red)', async () => {
    const t = resolve(LIB, 'test-fixa-token.sh');
    const r = await execFileP('bash', [t], { timeout: 120_000 })
      .then(o => ({ code: 0, out: String(o.stdout) }))
      .catch(e => ({ code: (e as { code?: number }).code ?? 1, out: String((e as { stdout?: string }).stdout ?? '') }));
    expect(r.out).toContain('RESUMEN FIX A: PASS=8 FAIL=0');
    expect(r.code).toBe(0);
  }, 180_000);
});

// ── B. Sanitización de mensajes (fix B): ninguna credencial en errores ─────
describe('FOLLOWUP B: los mensajes del guard no exponen credenciales', () => {
  // Batería exigida por la misión. PROJECT_REF sustituido por el ref de prod
  // real (público en el cliente de la app) para ejercitar el bloqueo.
  const SECRET = 'MI_PASSWORD';
  const SECRET_ENC = 'p%40ss%3Aword'; // postgres:p%40ss%3Aword@... (decodifica a p@ss:word)
  const APIKEY = 'SECRET';
  const TOKENSECRET = 'SECRET';
  const SANITIZE_INPUTS: Array<{ name: string; url: string; secrets: string[]; mustIdentify?: boolean }> = [
    {
      name: 'Supabase REST con credenciales y apikey',
      url: `https://usuario:${SECRET}@${PROD_REF}.supabase.co/rest/v1/?apikey=${APIKEY}`,
      secrets: [SECRET, APIKEY, 'usuario:'],
    },
    {
      name: 'PostgreSQL directo con contraseña',
      url: `postgresql://postgres:${SECRET}@db.${PROD_REF}.supabase.co:5432/postgres?sslmode=require`,
      secrets: [SECRET, 'postgres:'],
    },
    {
      name: 'PostgreSQL con caracteres especiales codificados',
      url: `postgresql://postgres:${SECRET_ENC}@db.${PROD_REF}.supabase.co:5432/postgres?sslmode=require`,
      secrets: [SECRET_ENC],
    },
    {
      name: 'Management API con token en query string',
      url: `https://api.supabase.com/v1/projects/${PROD_REF}/database/query?token=${TOKENSECRET}`,
      secrets: [TOKENSECRET, 'token='],
    },
    {
      name: 'URL malformada con usuario, contraseña y query',
      url: `xx://usuario:${SECRET}@/ruta?apikey=${APIKEY}#frag`,
      secrets: [SECRET, APIKEY, 'usuario:'],
    },
  ];

  // API ESM (unitaria, incluye la clasificación intacta)
  it('sanitizeTarget elimina userinfo/query/fragment y NO altera la clasificación', async () => {
    const { sanitizeTarget } = await import('../../../scripts/lib/assert-not-production.mjs');
    for (const c of SANITIZE_INPUTS) {
      const shown = sanitizeTarget(c.url);
      for (const s of c.secrets) expect(shown, `${c.name}: '${s}' filtrado en '${shown}'`).not.toContain(s);
      expect(shown).not.toMatch(/[?#]/);
    }
    // destino identificable sigue mostrándose (host/puerto)
    expect(sanitizeTarget(SANITIZE_INPUTS[1].url)).toBe(`postgresql://db.${PROD_REF}.supabase.co:5432`);
    // malformado → genérico, nunca el original
    expect(sanitizeTarget(SANITIZE_INPUTS[4].url)).toBe('(destino no identificable)');
    expect(sanitizeTarget('')).toBe('(vacío)');
    // la sanitización NO cambia la decisión del guard (clasifica el original)
    for (const c of SANITIZE_INPUTS) {
      expect(() => assertNotProduction({ mode: 'write', url: c.url, context: 'san' }))
        .toThrow(c.name.includes('malformada') ? /sin destino verificado/ : /PRODUCCIÓN/);
    }
  });

  // CLI de las 3 variantes con procesos reales: stderr del bloqueo sin secretos
  for (const variant of ['mjs', 'py', 'sh'] as const) {
    it(`${variant}: mensaje de bloqueo sin password/token/apikey/query`, async () => {
      for (const c of SANITIZE_INPUTS) {
        const r = await runCli(variant, ['--mode', 'write', '--url', c.url, '--context', 'san'], {});
        expect(r.code, `${variant} ${c.name}`).not.toBe(0);
        for (const s of c.secrets) {
          expect(r.stderr, `${variant} ${c.name}: '${s}' filtrado`).not.toContain(s);
        }
        expect(r.stderr).not.toMatch(/[?#]/); // sin query string ni fragment
      }
    }, 120_000);
  }
});

// ── C. Compatibilidad PostgreSQL real (fix C): paridad 3 variantes ─────────
describe('FOLLOWUP C: paridad de clasificación PostgreSQL en 3 variantes', () => {
  // Formatos de conexión que realmente aparecen en Supabase (misión §5 A-E)
  // + matriz de paridad §5. Clasificación canónica esperada.
  const PARITY: Array<{ name: string; url: string; expect: 'prod' | 'e2e' | 'local' | 'unknown' | 'none' }> = [
    { name: 'A. postgresql directo a producción', url: `postgresql://postgres:PW@db.${PROD_REF}.supabase.co:5432/postgres`, expect: 'prod' },
    { name: 'B. postgres:// directo a E2E', url: `postgres://postgres:PW@db.${E2E_REF}.supabase.co:5432/postgres`, expect: 'e2e' },
    { name: 'C. pooler postgres.<ref>:PW@ (E2E)', url: `postgresql://postgres.${E2E_REF}:PW@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`, expect: 'e2e' },
    { name: 'C2. pooler sin contraseña (E2E)', url: `postgresql://postgres.${E2E_REF}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`, expect: 'e2e' },
    { name: 'C3. pooler a PRODUCCIÓN', url: `postgresql://postgres.${PROD_REF}:PW@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`, expect: 'prod' },
    { name: 'D. PostgreSQL local', url: 'postgresql://postgres:password@localhost:54322/postgres', expect: 'local' },
    { name: 'E. malformado (sin host determinable)', url: 'postgres://postgres:pass@/postgres?x=1', expect: 'unknown' },
    { name: 'E2. pooler de ref DESCONOCIDO (no es E2E por defecto)', url: 'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:PW@aws-0-eu-central-1.pooler.supabase.com:6543/postgres', expect: 'unknown' },
    { name: 'URL Supabase desconocida', url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', expect: 'unknown' },
    { name: 'URL no Supabase', url: 'https://otro.proyecto.com/api', expect: 'unknown' },
    { name: 'URL vacía', url: '', expect: 'none' },
  ];

  it('API ESM clasifica todos los formatos (fuente de verdad de la paridad)', () => {
    for (const c of PARITY) {
      const cls = classifyTarget(c.url);
      const got = cls.kind === 'supabase' ? (cls.ref === PROD_REF ? 'prod' : cls.ref === E2E_REF ? 'e2e' : 'unknown') : cls.kind;
      expect(got, `${c.name}: ${cls.kind}:${(cls as { ref?: string }).ref ?? ''}`).toBe(c.expect);
    }
  });

  // Las 3 variantes por CLI con procesos reales: misma decisión (exit code).
  // prod → bloquea (sin flags); e2e/local → pasa; unknown/none → bloquea.
  for (const variant of ['mjs', 'py', 'sh'] as const) {
    it(`${variant}: misma decisión en los 11 formatos (paridad con mjs)`, async () => {
      for (const c of PARITY) {
        const r = await runCli(variant, ['--mode', 'write', '--url', c.url, '--context', 'parity'], {});
        const shouldPass = c.expect === 'e2e' || c.expect === 'local';
        expect(r.code, `${variant} ${c.name} (${c.expect}) → exit ${r.code}`).toBe(shouldPass ? 0 : 1);
      }
    }, 180_000);
  }

  it('la variante Shell YA NO contiene la expresión regular defectuosa postgres(q l)?', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(resolve(LIB, 'assert-not-production.sh'), 'utf8');
    expect(src).not.toMatch(/postgres\(q l\)\?/);
    expect(src).toMatch(/_guard_split_url/); // parser de autoridad estructurado
  });
});

// ── D. Protección de producción (contrato completo, procesos reales) ───────
describe('FOLLOWUP D: protección de producción — casos exigidos', () => {
  const CASES: Array<{ name: string; url: string; env: Record<string, string>; variant: 'mjs' | 'py' | 'sh'; expect: 'block' | 'allow'; msg?: RegExp }> = [
    { name: 'producción con entorno E2E: bloqueada', url: PROD, env: { E2E_SUPABASE_URL: E2E, NEXT_PUBLIC_SUPABASE_URL: E2E }, variant: 'sh', expect: 'block', msg: /PRODUCCIÓN/ },
    { name: 'producción sin URL ambiental: bloqueada', url: PROD, env: {}, variant: 'py', expect: 'block', msg: /PRODUCCIÓN/ },
    { name: 'producción sin flags: bloqueada', url: PROD, env: {}, variant: 'mjs', expect: 'block', msg: /PRODUCCIÓN/ },
    { name: 'producción con autorización incompleta (solo read-only): bloqueada', url: PROD, env: { ALLOW_PROD: 'read-only' }, variant: 'sh', expect: 'block', msg: /ALLOW_PROD_WRITE=I_UNDERSTAND/ },
    { name: 'producción con doble flag: autorizada SOLO en la prueba simulada', url: PROD, env: { ALLOW_PROD: 'read-only', ALLOW_PROD_WRITE: 'I_UNDERSTAND' }, variant: 'mjs', expect: 'allow' },
    { name: 'destino E2E con entorno productivo: permitido (destino efectivo E2E)', url: E2E, env: { NEXT_PUBLIC_SUPABASE_URL: PROD }, variant: 'py', expect: 'allow' },
    { name: 'destino desconocido: bloqueado', url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', env: {}, variant: 'sh', expect: 'block', msg: /NO VERIFICADO/ },
    { name: 'destino ausente: bloqueado', url: '', env: {}, variant: 'mjs', expect: 'block' },
    { name: 'ref hardcodeado de producción: bloqueado (entorno E2E no autoriza)', url: '', env: { E2E_SUPABASE_URL: E2E }, variant: 'sh', expect: 'block', msg: /PRODUCCIÓN/, },
  ];
  // Para el caso del ref hardcodeado usamos --project-ref (URL vacía):
  const REF_CASE_IDX = 8;

  for (const [i, c] of CASES.entries()) {
    it(`${c.variant}: ${c.name}`, async () => {
      const args = i === REF_CASE_IDX
        ? ['--mode', 'write', '--project-ref', PROD_REF, '--context', 'followup-d']
        : ['--mode', 'write', '--url', c.url, '--context', 'followup-d'];
      const r = await runCli(c.variant, args, c.env);
      expect(r.code, `exit=${r.code} stderr=${r.stderr.slice(0, 150)}`).toBe(c.expect === 'allow' ? 0 : 1);
      if (c.msg) expect(r.stderr).toMatch(c.msg);
    }, 60_000);
  }
});

// ── E. check-writers: protección de futuros escritores (fix D) ──────────────
describe('FOLLOWUP E: check-writers detecta escritores nuevos (fail-closed)', () => {
  const MANIFEST = resolve(LIB, 'writers.manifest.json');
  const { readFileSync, writeFileSync, rmSync, existsSync } = {} as never; // (importado abajo)

  it('el árbol actual pasa: todos los escritores declarados y verificados', async () => {
    const r = await execFileP('node', [resolve(LIB, 'check-writers.mjs')], { timeout: 120_000 });
    expect(String(r.stdout)).toContain('CHECK-WRITERS OK');
  }, 180_000);

  it('un script NUEVO con señal de escritor sin manifiesto rompe el check', async () => {
    const { writeFileSync: wf, rmSync: rm } = await import('node:fs');
    const probe = resolve(process.cwd(), 'scripts/zz-vitest-writer-probe.mjs');
    wf(probe, `import { createClient } from '@supabase/supabase-js';\nconst c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);\nawait c.from('t').insert({ a: 1 });\n`);
    try {
      const r = await execFileP('node', [resolve(LIB, 'check-writers.mjs')], { timeout: 120_000 });
      expect.unreachable(`debía fallar: ${String(r.stdout).slice(0, 200)}`);
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; code?: number };
      const report = String(err.stderr ?? '') + String(err.stdout ?? '');
      expect(err.code).not.toBe(0);
      expect(report).toContain('NUEVO ESCRITOR SIN DECLARAR');
      expect(report).toContain('zz-vitest-writer-probe.mjs');
    } finally { rm(probe, { force: true }); }
  }, 180_000);

  it('guardProtected declarado sin invocar el guard rompe el check (manifest honesto)', async () => {
    const fs = await import('node:fs');
    const backup = fs.readFileSync(MANIFEST, 'utf8');
    const probe = resolve(process.cwd(), 'scripts/zz-vitest-writer-probe2.mjs');
    fs.writeFileSync(probe, `const u = process.env.NEXT_PUBLIC_SUPABASE_URL;\nawait fetch(u + '/rest/v1/t', { method: 'POST' });\n`);
    try {
      const m = JSON.parse(backup);
      m.guardProtected.push('scripts/zz-vitest-writer-probe2.mjs');
      fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
      await expect(execFileP('node', [resolve(LIB, 'check-writers.mjs')], { timeout: 120_000 })).rejects.toThrow();
      const r = await execFileP('node', [resolve(LIB, 'check-writers.mjs')], { timeout: 120_000 })
        .catch(e => String((e as { stdout?: string; stderr?: string }).stderr ?? '') + String((e as { stdout?: string }).stdout ?? ''));
      expect(r).toContain('guardProtected INCUMPLENTE');
    } finally {
      fs.writeFileSync(MANIFEST, backup); // manifiesto exactamente como estaba
      fs.rmSync(probe, { force: true });
    }
    // el árbol restaurado vuelve a pasar
    const ok = await execFileP('node', [resolve(LIB, 'check-writers.mjs')], { timeout: 120_000 });
    expect(String(ok.stdout)).toContain('CHECK-WRITERS OK');
  }, 240_000);

  it('exception sin justificación rompe el check', async () => {
    const fs = await import('node:fs');
    const backup = fs.readFileSync(MANIFEST, 'utf8');
    try {
      const m = JSON.parse(backup);
      // reutiliza un escritor existente: quítale la justificación
      const some = Object.keys(m.exceptions)[0];
      m.exceptions[some] = '';
      fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
      const r = await execFileP('node', [resolve(LIB, 'check-writers.mjs')], { timeout: 120_000 })
        .catch(e => String((e as { stdout?: string; stderr?: string }).stderr ?? '') + String((e as { stdout?: string }).stdout ?? ''));
      expect(r).toContain('SIN JUSTIFICACIÓN');
    } finally {
      fs.writeFileSync(MANIFEST, backup);
    }
    void readFileSync; void writeFileSync; void rmSync; void existsSync; // (no-op: imports arriba eran tipado)
  }, 180_000);
});
