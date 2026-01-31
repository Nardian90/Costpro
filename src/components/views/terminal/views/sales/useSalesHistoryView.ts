
'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useTransactionDetails } from '@/hooks/api/useTransactions';
import { useTransactions } from '@/hooks/api/useTransactions';
import { Transaction } from '@/types';

export function useSalesHistoryView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);

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

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAll = (ids: string[]) => {
        setSelectedIds(prev => {
            if (prev.size === ids.length) {
                return new Set();
            } else {
                return new Set(ids);
            }
        });
    };

    const selectedTransactions = useMemo(() => {
        return transactionsData.filter(t => selectedIds.has(t.id));
    }, [transactionsData, selectedIds]);

    return {
        // State
        searchTerm,
        setSearchTerm,
        selectedStatus,
        setSelectedStatus,
        selectedIds,
        isTaxModalOpen,
        setIsTaxModalOpen,

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

        // Selection Actions
        toggleSelection,
        toggleAll,
        selectedTransactions
    };
}
