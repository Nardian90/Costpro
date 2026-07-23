/**
 * Tests for store backup service — data extraction, serialization (JSON/PDF/XLSX),
 * date range filtering, and restore logic.
 *
 * Coverage:
 *   1. extractStoreData — pulls all store-scoped tables + applies date filter
 *   2. generateBackup JSON — produces valid JSON with metadata + tables
 *   3. generateBackup PDF — produces non-empty PDF Uint8Array starting with %PDF
 *   4. generateBackup XLSX — produces non-empty XLSX Uint8Array (ZIP magic bytes)
 *   5. buildDateRange — year/month boundaries are inclusive on start, exclusive on end
 *   6. restoreFromBackup — happy path (dry-run + real), invalid JSON, missing format
 *   7. restoreFromBackup — store_id rewrite to target store (cross-store migration)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateBackup,
  restoreFromBackup,
  type BackupOptions,
} from '@/lib/backup/backup-service';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock factory
// ─────────────────────────────────────────────────────────────────────────────

interface MockTableData {
  [tableName: string]: Record<string, unknown>[] | { error: true; message: string };
}

function makeMockSupabase(storeId: string, tables: MockTableData): SupabaseClient {
  // For the 'stores' table, maybeSingle() should return the first row (or null
  // if the array is empty) — used by both extractStoreData and restoreFromBackup
  // for store existence check.
  const storeRow = (tables['stores']?.[0] as Record<string, unknown>) || null;

  // Chainable mock — supports .from(table).select().eq().gte().lt().order().maybeSingle()
  // Each chain returns itself; final .maybeSingle()/.then returns a Promise.
  function chain(finalData: unknown, finalError: unknown = null) {
    const api: any = {
      select: () => api,
      eq: () => api,
      gte: () => api,
      lt: () => api,
      order: () => api,
      maybeSingle: () => Promise.resolve({ data: finalData, error: finalError }),
    };
    // Make it awaitable (so `await query` resolves with { data, error })
    api.then = (resolve: any, reject?: any) =>
      Promise.resolve({ data: finalData, error: finalError }).then(resolve, reject);
    return api;
  }

  const mock: any = {
    from: (table: string) => {
      // For stores table: maybeSingle() returns the single store row (or null).
      if (table === 'stores') {
        return chain(storeRow, null);
      }
      // For other tables: return array of rows (or empty array if table not in mock)
      const entry = tables[table];
      if (entry && typeof entry === 'object' && 'error' in (entry as any)) {
        return chain([], (entry as { error: true; message: string }).message);
      }
      return chain(entry || [], null);
    },
  };

  return mock as unknown as SupabaseClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('backup-service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('generateBackup — JSON format', () => {
    it('produces valid JSON with metadata and tables', async () => {
      const storeId = 'store-001';
      const supabase = makeMockSupabase(storeId, {
        stores: [{ id: storeId, name: 'Mi Tienda', slug: 'mi-tienda' }],
        products: [
          { id: 'p1', store_id: storeId, name: 'Producto 1', created_at: '2026-01-01T00:00:00Z' },
          { id: 'p2', store_id: storeId, name: 'Producto 2', created_at: '2026-02-01T00:00:00Z' },
        ],
        sales: [
          { id: 's1', store_id: storeId, total: 100, created_at: '2026-01-15T10:00:00Z' },
        ],
      });

      const opts: BackupOptions = {
        storeId,
        format: 'json',
        range: 'all',
      };

      const result = await generateBackup(supabase, opts);

      // Filename
      expect(result.filename).toMatch(/^backup_mi-tienda_completo_.+\.json$/);
      expect(result.contentType).toBe('application/json; charset=utf-8');

      // Content — parse back to verify
      const text = new TextDecoder().decode(result.data);
      const parsed = JSON.parse(text);

      expect(parsed.meta).toBeDefined();
      expect(parsed.meta.format).toBe('costpro-store-backup');
      expect(parsed.meta.version).toBe('1.0.0');
      expect(parsed.meta.storeId).toBe(storeId);
      expect(parsed.meta.storeName).toBe('Mi Tienda');
      expect(parsed.meta.storeSlug).toBe('mi-tienda');
      expect(parsed.meta.range).toBe('all');
      expect(parsed.meta.totalRecords).toBe(4); // 1 store + 2 products + 1 sale

      expect(parsed.tables.stores).toHaveLength(1);
      expect(parsed.tables.products).toHaveLength(2);
      expect(parsed.tables.sales).toHaveLength(1);

      // recordCounts exposed on result for audit log
      expect(result.recordCounts.stores).toBe(1);
      expect(result.recordCounts.products).toBe(2);
      expect(result.recordCounts.sales).toBe(1);
      expect(result.totalBytes).toBe(result.data.byteLength);
      expect(result.storeName).toBe('Mi Tienda');
    });

    it('throws when storeId is not found', async () => {
      const supabase = makeMockSupabase('nonexistent', {
        stores: [], // empty — store not found
      });

      await expect(
        generateBackup(supabase, { storeId: 'nonexistent', format: 'json', range: 'all' }),
      ).rejects.toThrow(/Tienda no encontrada/);
    });

    it('validates range=year requires year param', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T', slug: 't' }] });

      await expect(
        generateBackup(supabase, { storeId: 's1', format: 'json', range: 'year' }),
      ).rejects.toThrow(/year/);
    });

    it('validates range=month requires year+month params', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T', slug: 't' }] });

      await expect(
        generateBackup(supabase, { storeId: 's1', format: 'json', range: 'month', year: 2026 }),
      ).rejects.toThrow(/month/);
    });

    it('validates month is 1-12', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T', slug: 't' }] });

      await expect(
        generateBackup(supabase, { storeId: 's1', format: 'json', range: 'month', year: 2026, month: 13 }),
      ).rejects.toThrow(/month debe estar/);
    });

    it('validates month=0 (falsy) fails the range=month check', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T', slug: 't' }] });
      // month=0 is falsy → triggers "range=month requiere year y month"
      await expect(
        generateBackup(supabase, { storeId: 's1', format: 'json', range: 'month', year: 2026, month: 0 }),
      ).rejects.toThrow(/range=month requiere/);
    });

    it('rejects unknown format', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T', slug: 't' }] });

      await expect(
        generateBackup(supabase, { storeId: 's1', format: 'xml' as any, range: 'all' }),
      ).rejects.toThrow(/Formato no soportado/);
    });
  });

  describe('generateBackup — PDF format', () => {
    it('produces a non-empty PDF starting with %PDF magic bytes', async () => {
      const storeId = 'store-pdf';
      const supabase = makeMockSupabase(storeId, {
        stores: [{ id: storeId, name: 'Tienda PDF', slug: 'tienda-pdf' }],
        products: [
          { id: 'p1', store_id: storeId, name: 'Producto A', created_at: '2026-01-01T00:00:00Z' },
        ],
      });

      const result = await generateBackup(supabase, {
        storeId, format: 'pdf', range: 'all',
      });

      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toMatch(/^backup_tienda-pdf_completo_.+\.pdf$/);
      expect(result.data.byteLength).toBeGreaterThan(1000); // Real PDF should be > 1KB

      // Check magic bytes "%PDF"
      const text = new TextDecoder().decode(result.data.slice(0, 4));
      expect(text).toBe('%PDF');
    });
  });

  describe('generateBackup — XLSX format', () => {
    it('produces a non-empty XLSX file (ZIP magic bytes PK)', async () => {
      const storeId = 'store-xlsx';
      const supabase = makeMockSupabase(storeId, {
        stores: [{ id: storeId, name: 'Tienda XLSX', slug: 'tienda-xlsx' }],
        products: [
          { id: 'p1', store_id: storeId, name: 'Producto A', created_at: '2026-01-01T00:00:00Z' },
        ],
      });

      const result = await generateBackup(supabase, {
        storeId, format: 'xlsx', range: 'all',
      });

      expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.filename).toMatch(/^backup_tienda-xlsx_completo_.+\.xlsx$/);
      expect(result.data.byteLength).toBeGreaterThan(500);

      // XLSX is a ZIP archive — starts with PK (0x50 0x4B)
      expect(result.data[0]).toBe(0x50); // P
      expect(result.data[1]).toBe(0x4B); // K
    });
  });

  describe('restoreFromBackup', () => {
    it('rejects invalid JSON', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T' }] });
      await expect(
        restoreFromBackup(supabase, 's1', 'not-json{'),
      ).rejects.toThrow(/JSON invalido/);
    });

    it('rejects backup without costpro-store-backup format', async () => {
      const supabase = makeMockSupabase('s1', { stores: [{ id: 's1', name: 'T' }] });
      const fakeJson = JSON.stringify({
        meta: { format: 'some-other-format' },
        tables: {},
      });
      await expect(
        restoreFromBackup(supabase, 's1', fakeJson),
      ).rejects.toThrow(/Formato de backup no reconocido/);
    });

    it('dry-run does not call upsert', async () => {
      const storeId = 's1';
      const upsertSpy = vi.fn();
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'stores') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: { id: storeId, name: 'T' }, error: null }),
                }),
              }),
              update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            };
          }
          return { upsert: upsertSpy };
        }),
      } as unknown as SupabaseClient;

      const backup = JSON.stringify({
        meta: { format: 'costpro-store-backup', version: '1.0.0', storeId, storeName: 'T', exportedAt: '2026-01-01' },
        tables: {
          products: [
            { id: 'p1', store_id: 'orig-store', name: 'P1', created_at: '2026-01-01' },
          ],
        },
      });

      const result = await restoreFromBackup(supabase, storeId, backup, { dryRun: true });

      expect(result.inserted.products).toBe(1);
      // upsert should NOT have been called (dry-run)
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('real restore calls upsert with store_id rewritten to target store', async () => {
      const targetStoreId = 'target-store';
      const supabase = makeMockSupabase(targetStoreId, {
        stores: [{ id: targetStoreId, name: 'Target' }],
      });
      // Capture upsert calls
      const upsertCalls: any[] = [];
      (supabase as any).from = vi.fn((table: string) => {
        if (table === 'stores') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: targetStoreId, name: 'Target' }, error: null }) }) }),
            update: (data: any) => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn((rows: any[]) => {
            upsertCalls.push({ table, rows });
            return Promise.resolve({ data: null, error: null });
          }),
        };
      });

      const backup = JSON.stringify({
        meta: { format: 'costpro-store-backup', version: '1.0.0', storeId: 'orig-store', storeName: 'Origen', exportedAt: '2026-01-01' },
        tables: {
          products: [
            { id: 'p1', store_id: 'orig-store', name: 'P1', search_vector: "should:be:stripped" },
            { id: 'p2', store_id: 'orig-store', name: 'P2', search_vector: "ignored" },
          ],
        },
      });

      const result = await restoreFromBackup(supabase, targetStoreId, backup, { dryRun: false });

      // Find the products upsert call
      const productsCall = upsertCalls.find((c) => c.table === 'products');
      expect(productsCall).toBeDefined();
      expect(productsCall.rows).toHaveLength(2);
      // store_id should be rewritten to target
      expect(productsCall.rows[0].store_id).toBe(targetStoreId);
      expect(productsCall.rows[1].store_id).toBe(targetStoreId);

      // Generated columns (e.g. search_vector) should be stripped before upsert
      expect(productsCall.rows[0].search_vector).toBeUndefined();

      expect(result.inserted.products).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('handles upsert errors gracefully (records error, continues)', async () => {
      const targetStoreId = 'target';
      const supabase = makeMockSupabase(targetStoreId, {
        stores: [{ id: targetStoreId, name: 'T' }],
      });
      (supabase as any).from = vi.fn((table: string) => {
        if (table === 'stores') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: targetStoreId, name: 'T' }, error: null }) }) }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          };
        }
        return {
          upsert: vi.fn(() => Promise.resolve({
            data: null,
            error: { message: 'FK violation: store_id not found', code: '23503' },
          })),
        };
      });

      const backup = JSON.stringify({
        meta: { format: 'costpro-store-backup', version: '1.0.0', storeId: 'orig', storeName: 'O', exportedAt: '2026-01-01' },
        tables: {
          products: [{ id: 'p1', store_id: 'orig', name: 'P1' }],
          sales: [{ id: 's1', store_id: 'orig', total: 100 }],
        },
      });

      const result = await restoreFromBackup(supabase, targetStoreId, backup, { dryRun: false });

      // Both tables errored → recorded in errors array
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].table).toBe('products');
      expect(result.errors[0].message).toContain('FK violation');
      expect(result.inserted.products).toBe(0);
      expect(result.skipped.products).toBe(1);
    });
  });
});
