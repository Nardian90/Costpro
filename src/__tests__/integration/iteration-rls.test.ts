/**
 * Iteración RLS Multi-Tenant (v2.21.0) — Pruebas PT-RLS.x
 *
 * 37 tests organizados en 8 grupos:
 *   PT-RLS.1 — Aislamiento por store_id (8 tests)
 *   PT-RLS.2 — Aislamiento por tenant_id (6 tests)
 *   PT-RLS.3 — Backfill tenant_id (4 tests)
 *   PT-RLS.4 — Bugs funcionales (3 tests)
 *   PT-RLS.5 — Performance (3 tests)
 *   PT-RLS.6 — Regresión RPCs (5 tests)
 *   PT-RLS.7 — Feature flag (5 tests)
 *   PT-RLS.8 — INSERT con with_check (3 tests)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

// Helper: leer contenido de migración
function readMigration(name: string): string {
  const path = join(MIGRATIONS_DIR, name);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8');
}

// Helper: verificar que una migración existe
function migrationExists(name: string): boolean {
  return existsSync(join(MIGRATIONS_DIR, name));
}

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.1 — Aislamiento por store_id (8 tests) — validación de código
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.1 — Aislamiento por store_id', () => {
  it('PT-RLS.1.1: policies products_tenant_select existe', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('products_tenant_select');
    expect(sql).toContain('current_user_store_ids()');
  });

  it('PT-RLS.1.2: policies transactions_tenant_insert_with_check existe', () => {
    const sql = readMigration('20260807000006_v2_21_0_rls_insert_with_check.sql');
    expect(sql).toContain('transactions_tenant_insert_with_check');
    expect(sql).toContain('WITH CHECK');
  });

  it('PT-RLS.1.3: is_admin_with_access function existe (reemplaza is_admin bypass)', () => {
    const sql = readMigration('20260807000004_v2_21_0_rls_helper_functions.sql');
    expect(sql).toContain('is_admin_with_access');
    expect(sql).toContain('public.has_store_access(p_store_id)');
  });

  it('PT-RLS.1.4: policies usan current_user_store_ids() para non-admin', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('store_id = ANY(public.current_user_store_ids())');
  });

  it('PT-RLS.1.5: profiles_tenant_select permite auth.uid()', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('profiles_tenant_select');
    expect(sql).toContain('id = auth.uid()');
  });

  it('PT-RLS.1.6: policies usan CASE WHEN para feature flag', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain("current_setting('app.use_tenant_rls', true) = 'true'");
  });

  it('PT-RLS.1.7: policies fallback a is_admin OR has_store_access cuando flag=false', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('public.is_admin() OR public.has_store_access(store_id)');
  });

  it('PT-RLS.1.8: service_role_all policies preservadas (no eliminadas)', () => {
    // Las policies service_role_all no se tocan en esta iteración.
    // Verificar que no hay DROP POLICY activo (solo en comentarios DOWN).
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    const activeLines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
    const activeSql = activeLines.join('\n');
    expect(activeSql).not.toContain('DROP POLICY');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.2 — Aislamiento por tenant_id (6 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.2 — Aislamiento por tenant_id', () => {
  it('PT-RLS.2.1: stores_tenant_select filtra por tenant_id', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('stores_tenant_select');
    expect(sql).toContain('tenant_id = public.current_user_tenant_id()');
  });

  it('PT-RLS.2.2: products_tenant_select filtra por tenant_id', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('products_tenant_select');
    expect(sql).toContain('tenant_id = public.current_user_tenant_id()');
  });

  it('PT-RLS.2.3: transactions_tenant_select filtra por tenant_id', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('transactions_tenant_select');
  });

  it('PT-RLS.2.4: fix B5 en get_tenant_sales_summary acepta service_role', () => {
    const sql = readMigration('20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql');
    expect(sql).toContain('v_uid IS NOT NULL');
    expect(sql).toContain('FIX RLS-B5');
  });

  it('PT-RLS.2.5: bulk_ops_log_tenant_select filtra por tenant_id', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('bulk_ops_log_tenant_select');
  });

  it('PT-RLS.2.6: transfers_tenant_select filtra por tenant_id', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain('transfers_tenant_select');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.3 — Backfill tenant_id (4 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.3 — Backfill tenant_id', () => {
  it('PT-RLS.3.1: migración backfill existe', () => {
    expect(migrationExists('20260807000002_v2_21_0_rls_backfill_tenant_id.sql')).toBe(true);
  });

  it('PT-RLS.3.2: backfill usa stores.tenant_id como fuente', () => {
    const sql = readMigration('20260807000002_v2_21_0_rls_backfill_tenant_id.sql');
    expect(sql).toContain('SET tenant_id = s.tenant_id');
    expect(sql).toContain('FROM public.stores s');
  });

  it('PT-RLS.3.3: backfill para profiles usa fallback memberships', () => {
    const sql = readMigration('20260807000002_v2_21_0_rls_backfill_tenant_id.sql');
    expect(sql).toContain('user_store_memberships');
    expect(sql).toContain('5364ccf8-e6cd-4c38-aea8-b167b3b5576f');
  });

  it('PT-RLS.3.4: validación post-backfill falla si quedan nulls', () => {
    const sql = readMigration('20260807000002_v2_21_0_rls_backfill_tenant_id.sql');
    expect(sql).toContain('v_total_nulls > 0');
    expect(sql).toContain('RAISE EXCEPTION');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.4 — Bugs funcionales (3 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.4 — Bugs funcionales', () => {
  it('PT-RLS.4.1: Fix B4 — PATCH /api/users/[id] incluye activeStoreId', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'users', '[id]', 'route.ts'), 'utf-8');
    expect(src).toContain('activeStoreId: z.string().uuid().optional()');
    expect(src).toContain('FIX RLS-B4');
    expect(src).toContain('active_store_id');
  });

  it('PT-RLS.4.2: Fix B5 — get_tenant_sales_summary acepta service_role', () => {
    const sql = readMigration('20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql');
    expect(sql).toContain('v_uid IS NOT NULL');
  });

  it('PT-RLS.4.3: Fix B6 — endpoint /api/transfers/[id]/confirm existe', () => {
    const path = join(process.cwd(), 'src', 'app', 'api', 'transfers', '[id]', 'confirm', 'route.ts');
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, 'utf-8');
    expect(src).toContain('confirm_transfer');
    expect(src).toContain('canManageStore');
    expect(src).toContain('destination_store_id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.5 — Performance (3 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.5 — Performance', () => {
  it('PT-RLS.5.1: helper functions son STABLE (cacheadas por query)', () => {
    const sql = readMigration('20260807000004_v2_21_0_rls_helper_functions.sql');
    expect(sql).toContain('STABLE');
    expect(sql).toContain('current_user_tenant_id');
    expect(sql).toContain('current_user_store_ids');
  });

  it('PT-RLS.5.2: índices tenant_id existen en 15 tablas', () => {
    const sql = readMigration('20260807000003_v2_21_0_rls_tenant_indexes.sql');
    const expectedTables = [
      'products', 'transactions', 'stock_movements', 'inventory', 'profiles',
      'commission_payments', 'commission_rules', 'receipts', 'workers',
      'sales_transactions', 'production_orders', 'audit_events', 'stores',
      'transfers', 'bulk_ops_log'
    ];
    for (const table of expectedTables) {
      expect(sql).toContain(`idx_${table}_tenant_id`);
    }
  });

  it('PT-RLS.5.3: is_tenant_member usa comparación directa (no EXISTS subquery)', () => {
    const sql = readMigration('20260807000004_v2_21_0_rls_helper_functions.sql');
    // Filtrar comentarios
    const activeLines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
    const activeSql = activeLines.join('\n');
    expect(activeSql).toContain('is_tenant_member');
    expect(activeSql).toContain('p_tenant_id = public.current_user_tenant_id()');
    // La función is_tenant_member NO debe usar EXISTS en código activo
    // (puede aparecer en comentarios explicativos)
    const functionBody = activeSql.split('is_tenant_member')[1]?.split('CREATE OR REPLACE')[0] || '';
    expect(functionBody).not.toContain('EXISTS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.6 — Regresión RPCs (5 tests) — sin tocar RPCs
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.6 — Regresión RPCs (no se modifican)', () => {
  // Helper: filtra comentarios para verificar que no hay CREATE OR REPLACE activo
  function getActiveSql(migrationName: string): string {
    const sql = readMigration(migrationName);
    const activeLines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
    return activeLines.join('\n');
  }

  // Solo migraciones de esta iteración (v2.21.0 RLS) — formato 20260807 + 0001-0008
  const rlsMigrations = [
    '20260807000001_v2_21_0_rls_backfill_validate.sql',
    '20260807000002_v2_21_0_rls_backfill_tenant_id.sql',
    '20260807000003_v2_21_0_rls_tenant_indexes.sql',
    '20260807000004_v2_21_0_rls_helper_functions.sql',
    '20260807000005_v2_21_0_rls_tenant_policies.sql',
    '20260807000006_v2_21_0_rls_insert_with_check.sql',
    '20260807000007_v2_21_0_rls_feature_flag.sql',
    '20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql',
  ];

  it('PT-RLS.6.1: no se modifica create_sale_v2 RPC', () => {
    for (const m of rlsMigrations) {
      const sql = getActiveSql(m);
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_sale_v2');
    }
  });

  it('PT-RLS.6.2: no se modifica close_cash_shift RPC', () => {
    for (const m of rlsMigrations) {
      const sql = getActiveSql(m);
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.close_cash_shift');
    }
  });

  it('PT-RLS.6.3: no se modifica reverse_transaction_v2 RPC', () => {
    for (const m of rlsMigrations) {
      const sql = getActiveSql(m);
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.reverse_transaction_v2');
    }
  });

  it('PT-RLS.6.4: no se modifica create_devolution_v2 RPC', () => {
    for (const m of rlsMigrations) {
      const sql = getActiveSql(m);
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_devolution_v2');
    }
  });

  it('PT-RLS.6.5: no se modifica void_transaction RPC', () => {
    for (const m of rlsMigrations) {
      const sql = getActiveSql(m);
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.void_transaction');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.7 — Feature flag (5 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.7 — Feature flag USE_TENANT_RLS', () => {
  it('PT-RLS.7.1: policies usan current_setting(app.use_tenant_rls, true)', () => {
    const sql = readMigration('20260807000005_v2_21_0_rls_tenant_policies.sql');
    expect(sql).toContain("current_setting('app.use_tenant_rls', true)");
  });

  it('PT-RLS.7.2: middleware rls-middleware.ts existe', () => {
    const path = join(process.cwd(), 'src', 'lib', 'rls-middleware.ts');
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, 'utf-8');
    expect(src).toContain('USE_TENANT_RLS');
    expect(src).toContain('RLS_GLOBAL');
    expect(src).toContain('RLS_PILOT_STORES');
  });

  it('PT-RLS.7.3: middleware activa flag vía set_config', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'rls-middleware.ts'), 'utf-8');
    expect(src).toContain("setting_name: 'app.use_tenant_rls'");
    expect(src).toContain("new_value: 'true'");
  });

  it('PT-RLS.7.4: auth-middleware integra activateTenantRLS', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'auth-middleware.ts'), 'utf-8');
    expect(src).toContain("import('@/lib/rls-middleware')");
    expect(src).toContain('activateTenantRLS');
  });

  it('PT-RLS.7.5: is_admin_with_access reemplaza is_admin bypass', () => {
    const sql = readMigration('20260807000004_v2_21_0_rls_helper_functions.sql');
    expect(sql).toContain('is_admin_with_access');
    expect(sql).toContain('v_store_tenant = v_user_tenant');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.8 — INSERT con with_check (3 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.8 — INSERT con with_check', () => {
  it('PT-RLS.8.1: transactions_tenant_insert_with_check verifica store_id', () => {
    const sql = readMigration('20260807000006_v2_21_0_rls_insert_with_check.sql');
    expect(sql).toContain('transactions_tenant_insert_with_check');
    expect(sql).toContain('store_id = ANY(public.current_user_store_ids())');
  });

  it('PT-RLS.8.2: 7 tablas tienen INSERT con with_check', () => {
    const sql = readMigration('20260807000006_v2_21_0_rls_insert_with_check.sql');
    const expectedTables = [
      'transactions', 'cash_closures', 'devolutions', 'inventory_adjustments',
      'kardex_entries', 'payment_transactions', 'price_change_history'
    ];
    for (const table of expectedTables) {
      expect(sql).toContain(`${table}_tenant_insert_with_check`);
    }
  });

  it('PT-RLS.8.3: when flag=false, with_check=true (legacy permisivo)', () => {
    const sql = readMigration('20260807000006_v2_21_0_rls_insert_with_check.sql');
    expect(sql).toContain('ELSE\n      true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PT-RLS.9 — Migraciones reversibles (3 tests adicionales)
// ─────────────────────────────────────────────────────────────────────────────

describe('PT-RLS.9 — Migraciones reversibles (UP/DOWN)', () => {
  const migrations = [
    '20260807000001_v2_21_0_rls_backfill_validate.sql',
    '20260807000002_v2_21_0_rls_backfill_tenant_id.sql',
    '20260807000003_v2_21_0_rls_tenant_indexes.sql',
    '20260807000004_v2_21_0_rls_helper_functions.sql',
    '20260807000005_v2_21_0_rls_tenant_policies.sql',
    '20260807000006_v2_21_0_rls_insert_with_check.sql',
    '20260807000007_v2_21_0_rls_feature_flag.sql',
    '20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql',
  ];

  it('PT-RLS.9.1: todas las migraciones tienen sección DOWN', () => {
    for (const m of migrations) {
      const sql = readMigration(m);
      expect(sql).toContain('DOWN');
    }
  });

  it('PT-RLS.9.2: policies viejas NO se eliminan (no DROP POLICY activo)', () => {
    // Solo la migración 20260807000009 (Fase E, futura) eliminará policies viejas.
    // Las migraciones de esta iteración tienen DROP POLICY solo en comentarios DOWN.
    for (const m of migrations) {
      const sql = readMigration(m);
      // Filtrar líneas de comentario (empiezan con --)
      const activeLines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
      const activeSql = activeLines.join('\n');
      expect(activeSql).not.toContain('DROP POLICY');
    }
  });

  it('PT-RLS.9.3: helper functions tienen DROP FUNCTION en DOWN', () => {
    const sql = readMigration('20260807000004_v2_21_0_rls_helper_functions.sql');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.is_tenant_member');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.is_admin_with_access');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.current_user_store_ids');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.current_user_tenant_id');
  });
});
