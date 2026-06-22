import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeApiClient, authHeaders } from '@/services/store-api-client';
import { useAuthStore } from '@/store';

describe('storeApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ token: null });
  });

  describe('authHeaders', () => {
    it('returns correct headers', () => {
      useAuthStore.setState({ token: 'abc' });
      const h = authHeaders();
      expect(h.Authorization).toBe('Bearer abc');
    });
  });

  describe('error handling branches', () => {
    it('covers catch blocks for all major methods', async () => {
        const mockFetch = vi.spyOn(globalThis, 'fetch');

        // Triggers .catch() on res.json()
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => { throw new Error('Fail'); }
        } as any);

        await expect(storeApiClient.fetchStores()).rejects.toThrow('Error de conexión');
        await expect(storeApiClient.createStore({name: 'n', address: 'a'})).rejects.toThrow('Error de conexión');
        await expect(storeApiClient.updateStore('id', {})).rejects.toThrow('Error de conexión');
        await expect(storeApiClient.deleteStore('id')).rejects.toThrow('Error de conexión');
        await expect(storeApiClient.toggleStoreStatus('id', true)).rejects.toThrow('Error de conexión');
        await expect(storeApiClient.resetStore('id', false)).rejects.toThrow('Error de conexión');
        await expect(storeApiClient.bulkStoreAction(['id'], 'delete')).rejects.toThrow('Error de conexión');
    });
  });

  it('all methods send correct requests', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true, status: 200, json: async () => ({ data: [], success: true, affected: 1 })
      } as any);

      await storeApiClient.fetchStores();
      await storeApiClient.createStore({ name: 'N', address: 'A' });
      await storeApiClient.updateStore('id', {});
      await storeApiClient.deleteStore('id');
      await storeApiClient.toggleStoreStatus('id', true);
      await storeApiClient.resetStore('id', false);
      await storeApiClient.bulkStoreAction(['id'], 'delete');

      expect(mockFetch).toHaveBeenCalledTimes(7);
  });
});
