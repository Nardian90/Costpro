import { useMemo } from 'react';
import { useAuditLogs } from '@/hooks/api/useAuditLogs';

export function useAuditLogsView(filters: any = {}) {
    const { store_id, search_term, date_from, date_to } = filters;

    const {
        data,
        isLoading: isLoadingLogs,
        error: logsError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useAuditLogs({
        storeIds: store_id ? [store_id] : [],
        action: undefined, // Could be added if needed
        dateFrom: date_from,
        dateTo: date_to
    });

    const auditLogsData = useMemo(() => data?.pages.flatMap(p => p.logs) ?? [], [data]);

    return {
        logs: auditLogsData,
        isLoading: isLoadingLogs,
        error: logsError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    };
}
