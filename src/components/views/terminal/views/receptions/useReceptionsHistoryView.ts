'use client';

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails } from '@/hooks/api/useReceptions';
import { type Receipt, type ReceiptItem } from '@/types';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useInvertDocument, useDuplicateDocument } from '@/hooks/api/useDocumentActions';

export function useReceptionsHistoryView() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  // Document Actions Hooks
  const invertDocumentMutation = useInvertDocument();
  const duplicateDocumentMutation = useDuplicateDocument();

  const { data: receptions = [], isLoading } = useReceptions(user?.storeId, user?.role === 'admin');
  const { data: receiptItems = [], isLoading: loadingDetails } = useReceptionDetails(selectedReceipt?.id);

  const filteredReceptions = useMemo(() => {
    return receptions.filter(r => {
      const matchesStatus = selectedStatus ? r.status === selectedStatus : true;

      const term = searchTerm.toLowerCase();
      const matchesSearch = searchTerm ? (
        r.id.toLowerCase().includes(term) ||
        (r.supplier && r.supplier.toLowerCase().includes(term)) ||
        (r.reference_doc && r.reference_doc.toLowerCase().includes(term))
      ) : true;

      const rDate = r.reception_date ? new Date(r.reception_date) : null;
      let matchesDate = true;
      if (rDate) {
        if (dateFrom) {
          matchesDate = matchesDate && rDate >= new Date(dateFrom);
        }
        if (dateTo) {
          matchesDate = matchesDate && rDate <= new Date(dateTo);
        }
      } else if (dateFrom || dateTo) {
        matchesDate = false;
      }

      return matchesStatus && matchesSearch && matchesDate;
    });
  }, [receptions, selectedStatus, searchTerm, dateFrom, dateTo]);

  const handleViewDetails = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
  };

  const handleCloseDetails = () => {
    setSelectedReceipt(null);
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
      // Nota: Al igual que en ventas, necesitamos los items.
      // Si no están cargados (porque no es la seleccionada), tendríamos un problema.
      // Pero usualmente el usuario abre los detalles primero.
      await invertDocumentMutation.mutateAsync({
        type: 'reception',
        id: receipt.id,
        items: receiptItems.length > 0 && selectedReceipt?.id === receipt.id ? receiptItems : [],
        storeId: user?.storeId || ''
      });
    } catch (error) {
      console.error('Error inverting reception:', error);
    }
  };

  const handleDuplicate = (receipt: Receipt) => {
    duplicateDocumentMutation.mutate({
      type: 'reception',
      items: receiptItems.length > 0 && selectedReceipt?.id === receipt.id ? receiptItems : []
    });
  };

  const handleExportCSV = (receipt: Receipt, items: ReceiptItem[]) => {
    if (!items || items.length === 0) {
      toast.error('No hay productos para exportar.');
      return;
    }

    const data = items.map(item => ({
      SKU: item.products?.sku || 'S/N',
      Producto: item.products?.name || 'Desconocido',
      Cantidad: item.quantity,
      'Costo Unitario': item.unit_cost,
      Subtotal: (item.quantity * item.unit_cost).toFixed(2)
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `recepcion_${receipt.reference_doc || receipt.id.split('-')[0]}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Reporte CSV generado con éxito');
  };

  return {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    selectedReceipt,
    receptions: filteredReceptions,
    isLoading,
    handleViewDetails,
    handleCloseDetails,
    handleInvert,
    handleDuplicate,
    isInverting: invertDocumentMutation.isPending,
    handleExportCSV,
    receiptItems,
    loadingDetails
  };
}
