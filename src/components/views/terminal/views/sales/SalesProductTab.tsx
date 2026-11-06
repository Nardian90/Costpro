'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatCurrency } from '@/lib/utils';
import { Package, RefreshCw, Columns3, RotateCcw, X } from 'lucide-react';
import { StateRenderer } from '@/components/ui/StateRenderer';
import * as XLSX from '@e965/xlsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { fetchAllRows } from '@/lib/supabase-fetch-all';
import {
  saleMatchesModalityFilter,
  type SaleModality,
  type SalePaymentInfo,
} from '@/lib/sales/sale-classification';

/**
 * Tab Productos del Historial de Ventas (misión 2026-11-06).
 *
 * Mejoras:
 *  A. Filtros Avanzados de modalidad monetaria (Venta CUP / Venta USD /
 *     Venta Mixta) y vía de pago (Transferencia) — la clasificación usa la
 *     distribución REAL del pago (payment_transactions; fallback legacy con
 *     los campos de la venta, misma semántica que /api/sales/summary). Los
 *     ítems de ventas que no cumplen se excluyen ANTES de agregar → la tabla
 *     y los totales reflejan el filtro.
 *  B. Ordenamiento numérico (no alfabético) por TODAS las columnas numéricas
 *     con alternancia ascendente/descendente, y gestión Mostrar/Ocultar
 *     columnas («Columnas») persistida por usuario en localStorage — solo
 *     afecta la presentación, nunca los datos ni los cálculos.
 *  C. La columna «USD» se identifica como «Venta USD» (solo nombre visible).
 *
 * COMPLETEZ (incidente IPV): la consulta pagina con fetchAllRows — ninguna
 * agregación puede truncar en silencio en el límite de 1000 filas de
 * PostgREST.
 */

interface ProductDayRow {
  fecha: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  total_cantidad: number;
  total_cup: number;
  total_usd: number | null;
  transactions_count: number;
}

interface RawTxnFields extends SalePaymentInfo {
  id: string;
  completed_at: string;
  status: string;
  total_amount: number;
  zelle_amount: number | null;
  sale_exchange_rate: number | null;
  store_id: string;
}

interface RawItemRow {
  id: string;
  quantity: number;
  price_at_sale: number;
  price_at_sale_cup: number | null;
  price_currency: string | null;
  transactions: RawTxnFields | null;
  products: { id: string; name: string; sku: string | null } | null;
}

// ── Definición de columnas (misión 2B/2C) ───────────────────────────────────

type ColumnKey = 'fecha' | 'producto' | 'sku' | 'cantidad' | 'total_cup' | 'venta_usd' | 'ventas';
type SortKey = 'fecha' | 'product_name' | 'total_cantidad' | 'total_cup' | 'total_usd' | 'transactions_count';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Columna esencial de identificación: siempre visible. */
  essential?: boolean;
  sortable?: boolean;
  numeric?: boolean;
  /** Clase responsive del diseño original (colapsa en pantallas pequeñas). */
  responsiveClass?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'fecha', label: 'Fecha', sortable: true },
  { key: 'producto', label: 'Producto', essential: true, sortable: true },
  { key: 'sku', label: 'SKU' },
  { key: 'cantidad', label: 'Cantidad', sortable: true, numeric: true },
  { key: 'total_cup', label: 'Total CUP', sortable: true, numeric: true },
  { key: 'venta_usd', label: 'Venta USD', numeric: true, responsiveClass: 'hidden sm:table-cell' },
  { key: 'ventas', label: 'Ventas', numeric: true, responsiveClass: 'hidden sm:table-cell' },
];

const COLUMN_STORAGE_KEY = 'costpro:sales-history:product-columns';

const SORT_BY_COLUMN: Partial<Record<ColumnKey, SortKey>> = {
  fecha: 'fecha',
  producto: 'product_name',
  cantidad: 'total_cantidad',
  total_cup: 'total_cup',
  venta_usd: 'total_usd',
  ventas: 'transactions_count',
};

const DEFAULT_VISIBLE: ColumnKey[] = COLUMNS.map(c => c.key);

function loadVisibleColumns(): ColumnKey[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE;
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw) as ColumnKey[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_VISIBLE;
    // La columna esencial (Producto) nunca se oculta; se restauran claves válidas.
    const valid = COLUMNS.filter(c => parsed.includes(c.key) || c.essential).map(c => c.key);
    return valid;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export type ProductModalityFilterValue = Exclude<SaleModality, 'other'>;

interface SalesProductTabProps {
  dateFrom: string;
  dateTo: string;
  storeId: string;
  onDataLoaded?: (data: ProductDayRow[]) => void;
  /** Modalidades monetarias seleccionadas en Filtros Avanzados (vacío = todas). */
  modalities?: ProductModalityFilterValue[];
  /** Filtro por vía de pago: solo ventas con transferencia/zelle. */
  transferOnly?: boolean;
  /** Limpia los filtros de modalidad/vía (regresar a la consulta general). */
  onClearModalityFilters?: () => void;
}

export function SalesProductTab({
  dateFrom,
  dateTo,
  storeId,
  onDataLoaded,
  modalities = [],
  transferOnly = false,
  onClearModalityFilters,
}: SalesProductTabProps) {
  const [rawItems, setRawItems] = useState<RawItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(loadVisibleColumns);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // COMPLETEZ (incidente IPV 2026-10-16): fetchAllRows pagina hasta agotar
      // — PostgREST trunca silenciosamente a 1000 filas sin esto. Orden por id
      // (clave única estable) para paginación determinista. Se consultan los
      // campos de pago reales de la venta (distribución autoritativa).
      let query = supabase
        .from('transaction_items')
        .select(`
          id,
          quantity,
          price_at_sale,
          price_at_sale_cup,
          price_currency,
          transactions!inner (
            id, completed_at, status, total_amount, zelle_amount, sale_exchange_rate,
            store_id, payment_method, cash_amount, transfer_amount, sale_currency,
            payment_transactions (amount, currency, payment_method)
          ),
          products (
            id, name, sku
          )
        `)
        .eq('transactions.status', 'completed')
        .eq('transactions.store_id', storeId)
        .order('id', { ascending: true });

      if (dateFrom) query = query.gte('transactions.completed_at', `${dateFrom}T00:00:00Z`);
      if (dateTo) query = query.lte('transactions.completed_at', `${dateTo}T23:59:59Z`);

      const items = await fetchAllRows<RawItemRow>(query as unknown as Parameters<typeof fetchAllRows<RawItemRow>>[0]);
      setRawItems(items || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, storeId]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // ── Agregado con filtro de modalidad/vía (misión 2A) ─────────────────────
  // Los ítems de ventas que no cumplen el filtro se excluyen ANTES de agregar:
  // la tabla y los totales reflejan exactamente los criterios aplicados.
  const data = useMemo(() => {
    const hasModalityFilter = modalities.length > 0 || transferOnly;
    const grouped = new Map<string, ProductDayRow>();

    for (const item of rawItems) {
      const txn = item.transactions as RawTxnFields | null;
      if (!txn?.completed_at) continue;

      if (hasModalityFilter && !saleMatchesModalityFilter(txn, modalities, transferOnly)) continue;

      const fecha = txn.completed_at.split('T')[0];
      const product = item.products;
      const productId = product?.id || 'unknown';
      const key = `${fecha}|${productId}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          fecha,
          product_id: productId,
          product_name: product?.name || 'Producto no disponible',
          sku: product?.sku || null,
          total_cantidad: 0,
          total_cup: 0,
          total_usd: null,
          transactions_count: 0,
        });
      }

      const row = grouped.get(key)!;
      const qty = Number(item.quantity || 0);
      const priceCup = Number(item.price_at_sale_cup || item.price_at_sale || 0);
      row.total_cantidad += qty;
      row.total_cup += priceCup * qty;
      row.transactions_count += 1;

      // USD si el ítem se vendió a precio USD
      if (item.price_currency === 'USD') {
        const usdPrice = Number(item.price_at_sale || 0);
        row.total_usd = (row.total_usd || 0) + usdPrice * qty;
      }
    }

    return Array.from(grouped.values());
  }, [rawItems, modalities, transferOnly]);

  // Notify parent of data changes for Excel export
  React.useEffect(() => {
    if (onDataLoaded) onDataLoaded(data);
  }, [data, onDataLoaded]);

  // ── Ordenamiento numérico (misión 2B) ─────────────────────────────────────
  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'fecha': cmp = a.fecha.localeCompare(b.fecha); break;
        case 'product_name': cmp = a.product_name.localeCompare(b.product_name); break;
        case 'total_cantidad': cmp = a.total_cantidad - b.total_cantidad; break;
        case 'total_cup': cmp = a.total_cup - b.total_cup; break;
        case 'total_usd': cmp = (a.total_usd ?? 0) - (b.total_usd ?? 0); break;
        case 'transactions_count': cmp = a.transactions_count - b.transactions_count; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortBy, sortDir]);

  // ── Totales (mismo conjunto que la tabla ordenada) ────────────────────────
  const totals = useMemo(() => {
    return data.reduce((acc, r) => ({
      total_cantidad: acc.total_cantidad + r.total_cantidad,
      total_cup: acc.total_cup + r.total_cup,
      total_usd: acc.total_usd + (r.total_usd || 0),
      products_count: acc.products_count + 1,
    }), { total_cantidad: 0, total_cup: 0, total_usd: 0, products_count: 0 });
  }, [data]);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // ── Gestión de columnas (misión 2B) ───────────────────────────────────────
  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key];
      // La columna esencial nunca desaparece del listado
      if (!next.includes('producto')) next.push('producto');
      try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE);
    try { localStorage.removeItem(COLUMN_STORAGE_KEY); } catch { /* noop */ }
  };

  const isVisible = (key: ColumnKey): boolean => visibleColumns.includes(key);
  const hasModalityFilter = modalities.length > 0 || transferOnly;
  const activeFilterLabels = [
    ...modalities.map(m => m === 'cup' ? 'Venta CUP' : m === 'usd' ? 'Venta USD' : 'Venta Mixta'),
    ...(transferOnly ? ['Transferencia'] : []),
  ].join(' + ');

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <StateRenderer
        isLoading={false}
        error={new Error(error)}
        data={[]}
        errorComponent={
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8">
            <p className="font-bold text-destructive">Error al cargar productos</p>
            <p className="text-sm text-destructive/80">{error}</p>
            <button onClick={fetchData} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
              Reintentar
            </button>
          </div>
        }
      >
        {() => null}
      </StateRenderer>
    );
  }

  if (data.length === 0) {
    return (
      <StateRenderer
        isLoading={false}
        data={[]}
        isEmpty
        emptyComponent={
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-border rounded-2xl p-8">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <p className="font-bold text-foreground">
              {hasModalityFilter ? 'Sin ventas con los filtros aplicados' : 'Sin ventas en el período'}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasModalityFilter
                ? 'Ninguna venta del período cumple la modalidad o vía de pago seleccionada.'
                : 'No hay ventas registradas en el rango de fechas seleccionado.'}
            </p>
            {hasModalityFilter && onClearModalityFilters && (
              <button
                onClick={onClearModalityFilters}
                className="mt-2 px-4 py-2 text-xs font-bold uppercase border border-border rounded-lg hover:bg-muted transition-all"
              >
                Limpiar filtros de modalidad
              </button>
            )}
          </div>
        }
      >
        {() => null}
      </StateRenderer>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-center">
          <Package className="w-5 h-5 text-primary mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Productos</p>
          <p className="text-base sm:text-lg font-black text-primary tabular-nums">{totals.products_count}</p>
        </div>
        <div className="rounded-xl bg-success/5 border border-success/10 p-3 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Cant. Total</p>
          <p className="text-base sm:text-lg font-black text-success tabular-nums">{totals.total_cantidad.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-foreground/5 border border-foreground/10 p-3 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Total CUP</p>
          <p className="text-base sm:text-lg font-black tabular-nums">{formatCurrency(totals.total_cup)}</p>
        </div>
        <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Total USD</p>
          <p className="text-base sm:text-lg font-black text-blue-500 tabular-nums">
            {totals.total_usd > 0 ? `$${totals.total_usd.toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      {/* Barra de herramientas: indicador de filtros + gestión de columnas */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {hasModalityFilter ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-primary/5 border border-primary/20 text-[11px] font-bold text-primary">
              Filtro: {activeFilterLabels}
            </span>
            {onClearModalityFilters && (
              <button
                type="button"
                onClick={onClearModalityFilters}
                className="inline-flex items-center gap-1 px-3 h-8 rounded-full border border-destructive/30 text-[11px] font-bold text-destructive hover:bg-destructive/5 transition-colors"
                aria-label="Limpiar filtros de modalidad"
              >
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">{data.length} fila{data.length !== 1 ? 's' : ''} producto-día</span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-border text-[11px] font-black uppercase tracking-wider hover:bg-muted transition-all"
              aria-label="Configurar columnas visibles"
            >
              <Columns3 className="w-4 h-4" /> Columnas
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest">Mostrar columnas</DropdownMenuLabel>
            {COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={isVisible(col.key)}
                onCheckedChange={() => { if (!col.essential) toggleColumn(col.key); }}
                disabled={col.essential}
                onSelect={(e) => e.preventDefault()}
                className="text-xs"
              >
                {col.label}{col.essential ? ' (fija)' : ''}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetColumns} className="text-xs text-muted-foreground">
              <RotateCcw className="w-3.5 h-3.5 mr-2" /> Restaurar columnas originales
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Product table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              {COLUMNS.map((col) => {
                if (!isVisible(col.key)) return null;
                const sortKey = SORT_BY_COLUMN[col.key];
                const isSorted = sortKey && sortBy === sortKey;
                const cellClass = [
                  'p-3',
                  col.numeric ? 'text-right' : 'text-left',
                  col.responsiveClass || '',
                  sortKey ? 'cursor-pointer hover:bg-muted/50 transition-colors select-none' : '',
                ].filter(Boolean).join(' ');
                return (
                  <th
                    key={col.key}
                    className={cellClass}
                    onClick={sortKey ? () => handleSort(sortKey) : undefined}
                    aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    title={sortKey ? 'Ordenar' : undefined}
                  >
                    {col.label}
                    {isSorted && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, i) => (
              <tr key={`${row.fecha}-${row.product_id}`} className={cn(
                'border-b border-border/30 hover:bg-muted/20 transition-colors',
                i % 2 === 1 && 'bg-muted/5'
              )}>
                {isVisible('fecha') && (
                  <td className="p-3 font-bold whitespace-nowrap text-xs">
                    {new Date(row.fecha + 'T12:00:00').toLocaleDateString('es-CU', {
                      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
                    })}
                  </td>
                )}
                {isVisible('producto') && (
                  <td className="p-3 font-bold text-xs">{row.product_name}</td>
                )}
                {isVisible('sku') && (
                  <td className="p-3 text-xs text-muted-foreground">{row.sku || '—'}</td>
                )}
                {isVisible('cantidad') && (
                  <td className="p-3 text-right tabular-nums font-bold text-xs">{row.total_cantidad.toFixed(2)}</td>
                )}
                {isVisible('total_cup') && (
                  <td className="p-3 text-right tabular-nums font-black text-xs">{formatCurrency(row.total_cup)}</td>
                )}
                {isVisible('venta_usd') && (
                  <td className={cn('p-3 text-right tabular-nums text-blue-500 text-xs', COLUMNS.find(c => c.key === 'venta_usd')?.responsiveClass)}>
                    {row.total_usd !== null && row.total_usd > 0 ? `$${row.total_usd.toFixed(2)}` : '—'}
                  </td>
                )}
                {isVisible('ventas') && (
                  <td className={cn('p-3 text-center tabular-nums text-xs', COLUMNS.find(c => c.key === 'ventas')?.responsiveClass)}>
                    {row.transactions_count}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-foreground/10 border-t-2 border-foreground/30 font-black">
              <td className="p-3 uppercase text-xs tracking-widest" colSpan={Math.max(1, visibleColumns.length - 3)}>
                Total
              </td>
              {isVisible('cantidad') && (
                <td className="p-3 text-right tabular-nums">{totals.total_cantidad.toFixed(2)}</td>
              )}
              {isVisible('total_cup') && (
                <td className="p-3 text-right tabular-nums">{formatCurrency(totals.total_cup)}</td>
              )}
              {isVisible('venta_usd') && (
                <td className={cn('p-3 text-right tabular-nums text-blue-500', COLUMNS.find(c => c.key === 'venta_usd')?.responsiveClass)}>
                  {totals.total_usd > 0 ? `$${totals.total_usd.toFixed(2)}` : '—'}
                </td>
              )}
              {isVisible('ventas') && (
                <td className={cn('p-3 text-right tabular-nums', COLUMNS.find(c => c.key === 'ventas')?.responsiveClass)}>
                  {data.length}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 h-10 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
    </div>
  );
}

// Helper cn (si no está importado desde utils)
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Export product tab data to Excel (respeta las columnas visibles de la tabla).
 */
export function exportProductTabToExcel(data: ProductDayRow[], filename: string, visibleColumns?: ColumnKey[]) {
  const visible = visibleColumns ?? DEFAULT_VISIBLE;
  const headers = COLUMNS.filter(c => visible.includes(c.key)).map(c => c.label);
  const rows = data
    .map(r => ({
      fecha: r.fecha,
      producto: r.product_name,
      sku: r.sku || '',
      cantidad: Number(r.total_cantidad.toFixed(2)),
      total_cup: Number(r.total_cup.toFixed(2)),
      venta_usd: r.total_usd !== null && r.total_usd > 0 ? Number(r.total_usd.toFixed(2)) : '',
      ventas: r.transactions_count,
    }))
    .map(r => COLUMNS.filter(c => visible.includes(c.key)).map(c => r[c.key as keyof typeof r]));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 10 },
  ];
  ws['!autofilter'] = { ref: `A1:${String.fromCharCode(64 + headers.length)}${rows.length + 1}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas por Producto');
  XLSX.writeFile(wb, filename);
}
