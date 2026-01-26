
'use client'

import React from 'react';
import { useSalesHistoryView } from './useSalesHistoryView';
import SalesHistoryViewComponent from '@/components/views/terminal/SalesHistoryView';
import { TransactionDetailsModal } from './TransactionDetailsModal';

export default function SalesHistoryView() {
  const {
    searchTerm,
    setSearchTerm,
    selectedStatus,
    setSelectedStatus,
    transactions,
    isLoading,
    selectedTransaction,
    transactionItems,
    loadingDetails,
    isDetailsModalOpen,
    handleViewDetails,
    handleCloseDetails,
  } = useSalesHistoryView();

  // We can add a loading skeleton here later
  if (isLoading) {
    return <div>Cargando historial de ventas...</div>;
  }

  return (
    <>
      <SalesHistoryViewComponent
        transactions={transactions}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        onViewDetails={handleViewDetails}
      />

      <TransactionDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={handleCloseDetails}
        transaction={selectedTransaction}
        items={transactionItems}
        isLoading={loadingDetails}
      />
    </>
  );
}
