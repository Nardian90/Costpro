'use client';

import React, { useRef } from 'react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { DollarSign, CreditCard, Eye, RefreshCcw, Copy, Calculator, CheckSquare, Square } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSalesHistoryView } from './useSalesHistoryView';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { TaxCalculationModal } from './TaxCalculationModal';

const SalesLoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

export default function SalesHistoryView() {
  const {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    selectedTransaction,
    transactions,
    isLoading,
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
    handleInvert,
    handleDuplicate,
    isInverting
  } = useSalesHistoryView();

  const isMobile = useIsMobile();

  const allIds = transactions.map(t => t.id);
  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase sm:block">Ventas</h2>
          {isMobile && <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase">Ventas</h2>}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setIsTaxModalOpen(true)}
              className="flex items-center gap-2 px-4 h-11 bg-primary text-foreground rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
            >
              <Calculator className="w-4 h-4" />
              Calcular Impuestos ({selectedIds.size})
            </button>
          )}
        </div>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por ID o monto..."
        >
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
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
           </div>
        </SearchBar>

        <StateRenderer
          isLoading={isLoading}
          error={null}
          data={transactions}
          loadingComponent={<SalesLoadingSkeleton />}
        >
          {() => (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <div className="table-scroll-wrapper">
              {/* Sticky header table */}
              <table className="data-table sticky-column-1 w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                    <th className="p-4 text-center w-10">
                      <div className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center">
                      <button
                        onClick={() => toggleAll(allIds)}
                        className="text-primary hover:scale-110 transition-transform"
                      >
                        {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      </div>
                    </th>
                    <th className="p-4 text-left">Ref</th>
                    <th className="p-4 text-left">Fecha</th>
                    <th className="p-4 text-left priority-low hidden sm:table-cell">Método</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center priority-low hidden sm:table-cell">Estado</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
              </table>

              {/* Virtualized body */}
              <div ref={parentRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 350px)' }}>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const txn = transactions[virtualRow.index];
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
                        <table className="data-table sticky-column-1 w-full text-sm">
                          <tbody>
                            <tr className={cn(
                                "border-b border-border/50 hover:bg-muted/20 transition-colors",
                                selectedIds.has(txn.id) && "bg-primary/5"
                            )}>
                              <td className="p-4 text-center">
                                <div className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center">
                                <button
                                  onClick={() => toggleSelection(txn.id)}
                                  className={cn(
                                    "transition-all",
                                    selectedIds.has(txn.id) ? "text-primary scale-110" : "text-muted-foreground/30"
                                  )}
                                  aria-label={`Seleccionar transacción ${txn.id}`}
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
                                  {txn.payment_method === 'cash' ? <DollarSign className="w-3 h-3 text-green-500" /> : <CreditCard className="w-3 h-3 text-primary" />}
                                  <span className="text-xs font-bold uppercase">
                                    {txn.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <span className="text-base font-black">{formatCurrency(txn.total_amount)}</span>
                              </td>
                              <td className="p-4 text-center priority-low hidden sm:table-cell">
                                <span className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded text-xs font-black uppercase",
                                  txn.status === 'completed' ? "bg-green-500/10 text-green-600" :
                                  txn.status === 'pending' ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"
                                )}>
                                  {txn.status === 'completed' ? 'Completada' :
                                   txn.status === 'pending' ? 'Pendiente' : 'Anulado'}
                                </span>
                              </td>
                              <td className="p-4 text-center" aria-label="Acciones de la venta">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleViewDetails(txn)}
                                    className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                                    title="Ver detalles"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                        handleViewDetails(txn);
                                        setTimeout(() => handleInvert(txn), 500);
                                    }}
                                    className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-destructive hover:text-foreground transition-all active:scale-95"
                                    title="Invertir Venta (Devolución)"
                                    disabled={txn.status === 'voided' || isInverting}
                                  >
                                    <RefreshCcw className={cn("w-4 h-4", isInverting && "animate-spin")} />
                                  </button>
                                  <button
                                    onClick={() => {
                                        handleViewDetails(txn);
                                        setTimeout(() => handleDuplicate(txn), 500);
                                    }}
                                    className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-amber-500 hover:text-foreground transition-all active:scale-95"
                                    title="Duplicar Venta"
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
            </div>
            </div>
          )}
        </StateRenderer>
      </div>
      <TransactionDetailsModal
        transaction={selectedTransaction}
        isOpen={!!selectedTransaction}
        onClose={handleCloseDetails}
        items={transactionItems}
        isLoading={loadingDetails}
      />

      <TaxCalculationModal
        isOpen={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        selectedTransactions={selectedTransactions}
      />
    </>
  );
}
