/**
 * MISIÓN TRANSVERSAL DE SEGURIDAD (2026-10-27) — Verificación estática de la
 * migración 20261027120000_has_store_access_as_superadmin_policy.sql.
 *
 * Contrato crítico:
 *   - La RAÍZ has_store_access_as delega el nivel administrativo de perfil a
 *     is_admin_check(p_user_id) — check central ('admin','superadmin') — en
 *     lugar del check estricto «v_role = 'admin'» que falsamente rechazaba
 *     al SuperAdmin (sin membresías por diseño) en los 59 flujos vivos.
 *   - Los 4 helpers derivados (can_admin_reverse_transaction,
 *     can_pos_undo_transaction, can_reverse_document,
 *     has_management_access_as) y el consumidor con gate propio
 *     (approve_transfer) aplican la MISMA delegación central.
 *   - Los checks de MEMBRESÍA de tienda conservan su semántica operativa
 *     exacta (incluido el rol de tienda 'admin' de can_reverse_document).
 *   - can_pos_undo_transaction conserva TODOS sus gates previos (vendedor,
 *     30s, completed) — el nivel administrativo no exime ser el vendedor.
 *   - Sin GRANT/REVOKE nuevos: ACL viva preservada (CREATE OR REPLACE).
 *   - Guard de existencia y firma de is_admin_check antes de delegar.
 *   - Ninguna firma cambia (compatibilidad con los 59 consumidores).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261027120000_has_store_access_as_superadmin_policy.sql';

function sql(file = MIGRATION): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

/** elimina comentarios -- y bloque (misma técnica que el contrato de seguridad estático: los checks corren sobre texto sin comentarios) */
function stripComments(t: string): string {
  return t
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** extrae el cuerpo CREATE OR REPLACE de una función del archivo */
function fnBody(s: string, name: string): string {
  const start = s.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = s.indexOf('$function$', s.indexOf('AS $function$', start) + 'AS $function$'.length);
  return s.slice(start, end);
}

describe('migración 20261027120000 — política superadmin de has_store_access_as y familia', () => {
  it('recrea exactamente las 6 funciones del alcance (ni más ni menos)', () => {
    const s = sql();
    const created = s.match(/CREATE OR REPLACE FUNCTION public\.[a-z_]+\(/g) || [];
    expect(created.sort()).toEqual([
      'CREATE OR REPLACE FUNCTION public.approve_transfer(',
      'CREATE OR REPLACE FUNCTION public.can_admin_reverse_transaction(',
      'CREATE OR REPLACE FUNCTION public.can_pos_undo_transaction(',
      'CREATE OR REPLACE FUNCTION public.can_reverse_document(',
      'CREATE OR REPLACE FUNCTION public.has_management_access_as(',
      'CREATE OR REPLACE FUNCTION public.has_store_access_as(',
    ].sort());
  });

  it('guard de existencia y firma de is_admin_check(uuid) antes de las definiciones', () => {
    const s = sql();
    const guard = s.indexOf('GUARD: public.is_admin_check(uuid)');
    const firstDef = s.indexOf('CREATE OR REPLACE FUNCTION public.has_store_access_as(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstDef);
    // el guard exige la semántica ('admin','superadmin')
    expect(s).toContain("ILIKE '%''admin'', ''superadmin''%'");
  });

  it('RAÍZ: has_store_access_as delega el nivel administrativo a is_admin_check y conserva la membresía', () => {
    const b = fnBody(sql(), 'has_store_access_as');
    // delegación central
    expect(b).toContain('IF public.is_admin_check(p_user_id) THEN RETURN true; END IF;');
    // NO queda check estricto de perfil 'admin' (sobre código, sin comentarios)
    expect(stripComments(b)).not.toMatch(/v_role\s*=\s*'admin'/);
    // denegación segura NULL preservada
    expect(b).toContain('IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;');
    // membresía activa intacta (semántica operativa byte-consistente)
    expect(b.replace(/\s+/g, ' ')).toContain(
      "SELECT 1 FROM public.user_store_memberships WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'"
    );
    // firma y atributos preservados
    expect(sql()).toContain(
      'CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid)'
    );
    expect(fnBody(sql(), 'has_store_access_as')).toMatch(/SECURITY DEFINER/);
  });

  it('can_admin_reverse_transaction: is_admin_check + membresía admin/manager/encargado intacta', () => {
    const b = fnBody(sql(), 'can_admin_reverse_transaction');
    expect(b).toContain('IF public.is_admin_check(p_actor) THEN RETURN true; END IF;');
    expect(stripComments(b)).not.toMatch(/v_profile_role\s*=\s*'admin'/);
    expect(b).toContain("COALESCE(v_membership_role IN ('admin','manager','encargado'), false)");
    expect(b).toContain('IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;');
  });

  it('can_pos_undo_transaction: is_admin_check + TODOS los gates POS previos conservados', () => {
    const b = fnBody(sql(), 'can_pos_undo_transaction');
    expect(b).toContain('IF public.is_admin_check(p_actor) THEN RETURN true; END IF;');
    expect(stripComments(b)).not.toMatch(/v_profile_role\s*=\s*'admin'/);
    // gates POS intactos: completed, vendedor = actor, ventana 30s
    expect(b).toContain("IF v_tx.status <> 'completed' THEN RETURN false; END IF;");
    expect(b).toContain('IF v_tx.seller_id IS NULL OR v_tx.seller_id <> p_actor THEN RETURN false; END IF;');
    expect(b).toContain("INTERVAL '30 seconds'");
    expect(b).toContain("COALESCE(v_membership_role IN ('admin','manager','encargado','clerk'), false)");
  });

  it('can_reverse_document: is_admin_check de perfil + check de MEMBRESÍA de tienda intacto', () => {
    const b = fnBody(sql(), 'can_reverse_document');
    expect(b).toContain('IF public.is_admin_check(p_actor) THEN RETURN true; END IF;');
    // el check estricto de PERFIL desaparece…
    expect(stripComments(b)).not.toMatch(/v_profile_role\s*=\s*'admin'/);
    // …pero el rol de TIENDA 'admin' (membresía) se conserva
    expect(b).toContain("IF v_membership_role = 'admin' THEN RETURN true; END IF;");
    // matriz operativa por tipo de documento intacta
    expect(b).toContain("WHEN 'receipt' THEN");
    expect(b).toContain("RETURN v_membership_role IN ('manager','encargado','warehouse');");
    expect(b).toContain("RETURN v_membership_role IN ('manager','costo');");
  });

  it('has_management_access_as: plataforma vía is_admin_check + manager/encargado de perfil y membresía admin/manager intactos', () => {
    const b = fnBody(sql(), 'has_management_access_as');
    expect(b).toContain('public.is_admin_check(p_user_id)');
    // perfiles operativos manager/encargado conservados (admin pasa por el check central)
    expect(b).toContain("role IN ('manager', 'encargado')");
    expect(b).not.toMatch(/role IN \('admin', 'manager', 'encargado'\)/);
    // bypass de servicio y membresía admin/manager intactos
    expect(b).toContain("CASE WHEN auth.role() = 'service_role' THEN true");
    expect(b).toContain("AND role IN ('admin', 'manager')");
  });

  it('approve_transfer: override de aprobador delegado a is_admin_check; hardening de nulidad intacto', () => {
    const b = fnBody(sql(), 'approve_transfer');
    expect(b).toContain(
      "v_has_approver_role := v_user_role = ANY(v_rule.approver_roles) OR public.is_admin_check(v_caller_uid);"
    );
    expect(stripComments(b)).not.toMatch(/v_user_role\s*=\s*'admin'/);
    // anti-spoofing H-7 conservado
    expect(b).toContain(
      "CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END"
    );
    // trampas de nulidad 2026-10-21 conservadas
    expect(b).toContain("IS DISTINCT FROM 'PENDIENTE'");
    expect(b).toContain('COALESCE(v_transfer.requires_approval, false)');
    // gate de acceso al origen (has_store_access_as) conservado
    expect(b).toContain('public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id)');
  });

  it('sin GRANT/REVOKE nuevos (ACL viva preservada por CREATE OR REPLACE)', () => {
    const s = sql();
    expect(stripComments(s)).not.toMatch(/\bGRANT\b/);
    expect(stripComments(s)).not.toMatch(/\bREVOKE\b/);
  });

  it("regresión: el check estricto de perfil «= 'admin'» desaparece de TODAS las funciones de perfil", () => {
    // Sobre código (sin comentarios), en los 6 cuerpos la única igualdad
    // estricta a 'admin' que debe quedar es la de MEMBRESÍA de tienda en
    // can_reverse_document.
    const s = stripComments(sql());
    const strict = s.match(/=\s*'admin'/g) || [];
    expect(strict.length).toBe(1); // v_membership_role = 'admin' (rol de tienda)
    expect(s).toContain("IF v_membership_role = 'admin' THEN RETURN true; END IF;");
  });
});
