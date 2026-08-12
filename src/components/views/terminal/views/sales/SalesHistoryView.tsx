'use client';

import React, { useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { DollarSign, CreditCard, Eye, Undo2, Copy, Calculator, CheckSquare, Square, AlertTriangle, ShoppingCart, Download, ChevronLeft, ChevronRight, X, Filter, Wallet, ArrowLeftRight, TrendingUp } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import * as XLSX from '@e965/xlsx';
import { useSalesHistoryView } from './useSalesHistoryView';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { useUIStore, useAuthStore } from '@/store';
import { TaxCalculationModal } from './TaxCalculationModal';
import { SalesSummaryTab } from './SalesSummaryTab';

// Helper para icono y etiqueta del método de pago
function getPaymentMethodInfo(method: string | null | undefined): { icon: React.ElementType; label: string; color: string } {
    switch ((method || '').toLowerCase()) {
        case 'cash': return { icon: DollarSign, label: 'Efectivo', color: 'text-success' };
        case 'card': return { icon: CreditCard, label: 'Tarjeta', color: 'text-primary' };
        case 'transfer': return { icon: ArrowLeftRight, label: 'Transferencia', color: 'text-primary' };
        case 'mixed': return { icon: Wallet, label: 'Mixto', color: 'text-warning' };
        case 'wallet': return { icon: Wallet, label: 'Billetera', color: 'text-warning' };
        case 'zelle': return { icon: DollarSign, label: 'USD/Zelle', color: 'text-blue-500' };
        case 'other': return { icon: CreditCard, label: 'Otro', color: 'text-muted-foreground' };
        default: return { icon: CreditCard, label: 'Sin especificar', color: 'text-muted-foreground' };
    }
}

const SalesLoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

// ── Stats Bar ──
const StatsBar = ({ stats }: { stats: { total: number; completed: number; voided: number; totalSales: number } }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Ventas</div>
      <div className="text-lg font-black text-primary tabular-nums">{stats.total}</div>
    </div>
    <div className="p-3 rounded-xl bg-success/5 border border-success/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Completadas</div>
      <div className="text-lg font-black text-success tabular-nums">{stats.completed}</div>
    </div>
    <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Anuladas</div>
      <div className="text-lg font-black text-destructive">{stats.voided}</div>
    </div>
    <div className="p-3 rounded-xl bg-warning/5 border border-warning/10 text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Ingresos</div>
      <div className="text-lg font-black text-warning tabular-nums">{formatCurrency(stats.totalSales)}</div>
    </div>
  </div>
);

// ── Pagination Footer with page size selector ──
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PaginationFooter = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }: {
  page: number; totalPages: number; totalItems: number; pageSize: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) => {
    const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, totalItems);

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/20">
            <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground">
                    Mostrando {from}–{to} de {totalItems}
                </span>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Filas:</span>
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className="text-xs font-bold border border-border rounded-lg px-2 py-1 bg-background outline-none cursor-pointer"
                    >
                        {PAGE_SIZE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
            </div>
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button type="button"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Página anterior"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1 px-2">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (page <= 3) {
                                pageNum = i + 1;
                            } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = page - 2 + i;
                            }
                            return (
                                <button type="button"
                                    key={pageNum}
                                    onClick={() => onPageChange(pageNum)}
                                    className={cn(
                                        "w-8 h-8 rounded-lg text-xs font-black transition-all",
                                        page === pageNum
                                            ? "bg-primary text-foreground shadow-sm"
                                            : "hover:bg-muted text-muted-foreground"
                                    )}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>
                    <button type="button"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Página siguiente"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default function SalesHistoryView() {
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'detalle' | 'resumen'>('detalle');
  const { setCurrentView, setForceOpenCart } = useUIStore();
  const user = useAuthStore(s => s.user);
  const activeStoreId = user?.activeStoreId || '';

  const {
    searchTerm, setSearchTerm,
    selectedStatus, setSelectedStatus,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    hasActiveFilters, handleClearFilters,
    selectedTransaction,
    transactions, totalFilteredCount,
    isLoading, stats,
    page, setPage, totalPages,
    handleViewDetails, handleCloseDetails,
    transactionItems, loadingDetails,
    selectedIds, toggleSelection, toggleAll,
    selectedTransactions,
    isTaxModalOpen, setIsTaxModalOpen,
    handleDuplicate,
    pageSize, setPageSize,
  } = useSalesHistoryView();

  const handleDuplicateAndNavigate = (txn: typeof transactions[0]) => {
    handleDuplicate(txn);
    setForceOpenCart(true);
    setTimeout(() => setCurrentView('pos'), 500);
  };

  const isMobile = useIsMobile();

  // PR-4.4H: Export to Excel (.xlsx) with USD column
  const handleExportExcel = useCallback(() => {
    if (!transactions || transactions.length === 0) return;

    const headers = ['Ref', 'Fecha', 'Hora', 'Método', 'Moneda', 'Total CUP', 'USD Original', 'Subtotal CUP', 'Descuento', 'Impuestos', 'Estado', 'Efectivo CUP', 'Transferencia CUP', 'Zelle (CUP equiv.)'];
    const rows = transactions.map(t => {
      const zelleAmt = Number((t as any).zelle_amount || 0);
      const rate = Number((t as any).sale_exchange_rate || 1);
      // PR-4.4I: USD solo si hay tasa persistida, sino vacío
      const usdOrig = zelleAmt > 0 && rate > 1 ? zelleAmt / rate : '';
      const hasZelle = zelleAmt > 0;
      const cashA = Number((t as any).cash_amount || 0);
      const transferA = Number((t as any).transfer_amount || 0);
      const currencyLabel = hasZelle && rate > 1
        ? (cashA === 0 && transferA === 0 ? 'USD' : 'CUP+USD')
        : (hasZelle ? 'CUP+USD?' : 'CUP');
      return [
        t.id.split('-')[0],
        formatDate(t.created_at),
        new Date(t.created_at).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' }),
        (() => {
          const m = (t.payment_method || '').toLowerCase();
          if (m === 'cash') return 'Efectivo';
          if (m === 'transfer') return 'Transferencia';
          if (m === 'mixed') return 'Mixto';
          if (m === 'zelle') return 'USD/Zelle';
          if (m === 'wallet') return 'Billetera';
          if (m === 'other') return 'Otro';
          return 'Sin especificar';
        })(),
        currencyLabel,
        Number(t.total_amount || 0),
        typeof usdOrig === 'number' && usdOrig > 0 ? Number(usdOrig.toFixed(2)) : '',
        Number(t.subtotal || 0),
        Number(t.discount_value || 0),
        Number(t.tax_amount || 0),
        t.status === 'completed' ? 'Completada' : t.status === 'pending' ? 'Pendiente' : 'Anulada',
        cashA,
        transferA,
        zelleAmt,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Set column widths
    ws['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 },
    ];
    // Add autofilter
    ws['!autofilter'] = { ref: `A1:N${rows.length + 1}` };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');

    const storeName = activeStoreId ? 'tienda' : 'todas';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `ventas_${storeName}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  }, [transactions, activeStoreId]);

  const allIds = transactions.map(t => t.id);
  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  // Clamp page when pageSize changes
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">Ventas</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Excel */}
            <button type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 h-11 border border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
              title="Exportar a Excel"
              aria-label="Exportar ventas a Excel"
            >
              <Download className="w-4 h-4" />
              {isMobile ? 'Excel' : 'Exportar Excel'}
            </button>
            {selectedTransactions.length > 0 && (
              <button type="button"
                onClick={() => setIsTaxModalOpen(true)}
                className="flex items-center gap-2 px-4 h-11 border border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
              >
                <Calculator className="w-4 h-4" />
                {isMobile ? 'Imp.' : `Impuestos (${selectedTransactions.length})`}
              </button>
            )}
          </div>
        </div>

        <StatsBar stats={stats} />

        {/* Search + Filters */}
        <SearchBar
          value={searchTerm}
          onChange={(v) => { setSearchTerm(v); setPage(1); }}
          placeholder="Buscar por referencia, vendedor..."
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
              className="p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
            >
              <option value="all">Todos los estados</option>
              <option value="completed">Completadas</option>
              <option value="voided">Anuladas</option>
              <option value="pending">Pendientes</option>
            </select>
            <input type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
            />
            <input type="date" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
            />
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Filter className="w-3 h-3" />
                <span>Filtros activos — {totalFilteredCount} resultado{totalFilteredCount !== 1 ? 's' : ''}</span>
              </div>
              <button type="button"
                onClick={handleClearFilters}
                className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline"
              >
                <X className="w-3 h-3" />
                Limpiar filtros
              </button>
            </div>
          )}
        </SearchBar>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setActiveTab('detalle')}
            className={cn(
              "flex-1 py-3 px-4 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[44px] transition-colors",
              activeTab === 'detalle' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Eye className="w-3.5 h-3.5 inline mr-1" /> Detalle
          </button>
          <button
            onClick={() => setActiveTab('resumen')}
            className={cn(
              "flex-1 py-3 px-4 text-xs font-black uppercase border-b-2 -mb-px whitespace-nowrap min-h-[44px] transition-colors",
              activeTab === 'resumen' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> Resumen Consolidado
          </button>
        </div>

        {/* Tab Resumen Consolidado */}
        {activeTab === 'resumen' && (
          <SalesSummaryTab
            dateFrom={dateFrom || ''}
            dateTo={dateTo || ''}
            storeId={activeStoreId}
          />
        )}

        {/* Tab Detalle */}
        {activeTab === 'detalle' && (
        <StateRenderer
          isLoading={isLoading}
          error={null}
          data={transactions}
          loadingComponent={<SalesLoadingSkeleton />}
          emptyComponent={
            <div className="text-center py-16 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
                <ShoppingCart className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  {hasActiveFilters ? 'Sin resultados' : 'Sin ventas registradas'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasActiveFilters
                    ? 'No se encontraron ventas con los filtros seleccionados. Intenta ajustar los criterios.'
                    : 'Las ventas apareceran aqui despues de confirmar transacciones en el Punto de Venta.'
                  }
                </p>
                {hasActiveFilters && (
                  <button type="button"
                    onClick={handleClearFilters}
                    className="mt-4 px-4 py-2 text-xs font-bold uppercase border border-border rounded-lg hover:bg-muted transition-all"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          }
        >
          {() => (
            <div className="space-y-4">
              {/* Selection bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
                  </div>
                  <button type="button"
                    onClick={() => selectedIds.forEach(id => toggleSelection(id))}
                    className="text-xs font-bold text-destructive hover:underline"
                  >
                    Deseleccionar todas
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <table className="data-table w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="p-4 text-center w-12">
                        <button type="button"
                          onClick={() => toggleAll(allIds)}
                          className="transition-all"
                          aria-label={isAllSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
                        >
                          {isAllSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground/30" />}
                        </button>
                      </th>
                      <th className="p-4 text-left">Ref</th>
                      <th className="p-4 text-left">Fecha</th>
                      <th className="p-4 text-left priority-low hidden sm:table-cell">Pago</th>
                      <th className="p-4 text-right">Total</th>
                      <th className="p-4 text-center priority-low hidden sm:table-cell">Estado</th>
                      <th className="p-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn) => {
                      const isVoided = txn.status === 'voided' || txn.status === 'reversed';
                      const canReverseTx = canReverse('transaction', txn.status);
                      return (
                        <tr key={txn.id} className={cn(
                          "border-b border-border/50 hover:bg-muted/20 transition-colors",
                          selectedIds.has(txn.id) && "bg-primary/5",
                          isVoided && "opacity-60"
                        )}>
                          <td className="p-4 text-center">
                            <div className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center">
                              <button type="button"
                                onClick={() => toggleSelection(txn.id)}
                                className={cn(
                                  "transition-all",
                                  selectedIds.has(txn.id) ? "text-primary scale-110" : "text-muted-foreground/30"
                                )}
                                aria-label={selectedIds.has(txn.id) ? 'Deseleccionar venta' : 'Seleccionar venta'}
                              >
                                {selectedIds.has(txn.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-xs text-primary">{txn.id.split('-')[0]}</td>
                          <td className="p-4">
                            <div className="font-bold text-xs">{formatDate(txn.created_at)}</div>
                            <div className="text-xs text-muted-foreground">{formatTime(txn.created_at)}</div>
                          </td>
                          <td className="p-4 priority-low hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const pm = getPaymentMethodInfo(txn.payment_method);
                                const PmIcon = pm.icon;
                                return <PmIcon className={cn("w-3 h-3", pm.color)} />;
                              })()}
                              <span className="text-xs font-bold uppercase">
                                {getPaymentMethodInfo(txn.payment_method).label}
                              </span>
                              {(txn as any).zelle_amount > 0 && (txn as any).sale_exchange_rate > 1 && (
                                <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                  ${((txn as any).zelle_amount / (txn as any).sale_exchange_rate).toFixed(2)} USD
                                </span>
                              )}
                              {(txn as any).zelle_amount > 0 && (!(txn as any).sale_exchange_rate || (txn as any).sale_exchange_rate <= 1) && (
                                <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                  USD s/tasa
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <div className={cn(
                              "text-base font-black tabular-nums",
                              isVoided ? "line-through text-muted-foreground" : ""
                            )}>{formatCurrency(txn.total_amount)} <span className="text-[10px] font-bold text-muted-foreground">CUP</span></div>
                            {(txn as any).zelle_amount > 0 && (txn as any).sale_exchange_rate > 1 && (
                              <div className="text-[10px] font-bold text-blue-500 tabular-nums">
                                ≈ ${((txn as any).zelle_amount / (txn as any).sale_exchange_rate).toFixed(2)} USD
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center priority-low hidden sm:table-cell">
                            <DocumentStatusBadge type="transaction" status={txn.status} />
                          </td>
                          <td className="p-4 text-center" aria-label="Acciones de la venta">
                            <div className="flex items-center justify-center gap-1.5">
                              <button type="button"
                                onClick={() => handleViewDetails(txn)}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                                title="Ver detalles"
                                aria-label="Ver detalles de la venta"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {canReverseTx && (
                                <button type="button"
                                  onClick={() => setReverseTarget({
                                    id: txn.id,
                                    label: `Venta ${txn.id.split('-')[0]} • ${formatCurrency(txn.total_amount)}`,
                                  })}
                                  className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95"
                                  title="Revertir venta (invierte stock + kardex)"
                                  aria-label="Revertir venta"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              )}
                              <button type="button"
                                onClick={() => handleDuplicateAndNavigate(txn)}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-95"
                                title="Duplicar Venta (carga items en POS)"
                                aria-label="Duplicar venta"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination Footer with page size selector */}
                <PaginationFooter
                  page={page}
                  totalPages={totalPages}
                  totalItems={totalFilteredCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            </div>
          )}
        </StateRenderer>
        )}
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTransaction}
        isOpen={!!selectedTransaction}
        onClose={handleCloseDetails}
        items={transactionItems}
        isLoading={loadingDetails}
      />

      {/* Reverse Document Modal */}
      <ReverseDocumentModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        type="transaction"
        docId={reverseTarget?.id || ''}
        docLabel={reverseTarget?.label}
      />

      {/* Tax Calculation Modal */}
      <TaxCalculationModal
        isOpen={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        selectedTransactions={selectedTransactions}
      />
    </>
  );
}
