'use client';

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails } from '@/hooks/api/useReceptions';
import { type Receipt, type ReceiptItem } from '@/types';
import Papa from 'papaparse';
import { toast } from 'sonner';

export function useReceptionsHistoryView() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

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
    handleExportCSV,
    receiptItems,
    loadingDetails
  };
}
