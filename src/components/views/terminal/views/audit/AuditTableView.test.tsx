import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuditTableView from './AuditTableView';

describe('AuditTableView', () => {
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
    }
  ];

  it('should render the table with log data', () => {
    render(<AuditTableView logs={mockLogs} />);

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('INSERT')).toBeInTheDocument();
    expect(screen.getByText('products')).toBeInTheDocument();
  });
});
