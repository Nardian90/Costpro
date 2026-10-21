/**
 * Test de contrato — migraciones preparadas CP-SEC-003 y CP-UI-001 (2026-10-22).
 *
 * Estas migraciones están PREPARADAS para revisión del propietario: NO se
 * aplican desde esta misión (la BD compartida es production). El contrato
 * que este test blinda:
 *
 *  1. CP-SEC-003: la consolidación de policies de UPDATE de products DEBE
 *     traer un guard fail-closed que aborte si existen filas con tenant_id
 *     NULL (requieren backfill autorizado previo) y SOLO dropear la policy
 *     supersa (products_update_rls), nunca la estricta (products_tenant_update).
 *  2. CP-UI-001: el constraint de exclusión de periodos solapados DEBE
 *     verificar solapes vigentes antes de crear el constraint (con detalle
 *     de los pares conflictivos), usar btree_gist y ser idempotente.
 *  3. Ninguna de las dos ejecuta writes de datos: solo DDL de policies/
 *     constraints + guards SELECT-only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIG = join(process.cwd(), 'supabase/migrations');
const SEC003 = readFileSync(
  join(MIG, '20261022000001_cp_sec_003_products_update_policy_consolidation.sql'), 'utf8');
const UI001 = readFileSync(
  join(MIG, '20261022000002_cp_ui_001_commission_payments_no_overlap.sql'), 'utf8');

describe('Migración CP-SEC-003 — consolidación policies UPDATE products', () => {
  it('guard fail-closed: aborta si hay productos con tenant_id NULL', () => {
    expect(SEC003).toContain('WHERE tenant_id IS NULL');
    expect(SEC003).toContain('RAISE EXCEPTION');
    expect(SEC003).toMatch(/PRE-CONDICI[ÓO]N NO CUMPLIDA/);
  });

  it('solo elimina la policy débil supersa, conserva la estricta', () => {
    expect(SEC003).toContain('DROP POLICY IF EXISTS "products_update_rls" ON public.products;');
    expect(SEC003).not.toContain('DROP POLICY IF EXISTS "products_tenant_update"');
    expect(SEC003).not.toContain('DROP POLICY IF EXISTS "products_tenant_insert"');
    expect(SEC003).not.toContain('DROP POLICY IF EXISTS "products_delete_rls"');
  });

  it('sin writes de datos ni grants: DDL de policies + guard SELECT-only', () => {
    expect(SEC003).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\s+public\.products\b/i);
    expect(SEC003).not.toMatch(/GRANT\s+EXECUTE/i);
    expect(SEC003).toMatch(/REVERSIBILIDAD/);
  });
});

describe('Migración CP-UI-001 — exclusion constraint de periodos solapados', () => {
  it('guard fail-closed: aborta con el DETALLE de pares solapados vigentes', () => {
    expect(UI001).toContain('cp1.id < cp2.id');
    expect(UI001).toContain("status <> 'cancelled'");
    expect(UI001).toMatch(/daterange\(cp1\.period_start, cp1\.period_end/);
    expect(UI001).toMatch(/string_agg/);
    expect(UI001).toMatch(/PRE-CONDICI[ÓO]N NO CUMPLIDA/);
  });

  it('constraint: btree_gist + rango inclusivo + parcial sobre cancelados + idempotente', () => {
    expect(UI001).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(UI001).toContain('EXCLUDE USING gist');
    expect(UI001).toContain("daterange(period_start, period_end, ''[]'')");
    expect(UI001).toContain("WHERE (status <> ''cancelled'')");
    expect(UI001).toContain("conname = 'commission_payments_no_overlap'");
  });

  it('reversibilidad documentada y sin writes de datos', () => {
    // La nota de reversibilidad cruza líneas de comentario (-- ) — se
    // comprueban los tokens, no el layout exacto.
    expect(UI001).toMatch(/DROP CONSTRAINT IF EXISTS/);
    expect(UI001).toContain('commission_payments_no_overlap');
    expect(UI001).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\s+public\.commission_payments\b/i);
  });
});
