'use client';

import React from 'react';
import { DollarSign, CreditCard, Eye, RefreshCcw, Copy, Calculator, CheckSquare, Square } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
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

  const allIds = transactions.map(t => t.id);
  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase hidden sm:block">Ventas</h2>
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
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">Todos</option>
                  <option value="completed">Completada</option>
                  <option value="pending">Pendiente</option>
                  <option value="voided">Anulada</option>
                </select>
              </div>
           </div>
        </SearchBar>

        <div className="table-scroll-wrapper">
          <StateRenderer
            isLoading={isLoading}
            error={null}
            data={transactions}
            loadingComponent={<SalesLoadingSkeleton />}
          >
            {(data) => (
              <table className="data-table sticky-column-1 w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                    <th className="p-4 text-center w-10">
                      <button
                        onClick={() => toggleAll(allIds)}
                        className="text-primary hover:scale-110 transition-transform"
                      >
                        {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="p-4 text-left">Ref</th>
                    <th className="p-4 text-left">Fecha</th>
                    <th className="p-4 text-left priority-low">Método</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center priority-low">Estado</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(txn => (
                    <tr key={txn.id} className={cn(
                        "border-b border-border/50 hover:bg-muted/20 transition-colors",
                        selectedIds.has(txn.id) && "bg-primary/5"
                    )}>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleSelection(txn.id)}
                          className={cn(
                            "transition-all",
                            selectedIds.has(txn.id) ? "text-primary scale-110" : "text-muted-foreground/30"
                          )}
                        >
                          {selectedIds.has(txn.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-4 font-bold text-xs text-primary">{txn.id.split('-')[0]}</td>
                      <td className="p-4">
                        <div className="font-bold text-xs">{formatDate(txn.created_at)}</div>
                        <div className="text-xs text-muted-foreground">{formatTime(txn.created_at)}</div>
                      </td>
                      <td className="p-4 priority-low">
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
                      <td className="p-4 text-center priority-low">
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
                                handleViewDetails(txn); // Para cargar los items
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
                                handleViewDetails(txn); // Para cargar los items
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
                  ))}
                </tbody>
              </table>
            )}
          </StateRenderer>
        </div>
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
