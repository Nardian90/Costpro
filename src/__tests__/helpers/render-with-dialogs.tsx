/**
 * CP-UX-FINAL-POLISH-003 — helper de tests para componentes que usan el sistema
 * unificado de diálogos (useDialogs). Envuelve el render en <DialogProvider>,
 * igual que `src/app/layout.tsx` en producción.
 */
import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { DialogProvider } from '@/components/ui/dialogs';

export function renderWithDialogs(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <DialogProvider>{children}</DialogProvider>
    ),
  });
}
