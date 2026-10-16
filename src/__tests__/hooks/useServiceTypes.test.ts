/**
 * useServiceTypes.test.ts — MISIÓN SUPER ADMIN (2026-10-17).
 *
 * Regresión del defecto reproducido: el hook usaba fetch crudo sin
 * Authorization → getServerSession (SEC-024 fail-closed, solo Bearer)
 * devolvía 401 «Se requiere sesión activa» en TODO el módulo de tipos de
 * servicio pese a que el usuario autenticado fuera admin (rol global).
 *
 * Contrato corregido:
 *  · Con token en el auth store → GET con Authorization: Bearer <token>.
 *  · Sin token (anónimo/sesión perdida) → fetch SIN header Authorization
 *    (no debe lanzar TypeError) y el error 401 se propaga en el estado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { createElement, Fragment } from 'react';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useAuthStore } from '@/store';
import { useServiceTypes } from '@/hooks/useServiceTypes';

const OK_RES = { ok: true, json: async () => ({ data: [{ id: 't-1', store_id: null, name: 'Transporte', code: 'TRANSP', description: null, is_active: true, created_at: '2026-06-25' }] }) };
const UNAUTHORIZED_RES = { ok: false, status: 401, json: async () => ({ error: 'No autorizado', message: 'Se requiere sesión activa' }) };

beforeEach(() => {
  fetchMock.mockReset();
  useAuthStore.setState({ user: null, token: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useServiceTypes — Authorization Bearer (FIX SUPERADMIN-TIPOS)', () => {
  it('envía Authorization: Bearer con el token del auth store', async () => {
    useAuthStore.setState({ token: 'jwt-de-prueba' });
    fetchMock.mockResolvedValue(OK_RES);

    renderHook(() => useServiceTypes());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/service-types');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.headers?.Authorization).toBe('Bearer jwt-de-prueba');
    expect(init?.headers?.['Content-Type']).toBe('application/json');
  });

  it('sin token: NO envía Authorization y no lanza error de cliente', async () => {
    fetchMock.mockResolvedValue(OK_RES);

    renderHook(() => useServiceTypes());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers?.Authorization).toBeUndefined();
  });

  it('401 del servidor se propaga como error legible en el estado (no catálogo vacío silencioso)', async () => {
    fetchMock.mockResolvedValue(UNAUTHORIZED_RES);

    const { result } = renderHook(() => useServiceTypes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('No autorizado');
    expect(result.current.types).toEqual([]);
  });

  it('carga el catálogo y filtra activos cuando la respuesta es 200', async () => {
    useAuthStore.setState({ token: 'jwt-admin' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 't-1', store_id: null, name: 'Transporte', code: 'TRANSP', description: null, is_active: true, created_at: 'x' },
          { id: 't-2', store_id: null, name: 'Aduana', code: 'ADU', description: null, is_active: false, created_at: 'x' },
        ],
      }),
    });

    const { result } = renderHook(() => useServiceTypes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.types).toHaveLength(2);
    expect(result.current.activeTypes.map((t) => t.name)).toEqual(['Transporte']);
  });
});

// Fragment import evita el jsx-runtime en un archivo .ts puro (sin JSX)
void Fragment;
void createElement;
