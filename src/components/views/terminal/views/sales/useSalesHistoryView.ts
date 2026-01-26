
'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useTransactions, useTransactionDetails } from '@/hooks/useQueries';
import { Transaction } from '@/types';

export function useSalesHistoryView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

    // Data Fetching
    const { data: transactionsData = [], isLoading: isLoadingTransactions } = useTransactions(user?.storeId, user?.role === 'admin');

    const filteredTransactions = useMemo(() => {
        return transactionsData.filter(t =>
            t.id.includes(searchTerm) &&
            (!selectedStatus || t.status === selectedStatus)
        );
    }, [transactionsData, searchTerm, selectedStatus]);

    // Fetching details for the modal
    const { data: transactionItems = [], isLoading: loadingDetails } = useTransactionDetails(selectedTransactionId || undefined);

    const selectedTransaction = useMemo(() =>
        transactionsData.find(t => t.id === selectedTransactionId) || null,
        [transactionsData, selectedTransactionId]
    );

    const handleViewDetails = (txn: Transaction) => {
        setSelectedTransactionId(txn.id);
    };

    const handleCloseDetails = () => {
        setSelectedTransactionId(null);
    }

    return {
        // State
        searchTerm,
        setSearchTerm,
        selectedStatus,
        setSelectedStatus,

        // Data
        transactions: filteredTransactions,
        isLoading: isLoadingTransactions,

        // Modal State & Data
        selectedTransaction,
        transactionItems,
        loadingDetails,
        isDetailsModalOpen: !!selectedTransactionId,
        handleViewDetails,
        handleCloseDetails,
    };
}
