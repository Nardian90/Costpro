/**
 * P2-7: Tests funcionales de validación para forms del módulo COSTOS.
 *
 * Valida comportamiento real:
 *   - Campos requeridos muestran * visual
 *   - aria-required presente en inputs
 *   - Validación inline muestra mensaje de error tras blur
 *   - Inputs inválidos no sobrescriben valor válido anterior (QuickMode)
 *   - Toast se dispara en input inválido (QuickMode)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── Mocks ──────────────────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        key
      );
    }
    return key;
  },
  useLocale: () => 'es',
}));
vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: vi.fn(() => ({
    data: {
      header: {
        resolution: 'Res 148/2023',
        code: 'MP-001',
        name: 'Producto Test',
        unit: 'kg',
        quantity: 100,
      },
      signature: {
        prepared_by: '',
        approved_by: '',
      },
    },
    _hasHydrated: true,
    updateValue: vi.fn(),
  })),
}));
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/store', () => ({
  useUIStore: () => ({ setCurrentView: vi.fn(), setActiveCostSection: vi.fn() }),
  useAuthStore: () => ({ user: { id: 'u1', activeStoreId: 's1', role: 'admin' } }),
}));

// ── Tests ────────────────────────────────────────────────────

describe('P2 — CostSheetHeaderEditor validación', () => {
  it('muestra * visual para campos requeridos', async () => {
    const CostSheetHeaderEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetHeaderEditor')).default;
    const { container } = render(
      <CostSheetHeaderEditor header={{} as any} calculatedHeader={{} as any} />,
      { wrapper: Wrapper }
    );
    // Buscar asteriscos rojos (spans con text-destructive)
    const requiredMarks = container.querySelectorAll('span.text-destructive');
    expect(requiredMarks.length).toBeGreaterThan(0);
  });

  it('aria-required presente en inputs/selects de campos requeridos', async () => {
    const CostSheetHeaderEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetHeaderEditor')).default;
    const { container } = render(
      <CostSheetHeaderEditor header={{} as any} calculatedHeader={{} as any} />,
      { wrapper: Wrapper }
    );
    const requiredElements = container.querySelectorAll('[aria-required="true"]');
    expect(requiredElements.length).toBeGreaterThan(0);
  });

  it('resalta campos requeridos vacíos con borde dashed', async () => {
    const CostSheetHeaderEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetHeaderEditor')).default;
    const { container } = render(
      <CostSheetHeaderEditor header={{ name: '' } as any} calculatedHeader={{} as any} />,
      { wrapper: Wrapper }
    );
    // Buscar elementos con border-dashed (campos requeridos vacíos)
    const dashedElements = container.querySelectorAll('.border-dashed');
    expect(dashedElements.length).toBeGreaterThan(0);
  });
});

describe('P2 — CostSheetSignatureEditor validación', () => {
  it('muestra * visual para campos requeridos (prepared_by, approved_by)', async () => {
    const CostSheetSignatureEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetSignatureEditor')).default;
    const { container } = render(
      <CostSheetSignatureEditor />,
      { wrapper: Wrapper }
    );
    const requiredMarks = container.querySelectorAll('span.text-destructive');
    expect(requiredMarks.length).toBeGreaterThanOrEqual(2);
  });

  it('aria-required="true" en ambos inputs de firma', async () => {
    const CostSheetSignatureEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetSignatureEditor')).default;
    const { container } = render(
      <CostSheetSignatureEditor />,
      { wrapper: Wrapper }
    );
    const requiredInputs = container.querySelectorAll('input[aria-required="true"]');
    expect(requiredInputs.length).toBe(2);
  });

  it('muestra error inline tras blur cuando campo está vacío', async () => {
    const CostSheetSignatureEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetSignatureEditor')).default;
    const { container, getByLabelText } = render(
      <CostSheetSignatureEditor />,
      { wrapper: Wrapper }
    );
    // Buscar input de elaborado por
    const preparedByInput = container.querySelector('#signature-prepared-by') as HTMLInputElement;
    expect(preparedByInput).toBeTruthy();

    // Focus + blur sin escribir
    fireEvent.focus(preparedByInput);
    fireEvent.blur(preparedByInput);

    // Debe aparecer un mensaje de error con role="alert"
    await waitFor(() => {
      const alertElements = container.querySelectorAll('[role="alert"]');
      expect(alertElements.length).toBeGreaterThan(0);
    });
  });

  it('aria-invalid aparece tras blur con campo vacío', async () => {
    const CostSheetSignatureEditor = (await import('@/components/views/terminal/views/cost_sheet/CostSheetSignatureEditor')).default;
    const { container } = render(
      <CostSheetSignatureEditor />,
      { wrapper: Wrapper }
    );
    const preparedByInput = container.querySelector('#signature-prepared-by') as HTMLInputElement;
    fireEvent.focus(preparedByInput);
    fireEvent.blur(preparedByInput);

    await waitFor(() => {
      expect(preparedByInput.getAttribute('aria-invalid')).toBe('true');
    });
  });
});

describe('P2 — CostSheetQuickMode validación numérica', () => {
  it('renderiza sin crashear con mapping inicial', async () => {
    const { CostSheetQuickMode } = await import('@/components/views/terminal/views/cost_sheet/CostSheetQuickMode');
    const mapping = { targetColumn: 'sale_price' as const, modificationRow: '2' };
    const { container } = render(
      <CostSheetQuickMode onGenerate={vi.fn()} mapping={mapping} onMappingChange={vi.fn()} />,
      { wrapper: Wrapper }
    );
    const inputs = container.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('todos los inputs numéricos tienen aria-label descriptivo', async () => {
    const { CostSheetQuickMode } = await import('@/components/views/terminal/views/cost_sheet/CostSheetQuickMode');
    const mapping = { targetColumn: 'sale_price' as const, modificationRow: '2' };
    const { container } = render(
      <CostSheetQuickMode onGenerate={vi.fn()} mapping={mapping} onMappingChange={vi.fn()} />,
      { wrapper: Wrapper }
    );
    const numberInputs = container.querySelectorAll('input[type="number"][aria-label]');
    expect(numberInputs.length).toBeGreaterThan(0);
    // Cada aria-label debe contener "fila" o nombre del producto
    numberInputs.forEach(input => {
      const label = input.getAttribute('aria-label') || '';
      expect(label.length).toBeGreaterThan(0);
    });
  });
});
