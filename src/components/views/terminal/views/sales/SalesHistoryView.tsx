'use client';

import React, { useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { DollarSign, CreditCard, Eye, Undo2, Copy, Calculator, CheckSquare, Square, AlertTriangle, ShoppingCart, Download, ChevronLeft, ChevronRight, X, Filter, Wallet, ArrowLeftRight } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSalesHistoryView } from './useSalesHistoryView';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { useUIStore } from '@/store';

// Helper para icono y etiqueta del método de pago
function getPaymentMethodInfo(method: string | null | undefined): { icon: React.ElementType; label: string; color: string } {
    switch ((method || '').toLowerCase()) {
        case 'cash': return { icon: DollarSign, label: 'Efectivo', color: 'text-success' };
        case 'card': return { icon: CreditCard, label: 'Tarjeta', color: 'text-primary' };
        case 'transfer': return { icon: ArrowLeftRight, label: 'Transferencia', color: 'text-primary' };
        case 'mixed': return { icon: Wallet, label: 'Mixto', color: 'text-warning' };
        case 'wallet': return { icon: Wallet, label: 'Billetera', color: 'text-warning' };
        case 'other': return { icon: CreditCard, label: 'Otro', color: 'text-muted-foreground' };
        default: return { icon: CreditCard, label: 'Sin especificar', color: 'text-muted-foreground' };
    }
}
import { TaxCalculationModal } from './TaxCalculationModal';
import { SalesSummaryTab } from './SalesSummaryTab';

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

// ── Pagination Footer ──
const PaginationFooter = ({ page, totalPages, totalItems, onPageChange }: { page: number; totalPages: number; totalItems: number; onPageChange: (p: number) => void }) => {
    if (totalPages <= 1 && totalItems <= 50) {
        return (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                <span className="font-bold">{totalItems} {totalItems === 1 ? 'venta' : 'ventas'}</span>
            </div>
        );
    }

    const from = (page - 1) * 50 + 1;
    const to = Math.min(page * 50, totalItems);

    return (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <span className="text-xs font-bold text-muted-foreground">
                Mostrando {from}–{to} de {totalItems}
            </span>
            <div className="flex items-center gap-1">
                <button type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Pagina anterior"
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
                    aria-label="Pagina siguiente"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default function SalesHistoryView() {
  // ESTÁNDAR: Revertir es la única forma de deshacer una venta
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'detalle' | 'resumen'>('detalle');
  const { setCurrentView, setForceOpenCart } = useUIStore();

  const {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    hasActiveFilters,
    handleClearFilters,
    selectedTransaction,
    transactions,
    totalFilteredCount,
    isLoading,
    stats,
    page,
    setPage,
    totalPages,
    handleViewDetails,
    handleCloseDetails,
    transactionItems,
    loadingDetails,
    selectedIds,
    toggleSelection,
    toggleAll,
    selectedTransactions,
    isTaxModalOpen,
    setIsTaxModalOpen,
    handleDuplicate,
    handleExportCSV,
  } = useSalesHistoryView();

  // ESTÁNDAR: tras duplicar, navegar al POS con carrito abierto para que el usuario vea los items
  const handleDuplicateAndNavigate = (txn: typeof transactions[0]) => {
    handleDuplicate(txn);
    // Forzar que el POS abra el carrito automáticamente al montar
    setForceOpenCart(true);
    // Navegar al POS tras un breve delay para que el carrito se cargue
    setTimeout(() => setCurrentView('pos'), 500);
  };

  const isMobile = useIsMobile();

  const allIds = transactions.map(t => t.id);
  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
   
  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">Ventas</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export CSV */}
            <button type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 h-11 border border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-muted transition-all active:scale-95"
              title="Exportar a CSV"
              aria-label="Exportar ventas a CSV"
            >
              <Download className="w-4 h-4" />
              {isMobile ? 'CSV' : 'Exportar CSV'}
            </button>
            {/* Tax Calc */}
            {selectedIds.size > 0 && (
              <button type="button"
                onClick={() => setIsTaxModalOpen(true)}
                className="flex items-center gap-2 px-4 h-11 bg-primary text-foreground rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
              >
                <Calculator className="w-4 h-4" />
                Impuestos ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!isLoading && totalFilteredCount > 0 && <StatsBar stats={stats} />}

        {/* Search & Filters */}
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por ID, monto o metodo..."
        >
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              {/* Status filter */}
              <div>
                <label htmlFor="sales-status" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Estado</label>
                <select
                  id="sales-status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
                >
                  <option value="">Todos</option>
                  <option value="completed">Completada</option>
                  <option value="pending">Pendiente</option>
                  <option value="voided">Anulada</option>
                </select>
              </div>
              {/* Date from */}
              <div>
                <label htmlFor="date-from" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Desde</label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
                />
              </div>
              {/* Date to */}
              <div>
                <label htmlFor="date-to" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Hasta</label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none min-h-[44px]"
                />
              </div>
           </div>

           {/* Active filters indicator + clear */}
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

        {/* V2.12.22: Tabs — Detalle | Resumen Consolidado */}
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
            storeId={typeof window !== 'undefined' ? localStorage.getItem('currentStoreId') || '' : ''}
          />
        )}

        {/* Tab Detalle (contenido original) */}
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
                    className="mt-3 text-xs font-black text-primary hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          }
        >
          {() => (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <div className="table-scroll-wrapper">
              {/* Sticky header table */}
              <table className="data-table sticky-column-1 w-full text-sm"><thead className="sr-only"><tr><th>Columnas</th></tr></thead>
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                    <th className="p-4 text-center w-10">
                      <div className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center">
                      <button type="button"
                        onClick={() => toggleAll(allIds)}
                        className="text-primary hover:scale-110 transition-transform"
                        aria-label={isAllSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
                      >
                        {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      </div>
                    </th>
                    <th className="p-4 text-left">Ref</th>
                    <th className="p-4 text-left">Fecha</th>
                    <th className="p-4 text-left priority-low hidden sm:table-cell">Metodo</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center priority-low hidden sm:table-cell">Estado</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
              </table>

              {/* Virtualized body */}
              <div ref={parentRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 420px)' }}>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const txn = transactions[virtualRow.index];
                    const isVoided = txn.status === 'voided' || txn.status === 'reversed';
                    const canReverseTx = canReverse('transaction', txn.status);
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <table className="data-table sticky-column-1 w-full text-sm"><thead className="sr-only"><tr><th>Columnas</th></tr></thead>
                          <tbody>
                            <tr className={cn(
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
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <span className={cn(
                                  "text-base font-black tabular-nums",
                                  isVoided ? "line-through text-muted-foreground" : ""
                                )}>{formatCurrency(txn.total_amount)}</span>
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

                                  {/* ESTÁNDAR: Revertir es la única forma de deshacer una venta completed.
                                      Anular (void) se eliminó porque era redundante y sin trazabilidad contable.
                                      Revertir invierte stock + crea kardex entries + pide motivo + audita. */}
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
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pagination Footer */}
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                totalItems={totalFilteredCount}
                onPageChange={setPage}
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

      {/* ESTÁNDAR: Modal de Reversión Contable — única forma de deshacer venta */}
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
