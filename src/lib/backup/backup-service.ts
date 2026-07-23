/**
 * @file Store Backup Service
 * @description Server-side service that extracts all data belonging to a
 * specific store (filtered by store_id) and serializes it to JSON, PDF, or
 * XLSX format. Used by /api/stores/[id]/backup.
 *
 * SCOPE: Exports store-scoped tables (products, transactions, transaction_items,
 * sales_transactions, cash_closures, stock_movements, inventory_adjustments,
 * production_orders, production_order_items, workers, commission_rules,
 * commission_payments, store_cost_templates) + the store row itself.
 *
 * CATEGORIES: `categories` is GLOBAL (shared between stores — no store_id
 * column). It is exported WITHOUT a store_id filter so the user has the
 * complete catalog context. On restore, categories are upserted (existing
 * IDs are kept) — they remain shared.
 *
 * SECURITY: Caller MUST verify canManageStore(session.user, storeId) before
 * invoking any function here. This service uses the service-role admin client
 * and bypasses RLS — it trusts the caller's authorization check.
 *
 * AUDIT: Caller MUST insert an audit_logs entry after calling. This service
 * returns metadata (recordCounts, warnings, totalBytes) that the caller
 * should log.
 *
 * WARNINGS: Tables that fail to export (missing column, table not found, etc.)
 * are recorded in `warnings` and surfaced to the user. The backup does NOT
 * silently skip tables — the user always knows what they got and what they
 * didn't.
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

export interface BackupWarning {
  table: string;
  message: string;
  /** 'warn' = partial export (e.g. date filter not applied), 'error' = table skipped entirely. */
  severity: 'warn' | 'error';
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
  /** Per-table warnings (tables that failed to export or were partially exported). */
  warnings: BackupWarning[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Table configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strategy for filtering rows by store.
 * - 'store_id'   → table has a `store_id` column, filter with .eq('store_id', X)
 * - 'global'     → table is shared across stores (e.g. categories), no filter
 * - 'via_parent' → table has no store_id; filter via a parent table's IDs
 *                  (e.g. transaction_items via transaction_id IN transactions.id)
 */
type StoreFilterStrategy =
  | { kind: 'store_id' }
  | { kind: 'global' }
  | { kind: 'via_parent'; parentTable: string; foreignKey: string };

interface TableConfig {
  name: string;
  /** Date column for range filter (null = no date filter applied). */
  dateCol: string | null;
  /** How to filter rows by store. */
  storeFilter: StoreFilterStrategy;
}

/**
 * Tables to export, in dependency order (parents before children).
 *
 * FIXED (2026-07-23): corrected all table names to match actual DB schema:
 *   - sales → transactions (POS sales) + sales_transactions (manual sales for commissions)
 *   - sale_items → transaction_items (linked via transaction_id)
 *   - cash_reports → cash_closures (cash_sessions is for open shifts; closures have the data)
 *   - commissions → commission_rules + commission_payments
 *   - worker_payments → commission_payments (already covered; payments to workers)
 *   - cost_templates → store_cost_templates (linked via store_id directly)
 *
 * Categories is GLOBAL (no store_id) — exported without filter, restored as-is.
 */
const TABLE_CONFIGS: ReadonlyArray<TableConfig> = [
  // Tier 0: store config + shared catalog
  { name: 'stores',                dateCol: null,         storeFilter: { kind: 'store_id' } }, // fetched separately by id
  { name: 'store_cost_templates',  dateCol: 'created_at', storeFilter: { kind: 'store_id' } },
  { name: 'categories',            dateCol: 'created_at', storeFilter: { kind: 'global' } },

  // Tier 1: catalog
  { name: 'products',              dateCol: 'created_at', storeFilter: { kind: 'store_id' } },

  // Tier 2: workers & production
  { name: 'workers',               dateCol: 'created_at', storeFilter: { kind: 'store_id' } },
  { name: 'production_orders',     dateCol: 'created_at', storeFilter: { kind: 'store_id' } },
  { name: 'production_order_items',dateCol: 'created_at', storeFilter: { kind: 'via_parent', parentTable: 'production_orders', foreignKey: 'order_id' } },

  // Tier 3: POS sales (transactions) + items (linked via transaction_id)
  { name: 'transactions',          dateCol: 'created_at', storeFilter: { kind: 'store_id' } },
  { name: 'transaction_items',     dateCol: 'created_at', storeFilter: { kind: 'via_parent', parentTable: 'transactions', foreignKey: 'transaction_id' } },

  // Tier 3b: manual sales for commissions (separate from POS transactions)
  { name: 'sales_transactions',    dateCol: 'sale_date',  storeFilter: { kind: 'store_id' } },

  // Tier 4: cash closures (was cash_reports) + inventory ops
  { name: 'cash_closures',         dateCol: 'closed_at',  storeFilter: { kind: 'store_id' } },
  { name: 'stock_movements',       dateCol: 'created_at', storeFilter: { kind: 'store_id' } },
  { name: 'inventory_adjustments', dateCol: 'created_at', storeFilter: { kind: 'store_id' } },

  // Tier 5: commissions + payments to workers
  { name: 'commission_rules',      dateCol: 'created_at', storeFilter: { kind: 'store_id' } },
  { name: 'commission_payments',   dateCol: 'paid_at',    storeFilter: { kind: 'store_id' } },
];

// Tables grouped by dependency tier for ordered RESTORE.
// Parents must be restored before children (FK integrity).
const RESTORE_ORDER: ReadonlyArray<string> = TABLE_CONFIGS.map(t => t.name);

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
]);

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
  /** Per-table warnings collected during extraction. */
  warnings: BackupWarning[];
}

/**
 * Fetch rows from a table filtered by store, with date range applied.
 * Returns { rows, warning } where warning is set if extraction failed
 * partially or fully.
 */
async function fetchTableData(
  supabase: SupabaseClient,
  config: TableConfig,
  storeId: string,
  dateRange: { from?: string; to?: string },
  parentIds?: string[],
): Promise<{ rows: Record<string, unknown>[]; warning: BackupWarning | null }> {
  let query = supabase.from(config.name).select('*');

  // ── Store filter ──────────────────────────────────────────────────────────
  if (config.storeFilter.kind === 'store_id') {
    query = query.eq('store_id', storeId);
  } else if (config.storeFilter.kind === 'global') {
    // No filter — export all rows (categories are shared)
  } else if (config.storeFilter.kind === 'via_parent') {
    if (!parentIds || parentIds.length === 0) {
      // No parent rows → no child rows
      return { rows: [], warning: null };
    }
    // Chunk the IN filter to avoid URL length limits (Supabase/PostgREST
    // caps URLs around 8KB; ~1000 UUIDs per chunk is safe).
    const CHUNK_SIZE = 500;
    const allChildRows: Record<string, unknown>[] = [];
    for (let i = 0; i < parentIds.length; i += CHUNK_SIZE) {
      const chunk = parentIds.slice(i, i + CHUNK_SIZE);
      const { data: chunkData, error: chunkErr } = await query
        .in(config.storeFilter.foreignKey, chunk);
      if (chunkErr) {
        return {
          rows: allChildRows,
          warning: {
            table: config.name,
            message: `Error al filtrar via ${config.storeFilter.foreignKey} (chunk ${i}): ${chunkErr.message}`,
            severity: 'error',
          },
        };
      }
      allChildRows.push(...((chunkData || []) as Record<string, unknown>[]));
    }
    // Apply date filter post-fetch (since we couldn't chain after .in())
    let filtered = allChildRows;
    if (config.dateCol && dateRange.from && dateRange.to) {
      filtered = allChildRows.filter((r) => {
        const v = r[config.dateCol as keyof typeof r] as string | undefined;
        if (!v) return false;
        return v >= dateRange.from! && v < dateRange.to!;
      });
      if (filtered.length !== allChildRows.length) {
        return {
          rows: filtered,
          warning: {
            table: config.name,
            message: `Filtro de fecha aplicado post-fetch (${allChildRows.length - filtered.length} filas omitidas)`,
            severity: 'warn',
          },
        };
      }
    }
    return { rows: filtered, warning: null };
  }

  // ── Date range filter ─────────────────────────────────────────────────────
  if (config.dateCol && dateRange.from && dateRange.to) {
    query = query.gte(config.dateCol, dateRange.from).lt(config.dateCol, dateRange.to);
  }

  // ── Order by date for stable diff across exports ──────────────────────────
  if (config.dateCol) {
    query = query.order(config.dateCol, { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    return {
      rows: [],
      warning: {
        table: config.name,
        message: `${error.code || 'DB_ERROR'}: ${error.message}`,
        severity: 'error',
      },
    };
  }

  return { rows: (data || []) as Record<string, unknown>[], warning: null };
}

async function extractStoreData(
  supabase: SupabaseClient,
  opts: BackupOptions,
): Promise<ExtractedData> {
  const dateRange = buildDateRange(opts);
  const recordCounts: Record<string, number> = {};
  const tables: Record<string, Record<string, unknown>[]> = {};
  const warnings: BackupWarning[] = [];

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

  // Iterate remaining tables in dependency order. For 'via_parent' tables,
  // we need to have already fetched the parent's IDs.
  const tableRowsById: Map<string, Set<string>> = new Map();

  for (const config of TABLE_CONFIGS) {
    if (config.name === 'stores') continue; // already fetched

    // Resolve parent IDs for 'via_parent' strategy
    let parentIds: string[] | undefined;
    if (config.storeFilter.kind === 'via_parent') {
      const parentSet = tableRowsById.get(config.storeFilter.parentTable);
      parentIds = parentSet ? Array.from(parentSet) : [];
    }

    const { rows, warning } = await fetchTableData(
      supabase, config, opts.storeId, dateRange, parentIds,
    );

    tables[config.name] = rows;
    recordCounts[config.name] = rows.length;

    // Track IDs of fetched rows for child tables that link via this table
    if (rows.length > 0) {
      const ids = new Set<string>();
      for (const r of rows) {
        const id = r['id'];
        if (typeof id === 'string') ids.add(id);
      }
      tableRowsById.set(config.name, ids);
    }

    if (warning) {
      warnings.push(warning);
      logger.warn('DATABASE', 'BACKUP_TABLE_FETCH_WARN', {
        storeId: opts.storeId,
        table: config.name,
        severity: warning.severity,
        message: warning.message,
      });
    }
  }

  return {
    storeName: (storeRow as { name: string }).name,
    storeSlug: (storeRow as { slug?: string }).slug || opts.storeId,
    recordCounts,
    tables,
    exportedAt: new Date().toISOString(),
    warnings,
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
      version: '1.1.0',  // bumped from 1.0.0 due to schema fixes (correct table names)
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
      warnings: extracted.warnings,
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

  // Sheet 0: metadata + warnings
  const metaRows: (string | number)[][] = [
    ['Campo', 'Valor'],
    ['Versión de formato', '1.1.0'],
    ['Tipo', 'costpro-store-backup'],
    ['Fecha de exportación', extracted.exportedAt],
    ['Nombre de tienda', extracted.storeName],
    ['Slug de tienda', extracted.storeSlug],
    ['Total de registros', Object.values(extracted.recordCounts).reduce((a, b) => a + b, 0)],
    ['', ''],
    ['Tabla', 'Registros'],
    ...Object.entries(extracted.recordCounts).map(([t, n]) => [t, n]),
  ];

  // Append warnings section
  if (extracted.warnings.length > 0) {
    metaRows.push(['', '']);
    metaRows.push(['ADVERTENCIAS', '']);
    metaRows.push(['Tabla', 'Severidad', 'Mensaje']);
    for (const w of extracted.warnings) {
      metaRows.push([w.table, w.severity, w.message]);
    }
  }

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

  // ── Warnings section (if any) ─────────────────────────────────────────────
  if (extracted.warnings.length > 0) {
    let currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
    if (currentY > 700) {
      doc.addPage();
      currentY = 40;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(180, 80, 0); // amber
    doc.text(`Advertencias (${extracted.warnings.length})`, margin, currentY);
    autoTable(doc, {
      startY: currentY + 10,
      head: [['Tabla', 'Severidad', 'Mensaje']],
      body: extracted.warnings.map(w => [w.table, w.severity, w.message]),
      theme: 'grid',
      headStyles: { fillColor: [180, 80, 0], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      margin: { left: margin, right: margin },
    });
  }

  // ── Per-table data ────────────────────────────────────────────────────────
  // For each non-empty table, render one section. We cap at 50 rows per
  // table in the PDF — it's a snapshot, not a full data export. For full
  // data, use JSON/XLSX.
  for (const [tableName, rows] of Object.entries(extracted.tables)) {
    if (!rows || rows.length === 0) continue;

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
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
    warnings: extracted.warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore (import JSON)
// ─────────────────────────────────────────────────────────────────────────────

export interface RestoreResult {
  /** New rows created (INSERT). */
  inserted: Record<string, number>;
  /** Existing rows updated (UPDATE via upsert). */
  updated: Record<string, number>;
  /** Rows that already existed and were skipped (when upsert=false). */
  skipped: Record<string, number>;
  /** Per-table errors. */
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

/**
 * Pre-fetch existing IDs for a table to distinguish INSERT vs UPDATE.
 * Returns a Set of IDs that already exist in the target table.
 *
 * We do this in chunks of 500 IDs to avoid URL length limits.
 */
async function fetchExistingIds(
  supabase: SupabaseClient,
  tableName: string,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const existing = new Set<string>();
  const CHUNK_SIZE = 500;
  for (let i = 0; i < candidateIds.length; i += CHUNK_SIZE) {
    const chunk = candidateIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from(tableName)
      .select('id')
      .in('id', chunk);
    if (error) {
      // If we can't pre-check, return empty set (caller will treat all as inserted)
      logger.warn('DATABASE', 'BACKUP_RESTORE_PRECHECK_FAILED', {
        table: tableName, error: error.message,
      });
      return new Set();
    }
    for (const row of (data || []) as Array<{ id: string }>) {
      existing.add(row.id);
    }
  }
  return existing;
}

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
  const updated: Record<string, number> = {};
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
      updated[tableName] = 0;
      skipped[tableName] = 0;
      continue;
    }

    if (dryRun) {
      // In dry-run, pre-check existing IDs to give accurate inserted/updated counts
      const candidateIds = rows
        .map((r) => r['id'])
        .filter((id): id is string => typeof id === 'string');
      const existingIds = await fetchExistingIds(supabase, tableName, candidateIds);
      let insCount = 0, updCount = 0, skipCount = 0;
      for (const r of rows) {
        const id = r['id'];
        if (typeof id === 'string' && existingIds.has(id)) {
          if (upsert) updCount++; else skipCount++;
        } else {
          insCount++;
        }
      }
      inserted[tableName] = insCount;
      updated[tableName] = updCount;
      skipped[tableName] = skipCount;
      continue;
    }

    // For 'stores' table: only update existing row, never insert (preserve id)
    if (tableName === 'stores') {
      const targetRow = rows.find((r) => r.id === targetStoreId);
      if (!targetRow) {
        skipped[tableName] = rows.length;
        inserted[tableName] = 0;
        updated[tableName] = 0;
        continue;
      }
      const { error } = await supabase
        .from('stores')
        .update(targetRow)
        .eq('id', targetStoreId);
      if (error) {
        errors.push({ table: tableName, message: error.message, sample: targetRow });
        inserted[tableName] = 0;
        updated[tableName] = 0;
        skipped[tableName] = rows.length;
      } else {
        inserted[tableName] = 0;
        updated[tableName] = 1;
        skipped[tableName] = rows.length - 1;
      }
      continue;
    }

    // For all other tables: ensure rows point to targetStoreId (rewrite
    // store_id field if present) and strip GENERATED columns.
    // For 'categories' (global, no store_id), we DO NOT rewrite store_id
    // because there is no store_id column.
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

    // Pre-check existing IDs to distinguish INSERT vs UPDATE for the report
    const candidateIds = normalizedRows
      .map((r) => r['id'])
      .filter((id): id is string => typeof id === 'string');
    const existingIds = await fetchExistingIds(supabase, tableName, candidateIds);
    let insCount = 0, updCount = 0;
    for (const r of normalizedRows) {
      const id = r['id'];
      if (typeof id === 'string' && existingIds.has(id)) {
        updCount++;
      } else {
        insCount++;
      }
    }

    // If upsert=false and we want to skip existing rows, filter them out
    let rowsToUpsert = normalizedRows;
    if (!upsert) {
      rowsToUpsert = normalizedRows.filter((r) => {
        const id = r['id'];
        return !(typeof id === 'string' && existingIds.has(id));
      });
    }

    if (rowsToUpsert.length === 0) {
      inserted[tableName] = 0;
      updated[tableName] = 0;
      skipped[tableName] = normalizedRows.length;
      continue;
    }

    // Use upsert to handle re-imports gracefully. onConflict='id' preserves
    // original UUIDs from the backup (needed for FK integrity).
    const { error } = await supabase
      .from(tableName)
      .upsert(rowsToUpsert, { onConflict: 'id', ignoreDuplicates: !upsert });

    if (error) {
      // Common: FK violation (parent row missing), unique constraint, RLS.
      errors.push({
        table: tableName,
        message: error.message,
        sample: rowsToUpsert[0],
      });
      inserted[tableName] = 0;
      updated[tableName] = 0;
      skipped[tableName] = normalizedRows.length;
    } else {
      inserted[tableName] = insCount;
      updated[tableName] = upsert ? updCount : 0;
      skipped[tableName] = upsert ? 0 : (normalizedRows.length - rowsToUpsert.length);
    }
  }

  return {
    inserted,
    updated,
    skipped,
    errors,
    durationMs: Date.now() - start,
  };
}
