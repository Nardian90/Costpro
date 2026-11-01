/**
 * Tests del guard de producción compartido (T1b).
 * Cubre las tres variantes (.mjs import, .mjs/.py/.sh por CLI) con el mismo
 * contrato: producción bloqueada por defecto; lectura con ALLOW_PROD=read-only;
 * escritura con el doble flag ALLOW_PROD_WRITE=I_UNDERSTAND.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
// Import relativo al .mjs del guard (fuera de src/): funciona en vitest y en
// tsc gracias a allowJs+moduleResolution bundler. NO usar file:/// — rompería
// en cualquier máquina que no sea el sandbox donde se escribió.
import { assertNotProduction } from '../../../scripts/lib/assert-not-production.mjs';

const LIB = resolve(process.cwd(), 'scripts/lib');
const PROD = 'https://wthkddeleylijmonclxg.supabase.co';
const E2E = 'https://e2e-example.supabase.co';

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

// ── API ESM (.mjs) ─────────────────────────────────────────────────────────
describe('assertNotProduction (API ESM)', () => {
  it('deja pasar URLs que NO son producción (E2E/local)', () => {
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

  it('bloquea ESCRITURA aunque esté ALLOW_PROD=read-only (falta doble flag)', () => {
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

  it('deduce la URL del entorno (NEXT_PUBLIC_SUPABASE_URL)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD;
    expect(() => assertNotProduction({ mode: 'write' })).toThrow(/BLOQUEADO/);
  });

  it('prefiere E2E_SUPABASE_URL sobre NEXT_PUBLIC (no bloquea)', () => {
    process.env.E2E_SUPABASE_URL = E2E;
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD;
    expect(assertNotProduction({ mode: 'write' })).toBe(E2E);
  });

  it('el mensaje no expone keys ni query strings', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD + '?apikey=SECRETO';
    try {
      assertNotProduction({ mode: 'read' });
      expect.unreachable('debía bloquear');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRETO');
    }
  });
});

// ── CLI: contrato idéntico en las tres variantes ───────────────────────────
describe('CLI de las tres variantes (.mjs / .py / .sh)', () => {
  const cases: Array<[string, string, Record<string, string>, 'ok' | 'block']> = [
    ['no-prod pasa', E2E, {}, 'ok'],
    ['prod sin flags bloquea', PROD, {}, 'block'],
    ['prod read-only lee', PROD, { ALLOW_PROD: 'read-only' }, 'ok'],
    ['prod read-only NO escribe', PROD, { ALLOW_PROD: 'read-only' }, 'block'],
    ['prod doble flag escribe', PROD, { ALLOW_PROD: 'read-only', ALLOW_PROD_WRITE: 'I_UNDERSTAND' }, 'ok'],
  ];

  for (const variant of [
    ['mjs', ['node', resolve(LIB, 'assert-not-production.mjs')]] as const,
    ['py', ['python3', resolve(LIB, 'assert-not-production.py')]] as const,
    ['sh', ['bash', resolve(LIB, 'assert-not-production.sh')]] as const,
  ]) {
    for (const [name, url, env, expected] of cases) {
      const mode = name.includes('lee') && expected === 'ok' ? 'read' : 'write';
      it(`${variant[0]}: ${name}`, () => {
        const envArg: Record<string, string> = { ...env, E2E_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_URL: '' };
        let code = 0;
        try {
          execFileSync(variant[1][0], [variant[1][1], '--mode', mode, '--url', url, '--context', 'test'], {
            env: { ...process.env, ...envArg },
            stdio: 'pipe',
          });
        } catch (e) {
          code = (e as { status?: number }).status ?? 1;
          const err = e as { stderr?: Buffer; message?: string };
          if ((code === 0) !== (expected === 'ok')) {
            throw new Error(`variant=${variant[0]} case=${name}: exit=${code} stderr=${String(err.stderr ?? '').slice(0, 300)} msg=${err.message?.slice(0, 200)}`);
          }
        }
        expect(code === 0).toBe(expected === 'ok');
      });
    }
  }
});
