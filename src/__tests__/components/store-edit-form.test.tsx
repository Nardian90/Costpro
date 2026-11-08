/**
 * CP-UX-ORG-STORES-001 — StoreEditForm (formulario ÚNICO de tienda).
 *
 * El formulario se EXTRAJO de EditStoreModal sin cambiar comportamiento: este
 * archivo certifica que las validaciones y el payload de guardado se
 * conservan idénticos (misma disciplina que exigía la misión: reutilizar, no
 * duplicar) y que la nueva estructura por secciones contiene los mismos
 * campos. Lo consumen EditStoreModal (modal) y StoreSettingsView (pestaña
 * Configuración).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { toast } from 'sonner';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x.test/img.png' } })) })) },
  },
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ available: true }),
}));

import { StoreEditForm } from '@/components/views/terminal/views/stores/StoreEditForm';

const STORE_FIXTURE = {
  id: 'store-1',
  name: 'Almacen Central',
  address: 'Calle Menocal 12',
  phone: '56561619',
  email: 'central@tienda.cu',
  reeup: '12345678901',
  nit: '12345678901',
  bank_account: '12345678',
  bank_branch: 'BPA Puerto Padre',
  logo_url: null,
  signature_url: null,
  stamp_url: null,
  latitude: 23.11,
  longitude: -82.36,
  slug: 'almacen-central',
  plantilla: 'construccion' as const,
  is_active: true,
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  cost_template: { id: 'ct1', store_id: 'store-1', template_id: 'costpro-reinicio', modalidad: 'produccion' as const, pdf_format: 'res148' as const, is_active: true },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StoreEditForm — formulario único (modal + pestaña Configuración)', () => {
  it('precarga los datos de la tienda y agrupa los campos en las 6 secciones', () => {
    render(
      <StoreEditForm store={STORE_FIXTURE as any} onSubmit={vi.fn()} isSubmitting={false} />,
    );
    expect((screen.getByLabelText(/name/) as HTMLInputElement).value).toBe('Almacen Central');
    // Secciones nuevas (i18n keys) — misma información, agrupada
    for (const section of ['sectionIdentification', 'sectionContact', 'sectionBanking', 'sectionBranding', 'sectionOnline']) {
      expect(screen.getByText(section)).toBeDefined();
    }
    // La sección FC existente se conserva
    expect(screen.getByText('fcTemplate')).toBeDefined();
    // Encabezado de identidad: la tienda que se está editando
    expect(screen.getByText('Almacen Central')).toBeDefined();
    expect(screen.getByText('editingStore')).toBeDefined();
  });

  it('valida nombre mínimo (≥2) igual que el modal original', async () => {
    const onSubmit = vi.fn();
    render(<StoreEditForm store={STORE_FIXTURE as any} onSubmit={onSubmit} isSubmitting={false} />);
    const nameInput = screen.getByLabelText(/name/) as HTMLInputElement;
    // «a» pasa la validación nativa required pero falla la del formulario (min 2)
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'a');
    await userEvent.click(screen.getByRole('button', { name: /saveChanges/ }));
    expect(toast.error).toHaveBeenCalledWith('nameMinLength');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('valida REEUP de 11 dígitos, igual que el modal original', async () => {
    const onSubmit = vi.fn();
    render(<StoreEditForm store={STORE_FIXTURE as any} onSubmit={onSubmit} isSubmitting={false} />);
    await userEvent.clear(screen.getByLabelText(/reeup/));
    await userEvent.type(screen.getByLabelText(/reeup/), '123');
    await userEvent.click(screen.getByRole('button', { name: /saveChanges/ }));
    expect(toast.error).toHaveBeenCalledWith('reeupExactDigits');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bloquea el guardado con email inválido (validación nativa + regex)', async () => {
    const onSubmit = vi.fn();
    render(<StoreEditForm store={STORE_FIXTURE as any} onSubmit={onSubmit} isSubmitting={false} />);
    const email = screen.getByLabelText(/email/) as HTMLInputElement;
    await userEvent.clear(email);
    await userEvent.type(email, 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: /saveChanges/ }));
    // El input es type="email": la validación nativa del navegador bloquea el
    // submit ANTES del handler (igual comportamiento que el modal original);
    // la regex del formulario es segunda línea de defensa.
    expect(email.validity.valid).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('guardado válido: emite el payload completo con plantilla FC', async () => {
    const onSubmit = vi.fn();
    render(<StoreEditForm store={STORE_FIXTURE as any} onSubmit={onSubmit} isSubmitting={false} />);
    await userEvent.click(screen.getByRole('button', { name: /saveChanges/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.name).toBe('Almacen Central');
    expect(payload.bank_branch).toBe('BPA Puerto Padre');
    expect(payload.slug).toBe('almacen-central');
    expect((payload as any).cost_template).toEqual({
      template_id: 'costpro-reinicio',
      modalidad: 'produccion',
      pdf_format: 'res148',
      is_active: true,
    });
  });

  it('modo solo lectura (sin canManageStore): sin acciones de guardado', () => {
    render(
      <StoreEditForm store={STORE_FIXTURE as any} onSubmit={vi.fn()} isSubmitting={false} readOnly />,
    );
    expect(screen.queryByRole('button', { name: /saveChanges/ })).toBeNull();
    expect((screen.getByLabelText(/name/) as HTMLInputElement).disabled).toBe(true);
  });

  it('resetToken cambia: recarga el formulario con los datos de la tienda (post-guardado)', async () => {
    const { rerender } = render(
      <StoreEditForm store={STORE_FIXTURE as any} onSubmit={vi.fn()} isSubmitting={false} />,
    );
    const nameInput = screen.getByLabelText(/name/) as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Borrador sin guardar');

    // El guardado refresca la query → nuevo objeto (mismo id) + resetToken++
    const refreshed = { ...STORE_FIXTURE, name: 'Almacen Central Actualizado' };
    rerender(
      <StoreEditForm store={refreshed as any} onSubmit={vi.fn()} isSubmitting={false} resetToken={1} />,
    );
    await waitFor(() => {
      expect((screen.getByLabelText(/name/) as HTMLInputElement).value).toBe('Almacen Central Actualizado');
    });
  });
});
