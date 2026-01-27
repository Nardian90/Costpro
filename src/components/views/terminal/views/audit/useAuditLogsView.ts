'use client'

import { useState } from 'react';
import { useAuditLogs } from '@/hooks/api/useAuditLogs';
import { useDebounce } from '@/hooks/ui/useDebounce';

export function useAuditLogsView() {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [selectedStoreId, setSelectedStoreId] = useState('all');

    const debouncedSearch = useDebounce(searchTerm, 500);

    // Data Fetching with backend filtering
    const { data: auditLogsData = [], isLoading: isLoadingLogs, error: logsError } = useAuditLogs({
        search_term: debouncedSearch,
        date_from: dateRange.from || undefined,
        date_to: dateRange.to ? `${dateRange.to}T23:59:59` : undefined,
        store_id: selectedStoreId === 'all' ? undefined : selectedStoreId
    });

    return {
        // State
        searchTerm,
        setSearchTerm,
        dateRange,
        setDateRange,
        selectedStoreId,
        setSelectedStoreId,

        // Data
        logs: auditLogsData,
        isLoading: isLoadingLogs,
        error: logsError
    };
}
