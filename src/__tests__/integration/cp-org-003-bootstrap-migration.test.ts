/**
 * CP-ORG-003 Fase 2 — Validación estática de la migración del bootstrap
 * (20261026210000_cp_org_003_fase2_bootstrap_tenant_admin.sql).
 *
 * Patrón de integration/iteration-12: leer el SQL fuente y verificar los
 * contratos de seguridad QUE DEBEN existir por construcción. La ejecución
 * contra una DB real queda en las suites LIVE-DB (omitidas en sandbox por
 * política del repo).
 *
 * Contratos (misión §4):
 *   - SECURITY DEFINER + search_path fijado (sin secuestro de esquema).
 *   - ACL: REVOKE anon; GRANT authenticated + service_role.
 *   - Path authenticated: tenant SIEMPRE del profile (p_tenant_id ignorado),
 *     gate de rol interno (tenant_admin/admin/superadmin), límite por PLAN
 *     DEL TENANT (nunca del cliente).
 *   - Cuota per-tenant atómica (ERR_STORE_LIMIT_REACHED dentro de la misma
 *     transacción que el INSERT).
 *   - Tienda + membresía inicial atómicas (mismo cuerpo de función).
 *   - Idempotente (DROP overloads + CREATE OR REPLACE).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20261026210000_cp_org_003_fase2_bootstrap_tenant_admin.sql';
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf-8');

describe('CP-ORG-003 F2 — Migración bootstrap: privilegios y endurecimiento del RPC', () => {
  it('conserva SECURITY DEFINER con search_path fijado (sin secuestro de esquema)', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO public, pg_temp");
  });

  it('ACL idéntica a Iteración 13: REVOKE anon, GRANT authenticated + service_role', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_store_with_membership FROM anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_store_with_membership TO service_role');
  });

  it('idempotente: DROP de overloads previos + CREATE OR REPLACE', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.create_store_with_membership(');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_store_with_membership(');
  });

  it('distingue el path del caller por auth.role() — no solo por parámetros', () => {
    expect(sql).toContain("auth.role() = 'service_role'");
  });
});

describe('CP-ORG-003 F2 — Path authenticated: scope, gate y cuota internos', () => {
  it('el tenant se resuelve del PROFILE del caller — p_tenant_id NO se usa en ese path', () => {
    // Dentro del bloque IF NOT v_is_service: SELECT role, tenant_id FROM profiles
    expect(sql).toContain('SELECT role, tenant_id INTO v_caller_role, v_tenant');
    // Y NO existe asignación v_tenant := p_tenant_id en el path authenticated
    // (la única referencia a p_tenant_id para resolver tenant vive en el ELSE service_role).
    const elseBlock = sql.split('ELSE\n    -- Path service_role')[1]?.split('END IF;')[0] ?? '';
    expect(elseBlock).toContain('v_tenant := COALESCE(p_tenant_id');
    const authBlock = sql.split('IF NOT v_is_service THEN')[1]?.split('ELSE\n    -- Path service_role')[0] ?? '';
    expect(authBlock).not.toContain('v_tenant := COALESCE(p_tenant_id');
  });

  it('gate de rol interno: solo tenant_admin/admin/superadmin por sesión directa', () => {
    expect(sql).toContain("v_caller_role IS DISTINCT FROM 'tenant_admin'");
    expect(sql).toContain("v_caller_role NOT IN ('admin', 'superadmin')");
    expect(sql).toContain('ERR_UNAUTHORIZED');
  });

  it('límite por PLAN DEL TENANT en el path authenticated (nunca del cliente)', () => {
    const authLimitBlock = sql.split('IF v_is_service THEN')[1]?.split('ELSE')[0] ?? '';
    expect(authLimitBlock).toContain('v_limit := p_max_stores'); // solo path service
    const tenantPlanBlock = sql.split('SELECT plan INTO v_plan FROM public.tenants WHERE id = v_tenant')[1]?.split('END IF;')[0] ?? '';
    expect(tenantPlanBlock).toContain("WHEN 'free'::plan_t THEN 1");
    expect(tenantPlanBlock).toContain("WHEN 'pro'::plan_t THEN 3");
    expect(tenantPlanBlock).toContain("WHEN 'enterprise'::plan_t THEN 10");
  });

  it('cuota per-tenant atómica: COUNT por tenant + ERR_STORE_LIMIT_REACHED antes del INSERT', () => {
    expect(sql).toContain('WHERE tenant_id = v_tenant AND is_active = true');
    expect(sql).toContain('ERR_STORE_LIMIT_REACHED');
    expect(sql.indexOf('ERR_STORE_LIMIT_REACHED')).toBeLessThan(sql.indexOf('INSERT INTO public.stores'));
  });

  it('tienda + membresía admin inicial + active_store_id + audit: ATÓMICOS (misma función)', () => {
    expect(sql).toContain('INSERT INTO public.stores (');
    expect(sql).toContain("INSERT INTO public.user_store_memberships (user_id, store_id, role, status)");
    expect(sql).toContain("VALUES (v_caller_uid, v_store_id, 'admin', 'active')");
    expect(sql).toContain('UPDATE public.profiles SET active_store_id = v_store_id');
    expect(sql).toContain("VALUES ('store_created', 'stores'");
    // La membresía del caller es de TIENDA (admin), no un rol global:
    expect(sql).not.toContain("UPDATE public.profiles SET role = 'admin'");
  });

  it('el audit log registra el path del caller (trazabilidad del bootstrap)', () => {
    expect(sql).toContain("'caller_path'");
  });
});
