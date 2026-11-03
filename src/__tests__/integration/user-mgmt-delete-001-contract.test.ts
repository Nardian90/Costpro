/**
 * USER-MGMT-DELETE-001 — pruebas de contrato estáticas (corren en CI sin BD).
 *
 * La suite live (user-mgmt-delete-001-live.test.ts) cubre el flujo real
 * contra CostproE2E; aquí se fijan los CONTRATOS del código para que ninguna
 * regresión silenciosa desmonte la seguridad:
 *   · La ruta hard-delete exige superadmin en la RPC (no basta withRole admin).
 *   · Guardas de autoeliminación / último superadmin / bloqueos en la RPC.
 *   · El soft-delete ya no exige reason (causa raíz del bug del 400).
 *   · El modal de confirmación exige type-to-confirm y muestra bloqueos.
 *   · La UI distingue desactivar/banear (switch) de eliminar (modal).
 *   · La eliminación usa el UUID de la ruta, nunca el correo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const MIGRATION = 'supabase/migrations/20261103120000_user_mgmt_delete_001_managed_hard_delete.sql';
const HARD_ROUTE = 'src/app/api/users/[id]/hard-delete/route.ts';
const SOFT_ROUTE = 'src/app/api/users/delete/route.ts';
const MODAL = 'src/components/views/terminal/views/users/DeleteUserConfirmModal.tsx';
const HOOK = 'src/components/views/terminal/views/users/useUsersView.ts';
const VIEW = 'src/components/views/terminal/views/users/UsersManagementView.tsx';

describe('USER-MGMT-DELETE-001 — contratos de la migración SQL', () => {
  const sql = () => R(MIGRATION);

  it('managed_hard_delete_user SOLO autoriza a superadmin (rol real del caller)', () => {
    const s = sql();
    expect(s).toMatch(/v_caller_role <> 'superadmin'[\s\S]{0,120}ERR_UNAUTHORIZED: solo un SuperAdmin/);
    // el rol se lee del perfil, no de un parámetro del cliente
    expect(s).toMatch(/SELECT role INTO v_caller_role FROM public\.profiles WHERE id = v_caller_uid/);
  });

  it('preflight y ejecución bloquean la AUTOELIMINACIÓN', () => {
    const s = sql();
    const occurrences = (s.match(/ERR_SELF_DELETE_BLOCKED/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2); // preflight + ejecución
  });

  it('preflight y ejecución bloquean al ÚLTIMO superadmin activo', () => {
    const s = sql();
    expect((s.match(/ERR_LAST_SUPERADMIN/g) || []).length).toBeGreaterThanOrEqual(2);
    // el conteo excluye al objetivo y exige activo + no borrado
    expect(s).toMatch(/role = 'superadmin' AND is_active = true AND deleted_at IS NULL[\s\S]{0,80}AND id <> p_target_id/);
  });

  it('las columnas NOT NULL (ventas/transferencias/ajustes/vales/caja) BLOQUEAN, no se reescriben', () => {
    const s = sql();
    expect(s).toMatch(/ERR_BLOCKING_DEPENDENCIES/);
    // jamás SET NULL sobre columnas NOT NULL
    expect(s).not.toMatch(/UPDATE public\.transactions\s+SET seller_id\s*=\s*NULL/);
    expect(s).not.toMatch(/UPDATE public\.transfers\s+SET created_by\s*=\s*NULL/);
    expect(s).not.toMatch(/UPDATE public\.cash_sessions\s+SET cashier_id\s*=\s*NULL/);
  });

  it('el historial comercial nullable se PRESERVA desenlazado (SET NULL manual)', () => {
    const s = sql();
    expect(s).toMatch(/UPDATE public\.sales\s+SET cashier_id\s*=\s*NULL/);
    expect(s).toMatch(/UPDATE public\.kardex_entries\s+SET created_by\s*=\s*NULL/);
    expect(s).toMatch(/UPDATE public\.receipts\s+SET user_id\s*=\s*NULL/);
    expect(s).toMatch(/UPDATE public\.audit_logs\s+SET user_id\s*=\s*NULL/);
    expect(s).toMatch(/UPDATE public\.tenants\s+SET owner_id\s*=\s*NULL/);
  });

  it('auditoría USER_HARD_DELETED con razón, mecanismo y snapshot de lo preservado', () => {
    const s = sql();
    expect(s).toMatch(/'USER_HARD_DELETED'/);
    expect(s).toMatch(/jsonb_build_object\(\s*'reason', p_reason/);
    expect(s).toMatch(/'mechanism', 'managed_hard_delete_user \(USER-MGMT-DELETE-001\)'/);
    expect(s).toMatch(/'business_records_preserved', v_preserved/);
  });

  it('idempotencia: usuario ya eliminado → success/already_deleted (no error)', () => {
    expect(sql()).toMatch(/'already_deleted', true/);
  });

  it('identidad Auth se elimina (hijos primero) y el profile físico también', () => {
    const s = sql();
    expect(s).toMatch(/DELETE FROM auth\.refresh_tokens/);
    expect(s).toMatch(/DELETE FROM auth\.sessions/);
    expect(s).toMatch(/DELETE FROM auth\.identities/);
    expect(s).toMatch(/DELETE FROM auth\.mfa_factors/);
    expect(s).toMatch(/DELETE FROM auth\.users\s+WHERE id = p_target_id/);
    expect(s).toMatch(/DELETE FROM public\.profiles WHERE id = p_target_id/);
  });

  it('membresías y datos user-scoped sin historial se limpian', () => {
    const s = sql();
    expect(s).toMatch(/DELETE FROM public\.user_store_memberships WHERE user_id = p_target_id/);
    expect(s).toMatch(/DELETE FROM public\.user_preferences/);
  });

  it('ACL: service_role únicamente (patrón REM-INV-6)', () => {
    const s = sql();
    expect((s.match(/REVOKE EXECUTE ON FUNCTION public\.(managed_hard_delete_user|managed_delete_user_preflight)[^(]*\([^)]*\) FROM PUBLIC, anon, authenticated/g) || []).length).toBe(2);
    expect((s.match(/GRANT EXECUTE ON FUNCTION public\.(managed_hard_delete_user|managed_delete_user_preflight)[^(]*\([^)]*\) TO service_role/g) || []).length).toBe(2);
  });

  it('el trigger prevent_hard_delete_profile se deshabilita y SIEMPRE se re-habilita (excepción incluida)', () => {
    const s = sql();
    expect(s).toMatch(/DISABLE TRIGGER %I', r\.tgname/);
    // re-habilitación en el bloque EXCEPTION y al final
    expect((s.match(/ENABLE TRIGGER %I/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('USER-MGMT-DELETE-001 — contratos de la ruta hard-delete', () => {
  it('doble verificación: withRole(admin) + superadmin dentro de la RPC', () => {
    const s = R(HARD_ROUTE);
    expect(s).toMatch(/withRole\('admin'/);
    expect(s).toMatch(/managed_hard_delete_user/);
    expect(s).toMatch(/managed_delete_user_preflight/);
  });

  it('el UUID llega por la RUTA (nunca el correo como identificador de borrado)', () => {
    const s = R(HARD_ROUTE);
    expect(s).toMatch(/pathParts\[pathParts\.length - 2\]/);
    expect(s).toMatch(/\/\^\[0-9a-f\]\{8\}/); // validación UUID estricta
    expect(s).not.toMatch(/p_email/);
  });

  it('preflight SIN efectos vía ?preflight=1', () => {
    expect(R(HARD_ROUTE)).toMatch(/searchParams\.get\('preflight'\) === '1'/);
  });

  it('razón obligatoria (Zod) en la ejecución', () => {
    const s = R(HARD_ROUTE);
    expect(s).toMatch(/z\.string\(\)\.min\(3, 'Razón requerida \(mín 3 chars\)'\)\.max\(500\)/);
  });

  it('errores de la RPC mapeados a mensajes claros sin fuga interna', () => {
    const s = R(HARD_ROUTE);
    for (const code of ['ERR_SELF_DELETE_BLOCKED', 'ERR_LAST_SUPERADMIN', 'ERR_USER_NOT_FOUND', 'ERR_UNAUTHORIZED', 'ERR_BLOCKING_DEPENDENCIES']) {
      expect(s).toContain(code);
    }
    expect(s).toMatch(/No se pudo eliminar el usuario/); // fallback sanitizado
  });

  it('rate limiting específico para la operación', () => {
    expect(R(HARD_ROUTE)).toMatch(/rateLimit\(`users:hard-delete:/);
  });
});

describe('USER-MGMT-DELETE-001 — causa raíz corregida en el soft-delete', () => {
  it('reason OPCIONAL (el 400 histórico ya no bloquea el flujo de la vista)', () => {
    const s = R(SOFT_ROUTE);
    expect(s).toMatch(/reason: z\.string\(\)\.min\(3\)\.max\(500\)\.optional\(\)/);
    expect(s).toMatch(/reason \?\? '/); // default cuando la UI no lo envía
  });
});

describe('USER-MGMT-DELETE-001 — contratos de la UI', () => {
  it('el modal exige escribir ELIMINAR (type-to-confirm) y una razón', () => {
    const s = R(MODAL);
    expect(s).toMatch(/'ELIMINAR'/);
    expect(s).toMatch(/confirmText\.trim\(\)\.toUpperCase\(\) === 'ELIMINAR'/);
    expect(s).toMatch(/reason\.trim\(\)\.length >= 3/);
  });

  it('el modal muestra nombre, correo (si existe), tiendas y bloqueos del preflight', () => {
    const s = R(MODAL);
    expect(s).toMatch(/sin correo visible/);   // caso §6 sin correo
    expect(s).toMatch(/Tiendas asignadas/);
    expect(s).toMatch(/blocking_dependencies/);
    expect(s).toMatch(/can_delete/);
  });

  it('el modal distingue cuentas parciales (solo Auth / solo profiles)', () => {
    const s = R(MODAL);
    expect(s).toMatch(/profile_present === false/);
    expect(s).toMatch(/auth_present === false/);
  });

  it('el botón se bloquea mientras corre (sin dobles solicitudes)', () => {
    const s = R(MODAL);
    expect(s).toMatch(/isProcessing/);
    expect(s).toMatch(/disabled=\{!ready\}/);
  });

  it('la vista distingue eliminar DEFINITIVO (solo superadmin) de desactivar/banear (switch)', () => {
    const s = R(VIEW);
    expect(s).toMatch(/Eliminar definitivamente/);
    expect(s).toMatch(/!isSuperAdmin/);
    expect(s).toMatch(/handleToggleUserStatus/);
  });

  it('el hook: preflight al abrir, confirmación por UUID, refresco de todas las queries derivadas', () => {
    const s = R(HOOK);
    expect(s).toMatch(/hard-delete\?preflight=1/);
    expect(s).toMatch(/\/api\/users\/\$\{userId\}\/hard-delete/);
    expect(s).toMatch(/queryKey: \['users'\]/);
    expect(s).toMatch(/queryKey: \['memberships'\]/);
    // ya NO usa confirm() nativo
    expect(s).not.toMatch(/if\s*\(confirm\(/);
  });

  it('el fallo NO cierra el modal ni oculta el usuario (resultado real)', () => {
    const s = R(HOOK);
    expect(s).toMatch(/const confirmHardDelete = async[\s\S]*?toast\.error[\s\S]*?return false;/);
  });
});
