'use client'

import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useTransactionDetails } from '@/hooks/api/useTransactions';
import { useTransactions } from '@/hooks/api/useTransactions';
import { Transaction, ROLE_PERMISSIONS, TransactionItem } from '@/types';
import { useInvertDocument, useDuplicateDocument } from '@/hooks/api/useDocumentActions';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils';

// ── CSV Export Utility ──
function formatPaymentMethod(method: string | null | undefined): string {
    switch ((method || '').toLowerCase()) {
        case 'cash': return 'Efectivo';
        case 'card': return 'Tarjeta';
        case 'transfer': return 'Transferencia';
        case 'mixed': return 'Mixto';
        case 'wallet': return 'Billetera';
        case 'other': return 'Otro';
        default: return 'Sin especificar';
    }
}

function generateCSV(transactions: Transaction[]): string {
    const headers = ['Ref', 'Fecha', 'Hora', 'Metodo', 'Total', 'Subtotal', 'Descuento', 'Impuestos', 'Estado'];
    const rows = transactions.map(t => [
        t.id.split('-')[0],
        formatDate(t.created_at),
        new Date(t.created_at).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' }),
        formatPaymentMethod(t.payment_method),
        (t.total_amount || 0).toFixed(2),
        (t.subtotal || 0).toFixed(2),
        (t.discount_value || 0).toFixed(2),
        (t.tax_amount || 0).toFixed(2),
        t.status === 'completed' ? 'Completada' : t.status === 'pending' ? 'Pendiente' : 'Anulada'
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    return csvContent;
}

function downloadCSV(content: string, filename: string) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ── Date helpers ──
function toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function useSalesHistoryView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);

    // Confirmation modal state for void
    const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);

    // Document Actions Hooks
    const invertDocumentMutation = useInvertDocument();
    const duplicateDocumentMutation = useDuplicateDocument();

    // Permission check — merge all user roles to determine void capability
    const canVoid = (() => {
        if (!user?.roles) return false;
        return user.roles.some(r => ROLE_PERMISSIONS[r]?.canVoidTransactions === true);
    })();

    // Data Fetching
    const { data: transactionsData = [], isLoading: isLoadingTransactions } = useTransactions(user?.activeStoreId, user?.role === 'admin');

    const filteredTransactions = useMemo(() => {
        return transactionsData.filter(t => {
            // Status filter
            if (selectedStatus && t.status !== selectedStatus) return false;

            // Date range filter
            if (dateFrom) {
                const txnDate = toLocalDateString(new Date(t.created_at));
                if (txnDate < dateFrom) return false;
            }
            if (dateTo) {
                const txnDate = toLocalDateString(new Date(t.created_at));
                if (txnDate > dateTo) return false;
            }

            // Search filter
            if (!searchTerm) return true;
            const lower = searchTerm.toLowerCase();
            return (
                t.id.toLowerCase().includes(lower) ||
                t.total_amount.toString().includes(lower) ||
                (t.payment_method || '').toLowerCase().includes(lower)
            );
        });
    }, [transactionsData, searchTerm, selectedStatus, dateFrom, dateTo]);

    // Pagination — show batches of 50
    const PAGE_SIZE = 50;
    const [page, setPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));

    // Reset page when filters change
    const effectivePage = useMemo(() => {
        if (page > totalPages) return totalPages;
        return page;
    }, [page, totalPages]);

    const paginatedTransactions = useMemo(() => {
        const start = (effectivePage - 1) * PAGE_SIZE;
        return filteredTransactions.slice(start, start + PAGE_SIZE);
    }, [filteredTransactions, effectivePage]);

    // Fetching details for the modal
    const { data: transactionItems = [], isLoading: loadingDetails } = useTransactionDetails(selectedTransactionId || undefined);

    const selectedTransaction = useMemo(() =>
        transactionsData.find(t => t.id === selectedTransactionId) || null,
        [transactionsData, selectedTransactionId]
    );

    const handleViewDetails = useCallback((txn: Transaction) => {
        setSelectedTransactionId(txn.id);
    }, []);

    const handleCloseDetails = useCallback(() => {
        setSelectedTransactionId(null);
    }, []);

    // ── Void confirmation flow ──
    const handleRequestVoid = useCallback((txn: Transaction) => {
        if (txn.status === 'voided') {
            toast.error('Esta venta ya ha sido anulada.');
            return;
        }
        setSelectedTransactionId(txn.id);
        setVoidTarget(txn);
    }, []);

    const handleConfirmVoid = async () => {
        if (!voidTarget) return;
        const txn = voidTarget;
        setVoidTarget(null);

        if (!user?.activeStoreId) {
            toast.error('No hay tienda activa');
            return;
        }

        try {
            await invertDocumentMutation.mutateAsync({
                type: 'sale',
                id: txn.id,
                items: transactionItems.length > 0 && selectedTransactionId === txn.id ? transactionItems : undefined,
                storeId: user.activeStoreId
            });
            setSelectedTransactionId(null);
        } catch (error: unknown) {
            const msg = (error instanceof Error ? error.message : String(error)) || 'Error al anular la venta';
            toast.error(msg);
        }
    };

    const handleCancelVoid = useCallback(() => {
        setVoidTarget(null);
    }, []);

    // ── Duplicate ──
    const handleDuplicate = useCallback((txn: Transaction) => {
        setSelectedTransactionId(txn.id);
        setTimeout(() => {
            duplicateDocumentMutation.mutate({
                type: 'sale',
                id: txn.id,
                items: transactionItems.length > 0 && selectedTransactionId === txn.id ? transactionItems : undefined
            });
        }, 400);
    }, [duplicateDocumentMutation, selectedTransactionId, transactionItems]);

    // ── CSV Export ──
    const handleExportCSV = useCallback(() => {
        if (filteredTransactions.length === 0) {
            toast.info('No hay ventas para exportar con los filtros actuales.');
            return;
        }
        try {
            const csv = generateCSV(filteredTransactions);
            const dateStr = new Date().toISOString().split('T')[0];
            downloadCSV(csv, `ventas_${dateStr}.csv`);
            toast.success(`${filteredTransactions.length} ventas exportadas a CSV.`);
        } catch {
            toast.error('Error al generar el archivo CSV.');
        }
    }, [filteredTransactions]);

    // ── Selection ──
    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback((ids: string[]) => {
        setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids));
    }, []);

    const selectedTransactions = useMemo(() => {
        return transactionsData.filter(t => selectedIds.has(t.id));
    }, [transactionsData, selectedIds]);

    // Summary stats (based on ALL transactions, not just filtered)
    const stats = useMemo(() => {
        const all = transactionsData;
        const completed = all.filter(t => t.status === 'completed');
        const totalSales = completed.reduce((sum, t) => sum + (t.total_amount || 0), 0);
        return {
            total: all.length,
            completed: completed.length,
            voided: all.filter(t => t.status === 'voided').length,
            totalSales
        };
    }, [transactionsData]);

    // Clear filters
    const handleClearFilters = useCallback(() => {
        setSearchTerm('');
        setSelectedStatus('');
        setDateFrom('');
        setDateTo('');
        setPage(1);
    }, []);

    const hasActiveFilters = !!(searchTerm || selectedStatus || dateFrom || dateTo);

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
        hasActiveFilters,
        handleClearFilters,
        selectedIds,
        isTaxModalOpen,
        setIsTaxModalOpen,

        // Data
        transactions: paginatedTransactions,
        totalFilteredCount: filteredTransactions.length,
        isLoading: isLoadingTransactions,
        stats,

        // Pagination
        page: effectivePage,
        setPage,
        totalPages,

        // Modal State & Data
        selectedTransaction,
        transactionItems,
        loadingDetails,
        isDetailsModalOpen: !!selectedTransactionId,
        handleViewDetails,
        handleCloseDetails,

        // Void actions
        voidTarget,
        handleRequestVoid,
        handleConfirmVoid,
        handleCancelVoid,
        canVoid,

        // Other Actions
        handleDuplicate,
        handleExportCSV,
        isInverting: invertDocumentMutation.isPending,

        // Selection Actions
        toggleSelection,
        toggleAll,
        selectedTransactions
    };
}
