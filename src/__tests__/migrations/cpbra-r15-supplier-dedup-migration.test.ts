/**
 * CP-BRA-REMEDIATION-001 — PR fix/cpbra-r15 (R-15: dedup server de proveedores).
 *
 * Test de contrato de la migración 20261126160000 (patrón estático sin BD).
 * Regla PRO-001: la duplicación de terceros NUNCA es silenciosa — la capa
 * autoritativa (RPC) exige confirmación explícita y audita la decisión
 * (unicidad NO estricta por decisión del propietario §8.4 CP-AP).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/20261126160000_cpbra_r15_supplier_dedup_guard.sql');
const HOOK = resolve(process.cwd(), 'src/hooks/api/useSuppliers.ts');
const SELECTOR = resolve(process.cwd(), 'src/components/views/terminal/views/inventory/SupplierSelector.tsx');
const sql = readFileSync(MIGRATION, 'utf8');
const hook = readFileSync(HOOK, 'utf8');
const selector = readFileSync(SELECTOR, 'utf8');

describe('migración 20261126160000 — R-15: guard server-side de duplicados de proveedores', () => {
  it('existe, transaccional, define el RPC con ACL y marca', () => {
    expect(sql).toContain('20261126160000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_supplier_local(');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_supplier_local(');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_supplier_local(');
    expect(sql).toContain('CP-BRA-REMEDIATION-001 (R-15)');
  });

  it('autorización fail-closed con anti-spoofing (canon ADN-009)', () => {
    expect(sql).toContain("WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())");
    expect(sql).toContain('ERR_UNAUTHENTICATED');
    expect(sql).toContain('public.is_admin_check(v_caller)');
    expect(sql).toContain('public.has_store_access_as(v_caller, p_store_id)');
    expect(sql).toContain('ERR_UNAUTHORIZED');
  });

  it('reuso EXACTO se conserva (comportamiento vigente del hook)', () => {
    expect(sql).toContain("'status', 'reused'");
    expect(sql).toContain('lower(btrim(s.name)) = lower(v_name)');
  });

  it('sospechosos por nombre normalizado/NIT/teléfono → fail-closed con candidatos', () => {
    expect(sql).toContain('ERR_SUPPLIER_DUPLICATE_SUSPECTED');
    // Las TRES vías de coincidencia del hallazgo (la causa raíz del quirk
    // «TiendaPueblo» era el nombre normalizado).
    expect(sql).toContain("regexp_replace(lower(btrim(s.name)), '\\s', '', 'g') = regexp_replace(v_norm, '\\s', '', 'g')");
    expect(sql).toContain("lower(btrim(COALESCE(s.tax_id, ''))) = lower(btrim(p_tax_id))");
    expect(sql).toContain("btrim(COALESCE(s.phone, '')) = btrim(p_phone)");
    // El rechazo incluye los candidatos (accionable desde la UI).
    expect(sql).toContain('v_suspects');
  });

  it('la confirmación explícita exige flag Y motivo (≥3) y se audita SIEMPRE', () => {
    const block = sql.slice(
      sql.indexOf('IF v_n_suspects > 0 THEN'),
      sql.indexOf('-- 3) Alta local'),
    );
    expect(block).toContain('p_confirm_duplicate');
    expect(block).toContain("length(btrim(COALESCE(p_duplicate_reason, ''))) >= 3");
    expect(block).toContain('ERR_SUPPLIER_DUPLICATE_SUSPECTED');
    const auditBlock = sql.slice(sql.indexOf('-- 4) Trazabilidad'));
    expect(auditBlock).toContain("'SUPPLIER_DUPLICATE_CONFIRMED'");
    expect(auditBlock).toContain("'decision', 'explicit_user_confirmation'");
    expect(auditBlock).toContain("'candidates', v_suspects");
  });

  it('NO impone unicidad estricta (decisión del propietario §8.4) ni toca RLS', () => {
    expect(sql).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(sql).not.toMatch(/ADD\s+CONSTRAINT.*UNIQUE/i);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|ENABLE ROW LEVEL SECURITY/i);
  });

  it('el hook usa el RPC autoritativo (SEC-001: la última barrera es la DB)', () => {
    expect(hook).toContain('create_supplier_local');
    expect(hook).toContain('p_confirm_duplicate');
    expect(hook).toContain('confirmDuplicate');
    // La vía de INSERT directo del cliente quedó eliminada.
    expect(hook).not.toMatch(/\.from\("suppliers"\)[\s\S]{0,200}\.insert\(/);
  });

  it('SupplierSelector envía la confirmación explícita tras su advertencia', () => {
    expect(selector).toContain('confirmDuplicate: true');
    expect(selector).toContain('duplicateReason');
    expect(selector).toContain('tras advertencia');
  });
});
