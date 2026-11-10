/**
 * Tests del lint de destructivos — CP-INFRA-020 T2.
 *
 * Verifica scripts/ci/check-destructive-guard.cjs contra un REPO FICTICIO
 * (tmp) con fixtures positivas y negativas; nunca toca el repo real ni la
 * red. Casos:
 *   · SQL destructivo con guard completo (marcador + DO $guard$ antes de la
 *     primera sentencia) → OK.
 *   · SQL destructivo sin guard → FAIL.
 *   · SQL destructivo con guard DESPUÉS de la primera sentencia → FAIL.
 *   · Guard incompleto (DO sin verificar ledger) → FAIL.
 *   · Script .mjs con TRUNCATE y sin assert-not-production → FAIL.
 *   · Script .mjs con assert-not-production → OK.
 *   · REVOKE TRUNCATE (no destructivo) → OK.
 *   · GRANT ... TRUNCATE en SQL → OK (no sentencia TRUNCATE).
 *   · audit-evidence con TRUNCATE → solo advertencia (no falla).
 *   · Migración nueva (git diff) con TRUNCATE sin DESTRUCTIVE-OK → FAIL
 *     (simulada vía migración en el árbol sin historial: se omite en este
 *     test porque el diff es contra la base real; se cubre con fixtures
 *     unitarias del clasificador).
 *   · Excepción de allowlist vencida → FAIL.
 *   · El propio repo real pasa el lint (smoke de integración).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(process.cwd(), 'scripts/ci/check-destructive-guard.cjs');

const GUARD_OK = `-- COSTPRO-GUARD-DESTRUCTIVO v1
BEGIN;

DO $guard$
DECLARE v_centinela regprocedure; v_ledger regclass; v_es_aislada boolean;
BEGIN
    v_centinela := to_regprocedure('public.e2e_is_isolated_db()');
    IF v_centinela IS NULL THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: BD no desechable';
    END IF;
    EXECUTE 'SELECT public.e2e_is_isolated_db()' INTO v_es_aislada;
    IF v_es_aislada IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: centinela sin true';
    END IF;
    v_ledger := to_regclass('public.production_migration_ledger');
    IF v_ledger IS NOT NULL THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: es produccion';
    END IF;
END
$guard$;

`;

function runLint(cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT], { cwd, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: (err.stdout || '') + (err.stderr || '') };
  }
}

function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cpinfra020-lint-'));
  mkdirSync(join(dir, 'scripts', 'ci'), { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  // el lint necesita package.json? no: solo recorre archivos. Copiar allowlist vacío.
  writeFileSync(join(dir, 'scripts', 'ci', 'destructive-allowlist.json'),
    JSON.stringify({ exceptions: {} }));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

describe('CP-INFRA-020 check-destructive-guard', () => {
  let dirs: string[] = [];
  afterAll(() => { for (const d of dirs) if (existsSync(d)) rmSync(d, { recursive: true, force: true }); });

  it('SQL destructivo con guard completo pasa', () => {
    const d = makeRepo({
      'supabase/scripts/reset.sql': GUARD_OK + 'TRUNCATE public.sales CASCADE;\nCOMMIT;\n',
    });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(0);
    expect(r.out).toContain('guard OK');
  });

  it('SQL destructivo sin guard falla', () => {
    const d = makeRepo({
      'supabase/scripts/malo.sql': 'TRUNCATE public.sales CASCADE;\n',
    });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('malo.sql');
    expect(r.out).toContain('sin guard');
  });

  it('SQL con DELETE FROM auth.users sin guard falla', () => {
    const d = makeRepo({ 'x.sql': 'DELETE FROM auth.users;\n' });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('DELETE FROM auth.users');
  });

  it('guard DESPUÉS de la primera sentencia destructiva falla (D1.1)', () => {
    const d = makeRepo({
      'supabase/scripts/tarde.sql': "SET session_replication_role = 'replica';\n" + GUARD_OK + 'TRUNCATE public.sales;\nCOMMIT;\n',
    });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('NO precede');
  });

  it('guard incompleto (no verifica ledger) falla', () => {
    const malo = GUARD_OK.replace(/production_migration_ledger/g, 'otra_cosa');
    const d = makeRepo({ 'supabase/scripts/incompleto.sql': malo + 'TRUNCATE public.sales;\nCOMMIT;\n' });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('guard incompleto');
  });

  it('script .mjs con TRUNCATE sin assert-not-production falla; con guard pasa', () => {
    const d = makeRepo({ 'scripts/malo.mjs': 'const sql = "TRUNCATE public.sales CASCADE";\nawait client.query(sql);\n' });
    dirs.push(d);
    expect(runLint(d).code).toBe(1);

    const d2 = makeRepo({ 'scripts/bueno.mjs': '// scripts/lib/assert-not-production\nconst sql = "TRUNCATE public.sales CASCADE";\nawait client.query(sql);\n' });
    dirs.push(d2);
    expect(runLint(d2).code).toBe(0);
  });

  it('REVOKE TRUNCATE no es destructivo (permiso, no sentencia)', () => {
    const d = makeRepo({ 'permisos.sql': 'REVOKE TRUNCATE ON public.sales FROM anon;\n' });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(0);
  });

  it('GRANT con palabra TRUNCATE no cuenta como sentencia TRUNCATE', () => {
    const d = makeRepo({ 'g.sql': 'GRANT SELECT, TRUNCATE ON public.sales TO authenticated;\n' });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(0);
  });

  it('session_replication_role=replica sin guard falla', () => {
    const d = makeRepo({ 'repl.sql': "SET session_replication_role = 'replica';\nTRUNCATE TABLE public.stores;\n" });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(1);
    expect(r.out).toContain('session_replication_role');
  });

  it('audit-evidence con TRUNCATE solo advierte (no falla)', () => {
    const d = makeRepo({ 'audit-evidence/OLD/ev.sql': 'TRUNCATE public.sales CASCADE;\n' });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(0);
    expect(r.out).toContain('solo advertencia');
  });

  it('excepción de allowlist vencida vuelve a fallar (fail-closed)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cpinfra020-exp-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'scripts', 'ci'), { recursive: true });
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'ci', 'destructive-allowlist.json'), JSON.stringify({
      exceptions: { 'viejo.sql': { expires: '2020-01-01', justification: 'expirada hace años para el test de fail-closed' } },
    }));
    writeFileSync(join(dir, 'viejo.sql'), 'TRUNCATE public.sales;\n');
    const r = runLint(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('VENCIDA');
  });

  it('excepción vigente y justificada pasa', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cpinfra020-exp2-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'scripts', 'ci'), { recursive: true });
    mkdirSync(join(dir, '.git'), { recursive: true });
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'ci', 'destructive-allowlist.json'), JSON.stringify({
      exceptions: { 'docs/ejemplo.sql': { expires: '2099-01-01', justification: 'documento de ejemplo historico de solo lectura, no ejecutable' } },
    }));
    writeFileSync(join(dir, 'docs', 'ejemplo.sql'), 'TRUNCATE TABLE public.sales;\n');
    const r = runLint(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain('EXCEPCIÓN');
  });

  it('fixture de test con destructivo: informativo, no falla', () => {
    const d = makeRepo({ 'src/__tests__/fixtures/deleter.fixture.ts': 'export const sql = "DELETE FROM auth.users;";\n' });
    dirs.push(d);
    const r = runLint(d);
    expect(r.code).toBe(0);
    expect(r.out).toContain('informativo');
  });

  it('smoke de integración: el repo real pasa el lint', () => {
    const r = runLint(resolve(process.cwd()));
    expect(r.code).toBe(0);
  }, 120000);
});
