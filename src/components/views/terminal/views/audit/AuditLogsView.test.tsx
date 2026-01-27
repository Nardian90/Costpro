import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuditLogsView from './AuditLogsView';
import { useAuditLogsView } from './useAuditLogsView';

// Mock the hook
vi.mock('./useAuditLogsView', () => ({
  useAuditLogsView: vi.fn()
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(() => ({ data: [], isLoading: false }))
}));

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(() => ({ user: { id: '1', role: 'admin' } }))
}));

describe('AuditLogsView', () => {
  const mockLogs = [
    {
      id: '1',
      created_at: '2024-01-01T10:00:00Z',
      table_name: 'products',
      action: 'INSERT',
      profile: { full_name: 'Admin User', role: 'admin' },
      new_data: { name: 'New Product' },
      old_data: {},
      metadata: { store_name: 'Main Store' },
      record_id: 'p1',
      user_id: 'u1',
    },
    {
      id: '2',
      created_at: '2024-01-02T11:00:00Z',
      table_name: 'transactions',
      action: 'VOID',
      profile: { full_name: 'Cashier 1', role: 'clerk' },
      new_data: { status: 'voided' },
      old_data: { status: 'completed' },
      metadata: { store_name: 'Second Store' },
      record_id: 't1',
      user_id: 'u2',
    },
  ];

  it('should render the audit logs', () => {
    (useAuditLogsView as any).mockReturnValue({
      logs: mockLogs,
      searchTerm: '',
      setSearchTerm: vi.fn(),
      dateRange: { from: '', to: '' },
      setDateRange: vi.fn(),
      isLoading: false
    });

    render(<AuditLogsView />);
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Cashier 1')).toBeInTheDocument();
  });

  it('should reflect filtered logs from the hook', () => {
    // The hook is now responsible for filtering by searchTerm via backend RPC
    (useAuditLogsView as any).mockReturnValue({
      logs: [mockLogs[0]], // Only return the matching log
      searchTerm: 'Product',
      setSearchTerm: vi.fn(),
      dateRange: { from: '', to: '' },
      setDateRange: vi.fn(),
      isLoading: false
    });

    render(<AuditLogsView />);
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.queryByText('Cashier 1')).not.toBeInTheDocument();
  });
});
