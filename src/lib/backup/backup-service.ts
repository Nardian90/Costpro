/**
 * @file Store Backup Service
 * @description Server-side service that extracts all data belonging to a
 * specific store (filtered by store_id) and serializes it to JSON, PDF, or
 * XLSX format. Used by /api/stores/[id]/backup.
 *
 * SCOPE: Exports store-scoped tables only (categories, products, sales,
 * sale_items, receipts, cash_reports, stock_movements, inventory_adjustments,
 * production_orders, production_order_items, workers, commissions,
 * worker_payments, stores row + cost_templates row).
 *
 * SECURITY: Caller MUST verify canManageStore(session.user, storeId) before
 * invoking any function here. This service uses the service-role admin client
 * and bypasses RLS — it trusts the caller's authorization check.
 *
 * AUDIT: Caller MUST insert an audit_logs entry after calling. This service
 * returns metadata (recordCounts, totalBytes) that the caller should log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BackupFormat = 'json' | 'pdf' | 'xlsx';
export type BackupRange = 'all' | 'year' | 'month';

export interface BackupOptions {
  storeId: string;
  format: BackupFormat;
  range: BackupRange;
  /** Year (e.g. 2026). Required when range === 'year' or 'month'. */
  year?: number;
  /** Month 1-12. Required when range === 'month'. */
  month?: number;
}

export interface BackupResult {
  /** File contents as a Uint8Array (binary) — works for all 3 formats. */
  data: Uint8Array;
  /** Suggested filename (without path). */
  filename: string;
  /** MIME type for the HTTP Content-Type header. */
  contentType: string;
  /** Per-table record counts, for audit log + UI toast. */
  recordCounts: Record<string, number>;
  /** Total bytes of `data`. */
  totalBytes: number;
  /** Store name (for audit). */
  storeName: string;
}

// Tables grouped by dependency tier for ordered export.
// Each entry: [tableName, dateColumnForRangeFilter | null]
// Tables without a date column are exported in full (range filter ignored).
const STORE_SCOPED_TABLES: ReadonlyArray<readonly [string, string | null]> = [
  // Tier 0: store config (single row)
  ['stores', null],
  ['cost_templates', null],
  ['categories', null],
  // Tier 1: catalog
  ['products', 'created_at'],
  // Tier 2: workers & production
  ['workers', 'created_at'],
  ['production_orders', 'created_at'],
  ['production_order_items', 'created_at'],
  // Tier 3: sales & receipts
  ['sales', 'created_at'],
  ['sale_items', 'created_at'],
  ['receipts', 'created_at'],
  // Tier 4: cash & inventory ops
  ['cash_reports', 'opened_at'],
  ['stock_movements', 'created_at'],
  ['inventory_adjustments', 'created_at'],
  // Tier 5: commissions & payments (workers)
  ['commissions', 'created_at'],
  ['worker_payments', 'created_at'],
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Date range filter
// ─────────────────────────────────────────────────────────────────────────────

function buildDateRange(opts: BackupOptions): { from?: string; to?: string } {
  if (opts.range === 'all') return {};
  if (opts.range === 'year' && opts.year) {
    const from = `${opts.year}-01-01T00:00:00.000Z`;
    const to = `${opts.year + 1}-01-01T00:00:00.000Z`;
    return { from, to };
  }
  if (opts.range === 'month' && opts.year && opts.month) {
    // JS Date month is 0-indexed; new Date(year, monthIdx, 1) handles month
    // boundary correctly (month=12 → next year January).
    const startDate = new Date(opts.year, opts.month - 1, 1);
    const endDate = new Date(opts.year, opts.month, 1);
    return {
      from: startDate.toISOString(),
      to: endDate.toISOString(),
    };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Data extraction
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractedData {
  storeName: string;
  recordCounts: Record<string, number>;
  /** Map tableName → rows (raw JSON from DB). */
  tables: Record<string, Record<string, unknown>[]>;
  /** ISO timestamp of the export (for headers/metadata). */
  exportedAt: string;
  /** Store slug (for filename). */
  storeSlug: string;
}

async function extractStoreData(
  supabase: SupabaseClient,
  opts: BackupOptions,
): Promise<ExtractedData> {
  const { from, to } = buildDateRange(opts);
  const recordCounts: Record<string, number> = {};
  const tables: Record<string, Record<string, unknown>[]> = {};

  // First, fetch the store row (also gives us name + slug for metadata).
  const { data: storeRow, error: storeErr } = await supabase
    .from('stores')
    .select('*')
    .eq('id', opts.storeId)
    .maybeSingle();

  if (storeErr) {
    logger.error('DATABASE', 'BACKUP_STORE_FETCH_FAILED', {
      storeId: opts.storeId, error: storeErr,
    });
    throw new Error(`Error al leer tienda: ${storeErr.message}`);
  }
  if (!storeRow) {
    throw new Error(`Tienda no encontrada: ${opts.storeId}`);
  }

  tables['stores'] = [storeRow];
  recordCounts['stores'] = 1;

  // Iterate remaining tables. For each, filter by store_id (when present) +
  // date range (when the table has a date column and range != all).
  for (const [table, dateCol] of STORE_SCOPED_TABLES) {
    if (table === 'stores') continue; // already fetched

    let query = supabase.from(table).select('*');

    // store_id filter — but cost_templates may not have store_id directly;
    // it may be linked via stores.cost_template_id. Handle gracefully.
    // We try .eq('store_id', X) and if it errors, retry without the filter.
    // For 'cost_templates' we link through the store row already fetched.
    if (table === 'cost_templates') {
      const templateId = (storeRow as { cost_template_id?: string }).cost_template_id;
      if (templateId) {
        query = query.eq('id', templateId);
      } else {
        // No template linked — skip.
        tables[table] = [];
        recordCounts[table] = 0;
        continue;
      }
    } else {
      query = query.eq('store_id', opts.storeId);
    }

    // Date range filter
    if (dateCol && from && to) {
      query = query.gte(dateCol, from).lt(dateCol, to);
    }

    // Order by created_at (if exists) for stable diff across exports
    if (dateCol) {
      query = query.order(dateCol, { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      // Some tables may not exist in older migrations — log + skip rather
      // than fail the whole backup. The audit log will show 0 records.
      logger.warn('DATABASE', 'BACKUP_TABLE_FETCH_WARN', {
        storeId: opts.storeId, table, error: error.message,
      });
      tables[table] = [];
      recordCounts[table] = 0;
      continue;
    }

    tables[table] = (data || []) as Record<string, unknown>[];
    recordCounts[table] = (data || []).length;
  }

  return {
    storeName: (storeRow as { name: string }).name,
    storeSlug: (storeRow as { slug?: string }).slug || opts.storeId,
    recordCounts,
    tables,
    exportedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filename + slug helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'tienda';
}

function buildFilename(opts: BackupOptions, storeSlug: string): string {
  const date = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const slug = sanitizeSlug(storeSlug);
  const rangeSuffix =
    opts.range === 'all' ? 'completo' :
    opts.range === 'year' ? `anio-${opts.year}` :
    `mes-${opts.year}-${String(opts.month).padStart(2, '0')}`;
  const ext = opts.format;
  return `backup_${slug}_${rangeSuffix}_${date}.${ext}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format serializers
// ─────────────────────────────────────────────────────────────────────────────

function serializeJson(extracted: ExtractedData, opts: BackupOptions): Uint8Array {
  const payload = {
    meta: {
      version: '1.0.0',
      format: 'costpro-store-backup',
      exportedAt: extracted.exportedAt,
      storeId: opts.storeId,
      storeName: extracted.storeName,
      storeSlug: extracted.storeSlug,
      range: opts.range,
      year: opts.year,
      month: opts.month,
      recordCounts: extracted.recordCounts,
      totalRecords: Object.values(extracted.recordCounts).reduce((a, b) => a + b, 0),
    },
    tables: extracted.tables,
  };
  const json = JSON.stringify(payload, null, 2);
  return new TextEncoder().encode(json);
}

function serializeXlsx(extracted: ExtractedData): Uint8Array {
  // Use require() so we don't pull xlsx into client bundles.
  const XLSX = require('@e965/xlsx') as typeof import('@e965/xlsx');

  const wb = XLSX.utils.book_new();

  // Sheet 0: metadata
  const metaRows: (string | number)[][] = [
    ['Campo', 'Valor'],
    ['Versión de formato', '1.0.0'],
    ['Tipo', 'costpro-store-backup'],
    ['Fecha de exportación', extracted.exportedAt],
    ['Nombre de tienda', extracted.storeName],
    ['Slug de tienda', extracted.storeSlug],
    ['Total de registros', Object.values(extracted.recordCounts).reduce((a, b) => a + b, 0)],
    ['', ''],
    ['Tabla', 'Registros'],
    ...Object.entries(extracted.recordCounts).map(([t, n]) => [t, n]),
  ];
  const wsMeta = XLSX.utils.aoa_to_sheet(metaRows);
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Resumen');

  // One sheet per table. XLSX sheet names ≤ 31 chars and no special chars.
  for (const [tableName, rows] of Object.entries(extracted.tables)) {
    if (!rows || rows.length === 0) continue;
    const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 31);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  // write() returns a Node Buffer when type='buffer' (compatible w/ Uint8Array)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Uint8Array;
  return buf;
}

async function serializePdf(extracted: ExtractedData, opts: BackupOptions): Promise<Uint8Array> {
  // Dynamic import — jspdf is heavy and not needed server-side for JSON/XLSX.
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ── Cover ─────────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 140, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Respaldo de Tienda', margin, 60);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(extracted.storeName, margin, 85);
  doc.setFontSize(10);
  doc.text(`Exportado: ${new Date(extracted.exportedAt).toLocaleString('es-CU')}`, margin, 105);
  doc.text(
    `Alcance: ${
      opts.range === 'all' ? 'Historico completo' :
      opts.range === 'year' ? `Anio ${opts.year}` :
      `${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][(opts.month || 1) - 1]} ${opts.year}`
    }`,
    margin, 122,
  );

  // ── Summary table ─────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Resumen de registros', margin, 180);

  const totalRecords = Object.values(extracted.recordCounts).reduce((a, b) => a + b, 0);
  autoTable(doc, {
    startY: 195,
    head: [['Tabla', 'Registros']],
    body: [
      ...Object.entries(extracted.recordCounts).map(([t, n]) => [t, String(n)]),
      ['TOTAL', String(totalRecords)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });

  // ── Per-table data ────────────────────────────────────────────────────────
  // For each non-empty table, render one section. We cap at 50 rows per
  // table in the PDF — it's a snapshot, not a full data export. For full
  // data, use JSON/XLSX.
  for (const [tableName, rows] of Object.entries(extracted.tables)) {
    if (!rows || rows.length === 0) continue;

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Tabla: ${tableName}`, margin, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `${rows.length} registro${rows.length === 1 ? '' : 's'} (mostrando primeros ${Math.min(rows.length, 50)})`,
      margin, 56,
    );

    // Get column headers from first row keys
    const firstRow = rows[0];
    const cols = Object.keys(firstRow).slice(0, 8); // cap at 8 columns to fit page width
    const head = [cols];
    const body = rows.slice(0, 50).map((row) =>
      cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
        return String(v).slice(0, 80);
      }),
    );

    autoTable(doc, {
      startY: 70,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  // ── Footer page numbers ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Costpro - Respaldo - Pagina ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' },
    );
  }

  // jsPDF's output('arraybuffer') returns ArrayBuffer; we wrap as Uint8Array
  const out = doc.output('arraybuffer') as ArrayBuffer;
  return new Uint8Array(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function generateBackup(
  supabase: SupabaseClient,
  opts: BackupOptions,
): Promise<BackupResult> {
  // Validate range params
  if (opts.range === 'year' && !opts.year) {
    throw new Error('range=year requiere parametro year');
  }
  if (opts.range === 'month' && (!opts.year || !opts.month)) {
    throw new Error('range=month requiere parametros year y month');
  }
  if (opts.month && (opts.month < 1 || opts.month > 12)) {
    throw new Error('month debe estar entre 1 y 12');
  }

  const extracted = await extractStoreData(supabase, opts);
  const filename = buildFilename(opts, extracted.storeSlug);

  let data: Uint8Array;
  let contentType: string;

  if (opts.format === 'json') {
    data = serializeJson(extracted, opts);
    contentType = 'application/json; charset=utf-8';
  } else if (opts.format === 'xlsx') {
    data = serializeXlsx(extracted);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (opts.format === 'pdf') {
    data = await serializePdf(extracted, opts);
    contentType = 'application/pdf';
  } else {
    throw new Error(`Formato no soportado: ${opts.format}`);
  }

  return {
    data,
    filename,
    contentType,
    recordCounts: extracted.recordCounts,
    totalBytes: data.byteLength,
    storeName: extracted.storeName,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore (import JSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface RestoreResult {
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  errors: Array<{ table: string; message: string; sample?: unknown }>;
  /** Total time in ms. */
  durationMs: number;
}

interface BackupFile {
  meta: {
    version: string;
    format: string;
    storeId: string;
    storeName: string;
    exportedAt: string;
    [k: string]: unknown;
  };
  tables: Record<string, Record<string, unknown>[]>;
}

// Order matters: parents before children. The export order above already
// satisfies this for most cases, but restore must be explicit because some
// tables reference others via FKs (e.g. sale_items -> sales).
const RESTORE_ORDER: ReadonlyArray<string> = [
  'stores',          // parent (UPDATE existing row, do not INSERT new)
  'cost_templates',
  'categories',
  'products',
  'workers',
  'production_orders',
  'production_order_items',
  'sales',
  'sale_items',
  'receipts',
  'cash_reports',
  'stock_movements',
  'inventory_adjustments',
  'commissions',
  'worker_payments',
];

/**
 * Columns that are GENERATED ALWAYS AS (...) STORED in the DB schema.
 * These cannot be written to via INSERT/UPDATE — the DB recomputes them
 * automatically. The backup exports them (for completeness) but restore
 * MUST strip them before upsert, otherwise PostgreSQL raises:
 *   ERROR: cannot insert a non-DEFAULT value into column "X"
 *
 * If you add a new generated column to a table, add it here.
 */
const GENERATED_COLUMNS: ReadonlySet<string> = new Set([
  'search_vector',          // products.search_vector (TSVECTOR full-text)
  // Add future generated columns here
]);

export async function restoreFromBackup(
  supabase: SupabaseClient,
  targetStoreId: string,
  fileContent: string,
  options: { upsert?: boolean; dryRun?: boolean } = {},
): Promise<RestoreResult> {
  const start = Date.now();
  const upsert = options.upsert ?? true;
  const dryRun = options.dryRun ?? false;
  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const errors: RestoreResult['errors'] = [];

  // Parse + validate
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(fileContent) as BackupFile;
  } catch (e) {
    throw new Error(`JSON invalido: ${e instanceof Error ? e.message : 'parse error'}`);
  }

  if (!parsed.meta || parsed.meta.format !== 'costpro-store-backup') {
    throw new Error('Formato de backup no reconocido. Se espera format=costpro-store-backup.');
  }
  if (!parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error('Backup no contiene la propiedad "tables".');
  }

  // Verify store exists — restore always targets an existing store.
  const { data: storeExists, error: storeErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', targetStoreId)
    .maybeSingle();
  if (storeErr) throw new Error(`Error al validar tienda destino: ${storeErr.message}`);
  if (!storeExists) throw new Error(`Tienda destino no encontrada: ${targetStoreId}`);

  // Process tables in dependency order
  for (const tableName of RESTORE_ORDER) {
    const rows = parsed.tables[tableName];
    if (!rows || rows.length === 0) {
      inserted[tableName] = 0;
      skipped[tableName] = 0;
      continue;
    }

    if (dryRun) {
      inserted[tableName] = rows.length;
      skipped[tableName] = 0;
      continue;
    }

    // For 'stores' table: only update existing row, never insert (preserve id)
    if (tableName === 'stores') {
      // Filter to only the row matching targetStoreId (in case backup has
      // multiple — it shouldn't, but defense in depth)
      const targetRow = rows.find((r) => r.id === targetStoreId);
      if (!targetRow) {
        skipped[tableName] = rows.length;
        inserted[tableName] = 0;
        continue;
      }
      const { error } = await supabase
        .from('stores')
        .update(targetRow)
        .eq('id', targetStoreId);
      if (error) {
        errors.push({ table: tableName, message: error.message, sample: targetRow });
        inserted[tableName] = 0;
        skipped[tableName] = rows.length;
      } else {
        inserted[tableName] = 1;
        skipped[tableName] = rows.length - 1;
      }
      continue;
    }

    // For all other tables: ensure rows point to targetStoreId (rewrite
    // store_id field if present) and strip GENERATED columns. This allows
    // restoring a backup of store A into store B (cross-store migration).
    const normalizedRows = rows.map((r) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (GENERATED_COLUMNS.has(k)) continue; // skip generated cols
        if (k === 'store_id') {
          cleaned[k] = targetStoreId;
        } else {
          cleaned[k] = v;
        }
      }
      return cleaned;
    });

    // Use upsert to handle re-imports gracefully. onConflict='id' preserves
    // original UUIDs from the backup (needed for FK integrity).
    const { error } = await supabase
      .from(tableName)
      .upsert(normalizedRows, { onConflict: 'id', ignoreDuplicates: !upsert });

    if (error) {
      // Common: FK violation (parent row missing), unique constraint, RLS.
      // Record error and continue with other tables — partial restore is
      // better than total failure.
      errors.push({
        table: tableName,
        message: error.message,
        sample: normalizedRows[0],
      });
      inserted[tableName] = 0;
      skipped[tableName] = normalizedRows.length;
    } else {
      inserted[tableName] = normalizedRows.length;
      skipped[tableName] = 0;
    }
  }

  return {
    inserted,
    skipped,
    errors,
    durationMs: Date.now() - start,
  };
}
