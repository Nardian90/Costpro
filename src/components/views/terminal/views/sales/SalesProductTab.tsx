'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Package, RefreshCw } from 'lucide-react';
import { StateRenderer } from '@/components/ui/StateRenderer';
import * as XLSX from '@e965/xlsx';

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

interface SalesProductTabProps {
  dateFrom: string;
  dateTo: string;
  storeId: string;
  onDataLoaded?: (data: ProductDayRow[]) => void;
}

export function SalesProductTab({ dateFrom, dateTo, storeId, onDataLoaded }: SalesProductTabProps) {
  const [data, setData] = useState<ProductDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'fecha' | 'product_name' | 'total_cup' | 'total_cantidad'>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Query transaction_items joined with transactions and products
      let query = supabase
        .from('transaction_items')
        .select(`
          quantity,
          price_at_sale,
          price_at_sale_cup,
          price_currency,
          transactions!inner (
            id, completed_at, status, total_amount, zelle_amount, sale_exchange_rate,
            store_id
          ),
          products (
            id, name, sku
          )
        `)
        .eq('transactions.status', 'completed')
        .eq('transactions.store_id', storeId);

      if (dateFrom) query = query.gte('transactions.completed_at', `${dateFrom}T00:00:00Z`);
      if (dateTo) query = query.lte('transactions.completed_at', `${dateTo}T23:59:59Z`);

      const { data: items, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Group by (fecha, product_id)
      const grouped = new Map<string, ProductDayRow>();

      for (const item of (items || [])) {
        const txn = item.transactions as any;
        if (!txn?.completed_at) continue;

        const fecha = txn.completed_at.split('T')[0];
        const product = item.products as any;
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

        // USD if item was priced in USD
        if (item.price_currency === 'USD') {
          const usdPrice = Number(item.price_at_sale || 0);
          row.total_usd = (row.total_usd || 0) + usdPrice * qty;
        }
      }

      setData(Array.from(grouped.values()));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, storeId]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // Notify parent of data changes for Excel export
  React.useEffect(() => {
    if (onDataLoaded) onDataLoaded(data);
  }, [data, onDataLoaded]);

  // Sort
  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'fecha') cmp = a.fecha.localeCompare(b.fecha);
      else if (sortBy === 'product_name') cmp = a.product_name.localeCompare(b.product_name);
      else if (sortBy === 'total_cup') cmp = a.total_cup - b.total_cup;
      else if (sortBy === 'total_cantidad') cmp = a.total_cantidad - b.total_cantidad;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortBy, sortDir]);

  // Totals
  const totals = useMemo(() => {
    return data.reduce((acc, r) => ({
      total_cantidad: acc.total_cantidad + r.total_cantidad,
      total_cup: acc.total_cup + r.total_cup,
      total_usd: acc.total_usd + (r.total_usd || 0),
      products_count: acc.products_count + 1,
    }), { total_cantidad: 0, total_cup: 0, total_usd: 0, products_count: 0 });
  }, [data]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

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
            <p className="font-bold text-foreground">Sin ventas en el período</p>
            <p className="text-sm text-muted-foreground">No hay ventas registradas en el rango de fechas seleccionado.</p>
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

      {/* Product table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-3 text-left cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('fecha')}>
                Fecha {sortBy === 'fecha' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="p-3 text-left cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('product_name')}>
                Producto {sortBy === 'product_name' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-right cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('total_cantidad')}>
                Cantidad {sortBy === 'total_cantidad' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="p-3 text-right cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('total_cup')}>
                Total CUP {sortBy === 'total_cup' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="p-3 text-right hidden sm:table-cell">USD</th>
              <th className="p-3 text-center hidden sm:table-cell">Ventas</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, i) => (
              <tr key={`${row.fecha}-${row.product_id}`} className={cn(
                'border-b border-border/30 hover:bg-muted/20 transition-colors',
                i % 2 === 1 && 'bg-muted/5'
              )}>
                <td className="p-3 font-bold whitespace-nowrap text-xs">
                  {new Date(row.fecha + 'T12:00:00').toLocaleDateString('es-CU', {
                    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
                  })}
                </td>
                <td className="p-3 font-bold text-xs">{row.product_name}</td>
                <td className="p-3 text-xs text-muted-foreground">{row.sku || '—'}</td>
                <td className="p-3 text-right tabular-nums font-bold text-xs">{row.total_cantidad.toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums font-black text-xs">{formatCurrency(row.total_cup)}</td>
                <td className="p-3 text-right tabular-nums text-blue-500 text-xs hidden sm:table-cell">
                  {row.total_usd !== null && row.total_usd > 0 ? `$${row.total_usd.toFixed(2)}` : '—'}
                </td>
                <td className="p-3 text-center tabular-nums text-xs hidden sm:table-cell">{row.transactions_count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-foreground/10 border-t-2 border-foreground/30 font-black">
              <td className="p-3 uppercase text-xs tracking-widest" colSpan={3}>Total</td>
              <td className="p-3 text-right tabular-nums">{totals.total_cantidad.toFixed(2)}</td>
              <td className="p-3 text-right tabular-nums">{formatCurrency(totals.total_cup)}</td>
              <td className="p-3 text-right tabular-nums text-blue-500 hidden sm:table-cell">
                {totals.total_usd > 0 ? `$${totals.total_usd.toFixed(2)}` : '—'}
              </td>
              <td className="p-3 text-right tabular-nums hidden sm:table-cell">{data.length}</td>
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
 * Export product tab data to Excel.
 */
export function exportProductTabToExcel(data: ProductDayRow[], filename: string) {
  const headers = ['Fecha', 'Producto', 'SKU', 'Cantidad', 'Total CUP', 'Total USD', 'N° Ventas'];
  const rows = data.map(r => [
    r.fecha,
    r.product_name,
    r.sku || '',
    Number(r.total_cantidad.toFixed(2)),
    Number(r.total_cup.toFixed(2)),
    r.total_usd !== null && r.total_usd > 0 ? Number(r.total_usd.toFixed(2)) : '',
    r.transactions_count,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 10 },
  ];
  ws['!autofilter'] = { ref: `A1:G${rows.length + 1}` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas por Producto');
  XLSX.writeFile(wb, filename);
}
