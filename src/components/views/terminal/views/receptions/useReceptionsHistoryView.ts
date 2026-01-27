'use client';

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useReceptions, useReceptionDetails } from '@/hooks/api/useReceptions';
import { type Receipt } from '@/types';

export function useReceptionsHistoryView() {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
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
      return matchesStatus && matchesSearch;
    });
  }, [receptions, selectedStatus, searchTerm]);

  const handleViewDetails = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
  };

  const handleCloseDetails = () => {
    setSelectedReceipt(null);
  };

  return {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    selectedReceipt,
    receptions: filteredReceptions,
    isLoading,
    handleViewDetails,
    handleCloseDetails,
    receiptItems,
    loadingDetails
  };
}
