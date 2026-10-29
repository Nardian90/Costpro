'use client';

import React, { useState } from 'react';
import {
  Calendar,
  Building2,
  FileText,
  Eye,
  RefreshCcw,
  Undo2,
  Copy,
  Pencil,
  Trash2,
  Ban,
  Download,
  Plus,
  Zap,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  Package,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { DestructiveConfirmModal } from '@/components/ui/DestructiveConfirmModal';
import { BaseModal } from '@/components/ui/BaseModal';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import {canReverseDocumentInStore, isAdminLevel } from '@/lib/roles';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';
import { useReceptionsHistoryView } from './useReceptionsHistoryView';
import { ReceptionDetailsModal } from './ReceptionDetailsModal';
// MISIÓN RECEPCIONES (2026-10-28): pestaña Productos — mismo dato, otra perspectiva
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ReceptionProductLinesTable from './ReceptionProductLinesTable';
import PageHeader from '@/components/ui/PageHeader'; // F4 (IA-F11): portador F2 de la jerarquía de página
import { Warehouse } from 'lucide-react';

const ReceptionsLoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(8)].map((_, i) => (
      <Skeleton key={i} className="h-16 w-full rounded-xl" />
    ))}
  </div>
);

export default function ReceptionsHistoryView() {
  const { setCurrentView } = useUIStore();
  // V2.2: estado del modal de reversión contable
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  // MISIÓN RECEPCIONES (2026-10-28): pestañas Documentos | Productos.
  // 'documentos' es la vista original — se conserva intacta.
  const [activeTab, setActiveTab] = useState('documentos');
  // Carga diferida de la pestaña Productos: el fetch solo ocurre tras la
  // primera visita (sin cargas innecesarias), pero una vez visitada el
  // componente permanece montado para no perder filtros ni paginación.
  const [productsVisited, setProductsVisited] = useState(false);
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'productos') setProductsVisited(true);
  };
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
    hasActiveFilters,
    handleClearFilters,
    receptionsError,
    refetchReceptions,
    handleViewDetails,
    handleViewDetailsById,
    handleCloseDetails,
    handleInvert,
    handleDuplicate,
    handleExportCSV,
    handleExportAllExcel,
    // MISIÓN RESOLUCIÓN 11 (2026-10-29): exportación SC-2-04
    handleExportSc204,
    isExportingSc204,
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
    // MISIÓN RECEPCIONES (2026-10-27): eliminar borrador (pending)
    deletingReceipt,
    isDeletingDraft,
    handleDeleteDraftRequest,
    handleDeleteDraftConfirm,
    handleDeleteDraftCancel,
    // R2: modal de inversión estilado
    invertConfirmReceipt,
    handleInvertConfirm,
    setInvertConfirmReceipt,
    isInverting,
  } = useReceptionsHistoryView();

  // FIX-WIZARD: Estado del wizard de backfill masivo
  const user = useAuthStore((s) => s.user);
  const storeId = (user as any)?.activeStoreId;
  // W9.5 B-10: gate de rol (espejo de can_reverse_document) — operadores de recepciones
  const canReverseReceipt = canReverseDocumentInStore(user, storeId, 'receipt');
  // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
  const isAdmin = isAdminLevel(user?.role) || (user as any)?.role === 'manager';
  const [showBackfillWizard, setShowBackfillWizard] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillForm, setBackfillForm] = useState({
    date_from: '',
    date_to: '',
    moneda: 'USD',
    tasa: 0,
  });

  const handleBackfillMonedaChange = async (moneda: string) => {
    setBackfillForm(prev => ({ ...prev, moneda, tasa: moneda === 'CUP' ? 1 : prev.tasa }));
    if (moneda !== 'CUP') {
      try {
        const res = await fetch(`/api/exchange-rates?currency=${moneda}&source=BCC&segment=3&days=1`);
        if (res.ok) {
          const data = await res.json();
          // FIX-F03: la API devuelve { rates: [...] } no un array directo.
          if (data?.rates && data.rates.length > 0) setBackfillForm(prev => ({ ...prev, tasa: data.rates[0].rate }));
        }
      } catch {}
    }
  };

  const handleBackfillApply = async () => {
    if (!storeId || !backfillForm.tasa || backfillForm.tasa <= 0) {
      toast.error('Debes especificar una tasa válida');
      return;
    }
    setBackfillLoading(true);
    try {
      const data = await apiFetch('/api/inventory/receptions/backfill-tasas', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId,
          date_from: backfillForm.date_from || undefined,
          date_to: backfillForm.date_to || undefined,
          moneda: backfillForm.moneda,
          tasa: backfillForm.tasa,
          motivo: 'Backfill masivo desde wizard',
        }),
      });
      toast.success(data.message || `${data.updated} items actualizados`);
      setShowBackfillWizard(false);
      setBackfillForm({ date_from: '', date_to: '', moneda: 'USD', tasa: 0 });
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setBackfillLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* F4 (IA-F11): encabezado migrado a PageHeader (F2) — título/description/acciones
            en la jerarquía canónica; título 1:1 "Recepciones" (label de menú).
            Antes: h2 self-made uppercase + fila de acciones ad-hoc. */}
        <PageHeader
          title="Recepciones"
          description="Historial de recepciones de mercancía"
          icon={Warehouse}
          primaryAction={
            <button
              type="button"
              onClick={() => setCurrentView('recepcion')}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Crear nueva recepción"
            >
              <Plus className="w-4 h-4" />
              Nueva
            </button>
          }
          secondaryActions={
            <>
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
              {/* FIX-WIZARD: Botón de wizard de backfill masivo */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowBackfillWizard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border-2 border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-400 font-black text-xs uppercase tracking-widest hover:bg-amber-400/20 hover:border-amber-400/60 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                  title="Asignar tasas históricas a múltiples recepciones"
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="hidden sm:inline">Tasas históricas</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleExportAllExcel}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95"
                aria-label="Exportar todas las recepciones a Excel"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            </>
          }
        />

        <QueryInspector />

        {/* MISIÓN RECEPCIONES (2026-10-28): dos perspectivas de la MISMA información.
            Pestaña 1 "Documentos": la vista original, intacta.
            Pestaña 2 "Productos": detalle por líneas de producto (solo lectura).
            Ambas pestañas usan forceMount + hidden para no perder estado
            (filtros, paginación, scroll) al alternar entre ellas. */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-4">
          <TabsList aria-label="Perspectivas de recepciones" className="h-11 w-full sm:w-fit">
            <TabsTrigger
              value="documentos"
              className="min-h-[44px] px-4 sm:px-6 text-xs font-black uppercase tracking-widest gap-2"
              data-testid="receptions-tab-documentos"
            >
              <FileText className="w-4 h-4" />
              Documentos
            </TabsTrigger>
            <TabsTrigger
              value="productos"
              className="min-h-[44px] px-4 sm:px-6 text-xs font-black uppercase tracking-widest gap-2"
              data-testid="receptions-tab-productos"
            >
              <Package className="w-4 h-4" />
              Productos
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ PESTAÑA 1: DOCUMENTOS — vista original intacta ═══════════ */}
          <TabsContent
            value="documentos"
            forceMount
            className={cn('mt-0 space-y-6', activeTab !== 'documentos' && 'hidden')}
          >

        {/* Reception-Flow-Fix: banner informativo cuando hay recepciones pendientes.
            Ayuda al usuario a recordar que tiene recepciones sin confirmar. */}
        {receptions.some((r: any) => r.status === 'pending') && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <Clock className="w-5 h-5 text-warning shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-xs font-black uppercase text-warning tracking-widest">
                {receptions.filter((r: any) => r.status === 'pending').length} recepción(es) pendiente(s)
              </p>
              <p className="text-[11px] text-warning/80 mt-0.5">
                Las recepciones pendientes no afectan el inventario hasta que las confirmes.
                Usa el botón <CheckCircle2 className="inline w-3 h-3" /> para confirmar.
              </p>
            </div>
          </div>
        )}

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
                  <option value="reversed">Revertida</option>
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
            error={receptionsError}
            onRetry={refetchReceptions}
            data={receptions}
            loadingComponent={<ReceptionsLoadingSkeleton />}
            emptyComponent={
              // F3-B3: distinguir vacío real de vacío por filtros (patrón Historial)
              <div className="text-center py-16 space-y-3">
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  {hasActiveFilters ? 'Sin resultados' : 'Sin recepciones registradas'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'No se encontraron recepciones con los filtros seleccionados. Intenta ajustar los criterios.'
                    : 'Las recepciones aparecerán aquí después de registrarlas en Inventario.'
                  }
                </p>
                {hasActiveFilters && (
                  <button type="button"
                    onClick={handleClearFilters}
                    className="mt-3 px-4 py-2 text-xs font-bold uppercase border border-border rounded-lg hover:bg-muted transition-all"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            }
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
                  {data.map((rec: any) => (
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
                        <DocumentStatusBadge type="receipt" status={rec.status} />
                        {/* FIX-PAYMENT-TRACKING (2026-07-12): badge de estado de pago */}
                        {rec.status !== 'voided' && rec.status !== 'reversed' && (rec as any).payment_status && (
                          <span className={cn(
                            "ml-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase",
                            (rec as any).payment_status === 'paid' ? "bg-success/10 text-success"
                            : (rec as any).payment_status === 'partial' ? "bg-amber-500/10 text-amber-500"
                            : "bg-destructive/10 text-destructive"
                          )}>
                            {(rec as any).payment_status === 'paid' ? '💰 Pagado'
                             : (rec as any).payment_status === 'partial' ? '⚖️ Parcial'
                             : '⏳ Pendiente'}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-base font-black text-primary tabular-nums">{formatCurrency(rec.total_cost)}</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button"
                            onClick={() => handleViewDetails(rec as any)}
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
                              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border-2 border-success/40 bg-success/90 text-white dark:text-black hover:bg-success transition-all active:scale-95"
                              title="Confirmar recepción (aplicar al inventario)"
                              disabled={isConfirmingPending}
                            >
                              <CheckCircle2 className={cn("w-4 h-4", isConfirmingPending && confirmingReceiptId === rec.id && "animate-pulse")} />
                            </button>
                          )}
                          {/* ESTÁNDAR: para confirmadas (active) SOLO Revertir + Duplicar.
                              "Invertir" se eliminó — era redundante con Revertir y sin trazabilidad.
                              Revertir descuenta stock + crea kardex entries + pide motivo + audita. */}
                          {rec.status === 'active' && canReverseReceipt && (
                            <>
                              {/* ESTÁNDAR: Revertir — única forma de deshacer recepción confirmada */}
                              <button type="button"
                                onClick={() => setReverseTarget({
                                  id: rec.id,
                                  label: `Recepción ${rec.reference_doc || rec.id.split('-')[0]} • ${formatCurrency(rec.total_cost)}`,
                                })}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95"
                                title="Revertir Recepción (descuenta stock + kardex)"
                                aria-label="Revertir recepción"
                              >
                                <Undo2 className="w-4 h-4" />
                              </button>
                              <button type="button"
                                onClick={() => { handleDuplicate(rec); setTimeout(() => setCurrentView('recepcion'), 500); }}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-blue-500/40 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-95"
                                title="Duplicar Recepción (carga items en formulario)"
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
                              title="Anular (conserva el registro como anulada para auditoría)"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          {/* MISIÓN RECEPCIONES (2026-10-27) — Eliminar borrador:
                              distinto de Anular. Borra DEFINITIVAMENTE la
                              recepción pendiente y sus líneas (RPC
                              delete_pending_reception con guard de estado +
                              auditoría). Solo visible para pending. */}
                          {rec.status === 'pending' && (
                            <button type="button"
                              onClick={() => handleDeleteDraftRequest(rec as any)}
                              disabled={isDeletingDraft}
                              className="w-11 h-11 inline-flex items-center justify-center rounded-lg border-2 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white dark:hover:text-black transition-all active:scale-95 disabled:opacity-50"
                              title="Eliminar borrador (borrado definitivo, sin registro anulados)"
                              aria-label="Eliminar borrador de recepción"
                              data-testid={`reception-delete-draft-${(rec as any).id.slice(0, 8)}`}
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
          </TabsContent>

          {/* ═══════════ PESTAÑA 2: PRODUCTOS — detalle por líneas (solo lectura) ═══════════
              Render diferido: el fetch de líneas solo ocurre tras la primera visita.
              Una vez visitada, permanece montada (forceMount) para conservar
              filtros y paginación al alternar pestañas. La apertura del documento
              de origen reutiliza el modal de detalles existente y sus permisos. */}
          <TabsContent
            value="productos"
            forceMount
            className={cn('mt-0', activeTab !== 'productos' && 'hidden')}
          >
            {productsVisited && (
              <ReceptionProductLinesTable
                storeId={storeId}
                onViewDocument={handleViewDetailsById}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
      <ReceptionDetailsModal
        receipt={selectedReceipt}
        isOpen={!!selectedReceipt}
        onClose={handleCloseDetails}
        items={receiptItems}
        isLoading={loadingDetails}
        onExport={() => selectedReceipt && handleExportCSV(selectedReceipt, receiptItems)}
        // MISIÓN RESOLUCIÓN 11 (2026-10-29): modelo oficial SC-2-04 (solo lectura)
        onExportSc204Pdf={() => handleExportSc204()}
        isExportingSc204={isExportingSc204}
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

      {/* MISIÓN RECEPCIONES (2026-10-27) — Confirmación de eliminación de
          borrador (pending). Distinción explícita con Anular: Anular conserva
          el registro como 'voided'; Eliminar lo borra definitivamente (solo
          borradores sin efectos de inventario). */}
      <DestructiveConfirmModal
        key={`delete-draft-${deletingReceipt?.id ?? 'none'}`}
        isOpen={!!deletingReceipt}
        onClose={() => !isDeletingDraft && handleDeleteDraftCancel()}
        title="Eliminar Borrador de Recepción"
        description="Borrado definitivo del borrador (estado Pendiente) y sus líneas"
        confirmName={deletingReceipt?.id.split('-')[0] || ''}
        confirmNameLabel="ID de la recepción"
        warningText={
          <>
            Vas a eliminar definitivamente el borrador <strong>{deletingReceipt?.id.split('-')[0]}</strong>
            {' '}({deletingReceipt?.supplier || 'sin proveedor'} · factura {deletingReceipt?.reference_doc || '—'}).
            A diferencia de <strong>Anular</strong> (que conserva el registro como anulada para auditoría),
            esta acción <strong>no se puede deshacer</strong> y el borrador desaparecerá del historial.
          </>
        }
        itemsList={[
          'La recepción pendiente y todas sus líneas se borran definitivamente',
          'El inventario NO cambia (un borrador nunca afectó existencias)',
          'Queda registro de auditoría de quién eliminó el borrador',
          'Las recepciones confirmadas no se pueden eliminar (usa Revertir)',
        ]}
        confirmLabel="Eliminar Borrador"
        onConfirm={handleDeleteDraftConfirm}
        isSubmitting={isDeletingDraft}
      />

      {/* R2: Modal estilado para invertir/anular recepción (reemplaza confirm() nativo) */}
      <DestructiveConfirmModal
        key={`invert-${invertConfirmReceipt?.id ?? 'none'}`}
        isOpen={!!invertConfirmReceipt}
        onClose={() => !isInverting && setInvertConfirmReceipt(null)}
        title="Invertir Recepción"
        description="Crea un documento de disminución que revierte el stock manteniendo trazabilidad"
        confirmName={invertConfirmReceipt?.id.split('-')[0] || ''}
        confirmNameLabel="ID de la recepción"
        warningText={
          <>
            Vas a invertir la recepción <strong>{invertConfirmReceipt?.id.split('-')[0]}</strong>.
            Esto anulará el documento y restará los productos del inventario manteniendo
            trazabilidad contable. La acción <strong>no se puede deshacer</strong>.
          </>
        }
        itemsList={[
          'El documento se marca como anulado (voided)',
          'El stock de cada producto se reduce',
          'El costo promedio se recalcula',
          'Se registra un movimiento de tipo return',
        ]}
        confirmLabel="Invertir Recepción"
        onConfirm={handleInvertConfirm}
        isSubmitting={isInverting}
      />

      {/* FIX-WIZARD: Modal de backfill masivo de tasas históricas */}
      <BaseModal
        open={showBackfillWizard}
        onOpenChange={setShowBackfillWizard}
        title="Asignar Tasas Históricas"
        maxWidth="sm:max-w-lg"
      >
        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 space-y-1">
            <p className="text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Wizard de Backfill Masivo
            </p>
            <p className="text-xs text-muted-foreground">
              Asigna una moneda y tasa de cambio a TODAS las recepciones que todavía tienen
              el valor default (CUP / 1.0) en el rango de fecha especificado.
              Las recepciones que ya tienen una tasa asignada NO se modifican.
            </p>
          </div>

          {/* Rango de fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Desde (opcional)
              </label>
              <input
                type="date"
                value={backfillForm.date_from}
                onChange={e => setBackfillForm(prev => ({ ...prev, date_from: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Hasta (opcional)
              </label>
              <input
                type="date"
                value={backfillForm.date_to}
                onChange={e => setBackfillForm(prev => ({ ...prev, date_to: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold"
              />
            </div>
          </div>

          {/* Moneda + Tasa */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Moneda</label>
              <select
                value={backfillForm.moneda}
                onChange={e => handleBackfillMonedaChange(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold"
              >
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="MLC">MLC</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Tasa (CUP por unidad)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={backfillForm.tasa || ''}
                onChange={e => setBackfillForm(prev => ({ ...prev, tasa: parseFloat(e.target.value) || 0 }))}
                disabled={backfillForm.moneda === 'CUP'}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold tabular-nums disabled:opacity-50"
                placeholder="500"
              />
            </div>
          </div>

          {backfillForm.moneda !== 'CUP' && backfillForm.tasa > 0 && (
            <div className="p-3 rounded-xl bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Vista previa del impacto:</p>
              <p className="text-sm font-bold">
                Cada producto comprado a ${backfillForm.tasa} {backfillForm.moneda}/CUP
                {backfillForm.date_from && ` entre ${backfillForm.date_from}`}
                {backfillForm.date_to && ` y ${backfillForm.date_to}`}
                {" "}será actualizado.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
            <button
              type="button"
              onClick={() => setShowBackfillWizard(false)}
              disabled={backfillLoading}
              className="px-4 h-11 rounded-xl border border-border hover:bg-muted font-bold text-xs uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBackfillApply}
              disabled={backfillLoading || !backfillForm.tasa || backfillForm.tasa <= 0}
              className="px-4 h-11 rounded-xl bg-amber-500 text-white font-black text-xs uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
            >
              {backfillLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Aplicando...</>
              ) : (
                <><DollarSign className="w-4 h-4" /> Aplicar backfill</>
              )}
            </button>
          </div>
        </div>
      </BaseModal>

      {/* V2.2: Modal de Reversión Contable */}
      <ReverseDocumentModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        type="receipt"
        docId={reverseTarget?.id || ''}
        docLabel={reverseTarget?.label}
      />
    </>
  );
}
