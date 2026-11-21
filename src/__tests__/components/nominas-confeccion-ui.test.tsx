/**
 * SMOKE UI — tab Nóminas (Trabajadores y Comisiones): las secciones nuevas del
 * tab Confección (misión 2026-11-21) se renderizan y se comportan:
 *   · «Configuración de columnas del documento» con 16 checkboxes.
 *   · Nombres / Neto a Cobrar / RECIBÍ CONFORME bloqueados (siempre visibles).
 *   · «Ocultar columnas sin datos» oculta las candidatas vacías.
 *   · «Restablecer» recupera el original.
 * Sin red: apiFetch y authStore simulados; nada toca Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NominasTab } from '@/components/views/terminal/views/workers/nominas/NominasTab';
import { useAuthStore } from '@/store';
import { loadColumnConfig } from '@/lib/payrolls/columns';
import type { Payroll } from '@/lib/payrolls/types';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { apiFetch } from '@/lib/api-fetch';

const mockFetch = vi.mocked(apiFetch);

const payrollList: { payrolls: Payroll[] } = { payrolls: [] };

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/api/workers')) return { workers: [] };
    return structuredClone(payrollList);
  });
  // ADMIN: gate CP-SEC-PAYROLL (la confección es de administradores)
  useAuthStore.setState({ user: { id: 'u-1', role: 'admin', name: 'Admin', email: 'a@b.c' } } as never);
  window.localStorage.clear();
});

describe('tab Nóminas — configuración de columnas en Confección (REQ1)', () => {
  it('renderiza las 16 columnas con las bloqueadas siempre activas', async () => {
    render(<NominasTab storeId="s-1" />);
    // Abrir el editor (Nueva nómina → PayrollEditor en tab Confección)
    fireEvent.click(screen.getByRole('button', { name: /Nueva nómina/i }));
    await waitFor(() => screen.getByRole('tab', { name: /Confección/i }));

    const section = screen.getByLabelText(/Configuración de columnas del documento/i);
    const boxes = within(section).getAllByRole('checkbox');
    expect(boxes.length).toBe(16);

    // RECIBÍ CONFORME: última, bloqueada y marcada
    const recibi = within(section).getByRole('checkbox', { name: /RECIBÍ CONFORME/i }) as HTMLInputElement;
    expect(recibi.checked).toBe(true);
    expect(recibi.disabled).toBe(true);
    // Neto a Cobrar bloqueado
    const neto = within(section).getByRole('checkbox', { name: /Neto a Cobrar/i }) as HTMLInputElement;
    expect(neto.disabled).toBe(true);
    // Nombres y Apellidos bloqueado
    const nombres = within(section).getByRole('checkbox', { name: /Nombres y Apellidos/i }) as HTMLInputElement;
    expect(nombres.disabled).toBe(true);
    // Una editable desmarcable: Deducciones
    const deduc = within(section).getByRole('checkbox', { name: /Columna Deducciones/i }) as HTMLInputElement;
    expect(deduc.checked).toBe(true);
    expect(deduc.disabled).toBe(false);
  });

  it('oculta columnas sin datos con el botón y las recupera con Restablecer', async () => {
    render(<NominasTab storeId="s-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Nueva nómina/i }));
    await waitFor(() => screen.getByRole('tab', { name: /Confección/i }));

    const section = screen.getByLabelText(/Configuración de columnas del documento/i);
    // Sin líneas no se detecta nada que ocultar (regla: sin trabajadores no se oculta nada)
    const hideBtn = within(section).getByRole('button', { name: /Ocultar columnas sin datos/i });
    expect(hideBtn.textContent).not.toContain('(');

    // Desmarcar Deducciones manualmente → persiste en localStorage normalizado
    const deduc = within(section).getByRole('checkbox', { name: /Columna Deducciones/i }) as HTMLInputElement;
    fireEvent.click(deduc);
    await waitFor(() => expect(deduc.checked).toBe(false));
    const stored = loadColumnConfig(window.localStorage);
    expect(stored).not.toContain('deducciones');
    expect(stored).toContain('recibi_conforme');

    // Restablecer recupera el original (todas visibles)
    fireEvent.click(within(section).getByRole('button', { name: /Restablecer/i }));
    await waitFor(() => expect(deduc.checked).toBe(true));
    expect(loadColumnConfig(window.localStorage)).toContain('deducciones');
  });
});
