'use client';

import React from 'react';
import {
  Calendar,
  Building2,
  FileText,
  Eye,
  RefreshCcw,
  Copy,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { QueryInspector } from '@/components/ui/QueryInspector';
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
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    selectedReceipt,
    receptions,
    isLoading,
    handleViewDetails,
    handleCloseDetails,
    handleInvert,
    handleDuplicate,
    isInverting,
    handleExportCSV,
    receiptItems,
    loadingDetails,
    // FM-06 additions
    isEditMode,
    handleEdit,
    handleVoidRequest,
    handleVoidConfirm,
    handleUpdateSubmit,
    isUpdating,
    isVoiding,
  } = useReceptionsHistoryView();

  return (
    <>
      <div className="space-y-6">
        <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase text-primary"> Recepciones </h2>

        <QueryInspector />

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por ID, proveedor o factura..."
        >
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              <div>
                <label htmlFor="reception-status" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Estado</label>
                <select
                  id="reception-status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">Todos</option>
                  <option value="active">Confirmada</option>
                  <option value="voided">Anulada</option>
                  <option value="pending">Pendiente</option>
                  <option value="partial">Parcial</option>
                </select>
              </div>
              <div>
                <label htmlFor="reception-from" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Desde</label>
                <input
                  id="reception-from"
                  type="date"
                  aria-label="Fecha desde"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label htmlFor="reception-to" className="text-xs font-black text-muted-foreground uppercase mb-1 block ml-1">Hasta</label>
                <input
                  id="reception-to"
                  type="date"
                  aria-label="Fecha hasta"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold uppercase focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
           </div>
        </SearchBar>

        <div className="table-scroll-wrapper">
          <StateRenderer
            isLoading={isLoading}
            error={null}
            data={receptions}
            loadingComponent={<ReceptionsLoadingSkeleton />}
          >
            {(data) => (
              <table className="data-table sticky-column-1 w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                    <th className="p-4 text-left">ID / Ref</th>
                    <th className="p-4 text-left">Fecha</th>
                    <th className="p-4 text-left">Proveedor</th>
                    <th className="p-4 text-left priority-low">Factura</th>
                    <th className="p-4 text-center priority-low">Estado</th>
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
                           <div className="font-bold text-xs">{formatDate(rec.reception_date)}</div>
                        </div>
                        <div className="text-xs text-muted-foreground ml-5">{formatTime(rec.created_at)}</div>
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
                          <span className="text-xs font-bold uppercase">{rec.reference_doc || 'S/N'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center priority-low">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-xs font-black uppercase",
                          rec.status === 'active' ? "bg-green-500/10 text-green-600" :
                          rec.status === 'voided' ? "bg-destructive/10 text-destructive" :
                          rec.status === 'pending' ? "bg-amber-500/10 text-amber-600" :
                          "bg-green-600/10 text-green-700"
                        )}>
                          {rec.status === 'active' ? 'Confirmada' :
                           rec.status === 'voided' ? 'Anulado' :
                           rec.status === 'pending' ? 'Pendiente' : 'Parcial'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-base font-black text-primary">{formatCurrency(rec.total_cost)}</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewDetails(rec)}
                            className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                            title="Ver productos"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                                handleViewDetails(rec);
                                setTimeout(() => handleInvert(rec), 500);
                            }}
                            className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-destructive hover:text-foreground transition-all active:scale-95"
                            title="Invertir Recepción (Disminución)"
                            disabled={rec.status === 'voided' || isInverting}
                          >
                            <RefreshCcw className={cn("w-4 h-4", isInverting && "animate-spin")} />
                          </button>
                           <button
                            onClick={() => {
                                handleViewDetails(rec);
                                setTimeout(() => handleDuplicate(rec), 500);
                            }}
                            className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-amber-500 hover:text-foreground transition-all active:scale-95"
                            title="Duplicar Recepción"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(rec)}
                            className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-amber-500 hover:text-foreground transition-all active:scale-95"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {rec.status !== 'voided' && (
                            <button
                              onClick={() => handleVoidRequest(rec)}
                              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-destructive hover:text-foreground transition-all active:scale-95"
                              title="Anular"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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
      <ReceptionDetailsModal
        receipt={selectedReceipt}
        isOpen={!!selectedReceipt}
        onClose={handleCloseDetails}
        items={receiptItems}
        isLoading={loadingDetails}
        onExport={() => selectedReceipt && handleExportCSV(selectedReceipt, receiptItems)}
        isEditMode={isEditMode}
        onUpdateSubmit={(updates) => selectedReceipt && handleUpdateSubmit(selectedReceipt.id, updates)}
        onVoidRequest={() => selectedReceipt && handleVoidConfirm(selectedReceipt!)}
        isUpdating={isUpdating}
        isVoiding={isVoiding}
      />
    </>
  );
}
