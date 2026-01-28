import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditEventMeta from './AuditEventMeta';
import React from 'react';

// Mock formatCurrency to avoid issues with Intl
vi.mock('@/lib/utils', () => ({
  formatCurrency: (val: any) => `$${val}`,
}));

describe('AuditEventMeta', () => {
  it('should render price change with correct label', () => {
    const oldData = { price: 100 };
    const newData = { price: 150 };

    render(<AuditEventMeta oldData={oldData} newData={newData} metadata={null} />);

    // Click to open details
    const button = screen.getByText(/Ver detalles/i);
    fireEvent.click(button);

    // Check if 'Precio Venta' label is present
    expect(screen.getByText(/PRECIO VENTA:/i)).toBeInTheDocument();
    expect(screen.getByText('$100')).toBeInTheDocument();
    expect(screen.getByText('$150')).toBeInTheDocument();
  });

  it('should still handle sale_price for backward compatibility', () => {
    const oldData = { sale_price: 200 };
    const newData = { sale_price: 250 };

    render(<AuditEventMeta oldData={oldData} newData={newData} metadata={null} />);

    const button = screen.getByText(/Ver detalles/i);
    fireEvent.click(button);

    expect(screen.getByText(/PRECIO VENTA:/i)).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
  });
});
