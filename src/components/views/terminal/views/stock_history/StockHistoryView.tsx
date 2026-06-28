'use client';

import React, { useMemo } from 'react';
import { History, ArrowUpRight, ArrowDownRight, ArrowUpDown, Calendar, Download, ChevronDown, User } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { SecondaryButton, IconButton } from '@/components/ui/atomic';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useStockMovements } from '@/hooks/api/useStockMovements';
import { useAuthStore } from '@/store';

export default function StockHistoryView() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const {
    data: pagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useStockMovements(
    user?.activeStoreId,
    user?.role === 'admin',
    dateRange.from || undefined,
    dateRange.to || undefined
  );

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Flatten all pages
  const allMovements = useMemo(() => {
    return (pagesData?.pages || []).flatMap(p => p.items);
  }, [pagesData]);

  const totalCount = pagesData?.pages?.[0]?.total ?? 0;

  // Client-side search filter
  const filteredMovements = useMemo(() => {
    if (!searchTerm) return allMovements;
    const term = searchTerm.toLowerCase();
    return allMovements.filter(mov => {
      const productName = mov.product?.name?.toLowerCase() || '';
      const productSku = mov.product?.sku?.toLowerCase() || '';
      const refDoc = mov.reference_doc?.toLowerCase() || '';
      return productName.includes(term) || productSku.includes(term) || refDoc.includes(term);
    });
  }, [allMovements, searchTerm]);

  const onRefresh = () => {
    refetch();
    toast.success('Historial de stock actualizado.');
  };

  const onSearchChange = (value: string) => setSearchTerm(value);
  const onDateRangeChange = (range: { from: string; to: string }) => setDateRange(range);

  const onLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // --- Export to CSV ---
  const handleExportCSV = useCallback(() => {
    if (filteredMovements.length === 0) {
      toast.error('No hay movimientos para exportar.');
      return;
    }

    const headers = ['Fecha', 'Tipo', 'Producto', 'SKU', 'Cantidad', 'Saldo Posterior', 'Costo Unit.', 'Precio Unit.', 'Referencia', 'Usuario'];
    const rows = filteredMovements.map(mov => [
      formatDate(mov.created_at),
      mov.movement_type === 'sale' ? 'Venta' : mov.movement_type === 'purchase' ? 'Compra' : mov.movement_type === 'adjustment' ? 'Ajuste' : mov.movement_type,
      mov.product?.name || '',
      mov.product?.sku || '',
      mov.quantity_change.toString(),
      (mov.balance_after ?? '').toString(),
      (mov.unit_cost ?? '').toString(),
      (mov.unit_price ?? '').toString(),
      mov.reference_doc || '',
      mov.created_by || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimientos_stock_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredMovements.length} movimientos exportados.`);
  }, [filteredMovements]);

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'sale': return 'text-primary bg-primary/10 border-primary/20';
      case 'purchase': return 'text-success bg-success/10 border-success/20';
      case 'adjustment': return 'text-warning bg-warning/10 border-warning/20';
      default: return 'text-muted-foreground bg-muted/20 border-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header — el título se omite cuando se usa dentro de tabs de InventoryView */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border">
              {totalCount} registro{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ActionMenu
          actions={[
            { id: 'export', label: 'Exportar CSV', icon: Download, onClick: handleExportCSV },
            { id: 'refresh', label: 'Actualizar', icon: History, onClick: onRefresh, variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <QueryInspector />

      {/* Search + Date Filters */}
      <SearchBar
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Filtrar por producto, SKU o referencia..."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          <div className="space-y-1.5">
            <label htmlFor="stock-from" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                id="stock-from"
                type="date"
                aria-label="Fecha desde"
                className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                value={dateRange.from}
                onChange={e => onDateRangeChange({ ...dateRange, from: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="stock-to" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                id="stock-to"
                type="date"
                aria-label="Fecha hasta"
                className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                value={dateRange.to}
                onChange={e => onDateRangeChange({ ...dateRange, to: e.target.value })}
              />
            </div>
          </div>
          {(dateRange.from || dateRange.to) && (
            <div className="flex items-end">
              <SecondaryButton
                label="Limpiar fechas"
                onClick={() => setDateRange({ from: '', to: '' })}
                className="text-xs"
              />
            </div>
          )}
        </div>
      </SearchBar>

      {/* Movements List */}
      <div className="space-y-3">
        {filteredMovements.map(mov => (
          <div key={mov.id as any} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/30 transition-all group">
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm group-hover:scale-105 transition-transform", getMovementBadge(mov.movement_type as any))}>
                {mov.movement_type === 'sale' ? <ArrowUpRight className="w-6 h-6" /> :
                 mov.movement_type === 'purchase' ? <ArrowDownRight className="w-6 h-6" /> :
                 <ArrowUpDown className="w-6 h-6" />}
              </div>
              <div>
                <div className="font-black text-base uppercase tracking-tight leading-tight">{mov.product?.name}</div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="font-mono text-xs font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{mov.product?.sku}</span>
                  <span className="text-xs font-black uppercase text-primary tracking-widest">
                    {mov.movement_type === 'sale' ? 'Venta' :
                     mov.movement_type === 'purchase' ? 'Compra' :
                     mov.movement_type === 'adjustment' ? 'Ajuste' : mov.movement_type}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right space-y-1">
              <div className={cn("text-xl font-black tabular-nums", mov.quantity_change > 0 ? 'text-success' : 'text-destructive')}>
                {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change}
                <span className="text-xs ml-1 font-bold">uds</span>
              </div>
              <div className="text-xs text-muted-foreground uppercase font-black tracking-widest">
                {formatDate(mov.created_at)}
              </div>
              <div className="flex items-center gap-3 justify-end text-xs text-muted-foreground/60 font-mono">
                {mov.balance_after !== null && mov.balance_after !== undefined && (
                  <span className="italic">Saldo: <span className="font-bold tabular-nums text-foreground/70">{mov.balance_after}</span></span>
                )}
                <span>REF: {mov.reference_doc || 'N/A'}</span>
              </div>
              {mov.created_by && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 justify-end">
                  <User className="w-3 h-3" />
                  <span className="font-mono">{mov.created_by.substring(0, 8)}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Load More */}
        {hasNextPage && (
          <div ref={loadMoreRef} className="flex justify-center pt-4">
            <SecondaryButton
              label={isFetchingNextPage ? 'Cargando...' : 'Cargar más movimientos'}
              icon={ChevronDown}
              onClick={onLoadMore}
              disabled={isFetchingNextPage}
            />
          </div>
        )}

        {/* Empty State */}
        {filteredMovements.length === 0 && !isLoading && (
          <div className="text-center py-24 rounded-xl border-2 border-dashed border-border bg-card/50">
            <History className="w-16 h-16 mx-auto mb-4 opacity-5" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">
              {searchTerm || dateRange.from || dateRange.to
                ? 'Sin movimientos para los filtros aplicados'
                : 'Sin movimientos registrados'}
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-card animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-40" />
                    <div className="h-3 bg-muted rounded w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
