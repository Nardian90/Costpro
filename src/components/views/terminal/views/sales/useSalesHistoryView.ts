'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useTransactionDetails } from '@/hooks/api/useTransactions';
import { useTransactions } from '@/hooks/api/useTransactions';
import { Transaction } from '@/types';
import { useInvertDocument, useDuplicateDocument } from '@/hooks/api/useDocumentActions';
import { toast } from 'sonner';

export function useSalesHistoryView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);

    // Document Actions Hooks
    const invertDocumentMutation = useInvertDocument();
    const duplicateDocumentMutation = useDuplicateDocument();

    // Data Fetching
    const { data: transactionsData = [], isLoading: isLoadingTransactions } = useTransactions(user?.storeId, user?.role === 'admin');

    const filteredTransactions = useMemo(() => {
        return transactionsData.filter(t =>
            (t.id.toLowerCase().includes(searchTerm.toLowerCase())) &&
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

    const handleInvert = async (txn: Transaction) => {
        if (txn.status === 'voided') {
            toast.error('Esta venta ya ha sido anulada.');
            return;
        }

        if (!confirm(`¿Estás seguro de que deseas invertir la venta ${txn.id.split('-')[0]}? Esto anulará el documento y devolverá los productos al inventario.`)) {
            return;
        }

        try {
            await invertDocumentMutation.mutateAsync({
                type: 'sale',
                id: txn.id,
                items: transactionItems.length > 0 && selectedTransactionId === txn.id ? transactionItems : undefined,
                storeId: user?.activeStoreId || user?.storeId || ''
            });
        } catch (error) {
            console.error('Error inverting sale:', error);
        }
    };

    const handleDuplicate = (txn: Transaction) => {
        duplicateDocumentMutation.mutate({
            type: 'sale',
            id: txn.id,
            items: transactionItems.length > 0 && selectedTransactionId === txn.id ? transactionItems : undefined
        });
    };

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

        // Actions
        handleInvert,
        handleDuplicate,
        isInverting: invertDocumentMutation.isPending,

        // Selection Actions
        toggleSelection,
        toggleAll,
        selectedTransactions
    };
}
