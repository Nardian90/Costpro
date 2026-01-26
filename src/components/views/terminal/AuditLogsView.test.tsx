import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuditLogsView from './AuditLogsView';

describe('AuditLogsView', () => {
  const mockProps = {
    logs: [
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
    ],
    searchTerm: '',
    onSearchChange: vi.fn(),
    dateRange: { from: '', to: '' },
    onDateRangeChange: vi.fn(),
  };

  it('should render the audit logs', () => {
    render(<AuditLogsView {...mockProps} />);
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Cashier 1')).toBeInTheDocument();
  });

  it('should filter logs by search term', () => {
    const props = { ...mockProps, searchTerm: 'Product' };
    render(<AuditLogsView {...props} />);
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.queryByText('Cashier 1')).not.toBeInTheDocument();
  });
});
