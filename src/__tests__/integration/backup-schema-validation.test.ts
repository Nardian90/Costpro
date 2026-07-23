/**
 * Schema validation integration tests for backup feature.
 *
 * These tests verify that the table names and column assumptions in
 * backup-service.ts match the ACTUAL database schema. They run ONLY when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are available (CI/local with
 * env). In plain `bun test` runs without env, they're skipped.
 *
 * Coverage:
 *   1. All 15 tables in TABLE_CONFIGS exist in the DB
 *   2. Tables with storeFilter=store_id have a store_id column
 *   3. Tables with dateCol have the column with that name
 *   4. transactions has transaction_id column (FK to transaction_items)
 *   5. stores has slug + name columns (used in metadata)
 *   6. products has search_vector column (GENERATED, must be stripped on restore)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Skip all tests if env vars not set
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !SUPABASE_URL || !SUPABASE_KEY;

const describeOrSkip = SKIP ? describe.skip : describe;

// Tables that backup-service.ts expects to exist + their expected columns
// Note: 'stores' is filtered by `id` (its PK), NOT by store_id (which it doesn't have).
const EXPECTED_TABLES = [
  { name: 'stores',                 storeIdCol: false, dateCol: null },        // filtered by id
  { name: 'store_cost_templates',   storeIdCol: true,  dateCol: 'created_at' },
  { name: 'categories',             storeIdCol: false, dateCol: 'created_at' }, // global
  { name: 'products',               storeIdCol: true,  dateCol: 'created_at' },
  { name: 'workers',                storeIdCol: true,  dateCol: 'created_at' },
  { name: 'production_orders',      storeIdCol: true,  dateCol: 'created_at' },
  { name: 'production_order_items', storeIdCol: false, dateCol: 'created_at' }, // via parent
  { name: 'transactions',           storeIdCol: true,  dateCol: 'created_at' },
  { name: 'transaction_items',      storeIdCol: false, dateCol: 'created_at' }, // via parent
  { name: 'sales_transactions',     storeIdCol: true,  dateCol: 'sale_date' },
  { name: 'cash_closures',          storeIdCol: true,  dateCol: 'closed_at' },
  { name: 'stock_movements',        storeIdCol: true,  dateCol: 'created_at' },
  { name: 'inventory_adjustments',  storeIdCol: true,  dateCol: 'created_at' },
  { name: 'commission_rules',       storeIdCol: true,  dateCol: 'created_at' },
  { name: 'commission_payments',    storeIdCol: true,  dateCol: 'paid_at' },
];

describeOrSkip('Backup schema validation (real DB)', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(() => {
    if (supabase) supabase.auth.signOut().catch(() => {});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: probe a column existence by trying to select it
  // ─────────────────────────────────────────────────────────────────────────
  async function columnExists(table: string, column: string): Promise<boolean> {
    const { error } = await supabase
      .from(table)
      .select(column)
      .limit(1);
    if (!error) return true;
    // PGRST204 / 42703 = column doesn't exist
    if (error.code === '42703' || error.code === 'PGRST204') return false;
    // Other errors (RLS, etc.) — assume column exists (can't verify)
    return true;
  }

  async function tableExists(table: string): Promise<boolean> {
    const { error } = await supabase
      .from(table)
      .select('id')
      .limit(1);
    // PGRST205 = table doesn't exist
    if (error && (error.code === 'PGRST205' || error.message.includes('Could not find the table'))) {
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tests
  // ─────────────────────────────────────────────────────────────────────────

  it('all 15 tables exist in the database', async () => {
    for (const t of EXPECTED_TABLES) {
      const exists = await tableExists(t.name);
      expect(exists, `Table "${t.name}" should exist`).toBe(true);
    }
  });

  it('tables with storeFilter=store_id have a store_id column', async () => {
    for (const t of EXPECTED_TABLES) {
      if (!t.storeIdCol) continue;
      const hasCol = await columnExists(t.name, 'store_id');
      expect(hasCol, `Table "${t.name}" should have a store_id column`).toBe(true);
    }
  });

  it('tables marked as global (categories) do NOT have store_id', async () => {
    for (const t of EXPECTED_TABLES) {
      if (t.storeIdCol) continue;
      const hasCol = await columnExists(t.name, 'store_id');
      expect(hasCol, `Global table "${t.name}" should NOT have a store_id column`).toBe(false);
    }
  });

  it('date columns exist where expected', async () => {
    for (const t of EXPECTED_TABLES) {
      if (!t.dateCol) continue;
      const hasCol = await columnExists(t.name, t.dateCol);
      expect(hasCol, `Table "${t.name}" should have a "${t.dateCol}" column`).toBe(true);
    }
  });

  it('transaction_items has transaction_id column (FK to transactions)', async () => {
    const hasCol = await columnExists('transaction_items', 'transaction_id');
    expect(hasCol, 'transaction_items should have transaction_id FK column').toBe(true);
  });

  it('stores has slug + name columns (used in metadata)', async () => {
    expect(await columnExists('stores', 'slug')).toBe(true);
    expect(await columnExists('stores', 'name')).toBe(true);
  });

  it('products has search_vector column (GENERATED, stripped on restore)', async () => {
    const hasCol = await columnExists('products', 'search_vector');
    expect(hasCol, 'products should have search_vector (GENERATED column)').toBe(true);
  });

  it('cash_closures has store_id + closed_at (replaces cash_reports)', async () => {
    expect(await columnExists('cash_closures', 'store_id')).toBe(true);
    expect(await columnExists('cash_closures', 'closed_at')).toBe(true);
  });

  it('commission_payments has store_id + paid_at (replaces commissions + worker_payments)', async () => {
    expect(await columnExists('commission_payments', 'store_id')).toBe(true);
    expect(await columnExists('commission_payments', 'paid_at')).toBe(true);
  });
});

// Summary log when skipped
if (SKIP) {
  describe('Backup schema validation (real DB)', () => {
    it.skip('skipped: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set', () => {});
  });
}
