import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock storeApiClient
const mockBulkStoreAction = vi.fn();
vi.mock('@/services/store-api-client', () => ({
  storeApiClient: {
    bulkStoreAction: (...args: unknown[]) => mockBulkStoreAction(...args),
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useBulkStoreAction } from '@/hooks/api/useStores';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useBulkStoreAction (F4-T01)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockBulkStoreAction.mockReset();
  });

  it('llama a bulkStoreAction con storeIds y action correctos', async () => {
    mockBulkStoreAction.mockResolvedValueOnce({ affected: 3, failed: 0 });

    const { result } = renderHook(() => useBulkStoreAction(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({
      storeIds: ['s1', 's2', 's3'],
      action: 'activate',
    });

    expect(mockBulkStoreAction).toHaveBeenCalledWith(['s1', 's2', 's3'], 'activate');
  });

  it('propaga el resultado con affected y failed', async () => {
    mockBulkStoreAction.mockResolvedValueOnce({ affected: 2, failed: 1 });

    const { result } = renderHook(() => useBulkStoreAction(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({
      storeIds: ['s1', 's2', 's3'],
      action: 'delete',
    });

    expect(res.affected).toBe(2);
    expect(res.failed).toBe(1);
  });

  it('propaga errores del cliente', async () => {
    mockBulkStoreAction.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useBulkStoreAction(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ storeIds: ['s1'], action: 'deactivate' })
    ).rejects.toThrow('Network error');
  });
});
