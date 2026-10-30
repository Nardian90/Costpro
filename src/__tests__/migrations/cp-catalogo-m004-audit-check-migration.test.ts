/**
 * MISIÓN CP-CAT-MAESTRO-004 (2026-10-30) — corrección del CHECK de auditoría.
 *
 * Contrato estático de la migración:
 *   20261030143000 — audit_logs_store_id_check tolera table_name='master_products'
 *   con store_id NULL (edición de identidad desde gobernanza de la organización).
 *
 * Invariantes verificados:
 *  - La migración solo toca el CHECK de audit_logs (sin políticas RLS, sin GRANT,
 *    sin funciones, sin datos).
 *  - El nuevo CHECK conserva las tablas originales (profiles/stores/system) y
 *    añade master_products.
 *  - Guard fail-closed presente (constraint presente + tolerancia + RPC existente).
 *  - update_master_product (consumidor del camino NULL) permanece intacto.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261030143000_cp_catalogo_audit_check_master_products.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261030143000 — CHECK de auditoría tolera master_products (piloto CP-CAT-MAESTRO-004)', () => {
  const s = read(MIGRATION);

  it('reemplaza audit_logs_store_id_check sin tocar nada más', () => {
    expect(s).toMatch(/DROP CONSTRAINT audit_logs_store_id_check/);
    expect(s).toMatch(/ADD CONSTRAINT audit_logs_store_id_check/);
    expect(s).not.toMatch(/DROP POLICY|CREATE POLICY|GRANT |REVOKE |CREATE OR REPLACE FUNCTION/);
    expect(s).not.toMatch(/DELETE FROM|UPDATE public\.|INSERT INTO public\.(?!audit_logs)/);
  });

  it('el nuevo CHECK conserva las tablas originales y añade master_products', () => {
    expect(s).toMatch(/'profiles'::text/);
    expect(s).toMatch(/'stores'::text/);
    expect(s).toMatch(/'system'::text/);
    expect(s).toMatch(/'master_products'::text/);
    expect(s).toMatch(/store_id IS NOT NULL/);
  });

  it('es idempotente (DO block con IF EXISTS antes del DROP) y con guard fail-closed', () => {
    expect(s).toMatch(/IF EXISTS \([\s\S]*pg_constraint[\s\S]*audit_logs_store_id_check/);
    expect(s).toMatch(/CP-CAT-004-GUARD/);
    expect(s).toMatch(/v_def NOT LIKE '%master_products%'/);
    expect(s).toMatch(/update_master_product/);
  });

  it('documenta el defecto real y su reproducción (23514 / HTTP 400 en gobernanza)', () => {
    expect(s).toMatch(/23514/);
    expect(s).toMatch(/update_master_product/);
    expect(s).toMatch(/gobernanza/i);
  });
});
