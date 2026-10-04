/**
 * REMEDIACIÓN fix/users-multistore-admin-password — FASE 8: SetPasswordModal.
 *
 * Contratos del modal de cambio administrativo de contraseña:
 *   - Muestra el usuario objetivo (nombre + email).
 *   - Validación: mín. 8 caracteres + coincidencia (con feedback específico).
 *   - Mostrar/ocultar contraseña.
 *   - Submit deshabilitado hasta cumplir política; prevención de doble submit.
 *   - onSubmit(userId, password) → true cierra el modal; false lo deja abierto.
 *   - La contraseña NO se persiste en localStorage/sessionStorage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { SetPasswordModal } from '@/components/views/terminal/views/users/SetPasswordModal';

const TARGET_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Juan Pérez',
  email: 'juan.perez@costpro.dev',
};

function renderModal(onSubmit = vi.fn().mockResolvedValue(true), onClose = vi.fn()) {
  render(
    <SetPasswordModal
      isOpen
      onClose={onClose}
      onSubmit={onSubmit}
      user={TARGET_USER}
    />
  );
  return { onSubmit, onClose };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SetPasswordModal — identificación y validación', () => {
  it('muestra el usuario objetivo (nombre + email)', () => {
    renderModal();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('juan.perez@costpro.dev')).toBeTruthy();
  });

  it('contraseña corta → error específico de política (mín. 8)', async () => {
    const user = userEvent.setup();
    renderModal();

    const input = screen.getByLabelText('Nueva contraseña') as HTMLInputElement;
    await user.type(input, 'corta');
    await user.tab();

    expect(screen.getByText(/debe tener al menos 8 caracteres/i)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('confirmación que no coincide → error de coincidencia asociado al input', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Nueva contraseña'), 'ClaveSegura99');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSegura88');

    expect(screen.getByText(/Las contraseñas no coinciden/i)).toBeTruthy();
    const confirmInput = screen.getByLabelText('Confirmar contraseña') as HTMLInputElement;
    expect(confirmInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('mostrar/ocultar contraseña alterna el tipo de ambos campos', async () => {
    const user = userEvent.setup();
    renderModal();

    const nueva = screen.getByLabelText('Nueva contraseña') as HTMLInputElement;
    const confirmar = screen.getByLabelText('Confirmar contraseña') as HTMLInputElement;
    expect(nueva.type).toBe('password');
    expect(confirmar.type).toBe('password');

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect((screen.getByLabelText('Nueva contraseña') as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText('Confirmar contraseña') as HTMLInputElement).type).toBe('text');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect((screen.getByLabelText('Nueva contraseña') as HTMLInputElement).type).toBe('password');
  });
});

describe('SetPasswordModal — envío seguro', () => {
  it('submit habilitado solo cuando cumple política y coincide; llama onSubmit(userId, password)', async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderModal();

    const submitBtn = screen.getByRole('button', { name: /Confirmar contraseña/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    await user.type(screen.getByLabelText('Nueva contraseña'), 'ClaveSegura99');
    expect(submitBtn.disabled).toBe(true); // falta confirmar

    await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSegura99');
    expect(submitBtn.disabled).toBe(false);

    await user.click(submitBtn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(TARGET_USER.id, 'ClaveSegura99');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('prevención de doble submit: mientras está pendiente, el botón queda deshabilitado', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: (v: boolean) => void;
    const pendingSubmit = vi.fn().mockImplementation(() => new Promise<boolean>((res) => { resolveSubmit = res; }));
    renderModal(pendingSubmit);

    await user.type(screen.getByLabelText('Nueva contraseña'), 'ClaveSegura99');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSegura99');

    const submitBtn = screen.getByRole('button', { name: /Confirmar contraseña/i }) as HTMLButtonElement;
    await user.click(submitBtn);

    expect(screen.getByText(/Guardando/i)).toBeTruthy();
    const savingBtn = screen.getByRole('button', { name: /Guardando/i }) as HTMLButtonElement;
    expect(savingBtn.disabled).toBe(true);

    resolveSubmit(true);
    await waitFor(() => expect(pendingSubmit).toHaveBeenCalledTimes(1));
  });

  it('error del servidor (onSubmit false) → modal abierto, campos sensibles limpiados', async () => {
    const user = userEvent.setup();
    const failing = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    renderModal(failing, onClose);

    await user.type(screen.getByLabelText('Nueva contraseña'), 'ClaveSegura99');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSegura99');
    await user.click(screen.getByRole('button', { name: /Confirmar contraseña/i }));

    await waitFor(() => expect(failing).toHaveBeenCalled());
    await waitFor(() => {
      expect((screen.getByLabelText('Nueva contraseña') as HTMLInputElement).value).toBe('');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('la contraseña no se persiste en localStorage/sessionStorage', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Nueva contraseña'), 'ClaveSegura99');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'ClaveSegura99');
    await user.click(screen.getByRole('button', { name: /Confirmar contraseña/i }));

    await waitFor(() => expect(setItemSpy).toBeDefined());
    for (const call of setItemSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('ClaveSegura99');
    }
  });
});
