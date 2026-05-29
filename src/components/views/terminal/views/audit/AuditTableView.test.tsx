import { render, screen } from '@testing-library/react';
import AuditTableView from './AuditTableView';
import { vi, describe, it, expect } from 'vitest';

// Mock useVirtualizer to work in jsdom (no actual scrolling)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: any) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 64,
        size: 64,
      })),
    getTotalSize: () => options.count * 64,
    measureElement: vi.fn(),
  }),
}));

describe('AuditTableView', () => {
  const mockLogs = [
    {
      id: 'log-1',
      created_at: '2023-10-27T10:00:00Z',
      action: 'sale_confirmed',
      table_name: 'sales',
      user_id: 'user-1',
      record_id: 'record-1',
      store_id: 'store-1',
      profile: { full_name: 'Juan Pérez', role: 'admin' },
      metadata: { total: 100 }
    }
  ];

  it('should render the table with log data', () => {
    render(<AuditTableView logs={mockLogs} />);
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });
});
