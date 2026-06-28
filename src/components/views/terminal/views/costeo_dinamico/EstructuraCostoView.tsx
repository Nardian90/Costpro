'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import {
  Loader2, RefreshCw, Download, Package, TrendingUp, TrendingDown,
  Search, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CostStructureRow {
  product_id: string;
  product_name: string;
  stock_current: number;
  unit_cost: number;
  transport: number;
  manipulation: number;
  subtotal_real: number;
  commissions: number;
  other_services: number;
  exchange_variation: number;
  total_cost_expense: number;
  total_per_unit: number;
}

interface CostStructureResponse {
  data: CostStructureRow[];
  date_from: string;
  date_to: string;
  store_id: string;
}

export default function EstructuraCostoView() {
  const user = useAuthStore((s) => s.user);
  const storeId = (user as any)?.activeStoreId;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CostStructureRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyWithStock, setOnlyWithStock] = useState(true);
  const [sortBy, setSortBy] = useState<string>('total_per_unit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Date range (default: last 90 days)
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(ninetyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const fetchData = useCallback(async () => {
    if (!storeId) {
      toast.error('No hay tienda activa');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        store_id: storeId,
        date_from: dateFrom,
        date_to: dateTo,
      });
      const result = await apiFetch<CostStructureResponse>(`/api/inventory/estructura-costo?${params}`);
      setData(result.data || []);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = [
      'Producto', 'Existencia', 'Costo Unit.', 'Transportación', 'Manipulación',
      'Subtotal Costo Real', 'Comisiones', 'Otros Servicios', 'Variación Cambiaria',
      'Costo y Gasto Total', 'Costo por Unidad',
    ];
    const rows = filtered.map(r => [
      `"${r.product_name}"`, r.stock_current,
      r.unit_cost.toFixed(2), r.transport.toFixed(2), r.manipulation.toFixed(2),
      r.subtotal_real.toFixed(2), r.commissions.toFixed(2), r.other_services.toFixed(2),
      r.exchange_variation.toFixed(2), r.total_cost_expense.toFixed(2),
      r.total_per_unit.toFixed(2),
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estructura-costo-${storeId}-${dateFrom}-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filtered.length} productos`);
  };

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const filtered = data
    .filter(r => onlyWithStock ? r.stock_current > 0 : true)
    .filter(r => !searchTerm || r.product_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      const va = (a as any)[sortBy] as number ?? 0;
      const vb = (b as any)[sortBy] as number ?? 0;
      cmp = va - vb;
      if (sortBy === 'product_name') cmp = a.product_name.localeCompare(b.product_name);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // Totales
  const totals = filtered.reduce((acc, r) => {
    acc.unit_cost += r.unit_cost;
    acc.transport += r.transport;
    acc.manipulation += r.manipulation;
    acc.subtotal += r.subtotal_real;
    acc.commissions += r.commissions;
    acc.other += r.other_services;
    acc.exchange += r.exchange_variation;
    acc.total += r.total_cost_expense;
    return acc;
  }, { unit_cost: 0, transport: 0, manipulation: 0, subtotal: 0, commissions: 0, other: 0, exchange: 0, total: 0 });

  if (!storeId) {
    return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Selecciona una tienda</p></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Package className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Estructura de Costo</h1>
            <p className="text-xs text-muted-foreground">Composición del costo por producto ({dateFrom} → {dateTo})</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="flex items-center gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-9 text-xs" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-9 text-xs" />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar producto..." className="h-9 text-xs" />
        </div>
        <button
          onClick={() => setOnlyWithStock(!onlyWithStock)}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
            onlyWithStock ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
        >
          {onlyWithStock ? '✓ Solo con existencia' : 'Ver todos'}
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">No hay productos para mostrar</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <Th label="Producto" col="product_name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Exist." col="stock_current" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="Costo Unit." col="unit_cost" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="+ Transp." col="transport" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="+ Manip." col="manipulation" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="= Subtotal" col="subtotal_real" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right font-bold" />
                <Th label="+ Comisiones" col="commissions" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="+ Otros" col="other_services" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="± Variación Camb." col="exchange_variation" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="Costo y Gasto Total" col="total_cost_expense" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right font-bold" />
                <Th label="Costo/Unidad" col="total_per_unit" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right font-bold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.product_id} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="p-2 font-medium truncate max-w-[180px]">{r.product_name}</td>
                  <td className="p-2 text-right tabular-nums">{r.stock_current}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.unit_cost)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{r.transport > 0 ? fmt(r.transport) : '—'}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{r.manipulation > 0 ? fmt(r.manipulation) : '—'}</td>
                  <td className="p-2 text-right tabular-nums font-bold border-l border-border/20">{fmt(r.subtotal_real)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{r.commissions > 0 ? fmt(r.commissions) : '—'}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{r.other_services > 0 ? fmt(r.other_services) : '—'}</td>
                  <td className={cn('p-2 text-right tabular-nums', r.exchange_variation > 0 ? 'text-orange-600' : r.exchange_variation < 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                    {r.exchange_variation !== 0 ? (r.exchange_variation > 0 ? '+' : '') + fmt(r.exchange_variation) : '—'}
                  </td>
                  <td className="p-2 text-right tabular-nums font-black border-l border-border/20 bg-primary/5">{fmt(r.total_cost_expense)}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-primary">{fmt(r.total_per_unit)}</td>
                </tr>
              ))}
            </tbody>
            {/* Totales */}
            <tfoot className="bg-muted/30 border-t-2 border-border">
              <tr className="font-black">
                <td className="p-2" colSpan={2}>TOTALES ({filtered.length})</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.unit_cost)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.transport)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.manipulation)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.subtotal)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.commissions)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.other)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(totals.exchange)}</td>
                <td className="p-2 text-right tabular-nums text-primary">{fmt(totals.total)}</td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('es-CU', { maximumFractionDigits: 2 }).format(n);
}

function Th({ label, col, sortBy, sortDir, onSort, className }: { label: string; col: string; sortBy: string; sortDir: string; onSort: (c: string) => void; className?: string }) {
  return (
    <th className={cn('p-2 cursor-pointer hover:bg-muted/70 select-none whitespace-nowrap', className)} onClick={() => onSort(col)}>
      {label} {sortBy === col && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );
}
