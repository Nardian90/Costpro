
'use client'

import { useState, useMemo } from 'react';
import { useAuditLogs } from '@/hooks/useQueries';

export function useAuditLogsView() {
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });

    // Data Fetching
    const { data: auditLogsData = [], isLoading: isLoadingLogs } = useAuditLogs();

    const filteredLogs = useMemo(() => {
        // Filtering logic can be more sophisticated, including date range
        return auditLogsData.filter(log =>
            (log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.table_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.profile?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [auditLogsData, searchTerm, dateRange]);

    return {
        // State
        searchTerm,
        setSearchTerm,
        dateRange,
        setDateRange,

        // Data
        logs: filteredLogs,
        isLoading: isLoadingLogs,
    };
}
