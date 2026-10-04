/**
 * E2E-PRODUCT-FIX-ROUND1 — Regresiones estáticas de los fixes de producto
 * ============================================================================
 * Cubre los tres dominios corregidos (validación de contenido de los
 * artefactos, mismo patrón que iteration-11-3/iteration-rls):
 *
 *   1. RPC overloads: la migración 20261005120000 elimina los overloads
 *      obsoletos (10-arg devolution, 5/6-arg vale) y restaura la superficie
 *      service_role-only certificada (W9.4.2-F06/REM-INV-6) en los
 *      overloads canónicos de enervida.
 *   2. BUG-022: la migración 20261005120001 privatiza el bucket 'reports'
 *      y elimina la política pública de lectura.
 *   3. DEFECT-001 + ACL: la ruta /api/inventory/adjust usa el admin client
 *      (service-role) con p_user_id del JWT y mapea movementType al enum.
 *   4. BUG-022 (app): /api/reports/generate no genera signed URLs ni URLs
 *      públicas; devuelve el endpoint autenticado /api/reports/download.
 *   5. BUG-022 (frontend): useReportState descarga el PDF con Bearer
 *      (fetch+blob), no abre la URL directamente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const SRC = (rel: string) => join(ROOT, rel);

const MIG_OVERLOADS = '20261005120000_fix_rpc_overload_ambiguity.sql';
const MIG_BUG022 = '20261005120001_bug022_reports_private_bucket.sql';

describe('E2E-PRODUCT-FIX-ROUND1 — Fix overloads RPC', () => {
  it('la migración de fix existe', () => {
    expect(existsSync(join(MIGRATIONS_DIR, MIG_OVERLOADS))).toBe(true);
  });

  it('dropea el overload obsoleto de 10 args de create_devolution_v2', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, MIG_OVERLOADS), 'utf-8');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.create_devolution_v2(');
    expect(sql).toContain('uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text\n);');
  });

  it('dropea los overloads obsoletos de 5 y 6 args de create_vale_salida', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, MIG_OVERLOADS), 'utf-8');
    const drops = sql.match(/DROP FUNCTION IF EXISTS public\.create_vale_salida\(/g) ?? [];
    expect(drops.length).toBe(2);
  });

  it('revoca PUBLIC/anon/authenticated del overload canónico (11-arg devolution, 7-arg vale)', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, MIG_OVERLOADS), 'utf-8');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_devolution_v2(');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_vale_salida(');
    expect((sql.match(/FROM PUBLIC, anon, authenticated/g) ?? []).length).toBe(2);
    expect((sql.match(/GRANT EXECUTE ON FUNCTION public\.(create_devolution_v2|create_vale_salida)\(/g) ?? []).length).toBe(2);
  });

  it('deja intactos cuerpos, RLS, triggers y tablas (solo DDL de superficie)', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, MIG_OVERLOADS), 'utf-8');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toMatch(/UPDATE\s+(?!.*storage\.buckets)/i);
  });
});

describe('E2E-PRODUCT-FIX-ROUND1 — BUG-022 bucket reports', () => {
  it('la migración BUG-022 existe', () => {
    expect(existsSync(join(MIGRATIONS_DIR, MIG_BUG022))).toBe(true);
  });

  it('privatiza el bucket y elimina la política pública', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, MIG_BUG022), 'utf-8');
    expect(sql).toContain("UPDATE storage.buckets SET public = false WHERE id = 'reports'");
    expect(sql).toContain('DROP POLICY IF EXISTS "Public Access to Reports" ON storage.objects');
    // No reintroduce lectura anónima: sin política SELECT nueva
    expect(sql).not.toContain('CREATE POLICY');
  });
});

describe('E2E-PRODUCT-FIX-ROUND1 — DEFECT-001 ruta inventory/adjust', () => {
  const route = readFileSync(SRC('src/app/api/inventory/adjust/route.ts'), 'utf-8');

  it('usa el admin client (service-role), no el client del usuario', () => {
    expect(route).toContain('getSupabaseAdminSafe');
    expect(route).not.toContain('getSupabaseAuthClient');
  });

  it('p_user_id proviene de la sesión (JWT), no del body', () => {
    expect(route).toContain('p_user_id: userId');
  });

  it('mapea movementType al enum movement_type (adjustment) con delta', () => {
    expect(route).toContain('p_movement_type: "adjustment"');
    expect(route).toContain('movementType === "subtract"');
    expect(route).toContain('movementType === "set"');
    expect(route).toContain('delta');
  });

  it('pasa p_skip_access_check (patrón certificado enervida 20261004120002: gate propio de la ruta)', () => {
    expect(route).toContain('p_skip_access_check: true');
    expect(route).toContain('withStoreAccess');
  });
});

describe('E2E-PRODUCT-FIX-ROUND1 — BUG-022 reports (app)', () => {
  const generate = readFileSync(SRC('src/app/api/reports/generate/route.ts'), 'utf-8');
  const download = readFileSync(SRC('src/app/api/reports/download/[runId]/route.ts'), 'utf-8');
  const reportState = readFileSync(SRC('src/hooks/ui/useReportState.ts'), 'utf-8');

  it('generate ya no genera signed URLs ni URLs públicas', () => {
    expect(generate).not.toContain('createSignedUrl');
    expect(generate).not.toContain('getPublicUrl');
  });

  it('generate sube el PDF con write simple (upsert false — sin política UPDATE en el bucket)', () => {
    expect(generate).toContain('upsert: false');
  });

  it('generate devuelve el endpoint autenticado de descarga', () => {
    expect(generate).toContain('/api/reports/download/');
  });

  it('existe la ruta download con withAuth y verificación de ownership', () => {
    expect(existsSync(SRC('src/app/api/reports/download/[runId]/route.ts'))).toBe(true);
    expect(download).toContain('withAuth');
    expect(download).toContain('executed_by !== session.user.id');
    expect(download).toContain("from('reports')");
  });

  it('el frontend descarga con Bearer (fetch+blob), no abre la URL directa', () => {
    expect(reportState).not.toMatch(/window\.open\(result\.url/);
    expect(reportState).toContain('Authorization: `Bearer ${token}`');
    expect(reportState).toContain('createObjectURL');
  });
});
