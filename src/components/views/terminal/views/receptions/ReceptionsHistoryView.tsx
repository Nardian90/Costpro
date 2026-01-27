'use client';

import React from 'react';
import { Warehouse, Eye, Calendar, Building2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useReceptionsHistoryView } from './useReceptionsHistoryView';
import { ReceptionDetailsModal } from './ReceptionDetailsModal';

const ReceptionsLoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

export default function ReceptionsHistoryView() {
  const {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    selectedReceipt,
    receptions,
    isLoading,
    handleViewDetails,
    handleCloseDetails,
    receiptItems,
    loadingDetails
  } = useReceptionsHistoryView();

  return (
    <>
      <div className="space-y-6">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Recepciones</h2>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por ID, proveedor o factura..."
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
                  <option value="active">Activa</option>
                  <option value="voided">Anulada</option>
                </select>
              </div>
           </div>
        </SearchBar>

        <div className="responsive-table-container">
          <StateRenderer
            isLoading={isLoading}
            error={null}
            data={receptions}
            loadingComponent={<ReceptionsLoadingSkeleton />}
          >
            {(data) => (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                    <th className="p-4 text-left">Ref</th>
                    <th className="p-4 text-left">Fecha</th>
                    <th className="p-4 text-left">Proveedor</th>
                    <th className="p-4 text-left priority-low">Factura</th>
                    <th className="p-4 text-right">Total Costo</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(rec => (
                    <tr key={rec.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-4 font-bold text-xs text-primary">{rec.id.split('-')[0]}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                           <Calendar className="w-3 h-3 text-muted-foreground" />
                           <div className="font-bold text-xs">{rec.reception_date ? new Date(rec.reception_date).toLocaleDateString() : 'N/A'}</div>
                        </div>
                        <div className="text-[9px] text-muted-foreground ml-5">{new Date(rec.created_at).toLocaleTimeString()}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                           <Building2 className="w-3 h-3 text-muted-foreground" />
                           <span className="text-xs font-bold uppercase truncate max-w-[150px]">{rec.supplier || 'S/N'}</span>
                        </div>
                      </td>
                      <td className="p-4 priority-low">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-bold uppercase">{rec.reference_doc || 'S/N'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-base font-black text-primary">${rec.total_cost.toFixed(2)}</span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleViewDetails(rec)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-white transition-all active:scale-95"
                          aria-label="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </StateRenderer>
        </div>
      </div>
      <ReceptionDetailsModal
        receipt={selectedReceipt}
        isOpen={!!selectedReceipt}
        onClose={handleCloseDetails}
        items={receiptItems}
        isLoading={loadingDetails}
      />
    </>
  );
}
