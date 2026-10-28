'use client'

import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails, useUpdateReception, useVoidReception, useConfirmPendingReception, useDeletePendingReception } from '@/hooks/api/useReceptions';
import { Receipt, ReceiptItem } from '@/types';
import { useInvertDocument } from '@/hooks/api/useDocumentActions';
import { useDuplicateDocumentV2 } from '@/hooks/api/useDuplicateDocumentV2';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabaseClient';

export function useReceptionsHistoryView() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  // FM-06 additions
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [voidConfirmInput, setVoidConfirmInput] = useState('');
  // Reception-Flow-Fix: state para confirmar recepción pendiente.
  const [confirmingReceiptId, setConfirmingReceiptId] = useState<string | null>(null);

  const updateReceptionMutation = useUpdateReception();
  const voidReceptionMutation = useVoidReception();
  // Reception-Flow-Fix: hook para confirmar recepción pendiente.
  const confirmPendingMutation = useConfirmPendingReception();
  // MISIÓN RECEPCIONES (2026-10-27) — Defecto D-C: hook para ELIMINAR
  // borradores de recepción (status='pending') de forma definitiva.
  const deletePendingMutation = useDeletePendingReception();
  // MISIÓN RECEPCIONES: recepción pendiente cuya eliminación se confirma.
  const [deletingReceipt, setDeletingReceipt] = useState<Receipt | null>(null);

  // Document Actions Hooks
  const invertDocumentMutation = useInvertDocument();
  const duplicateDocumentMutation = useDuplicateDocumentV2();

  // Data Fetching
  // F3-B1: exponer error + refetch — antes los errores de red se tragaban (error={null} en la vista).
  const { data: receptions = [], isLoading, error: receptionsError, refetch: refetchReceptions } = useReceptions(user?.activeStoreId);

  const filteredReceipts = useMemo(() => {
    return receptions.filter((r: any) => {
      const matchesSearch = (r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             r.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             r.reference_doc?.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = !selectedStatus || r.status === selectedStatus;

      let matchesDate = true;
      if (dateFrom || dateTo) {
        const date = new Date(r.reception_date || r.created_at || '');
        if (dateFrom && date < new Date(dateFrom)) matchesDate = false;
        if (dateTo && date > new Date(dateTo)) matchesDate = false;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [receptions, searchTerm, selectedStatus, dateFrom, dateTo]);

  // Fetching items for the modal or action
  const { data: items = [], isLoading: loadingDetails } = useReceptionDetails(selectedReceiptId || undefined);

  // MISIÓN RECEPCIONES (2026-10-28) — Vista por productos:
  // override para abrir desde la pestaña Productos el documento de origen
  // aunque no esté en la lista paginada de Documentos (tope 200). La fila
  // se lee con el mismo cliente Supabase (RLS activa) — solo lectura.
  const [overrideReceipt, setOverrideReceipt] = useState<Receipt | null>(null);

  const selectedReceipt = useMemo(() => {
    if (overrideReceipt && selectedReceiptId === overrideReceipt.id) return overrideReceipt;
    return receptions.find((r: any) => r.id === selectedReceiptId) || null;
  }, [receptions, selectedReceiptId, overrideReceipt]);

  const handleViewDetails = (receipt: Receipt) => {
    setOverrideReceipt(null);
    setSelectedReceiptId(receipt.id);
  };

  // MISIÓN RECEPCIONES (2026-10-28): abrir el documento de origen desde una
  // línea de la pestaña Productos. Si el documento ya está en la lista
  // cargada se reutiliza; si no (documentos antiguos fuera del tope), se
  // lee su cabecera por ID — siempre bajo RLS y sin modificar nada.
  const handleViewDetailsById = useCallback(async (receiptId: string) => {
    const inList = receptions.find((r: any) => r.id === receiptId);
    if (inList) {
      setOverrideReceipt(null);
      setSelectedReceiptId(receiptId);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', receiptId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error('No se encontró el documento de origen (¿fue eliminado?).');
        return;
      }
      setOverrideReceipt(data as Receipt);
      setSelectedReceiptId(receiptId);
    } catch (error) {
      logger.error('DATABASE', 'RECEPTION_OPEN_FROM_LINE_FAILED', { error, receiptId });
      toast.error('No se pudo abrir el documento de origen');
    }
  }, [receptions]);

  const handleCloseDetails = () => {
    setSelectedReceiptId(null);
    setEditingReceiptId(null);
    setOverrideReceipt(null);
  };

  const handleEdit = (receipt: Receipt) => {
    setEditingReceiptId(receipt.id);
    setSelectedReceiptId(receipt.id); // abre el modal existente en modo edición
  };

  const handleVoidRequest = (receipt: Receipt) => {
    setSelectedReceiptId(receipt.id); // abre modal en modo anulación
    setEditingReceiptId(null);
    setVoidConfirmInput('');
  };

  const handleVoidConfirm = async (receipt: Receipt) => {
    if (!user?.activeStoreId) { toast.error('No hay tienda activa'); return; }
    try {
      await voidReceptionMutation.mutateAsync({
        receiptId: receipt.id,
        storeId: user?.activeStoreId || '',
        reason: 'Anulada por encargado'
        // operationDate se omite intencionalmente: las anulaciones usan NOW()
        // (que siempre pasa la validación forward-only).
      });
      setSelectedReceiptId(null);
      toast.success('Recepción anulada correctamente');
    } catch (error) {
      logger.error('DATABASE', 'RECEPTION_VOID_FAILED', { error });
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
        toast.error('No se puede retroceder en el tiempo operativo. Revisa la "Fecha de Operación" en el dashboard MULTI-TIENDA.', { duration: 8000 });
      } else {
        toast.error('Error al anular la recepción: ' + msg);
      }
    }
  };

  // Reception-Flow-Fix: confirmar una recepción pendiente.
  // Aplica los cambios de stock y marca la recepción como 'active' (no editable).
  const handleConfirmPendingRequest = (receipt: Receipt) => {
    setConfirmingReceiptId(receipt.id);
    setSelectedReceiptId(receipt.id); // abre el modal de detalles
  };

  const handleConfirmPendingExecute = async (receipt: Receipt) => {
    if (!user?.activeStoreId || !user?.id) {
      toast.error('No hay tienda activa o sesión válida');
      return;
    }
    try {
      await confirmPendingMutation.mutateAsync({
        receiptId: receipt.id,
        storeId: user.activeStoreId,
        userId: user.id,
      });
      setSelectedReceiptId(null);
      setConfirmingReceiptId(null);
      toast.success('Recepción confirmada correctamente. El inventario ha sido actualizado.');
    } catch (error: any) {
      logger.error('DATABASE', 'RECEPTION_CONFIRM_FAILED', { error });
      toast.error(error?.message || 'Error al confirmar la recepción pendiente');
    }
  };

  const handleConfirmPendingCancel = () => {
    setConfirmingReceiptId(null);
  };

  // MISIÓN RECEPCIONES (2026-10-27) — Eliminar borrador de recepción (pending).
  // Diferencia con Anular: Anular conserva el registro como 'voided' para
  // auditoría; Eliminar lo borra DEFINITIVAMENTE (solo permitido sobre
  // borradores sin efectos de inventario) para descartar intentos fallidos.
  const handleDeleteDraftRequest = (receipt: Receipt) => {
    if (receipt.status !== 'pending') {
      toast.error('Solo se pueden eliminar recepciones en estado Pendiente (borrador).');
      return;
    }
    setDeletingReceipt(receipt);
  };

  const handleDeleteDraftConfirm = async () => {
    if (!deletingReceipt) return;
    try {
      await deletePendingMutation.mutateAsync({ receiptId: deletingReceipt.id });
      toast.success('Borrador de recepción eliminado correctamente');
      setDeletingReceipt(null);
      // Si el modal de detalles estaba abierto sobre esa recepción, cerrarlo
      if (selectedReceiptId === deletingReceipt.id) setSelectedReceiptId(null);
    } catch (error: any) {
      logger.error('DATABASE', 'RECEPTION_DELETE_DRAFT_FAILED', { error });
      toast.error(error?.message || 'Error al eliminar el borrador de recepción', { duration: 8000 });
    }
  };

  const handleDeleteDraftCancel = () => setDeletingReceipt(null);

  const handleUpdateSubmit = async (receiptId: string, updates: {
    supplier?: string;
    referenceDoc?: string;
    notes?: string;
    itemUpdates?: Array<{ id: string; quantity: number; unit_cost: number; deleted: boolean }>;
  }) => {
    try {
      // FIX R-1+R-2: Una sola llamada API route que hace header + items atómicamente en una transacción.
      // Antes: 2 llamadas separadas (mutation header + RPC items) → estado parcial si la 2ª fallaba.
      // Ahora: la API route /api/inventory/receptions/[id] PATCH actualiza header + items en una transacción.
      const { apiFetch } = await import('@/lib/api-fetch');
      await apiFetch(`/api/inventory/receptions/${receiptId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      setEditingReceiptId(null);
      toast.success('Recepción actualizada');
    } catch (error) {
      logger.error('DATABASE', 'RECEPTION_UPDATE_FAILED', { error });
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la recepción');
    }
  };

  // R2: state para modal de inversión estilado (reemplaza confirm() nativo)
  const [invertConfirmReceipt, setInvertConfirmReceipt] = useState<Receipt | null>(null);

  const handleInvert = (receipt: Receipt) => {
    if (receipt.status === 'voided') {
      toast.error('Esta recepción ya ha sido anulada.');
      return;
    }
    // Abrir modal estilado en vez de confirm() nativo
    setInvertConfirmReceipt(receipt);
  };

  const handleInvertConfirm = async () => {
    if (!invertConfirmReceipt) return;
    if (!user?.activeStoreId) { toast.error('No hay tienda activa'); return; }

    try {
      await invertDocumentMutation.mutateAsync({
        type: 'reception',
        id: invertConfirmReceipt.id,
        storeId: user?.activeStoreId || ''
      });
      setInvertConfirmReceipt(null);
    } catch (error) {
      logger.error('DATABASE', 'RECEPTION_INVERT_FAILED', { error });
      setInvertConfirmReceipt(null);
    }
  };

  // V2.4.4: usa useDuplicateDocumentV2 (carga items en carrito sin pre-fetch)
  const handleDuplicate = (receipt: Receipt) => {
    duplicateDocumentMutation.mutate({
      type: 'reception',
      id: receipt.id,
      storeId: user?.activeStoreId,
    });
  };

  // Export single reception to Excel
  const handleExportCSV = async (receipt: Receipt, items: ReceiptItem[]) => {
    if (items.length === 0) {
      toast.error('No hay items para exportar');
      return;
    }
    try {
      const toastId = toast.loading('Preparando Excel...');
      const XLSX = await import('@e965/xlsx');
      const data = items.map(item => ({
        'Producto': item.products?.name || '',
        'SKU': item.products?.sku || '',
        'Cantidad': item.quantity,
        'Costo Unitario': Number(item.unit_cost.toFixed(2)),
        'Subtotal': Number((item.quantity * item.unit_cost).toFixed(2)),
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');

      // Add receipt metadata sheet
      const meta = [
        { 'Campo': 'ID', 'Valor': receipt.id.split('-')[0] },
        { 'Campo': 'Fecha', 'Valor': receipt.reception_date || receipt.created_at ? new Date(receipt.reception_date || receipt.created_at || '').toLocaleDateString('es-CU') : '' },
        { 'Campo': 'Proveedor', 'Valor': receipt.supplier || 'N/A' },
        { 'Campo': 'Factura', 'Valor': receipt.reference_doc || 'N/A' },
        { 'Campo': 'Estado', 'Valor': receipt.status === 'active' ? 'Confirmada' : receipt.status === 'voided' ? 'Anulada' : receipt.status === 'pending' ? 'Pendiente' : 'Parcial' },
        { 'Campo': 'Total Costo', 'Valor': Number(receipt.total_cost.toFixed(2)) },
      ];
      const metaSheet = XLSX.utils.json_to_sheet(meta);
      metaSheet['!cols'] = [{ wch: 20 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(workbook, metaSheet, 'Info');

      XLSX.writeFile(workbook, `recepcion_${receipt.id.split('-')[0]}.xlsx`);
      toast.success('Recepción exportada a Excel', { id: toastId });
    } catch (error) {
      logger.error('SYSTEM', 'EXCEL_EXPORT_FAILED', { error });
      toast.error('Error al exportar a Excel');
    }
  };

  // Export full receptions list to Excel
  const handleExportAllExcel = useCallback(async () => {
    if (receptions.length === 0) {
      toast.error('No hay recepciones para exportar');
      return;
    }
    try {
      const toastId = toast.loading('Preparando Excel de recepciones...');
      const XLSX = await import('@e965/xlsx');
      const data = receptions.map((r: any) => ({
        'ID': r.id.split('-')[0],
        'Fecha': r.reception_date || r.created_at ? new Date(r.reception_date || r.created_at || '').toLocaleDateString('es-CU') : '',
        'Proveedor': r.supplier || '',
        'Factura': r.reference_doc || '',
        'Estado': r.status === 'active' ? 'Confirmada' : r.status === 'voided' ? 'Anulada' : r.status === 'pending' ? 'Pendiente' : 'Parcial',
        'Total Costo': Number(r.total_cost.toFixed(2)),
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 25 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Recepciones');
      XLSX.writeFile(workbook, `recepciones-${Date.now()}.xlsx`);
      toast.success('Recepciones exportadas a Excel', { id: toastId });
    } catch (error) {
      logger.error('SYSTEM', 'EXCEL_EXPORT_FAILED', { error });
      toast.error('Error al exportar a Excel');
    }
  }, [receptions]);

  return {
    // State
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,

    // F3-B3: distinción empty real vs empty filtrado + limpieza de filtros
    hasActiveFilters: !!(searchTerm || selectedStatus || dateFrom || dateTo),
    handleClearFilters: () => {
      setSearchTerm('');
      setSelectedStatus('');
      setDateFrom('');
      setDateTo('');
    },

    // Data
    receptions: filteredReceipts,
    isLoading,
    receptionsError: receptionsError ?? null,
    refetchReceptions,

    // Modal State & Data
    selectedReceipt,
    receiptItems: items,
    loadingDetails,
    isDetailsModalOpen: !!selectedReceiptId,
    handleViewDetails,
    handleViewDetailsById,
    handleCloseDetails,

    // FM-06
    editingReceiptId,
    isEditMode: !!editingReceiptId,
    voidConfirmInput,
    setVoidConfirmInput,
    handleEdit,
    handleVoidRequest,
    handleVoidConfirm,
    handleUpdateSubmit,
    isUpdating: updateReceptionMutation.isPending,
    isVoiding: voidReceptionMutation.isPending,

    // Reception-Flow-Fix: confirmar pendiente
    confirmingReceiptId,
    isConfirmingPending: confirmPendingMutation.isPending,
    handleConfirmPendingRequest,
    handleConfirmPendingExecute,
    handleConfirmPendingCancel,

    // MISIÓN RECEPCIONES: eliminar borrador (pending)
    deletingReceipt,
    isDeletingDraft: deletePendingMutation.isPending,
    handleDeleteDraftRequest,
    handleDeleteDraftConfirm,
    handleDeleteDraftCancel,

    // Actions
    handleInvert,
    handleDuplicate,
    handleExportCSV,
    handleExportAllExcel,
    isInverting: invertDocumentMutation.isPending,

    // R2: modal de inversión estilado
    invertConfirmReceipt,
    handleInvertConfirm,
    setInvertConfirmReceipt
  };
}
