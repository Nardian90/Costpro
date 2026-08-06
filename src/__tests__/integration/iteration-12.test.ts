/**
 * Iteración 12 — Pruebas PT-12.x
 * Tests para el módulo Usuarios (v2.14).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

// ============================================================================
// PT-12.1 — Migrations existentes (esquema)
// ============================================================================
describe('PT-12.1 — Migrations de esquema (1-6)', () => {
  it('plan_enum migration crea tipo plan_t', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000001_v2_14_1_plan_enum.sql'), 'utf-8');
    expect(sql).toContain("CREATE TYPE plan_t AS ENUM ('free', 'pro', 'enterprise')");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS plan_new plan_t');
    expect(sql).toContain('basico'); // backfill mapping basico → free
    expect(sql).toContain('free'); // backfill target value
  });

  it('profiles_soft_delete migration añade columnas + trigger', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000002_v2_14_2_profiles_soft_delete.sql'), 'utf-8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS deletion_reason TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS deleted_by UUID');
    expect(sql).toContain('prevent_hard_delete_profile');
    expect(sql).toContain('profiles_email_active_unique_idx');
  });

  it('orphaned_users_log migration crea tabla con UNIQUE auth_user_id', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000003_v2_14_3_orphaned_users_log.sql'), 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.orphaned_users_log');
    expect(sql).toContain('auth_user_id UUID NOT NULL UNIQUE');
    expect(sql).toContain("CHECK (status IN ('pending', 'resolved', 'ignored', 'pending_deletion'))");
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('user_invitations migration crea tabla con token_hash', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000004_v2_14_4_user_invitations.sql'), 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_invitations');
    expect(sql).toContain('token_hash TEXT NOT NULL UNIQUE');
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))");
  });

  it('user_audit_log_enhancements migration añade CHECK + index', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000005_v2_14_5_user_audit_log_enhancements.sql'), 'utf-8');
    expect(sql).toContain("CHECK (performed_by IS NOT NULL OR action LIKE 'SYSTEM_%')");
    expect(sql).toContain('idx_user_audit_log_target_created');
  });

  it('is_global_admin_doc migration actualiza COMMENT', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000006_v2_14_6_is_global_admin_doc.sql'), 'utf-8');
    expect(sql).toContain('COMMENT ON FUNCTION public.is_global_admin()');
    expect(sql).toContain('Compatibility alias for is_admin()');
  });
});

// ============================================================================
// PT-12.2 — RPCs (migrations 7-16)
// ============================================================================
describe('PT-12.2 — RPCs nuevos (7-16)', () => {
  it('managed_create_user_v2 acepta p_plan y escribe audit log', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000007_v2_14_7_managed_create_user_v2.sql'), 'utf-8');
    expect(sql).toContain('p_plan plan_t DEFAULT');
    expect(sql).toContain("INSERT INTO public.user_audit_log");
    expect(sql).toContain("'USER_CREATED'");
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO public, pg_temp");
  });

  it('managed_update_user usa SELECT FOR UPDATE + audit log estructurado', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000008_v2_14_8_managed_update_user.sql'), 'utf-8');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("'USER_UPDATED'");
    expect(sql).toContain('v_changes');
    expect(sql).toContain('ERR_SELF_DEACTIVATE_BLOCKED');
  });

  it('managed_toggle_user_status escribe audit log USER_ACTIVATED/DEACTIVATED', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000009_v2_14_9_managed_toggle_user_status.sql'), 'utf-8');
    expect(sql).toContain("'USER_ACTIVATED'");
    expect(sql).toContain("'USER_DEACTIVATED'");
    expect(sql).toContain('ERR_SELF_DEACTIVATE_BLOCKED');
  });

  it('managed_reset_password escribe audit log PASSWORD_RESET_REQUESTED', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000010_v2_14_10_managed_reset_password.sql'), 'utf-8');
    expect(sql).toContain("'PASSWORD_RESET_REQUESTED'");
    expect(sql).toContain('ERR_SELF_RESET_BLOCKED');
  });

  it('managed_soft_delete_user anonimiza PII + revoca memberships + audit', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000011_v2_14_11_managed_soft_delete_user.sql'), 'utf-8');
    expect(sql).toContain("'USER_SOFT_DELETED'");
    expect(sql).toContain("'[deleted user]'");
    expect(sql).toContain('@anonymized.local');
    expect(sql).toContain('ai_api_key = NULL');
    expect(sql).toContain('ERR_USER_HAS_ACTIVE_MEMBERSHIPS');
    expect(sql).toContain('ERR_SELF_DELETE_BLOCKED');
    expect(sql).toContain("status = 'revoked'");
  });

  it('managed_update_membership valida caller admin/manager + audit', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000012_v2_14_12_managed_update_membership.sql'), 'utf-8');
    expect(sql).toContain("ARRAY['admin', 'manager']");
    expect(sql).toContain("'MEMBERSHIP_UPDATED'");
    expect(sql).toContain('FOR UPDATE');
  });

  it('managed_revoke_membership auto-desactiva user sin memberships', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000013_v2_14_13_managed_revoke_membership.sql'), 'utf-8');
    expect(sql).toContain("'MEMBERSHIP_REVOKED'");
    expect(sql).toContain("'USER_AUTO_DEACTIVATED'");
    expect(sql).toContain('v_remaining_active');
  });

  it('detect_orphan_users es idempotente (ON CONFLICT DO NOTHING)', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000014_v2_14_14_detect_reconcile_orphans.sql'), 'utf-8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.detect_orphan_users');
    expect(sql).toContain('ON CONFLICT (auth_user_id) DO NOTHING');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reconcile_orphan_user');
    expect(sql).toContain("'create_profile'");
    expect(sql).toContain("'delete_auth_user'");
    expect(sql).toContain("'ignore'");
    expect(sql).toContain("'ORPHAN_RECONCILED'");
  });

  it('get_user_audit_history es admin-only y paginada', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000015_v2_14_15_get_user_audit_history.sql'), 'utf-8');
    expect(sql).toContain('LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)');
    expect(sql).toContain('public.is_admin()');
  });

  it('bulk_assign_memberships escribe audit log MEMBERSHIPS_BULK_ASSIGNED', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20260805000016_v2_14_16_bulk_assign_memberships_audit.sql'), 'utf-8');
    expect(sql).toContain("'MEMBERSHIPS_BULK_ASSIGNED'");
    expect(sql).toContain('foreign_key_violation');
  });
});

// ============================================================================
// PT-12.3 — API routes existen y exportan handlers correctos
// ============================================================================
describe('PT-12.3 — API routes', () => {
  it('PATCH /api/users/[id] existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', '[id]', 'route.ts'), 'utf-8');
    expect(src).toContain('export const PATCH');
    expect(src).toContain("withRole('admin'");
    expect(src).toContain('managed_update_user');
  });

  it('GET /api/users/orphans existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', 'orphans', 'route.ts'), 'utf-8');
    expect(src).toContain('export const GET');
    expect(src).toContain('detect_orphan_users');
  });

  it('POST /api/users/[id]/reconcile existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', '[id]', 'reconcile', 'route.ts'), 'utf-8');
    expect(src).toContain('export const POST');
    expect(src).toContain('reconcile_orphan_user');
  });

  it('GET /api/users/[id]/audit-history existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', '[id]', 'audit-history', 'route.ts'), 'utf-8');
    expect(src).toContain('export const GET');
    expect(src).toContain('get_user_audit_history');
  });

  it('PATCH+DELETE /api/users/[id]/memberships/[membershipId] existen', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', '[id]', 'memberships', '[membershipId]', 'route.ts'), 'utf-8');
    expect(src).toContain('export const PATCH');
    expect(src).toContain('export const DELETE');
    expect(src).toContain('managed_update_membership');
    expect(src).toContain('managed_revoke_membership');
  });

  it('toggle-status usa RPC managed_toggle_user_status', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', 'toggle-status', 'route.ts'), 'utf-8');
    expect(src).toContain("rpc('managed_toggle_user_status'");
    expect(src).toContain('auth.admin.signOut');
  });

  it('reset-password usa RPC managed_reset_password', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', 'reset-password', 'route.ts'), 'utf-8');
    expect(src).toContain("rpc('managed_reset_password'");
  });

  it('delete usa RPC managed_soft_delete_user + auth.admin.updateUser', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', 'delete', 'route.ts'), 'utf-8');
    expect(src).toContain("rpc('managed_soft_delete_user'");
    expect(src).toContain('ban_duration');
    expect(src).toContain('auth.admin.signOut');
  });

  it('managed-create usa RPC managed_create_user_v2 con p_plan', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', 'managed-create', 'route.ts'), 'utf-8');
    expect(src).toContain("rpc('managed_create_user_v2'");
    expect(src).toContain('p_plan');
  });
});

// ============================================================================
// PT-12.4 — Frontend hooks y componentes
// ============================================================================
describe('PT-12.4 — Frontend hooks y componentes', () => {
  it('useUpdateUser usa fetch PATCH (no UPDATE directo)', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'hooks', 'api', 'useUsers.ts'), 'utf-8');
    expect(src).toContain("fetch(`/api/users/${id}`");
    expect(src).toContain('method: \'PATCH\'');
    expect(src).not.toContain('from(\'profiles\')\n      .update');
  });

  it('useStoreTeam.updateRoleMutation usa fetch PATCH', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'hooks', 'api', 'useStoreTeam.ts'), 'utf-8');
    expect(src).toContain('fetch(`/api/users/_/memberships/${membershipId}`');
    expect(src).toContain('method: \'PATCH\'');
  });

  it('useStoreTeam.removeMemberMutation usa fetch DELETE', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'hooks', 'api', 'useStoreTeam.ts'), 'utf-8');
    expect(src).toContain('method: \'DELETE\'');
  });

  it('useUsers filtra deleted_at IS NULL', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'hooks', 'api', 'useUsers.ts'), 'utf-8');
    expect(src).toContain("is('deleted_at', null)");
  });

  it('useOrphanUsers hook existe', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'hooks', 'api', 'useOrphanUsers.ts'), 'utf-8');
    expect(src).toContain('useOrphanUsers');
    expect(src).toContain('useReconcileOrphan');
    expect(src).toContain('useUserAuditHistory');
    expect(src).toContain('/api/users/orphans');
  });

  it('SoftDeleteConfirmModal requiere reason >= 3 chars + explica anonimización', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'users', 'SoftDeleteConfirmModal.tsx'), 'utf-8');
    expect(src).toContain('reason.trim().length < 3');
    expect(src).toContain('anonimiz');  // "anonimizan" o "anonimiza"
    expect(src).toContain('soft delete');  // title o description
  });

  it('OrphanUsersPanel renderiza lista + acciones', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'users', 'OrphanUsersPanel.tsx'), 'utf-8');
    expect(src).toContain('useOrphanUsers');
    expect(src).toContain('useReconcileOrphan');
    expect(src).toContain('create_profile');
    expect(src).toContain('delete_auth_user');
    expect(src).toContain('ignore');
  });

  it('UserAuditHistoryModal muestra historial', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'users', 'UserAuditHistoryModal.tsx'), 'utf-8');
    expect(src).toContain('useUserAuditHistory');
    expect(src).toContain('USER_CREATED');
    expect(src).toContain('USER_SOFT_DELETED');
  });

  it('UserForm usa plan enum free/pro/enterprise (no basico/profesional)', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'users', 'UserForm.tsx'), 'utf-8');
    expect(src).toContain("z.enum(['free', 'pro', 'enterprise'])");
    expect(src).not.toContain("'basico'");
    expect(src).not.toContain("'profesional'");
  });

  it('config/app.ts PLAN_STORE_LIMITS incluye free y pro', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'app.ts'), 'utf-8');
    expect(src).toContain('free: 1');
    expect(src).toContain('pro: 3');
    expect(src).toContain('enterprise: 10');
  });
});

// ============================================================================
// PT-12.5 — Feature flag USE_V2_CHECKOUT sigue en false
// ============================================================================
describe('PT-12.5 — Feature flag USE_V2_CHECKOUT sigue en false', () => {
  it('features.ts mantiene USE_V2_CHECKOUT default false', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain('USE_V2_CHECKOUT');
    expect(src).toContain("=== 'true' || false");
  });
});

// ============================================================================
// PT-12.6 — Inventario de migraciones (16 total)
// ============================================================================
describe('PT-12.6 — Todas las migraciones de Iteración 12 existen', () => {
  const expected = [
    '20260805000001_v2_14_1_plan_enum.sql',
    '20260805000002_v2_14_2_profiles_soft_delete.sql',
    '20260805000003_v2_14_3_orphaned_users_log.sql',
    '20260805000004_v2_14_4_user_invitations.sql',
    '20260805000005_v2_14_5_user_audit_log_enhancements.sql',
    '20260805000006_v2_14_6_is_global_admin_doc.sql',
    '20260805000007_v2_14_7_managed_create_user_v2.sql',
    '20260805000008_v2_14_8_managed_update_user.sql',
    '20260805000009_v2_14_9_managed_toggle_user_status.sql',
    '20260805000010_v2_14_10_managed_reset_password.sql',
    '20260805000011_v2_14_11_managed_soft_delete_user.sql',
    '20260805000012_v2_14_12_managed_update_membership.sql',
    '20260805000013_v2_14_13_managed_revoke_membership.sql',
    '20260805000014_v2_14_14_detect_reconcile_orphans.sql',
    '20260805000015_v2_14_15_get_user_audit_history.sql',
    '20260805000016_v2_14_16_bulk_assign_memberships_audit.sql',
  ];

  for (const f of expected) {
    it(`${f} existe`, () => {
      const files = readdirSync(MIGRATIONS_DIR);
      expect(files).toContain(f);
    });
  }
});

// ============================================================================
// PT-12.7 — Cada migration tiene sección DOWN
// ============================================================================
describe('PT-12.7 — Todas las migrations tienen sección DOWN', () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.startsWith('20260805') && f.endsWith('.sql'));

  for (const f of files) {
    it(`${f} tiene DOWN`, () => {
      const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
      expect(content).toContain('DOWN');
    });
  }
});
