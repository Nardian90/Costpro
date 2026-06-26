'use client'

import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails, useUpdateReception, useVoidReception, useConfirmPendingReception } from '@/hooks/api/useReceptions';
import { Receipt, ReceiptItem } from '@/types';
import { useInvertDocument, useDuplicateDocument } from '@/hooks/api/useDocumentActions';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

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

  // Document Actions Hooks
  const invertDocumentMutation = useInvertDocument();
  const duplicateDocumentMutation = useDuplicateDocument();

  // Data Fetching
  const { data: receptions = [], isLoading } = useReceptions(user?.activeStoreId);

  const filteredReceipts = useMemo(() => {
    return receptions.filter(r => {
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

  const selectedReceipt = useMemo(() =>
    receptions.find(r => r.id === selectedReceiptId) || null,
    [receptions, selectedReceiptId]
  );

  const handleViewDetails = (receipt: Receipt) => {
    setSelectedReceiptId(receipt.id);
  };

  const handleCloseDetails = () => {
    setSelectedReceiptId(null);
    setEditingReceiptId(null);
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

  const handleDuplicate = (receipt: Receipt) => {
    duplicateDocumentMutation.mutate({
      type: 'reception',
      id: receipt.id,
      items: items.length > 0 && selectedReceiptId === receipt.id ? items : undefined
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
      const data = receptions.map(r => ({
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

    // Data
    receptions: filteredReceipts,
    isLoading,

    // Modal State & Data
    selectedReceipt,
    receiptItems: items,
    loadingDetails,
    isDetailsModalOpen: !!selectedReceiptId,
    handleViewDetails,
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
