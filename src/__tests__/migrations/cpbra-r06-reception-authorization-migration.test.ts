/**
 * CP-BRA-R06 — contrato de la migración
 * 20261128120000_cpbra_r06_reception_authorization.sql (estático, sin BD).
 *
 * Misión CP-BRA-R06-FINAL-CERTIFICATION-001 FASES 2-3:
 * decisión del propietario (vinculante) —
 *   CREAR: membresía activa + rol exacto 'encargado' en la tienda, o
 *          superadmin de plataforma. Ningún otro rol obtiene creación.
 *   CONFIRMAR/ANULAR (y editar/eliminar borrador): el CREADOR ORIGINAL con
 *          membresía activa en la tienda propietaria, o superadmin global.
 *   Históricos sin creador verificable (NULL/centinela 00000000-…) →
 *          solo superadmin.
 *
 * Este test verifica la estructura estática del SQL: helpers canónicos,
 * gates en los 9 RPC, trigger de identidad/inmutabilidad del creador,
 * políticas RLS y auditoría transaccional. La DEMOSTRACIÓN conductual de la
 * matriz completa vive en el E2E aislado (r06-reception-authorization.spec).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const SQL = readFileSync(join(DIR, '20261128120000_cpbra_r06_reception_authorization.sql'), 'utf8');

/** Cuerpo CREATE FUNCTION de un nombre dado (hasta el terminador). */
const body = (sql: string, fn: string): string => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$function\\$;`));
  return m ? m[0] : '';
};
/** Igual para cuerpos con $$ (helpers sql-language). */
const bodyDollar = (sql: string, fn: string): string => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\n\\$\\$;`));
  return m ? m[0] : '';
};
const stripComments = (s: string): string => s.replace(/--[^\n]*/g, '');

describe('CP-BRA-R06 — 20261128120000_cpbra_r06_reception_authorization.sql', () => {
  it('1. migración transaccional (BEGIN/COMMIT) e idempotente por estructura (OR REPLACE / DROP POLICY IF EXISTS)', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/\nCOMMIT;/);
    expect(SQL.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBeGreaterThanOrEqual(13); // 3 helpers + 9 RPC + trigger fn
    expect(SQL).toMatch(/DROP POLICY IF EXISTS receipts_insert_rls ON public\.receipts;/);
    expect(SQL).toMatch(/DROP POLICY IF EXISTS receipts_tenant_update ON public\.receipts;/);
    expect(SQL).toMatch(/DROP TRIGGER IF EXISTS trg_receipts_pin_creator ON public\.receipts;/);
  });

  it('2. helper is_superadmin_uid: variante por-uid del check canónico (misma fuente: profiles.role)', () => {
    const code = stripComments(bodyDollar(SQL, 'is_superadmin_uid'));
    expect(code).toContain("SELECT EXISTS (\n    SELECT 1 FROM public.profiles\n    WHERE id = p_user_id\n      AND role = 'superadmin'\n  )");
    expect(code).not.toContain('auth.uid()'); // por-uid, no por-sesión
  });

  it('3. helper can_create_reception: encargado exacto con membresía activa, o superadmin — SIN bypass de admin', () => {
    const code = stripComments(body(SQL, 'can_create_reception'));
    expect(code).toContain('public.is_superadmin_uid(p_user_id)');
    expect(code).toContain("m.role = 'encargado'::user_role");
    expect(code).toContain("m.status = 'active'");
    // El bypass de admin de plataforma NO aplica a la creación (decisión §0.1)
    expect(code).not.toContain('is_admin_check');
    expect(code).not.toContain("role IN ('admin', 'superadmin')");
  });

  it('4. helper can_manage_reception: creador + membresía activa, o superadmin; centinela histórico → solo superadmin', () => {
    const code = stripComments(body(SQL, 'can_manage_reception'));
    expect(code).toContain('public.is_superadmin_uid(p_actor)');
    expect(code).toContain("p_creator = '00000000-0000-0000-0000-000000000000'::uuid");
    expect(code).toContain('IF p_actor <> p_creator THEN RETURN false; END IF;');
    // No exige rol encargado sobre recepción propia (§0.2 explícito)
    expect(code).not.toContain("role = 'encargado'");
  });

  it('5. register_reception: gate de creación con ERR_FORBIDDEN_ROLE + auditoría con fuente de autorización', () => {
    const code = stripComments(body(SQL, 'register_reception'));
    expect(code).toContain('public.can_create_reception(v_caller_uid, p_store_id)');
    expect(code).toContain('ERR_FORBIDDEN_ROLE');
    expect(code).not.toContain('has_store_access_as(v_caller_uid, p_store_id)');
    expect(code).toContain("'authorization_source'");
    expect(code).toContain('public.is_superadmin_uid(v_caller_uid)');
    // la mecánica certificada queda intacta
    expect(code).toContain('PERFORM public.validate_operation_date(p_reception_date, p_store_id)');
    expect(code).toContain('INSERT INTO public.receipts (');
  });

  it('6. receive_against_po: recibir contra OC = creación → mismo gate (encargado|superadmin)', () => {
    const code = stripComments(body(SQL, 'receive_against_po'));
    expect(code).toContain('public.can_create_reception(auth.uid(), v_store_id)');
    expect(code).toContain('ERR_FORBIDDEN_ROLE');
    expect(code).not.toContain('public.has_store_access(v_store_id)');
  });

  it('7. confirm_pending_reception: creador|superadmin + auditoría transaccional RECEPTION_CONFIRMED_PENDING', () => {
    const code = stripComments(body(SQL, 'confirm_pending_reception'));
    expect(code).toContain('public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id)');
    expect(code).not.toContain('has_store_access_as(v_caller_uid, v_store_id)');
    expect(code).toContain("'RECEPTION_CONFIRMED_PENDING'");
    expect(code).toContain("'authorization_source', v_auth_source");
    expect(code).toContain("'creator_id', v_receipt.user_id");
    expect(code).toContain("'old_status', 'pending'");
    expect(code).toContain("'new_status', 'active'");
    // mecánica certificada intacta (WAC primero, FOR UPDATE, enlace documental)
    expect(code).toContain('FOR UPDATE');
    expect(code).toContain("PERFORM public.fn_recalc_wac");
    expect(code).toContain("ERR_RECEIPT_ALREADY_CONFIRMED");
  });

  it('8. void_pending_reception: creador|superadmin (guards de pagos vivos intactos) + auditoría con fuente', () => {
    const code = stripComments(body(SQL, 'void_pending_reception'));
    expect(code).toContain('public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_receipt.store_id)');
    expect(code).not.toContain('has_store_access_as(v_caller_uid, v_receipt.store_id)');
    expect(code).toContain("'RECEPTION_VOIDED_PENDING'");
    expect(code).toContain("'authorization_source'");
    expect(code).toContain("'creator_id', v_receipt.user_id");
    // guard financiero intacto
    expect(code).toContain('v_live_payments');
  });

  it('9. reverse_receipt_v2: creador|superadmin — sustituye has_store_access_as + can_reverse_document', () => {
    const code = stripComments(body(SQL, 'reverse_receipt_v2'));
    expect(code).toContain('public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_receipt.store_id)');
    expect(code).not.toContain('has_store_access_as(v_caller_uid, v_receipt.store_id)');
    // El gate de rol antiguo desaparece del cuerpo (la fuente única es el creador)
    expect(code).not.toContain('can_reverse_document');
    expect(code).toContain("'authorization_source'");
    expect(code).toContain("'creator_id', v_receipt.user_id");
    expect(code).toContain("'old_status', v_receipt.status, 'new_status', 'reversed'");
  });

  it('10. delete/save/add/update de borradores: creador|superadmin (intervenir = derecho del creador)', () => {
    for (const fn of ['delete_pending_reception', 'save_pending_reception_changes', 'add_reception_items', 'update_reception_items']) {
      const code = stripComments(body(SQL, fn));
      expect(code, `${fn}: gate nuevo`).toContain('public.can_manage_reception(v_caller_uid, v_receipt.user_id,');
      expect(code, `${fn}: gate viejo fuera`).not.toContain('has_store_access_as(v_caller_uid, v_store_id)');
    }
    // 10º RPC: la corrección de tasa/moneda de línea de borrador (vía
    // service_role desde la ruta) también es del creador. El SELECT añade
    // r.user_id AS receipt_creator para el gate.
    const tasa = stripComments(body(SQL, 'update_receipt_item_tasa'));
    expect(tasa).toContain('r.user_id AS receipt_creator');
    expect(tasa).toContain('public.can_manage_reception(v_caller_uid, v_item.receipt_creator, v_store_id)');
    expect(tasa).not.toContain('has_store_access_as(v_caller_uid, v_store_id)');
    expect(tasa).toContain('ERR_ALREADY_VOIDED'); // guards de estado intactos
  });

  it('11. trigger receipts_pin_creator: identidad del servidor en INSERT + inmutabilidad en UPDATE', () => {
    const code = stripComments(body(SQL, 'receipts_pin_creator'));
    expect(code).toContain("IF auth.role() = 'service_role' THEN");
    expect(code).toContain('NEW.user_id := COALESCE(NEW.user_id, auth.uid())');
    expect(code).toContain("ELSIF auth.role() = 'authenticated' THEN");
    expect(code).toContain('NEW.user_id := auth.uid()');
    expect(code).toContain('ERR_CREATOR_REQUIRED');
    expect(code).toContain('IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN');
    expect(code).toContain('ERR_CREATOR_IMMUTABLE');
    expect(SQL).toMatch(/CREATE TRIGGER trg_receipts_pin_creator\n  BEFORE INSERT OR UPDATE OF user_id ON public\.receipts/);
  });

  it('12. RLS: creación=encargado|superadmin; mutación/borrado=creador|superadmin; receipt_items=creación', () => {
    const insertPol = SQL.match(/CREATE POLICY receipts_insert_rls ON public\.receipts[\s\S]*?\);/)?.[0] || '';
    expect(stripComments(insertPol)).toContain('public.is_superadmin()');
    expect(stripComments(insertPol)).toContain("m.role = 'encargado'::user_role");
    expect(stripComments(insertPol)).toContain("m.status = 'active'");

    const updatePol = SQL.match(/CREATE POLICY receipts_update_rls ON public\.receipts[\s\S]*?\n  WITH CHECK[\s\S]*?\);/)?.[0] || '';
    expect(stripComments(updatePol)).toContain('receipts.user_id = auth.uid()');
    // El bypass is_admin() de la política anterior desaparece
    expect(stripComments(updatePol)).not.toContain('is_admin()');

    const deletePol = SQL.match(/CREATE POLICY receipts_delete_rls ON public\.receipts[\s\S]*?\n  USING \([\s\S]*?\);/)?.[0] || '';
    expect(stripComments(deletePol)).toContain('receipts.user_id = auth.uid()');
    expect(stripComments(deletePol)).toContain("receipts.status = 'pending'");

    const itemsPol = SQL.match(/CREATE POLICY receipt_items_insert_isolated ON public\.receipt_items[\s\S]*?\);/)?.[0] || '';
    expect(stripComments(itemsPol)).toContain("m.role = 'encargado'::user_role");
    expect(stripComments(itemsPol)).not.toContain('has_store_access(r.store_id)');
  });

  it('13. ACL: helpers nuevos REVOKE PUBLIC/anon + GRANT authenticated,service_role', () => {
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_superadmin_uid\(uuid\) FROM PUBLIC, anon;/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_superadmin_uid\(uuid\) TO authenticated, service_role;/);
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.can_create_reception\(uuid, uuid\) FROM PUBLIC, anon;/);
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.can_manage_reception\(uuid, uuid, uuid\) FROM PUBLIC, anon;/);
  });

  it('14. el manifiesto replay incluye la migración en la posición 226 (stream 226)', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json'), 'utf8'),
    ) as { archivos: Array<{ nombre: string; estado: string }>; total_incluidos: number };
    const incluidos = manifest.archivos.filter((m) => m.estado === 'incluido');
    const idx = incluidos.findIndex((m) => m.nombre === '20261128120000_cpbra_r06_reception_authorization.sql');
    expect(idx).toBe(225); // índice 0-based → posición 226 del stream (tras 20261128120000_cp_pos_transfer_identity)
    expect(manifest.total_incluidos).toBe(226);
    expect(incluidos.length).toBe(226);
  });
});
