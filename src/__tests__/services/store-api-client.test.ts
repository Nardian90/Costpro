import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeApiClient } from '@/services/store-api-client';
import { useAuthStore } from '@/store';

/**
 * Helper: asserts fetch was called with the expected URL and partial options,
 * ignoring the `signal` property added by timeoutController().
 */
function expectFetchCalledWith(url: string, options: Record<string, unknown>) {
  expect(globalThis.fetch).toHaveBeenCalledWith(url, expect.objectContaining(options));
}

describe('storeApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset auth store token to null by default
    useAuthStore.setState({ token: null });
  });

  // ─── Auth Headers ──────────────────────────────────────────────────
  describe('auth headers', () => {
    it('includes Authorization Bearer token when auth store has a token', async () => {
      useAuthStore.setState({ token: 'test-access-token-123' });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as Response);

      await storeApiClient.fetchStores();
      expectFetchCalledWith('/api/stores', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-access-token-123',
        },
      });
    });

    it('omits Authorization header when token is null', async () => {
      useAuthStore.setState({ token: null });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as Response);

      await storeApiClient.fetchStores();
      expectFetchCalledWith('/api/stores', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  // ─── createStore ─────────────────────────────────────────────────────
  describe('createStore', () => {
    it('returns store data on success', async () => {
      const mockStore = { id: 'store-1', name: 'Mi Tienda', address: 'Calle 1' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: mockStore }),
      } as Response);

      const result = await storeApiClient.createStore({ name: 'Mi Tienda', address: 'Calle 1' });
      expect(result).toEqual(mockStore);
      expectFetchCalledWith('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mi Tienda', address: 'Calle 1' }),
      });
    });

    it('throws on validation error (4xx response)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Datos inválidos', message: 'Nombre requerido' }),
      } as Response);

      await expect(
        storeApiClient.createStore({ name: '', address: '' }),
      ).rejects.toThrow('Nombre requerido');
    });

    it('throws on network error (fetch rejects)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        storeApiClient.createStore({ name: 'Tienda', address: 'Dir' }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('throws on non-JSON error response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Not JSON'); },
      } as unknown as Response);

      await expect(
        storeApiClient.createStore({ name: 'Tienda', address: 'Dir' }),
      ).rejects.toThrow('Error de conexión');
    });
  });

  // ─── updateStore ─────────────────────────────────────────────────────
  describe('updateStore', () => {
    it('returns updated store data on success', async () => {
      const mockUpdated = { id: 'store-1', name: 'Tienda Updated', address: 'Calle 2' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockUpdated }),
      } as Response);

      const result = await storeApiClient.updateStore('store-1', { name: 'Tienda Updated' });
      expect(result).toEqual(mockUpdated);
      expectFetchCalledWith('/api/stores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: 'store-1', name: 'Tienda Updated' }),
      });
    });

    it('throws on 403 forbidden', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Prohibido', message: 'No tienes permisos' }),
      } as Response);

      await expect(
        storeApiClient.updateStore('store-1', { name: 'Hack' }),
      ).rejects.toThrow('No tienes permisos');
    });
  });

  // ─── deleteStore ─────────────────────────────────────────────────────
  describe('deleteStore', () => {
    it('completes without error on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      await expect(storeApiClient.deleteStore('store-1')).resolves.toBeUndefined();
      expectFetchCalledWith('/api/stores', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: 'store-1' }),
      });
    });

    it('throws on 404 store not found', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Tienda no encontrada' }),
      } as Response);

      await expect(storeApiClient.deleteStore('nonexistent-id')).rejects.toThrow(
        'Tienda no encontrada',
      );
    });
  });

  // ─── resetStore ──────────────────────────────────────────────────────
  describe('resetStore', () => {
    it('completes without error on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      await expect(storeApiClient.resetStore('store-1')).resolves.toBeUndefined();
      expectFetchCalledWith('/api/stores/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: 'store-1' }),
      });
    });

    it('throws on 403 forbidden', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Prohibido', message: 'No tienes permisos para reiniciar' }),
      } as Response);

      await expect(
        storeApiClient.resetStore('store-1'),
      ).rejects.toThrow('No tienes permisos para reiniciar');
    });

    it('throws on network error (fetch rejects)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        storeApiClient.resetStore('store-1'),
      ).rejects.toThrow('Failed to fetch');
    });
  });

  // ─── fetchStores error paths ────────────────────────────────────────
  describe('fetchStores error paths', () => {
    it('throws on 401 Unauthorized response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized', message: 'Sesión expirada' }),
      } as Response);

      await expect(
        storeApiClient.fetchStores(),
      ).rejects.toThrow('Sesión expirada');
    });

    it('throws on 500 server error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error', message: 'Error interno del servidor' }),
      } as Response);

      await expect(
        storeApiClient.fetchStores(),
      ).rejects.toThrow('Error interno del servidor');
    });

    it('throws on network error (fetch rejects)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        storeApiClient.fetchStores(),
      ).rejects.toThrow('Failed to fetch');
    });

    it('throws fallback error on non-JSON error response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => { throw new Error('Not JSON'); },
      } as unknown as Response);

      await expect(
        storeApiClient.fetchStores(),
      ).rejects.toThrow('Error de conexión');
    });

    it('falls back to error field when message is absent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Acceso denegado' }),
      } as Response);

      await expect(
        storeApiClient.fetchStores(),
      ).rejects.toThrow('Acceso denegado');
    });

    it('falls back to default message when neither message nor error is present', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(
        storeApiClient.fetchStores(),
      ).rejects.toThrow('Error al cargar tiendas');
    });
  });
});
