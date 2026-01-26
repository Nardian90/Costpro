'use client';

import React from 'react';
import { DollarSign, CreditCard, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { useSalesHistoryView } from './useSalesHistoryView';
import { TransactionDetailsModal } from './TransactionDetailsModal';

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
    loadingDetails
  } = useSalesHistoryView();

  return (
    <>
      <div className="space-y-6">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Ventas</h2>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por ID o monto..."
        >
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase mb-1 block ml-1">Estado</label>
                <select
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

        <div className="responsive-table-container">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                <th className="p-4 text-left">Ref</th>
                <th className="p-4 text-left">Fecha</th>
                <th className="p-4 text-left priority-low">Método</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-center priority-low">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => (
                <tr key={txn.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-4 font-bold text-xs text-primary">{txn.id.split('-')[0]}</td>
                  <td className="p-4">
                    <div className="font-bold text-xs">{new Date(txn.created_at).toLocaleDateString()}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(txn.created_at).toLocaleTimeString()}</div>
                  </td>
                  <td className="p-4 priority-low">
                    <div className="flex items-center gap-2">
                      {txn.payment_method === 'cash' ? <DollarSign className="w-3 h-3 text-green-500" /> : <CreditCard className="w-3 h-3 text-primary" />}
                      <span className="text-[10px] font-bold uppercase">{txn.payment_method}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-base font-black">${txn.total_amount.toFixed(2)}</span>
                  </td>
                  <td className="p-4 text-center priority-low">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase",
                      txn.status === 'completed' ? "bg-green-500/10 text-green-600" :
                      txn.status === 'pending' ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"
                    )}>
                      {txn.status}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleViewDetails(txn)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-white transition-all active:scale-95"
                      aria-label="Ver detalles"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground uppercase font-black tracking-widest text-xs">
                    No se encontraron ventas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <TransactionDetailsModal
        transaction={selectedTransaction}
        isOpen={!!selectedTransaction}
        onClose={handleCloseDetails}
        items={transactionItems}
        isLoading={loadingDetails}
      />
    </>
  );
}
