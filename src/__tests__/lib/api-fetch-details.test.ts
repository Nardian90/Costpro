/**
 * MISIÓN CUERPO INVÁLIDO (2026-10-24) — apiFetch supera los `details`
 * de validación al Error lanzado (antes los descartaba y la UI mostraba
 * solo el mensaje genérico «Cuerpo inválido»).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('@/store', () => ({
  useAuthStore: { getState: () => ({ token: 'test-token' }) },
}));

import { apiFetch } from '@/lib/api-fetch';

beforeEach(() => {
  fetchMock.mockReset();
});

describe('apiFetch — propagación de detalles de validación', () => {
  it('error con details: el mensaje incluye los detalles específicos', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({
        error: 'Cuerpo inválido',
        details: [
          'notes: Invalid input: expected string, received null',
          'idempotency_key: UUID inválido',
        ],
      }),
      { status: 400 },
    ));
    await expect(apiFetch('/api/cash-flow', { method: 'POST' })).rejects.toThrow(
      'Cuerpo inválido (notes: Invalid input: expected string, received null · idempotency_key: UUID inválido)',
    );
  });

  it('error sin details: el mensaje queda igual que antes (aditivo, no rompe)', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: 'No autorizado' }),
      { status: 401 },
    ));
    await expect(apiFetch('/api/x')).rejects.toThrow('No autorizado');
  });

  it('details no textuales se filtran; máximo 3 detalles', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({
        error: 'Cuerpo inválido',
        details: [{ deep: 1 }, 'a: uno', 'b: dos', 'c: tres', 'd: cuatro'],
      }),
      { status: 400 },
    ));
    await expect(apiFetch('/api/x')).rejects.toThrow('Cuerpo inválido (a: uno · b: dos · c: tres)');
  });
});
