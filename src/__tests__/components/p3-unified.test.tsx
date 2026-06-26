/**
 * P3-8: Tests para <ConfirmDialog> y <UnifiedTabs> unificados.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

describe('P3-8 — ConfirmDialog', () => {
  it('renderiza title y message cuando open=true', async () => {
    const { ConfirmDialog } = await import('@/components/views/terminal/views/cost_sheet/ConfirmDialog');
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        title="Eliminar plantilla"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(getByText('Eliminar plantilla')).toBeTruthy();
    expect(getByText(/Esta acción no se puede deshacer/)).toBeTruthy();
  });

  it('no renderiza cuando open=false', async () => {
    const { ConfirmDialog } = await import('@/components/views/terminal/views/cost_sheet/ConfirmDialog');
    const { queryByText } = render(
      <ConfirmDialog
        open={false}
        title="Eliminar plantilla"
        message="Mensaje"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(queryByText('Eliminar plantilla')).toBeNull();
  });

  it('click en confirmar dispara onConfirm', async () => {
    const { ConfirmDialog } = await import('@/components/views/terminal/views/cost_sheet/ConfirmDialog');
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Mensaje"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        confirmLabel="Sí, eliminar"
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(getByText('Sí, eliminar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('variant destructive renderiza sin crashear', async () => {
    const { ConfirmDialog } = await import('@/components/views/terminal/views/cost_sheet/ConfirmDialog');
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="Eliminar"
        message="¿Seguro?"
        variant="destructive"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirmLabel="Eliminar"
      />,
      { wrapper: Wrapper }
    );
    // El componente debe renderizar sin crashear con variant="destructive"
    expect(container).toBeDefined();
  });
});

describe('P3-8 — UnifiedTabs', () => {
  it('renderiza todos los tabs', async () => {
    const { UnifiedTabs } = await import('@/components/views/terminal/views/cost_sheet/UnifiedTabs');
    const { getAllByText } = render(
      <UnifiedTabs
        tabs={[
          { id: 'a', label: 'Tab A' },
          { id: 'b', label: 'Tab B' },
          { id: 'c', label: 'Tab C' },
        ]}
        activeTab="a"
        onTabChange={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    // Desktop + mobile = 2 ocurrencias por tab
    expect(getAllByText('Tab A').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Tab B').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Tab C').length).toBeGreaterThanOrEqual(1);
  });

  it('click en tab dispara onTabChange con id correcto', async () => {
    const { UnifiedTabs } = await import('@/components/views/terminal/views/cost_sheet/UnifiedTabs');
    const onTabChange = vi.fn();
    const { getAllByText } = render(
      <UnifiedTabs
        tabs={[
          { id: 'a', label: 'Tab A' },
          { id: 'b', label: 'Tab B' },
        ]}
        activeTab="a"
        onTabChange={onTabChange}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.click(getAllByText('Tab B')[0]);
    expect(onTabChange).toHaveBeenCalledWith('b');
  });

  it('tab activo tiene aria-selected=true', async () => {
    const { UnifiedTabs } = await import('@/components/views/terminal/views/cost_sheet/UnifiedTabs');
    const { container } = render(
      <UnifiedTabs
        tabs={[
          { id: 'a', label: 'Tab A' },
          { id: 'b', label: 'Tab B' },
        ]}
        activeTab="b"
        onTabChange={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(activeTab).toBeTruthy();
    expect(activeTab?.textContent).toContain('Tab B');
  });

  it('todos los tabs tienen min-h-[44px]', async () => {
    const { UnifiedTabs } = await import('@/components/views/terminal/views/cost_sheet/UnifiedTabs');
    const { container } = render(
      <UnifiedTabs
        tabs={[
          { id: 'a', label: 'Tab A' },
          { id: 'b', label: 'Tab B' },
        ]}
        activeTab="a"
        onTabChange={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    const tabs = container.querySelectorAll('[role="tab"]');
    tabs.forEach(tab => {
      expect(tab.className).toMatch(/min-h-\[44px\]/);
    });
  });

  it('variant pills renderiza con estilo diferente a underline', async () => {
    const { UnifiedTabs } = await import('@/components/views/terminal/views/cost_sheet/UnifiedTabs');
    const { container: pillsContainer } = render(
      <UnifiedTabs
        tabs={[{ id: 'a', label: 'A' }]}
        activeTab="a"
        onTabChange={vi.fn()}
        variant="pills"
      />,
      { wrapper: Wrapper }
    );
    const { container: underlineContainer } = render(
      <UnifiedTabs
        tabs={[{ id: 'a', label: 'A' }]}
        activeTab="a"
        onTabChange={vi.fn()}
        variant="underline"
      />,
      { wrapper: Wrapper }
    );
    // Pills debe tener 'rounded-xl' en tab activo, underline debe tener 'border-b-2'
    const pillsTab = pillsContainer.querySelector('[role="tab"][aria-selected="true"]');
    const underlineTab = underlineContainer.querySelector('[role="tab"][aria-selected="true"]');
    expect(pillsTab?.className).toMatch(/rounded-xl/);
    expect(underlineTab?.className).toMatch(/border-b-2/);
  });
});
