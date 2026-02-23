'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails } from '@/hooks/api/useReceptions';
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

    // Actions
    handleInvert,
    handleDuplicate,
    handleExportCSV,
    isInverting: invertDocumentMutation.isPending
  };
}
