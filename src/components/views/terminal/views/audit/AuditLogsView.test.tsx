import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditLogsView from './AuditLogsView';
import { useAuditLogs } from '@/hooks/api/useAuditLogs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/hooks/api/useAuditLogs');
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { role: 'admin' } })
}));
vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: [] })
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('AuditLogsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the audit logs', () => {
    (useAuditLogs as any).mockReturnValue({
      data: {
        pages: [{
          logs: [
            { id: '1', action: 'test_action', created_at: new Date().toISOString(), user_id: 'u1', metadata: {} }
          ],
          total: 1
        }]
      },
      isLoading: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuditLogsView />
      </QueryClientProvider>
    );

    expect(screen.getByText('Auditoría Global')).toBeInTheDocument();
  });
});
