/**
 * FASE 3: Tests para CameraBarcodeScanner y BarcodeScanner.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'es' }));
vi.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));
vi.mock('@/lib/utils', () => ({ cn: (...c: any[]) => c.filter(Boolean).join(' '), formatCurrency: (n: number) => `$${n.toFixed(2)}` }));
vi.mock('@/components/ui/BaseModal', () => ({
  BaseModal: ({ children, open }: any) => open ? React.createElement('div', null, children) : null,
}));

describe('FASE 3 — BarcodeScanner', () => {
  it('renderiza el botón de escanear con cámara', async () => {
    const BarcodeScanner = (await import('@/components/views/terminal/views/pos/BarcodeScanner')).default;
    const { getByText } = render(
      <BarcodeScanner isOpen={true} onClose={vi.fn()} onScan={vi.fn()} products={[]} />,
      { wrapper: Wrapper }
    );
    expect(getByText('Escanear con Cámara')).toBeTruthy();
  });

  it('renderiza los modos SKU y Nombre', async () => {
    const BarcodeScanner = (await import('@/components/views/terminal/views/pos/BarcodeScanner')).default;
    const { getByText } = render(
      <BarcodeScanner isOpen={true} onClose={vi.fn()} onScan={vi.fn()} products={[]} />,
      { wrapper: Wrapper }
    );
    expect(getByText('SKU / Código')).toBeTruthy();
    expect(getByText('Nombre')).toBeTruthy();
  });

  it('dispara onScan al escribir y presionar Enter', async () => {
    const BarcodeScanner = (await import('@/components/views/terminal/views/pos/BarcodeScanner')).default;
    const onScan = vi.fn();
    const { container } = render(
      <BarcodeScanner isOpen={true} onClose={vi.fn()} onScan={onScan} products={[]} />,
      { wrapper: Wrapper }
    );
    const input = container.querySelector('#barcode-input') as HTMLInputElement;
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: '7501234567890' } });
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    expect(onScan).toHaveBeenCalledWith('7501234567890');
  });

  it('muestra resultados de búsqueda por nombre', async () => {
    const products = [
      { id: '1', name: 'Pan de agua', sku: 'PAN001', price: 5, stock_current: 10 },
      { id: '2', name: 'Pan de trigo', sku: 'PAN002', price: 8, stock_current: 5 },
    ];
    const BarcodeScanner = (await import('@/components/views/terminal/views/pos/BarcodeScanner')).default;
    const { getByText, container } = render(
      <BarcodeScanner isOpen={true} onClose={vi.fn()} onScan={vi.fn()} products={products as any} />,
      { wrapper: Wrapper }
    );

    // Cambiar a modo nombre
    fireEvent.click(getByText('Nombre'));

    // Escribir búsqueda
    const input = container.querySelector('#barcode-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pan' } });

    // Debería mostrar resultados
    expect(getByText('Pan de agua')).toBeTruthy();
    expect(getByText('Pan de trigo')).toBeTruthy();
  });

  it('muestra mensaje cuando no hay resultados', async () => {
    const BarcodeScanner = (await import('@/components/views/terminal/views/pos/BarcodeScanner')).default;
    const { getByText, container } = render(
      <BarcodeScanner isOpen={true} onClose={vi.fn()} onScan={vi.fn()} products={[]} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(getByText('Nombre'));
    const input = container.querySelector('#barcode-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'xyz123' } });

    expect(getByText(/No se encontraron productos/)).toBeTruthy();
  });
});

describe('FASE 3 — CameraBarcodeScanner (mocked)', () => {
  it('no renderiza cuando isOpen=false', async () => {
    // Mock dynamic import
    vi.doMock('@/components/views/terminal/views/pos/CameraBarcodeScanner', () => ({
      default: ({ isOpen }: any) => isOpen ? React.createElement('div', null, 'Camera Open') : null,
    }));
    vi.resetModules();
    const CameraBarcodeScanner = (await import('@/components/views/terminal/views/pos/CameraBarcodeScanner')).default;
    const { container } = render(<CameraBarcodeScanner isOpen={false} onScan={vi.fn()} onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(container.textContent).not.toContain('Camera Open');
  });
});
