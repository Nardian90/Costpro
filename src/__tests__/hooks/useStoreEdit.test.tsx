import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocks
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

vi.mock('@/services/store-api-client', () => ({
  storeApiClient: {},
  authHeaders: () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer fake' }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { useStoreEdit } from '@/hooks/views/useStoreEdit';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useStoreEdit (F3-T02 + F3-T05)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockReset();
  });

  describe('invalidateFCsForStore (F3-T05)', () => {
    it('llama al endpoint /api/product-cost-sheets/invalidate con storeId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, affected: 5, storeId: 's1' }),
      });

      const { result } = renderHook(() => useStoreEdit(), { wrapper: makeWrapper() });

      const count = await result.current.invalidateFCsForStore('s1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/product-cost-sheets/invalidate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ storeId: 's1' }),
        })
      );
      expect(count).toBe(5);
    });

    it('retorna 0 si el endpoint falla', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'FORBIDDEN' }),
      });

      const { result } = renderHook(() => useStoreEdit(), { wrapper: makeWrapper() });

      const count = await result.current.invalidateFCsForStore('s1');
      expect(count).toBe(0);
    });

    it('retorna 0 si fetch lanza excepción', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network'));

      const { result } = renderHook(() => useStoreEdit(), { wrapper: makeWrapper() });

      const count = await result.current.invalidateFCsForStore('s1');
      expect(count).toBe(0);
    });
  });

  describe('saveFCTemplate (F3-T05 integration)', () => {
    it('guarda FC y dispara invalidación de FCs existentes', async () => {
      // Primera llamada: PUT store-cost-templates (success)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      // Segunda llamada: POST invalidate (affected: 3)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, affected: 3 }),
      });

      const { result } = renderHook(() => useStoreEdit(), { wrapper: makeWrapper() });

      const ok = await result.current.saveFCTemplate('s1', {
        template_id: 'costpro-reinicio',
        modalidad: 'produccion',
        pdf_format: 'res148',
        is_active: true,
      });

      expect(ok).toBe(true);
      // Verificar que se llamó al endpoint de invalidación después del save
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const invalidateCall = mockFetch.mock.calls[1];
      expect(invalidateCall[0]).toBe('/api/product-cost-sheets/invalidate');
    });
  });
});
