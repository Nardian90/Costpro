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
  Download,
  Plus,
  Zap,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useUIStore } from '@/store';
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
  const { setCurrentView } = useUIStore();
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
    handleExportAllExcel,
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
    // Reception-Flow-Fix: confirmar pendiente
    confirmingReceiptId,
    isConfirmingPending,
    handleConfirmPendingRequest,
    handleConfirmPendingExecute,
    handleConfirmPendingCancel,
  } = useReceptionsHistoryView();

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase text-primary">
            Recepciones
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCurrentView('recepcion')}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Crear nueva recepción"
            >
              <Plus className="w-4 h-4" />
              Nueva
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('reception-express-auto', 'true');
                setCurrentView('recepcion');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border-2 border-primary/30 bg-primary/5 text-primary font-black text-xs uppercase tracking-widest hover:bg-primary/10 hover:border-primary/50 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Modo recepción express"
              title="Recepción Express: layout optimizado para recepción rápida"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Express</span>
            </button>
            <button
              type="button"
              onClick={handleExportAllExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95"
              aria-label="Exportar todas las recepciones a Excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* Reception-Flow-Fix: banner informativo cuando hay recepciones pendientes.
            Ayuda al usuario a recordar que tiene recepciones sin confirmar. */}
        {receptions.some(r => r.status === 'pending') && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Clock className="w-5 h-5 text-warning shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-xs font-black uppercase text-warning tracking-widest">
                {receptions.filter(r => r.status === 'pending').length} recepción(es) pendiente(s)
              </p>
              <p className="text-[11px] text-warning/80 mt-0.5">
                Las recepciones pendientes no afectan el inventario hasta que las confirmes.
                Usa el botón <CheckCircle2 className="inline w-3 h-3" /> para confirmar.
              </p>
            </div>
          </div>
        )}

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
                    <th className="p-4 text-left hidden sm:table-cell">Proveedor</th>
                    <th className="p-4 text-left priority-low hidden sm:table-cell">Factura</th>
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
                      <td className="p-4 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                           <Building2 className="w-3 h-3 text-muted-foreground" />
                           <span className="text-xs font-bold uppercase truncate max-w-[150px]">{rec.supplier || 'S/N'}</span>
                        </div>
                      </td>
                      <td className="p-4 priority-low hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-bold uppercase">{rec.reference_doc || 'S/N'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center priority-low">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-xs font-black uppercase",
                          rec.status === 'active' ? "bg-success/10 text-success" :
                          rec.status === 'voided' ? "bg-destructive/10 text-destructive" :
                          rec.status === 'pending' ? "bg-warning/10 text-warning" :
                          "bg-success/10 text-success"
                        )}>
                          {rec.status === 'active' ? 'Confirmada' :
                           rec.status === 'voided' ? 'Anulado' :
                           rec.status === 'pending' ? 'Pendiente' : 'Parcial'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-base font-black text-primary tabular-nums">{formatCurrency(rec.total_cost)}</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button"
                            onClick={() => handleViewDetails(rec)}
                            className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-foreground transition-all active:scale-95"
                            title="Ver productos"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* Reception-Flow-Fix: botón "Confirmar" solo para pendientes.
                              Aplica los cambios de stock y vuelve la recepción no editable. */}
                          {rec.status === 'pending' && (
                            <button type="button"
                              onClick={() => handleConfirmPendingRequest(rec)}
                              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border-2 border-success/30 bg-success/10 text-success hover:bg-success/20 transition-all active:scale-95"
                              title="Confirmar recepción (aplicar al inventario)"
                              disabled={isConfirmingPending}
                            >
                              <CheckCircle2 className={cn("w-4 h-4", isConfirmingPending && confirmingReceiptId === rec.id && "animate-pulse")} />
                            </button>
                          )}
                          {/* Reception-Flow-Restriction: para confirmadas (active) SOLO se permite
                              Invertir (que es como anular pero dejando trazabilidad mediante
                              documento de inversión) y Duplicar. NO se puede editar ni anular
                              directamente — la trazabilidad requiere el documento de inversión. */}
                          {rec.status === 'active' && (
                            <>
                              <button type="button"
                                onClick={() => {
                                    handleViewDetails(rec);
                                    setTimeout(() => handleInvert(rec), 500);
                                }}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-destructive hover:text-foreground transition-all active:scale-95"
                                title="Invertir Recepción — Crea un documento de disminución que revierte el stock manteniendo trazabilidad (equivalente a anular con auditoría)"
                                disabled={isInverting}
                              >
                                <RefreshCcw className={cn("w-4 h-4", isInverting && "animate-spin")} />
                              </button>
                              <button type="button"
                                onClick={() => {
                                    handleViewDetails(rec);
                                    setTimeout(() => handleDuplicate(rec), 500);
                                }}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-info hover:text-foreground transition-all active:scale-95"
                                title="Duplicar Recepción"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {/* Editar — SOLO para pendientes. Las confirmadas no son editables
                              (requiere Invertir + nueva recepción para corregir). */}
                          {rec.status === 'pending' && (
                            <button type="button"
                              onClick={() => handleEdit(rec)}
                              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-border hover:bg-warning hover:text-foreground transition-all active:scale-95"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {/* Anular — SOLO para pendientes. Las confirmadas se invierten
                              (no se anulan directamente) para mantener trazabilidad. */}
                          {rec.status === 'pending' && (
                            <button type="button"
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
        // Reception-Flow-Fix: pasar props para confirmar pendiente.
        isConfirmPendingMode={!!confirmingReceiptId && !!selectedReceipt && selectedReceipt.id === confirmingReceiptId}
        onConfirmPending={() => selectedReceipt && handleConfirmPendingExecute(selectedReceipt)}
        onConfirmPendingCancel={handleConfirmPendingCancel}
        isConfirmingPending={isConfirmingPending}
      />
    </>
  );
}
