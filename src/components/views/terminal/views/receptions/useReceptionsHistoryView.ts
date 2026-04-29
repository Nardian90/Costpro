'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails, useUpdateReception, useVoidReception } from '@/hooks/api/useReceptions';
import { Receipt, ReceiptItem } from '@/types';
import { useInvertDocument, useDuplicateDocument } from '@/hooks/api/useDocumentActions';
import { toast } from 'sonner';

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

  const updateReceptionMutation = useUpdateReception();
  const voidReceptionMutation = useVoidReception();

  // Document Actions Hooks
  const invertDocumentMutation = useInvertDocument();
  const duplicateDocumentMutation = useDuplicateDocument();

  // Data Fetching
  const { data: receptions = [], isLoading } = useReceptions(user?.activeStoreId || user?.storeId);

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
    if (!user?.activeStoreId && !user?.storeId) return;
    try {
      await voidReceptionMutation.mutateAsync({
        receiptId: receipt.id,
        storeId: user?.activeStoreId || user?.storeId || '',
        reason: 'Anulada por encargado'
      });
      setSelectedReceiptId(null);
      toast.success('Recepción anulada correctamente');
    } catch (error) {
      console.error('Error voiding reception:', error);
      toast.error('Error al anular la recepción');
    }
  };

  const handleUpdateSubmit = async (receiptId: string, updates: {
    supplier?: string;
    referenceDoc?: string;
    notes?: string;
  }) => {
    try {
      await updateReceptionMutation.mutateAsync({ receiptId, ...updates });
      setEditingReceiptId(null);
      toast.success('Recepción actualizada');
    } catch (error) {
      console.error('Error updating reception:', error);
      toast.error('Error al actualizar la recepción');
    }
  };

  const handleInvert = async (receipt: Receipt) => {
    if (receipt.status === 'voided') {
      toast.error('Esta recepción ya ha sido anulada.');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas invertir la recepción ${receipt.id.split('-')[0]}? Esto anulará el documento y restará los productos del inventario.`)) {
      return;
    }

    try {
      await invertDocumentMutation.mutateAsync({
        type: 'reception',
        id: receipt.id,
        items: items.length > 0 && selectedReceiptId === receipt.id ? items : undefined,
        storeId: user?.activeStoreId || user?.storeId || ''
      });
    } catch (error) {
      console.error('Error inverting reception:', error);
    }
  };

  const handleDuplicate = (receipt: Receipt) => {
    duplicateDocumentMutation.mutate({
      type: 'reception',
      id: receipt.id,
      items: items.length > 0 && selectedReceiptId === receipt.id ? items : undefined
    });
  };

  const handleExportCSV = (receipt: Receipt, items: ReceiptItem[]) => {
    // Implementación básica de exportación CSV
    const headers = ['Producto', 'SKU', 'Cantidad', 'Costo Unitario', 'Subtotal'];
    const rows = items.map(item => [
      item.products?.name || '',
      item.products?.sku || '',
      item.quantity,
      item.unit_cost,
      item.quantity * item.unit_cost
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `recepcion_${receipt.id.split('-')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

    // Actions
    handleInvert,
    handleDuplicate,
    handleExportCSV,
    isInverting: invertDocumentMutation.isPending
  };
}
