import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as RTL from '@testing-library/react';
const { renderHook, waitFor } = RTL as any;
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocks
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

vi.mock('@/store', () => ({
  useAuthStore: { getState: () => ({ token: 'fake-token' }) },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useBulkAssignMemberships } from '@/hooks/api/useUsers';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useBulkAssignMemberships (F4-T02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockReset();
  });

  it('envía POST al endpoint bulk con assignments y token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, affected: 3, failed: 0, userId: 'u1' }),
    });

    const { result } = renderHook(() => useBulkAssignMemberships(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({
      userId: 'u1',
      assignments: [
        { store_id: 's1', role: 'clerk' },
        { store_id: 's2', role: 'clerk' },
        { store_id: 's3', role: 'clerk' },
      ],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/users/u1/memberships/bulk',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer fake-token',
        }),
        body: JSON.stringify({
          assignments: [
            { store_id: 's1', role: 'clerk' },
            { store_id: 's2', role: 'clerk' },
            { store_id: 's3', role: 'clerk' },
          ],
        }),
      })
    );
  });

  it('lanza error si la respuesta no es ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'FORBIDDEN' }),
    });

    const { result } = renderHook(() => useBulkAssignMemberships(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({
        userId: 'u1',
        assignments: [{ store_id: 's1', role: 'clerk' }],
      })
    ).rejects.toThrow();
  });

  it('propaga affected y failed del resultado', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, affected: 4, failed: 1, userId: 'u1' }),
    });

    const { result } = renderHook(() => useBulkAssignMemberships(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({
      userId: 'u1',
      assignments: [{ store_id: 's1', role: 'clerk' }],
    });

    expect(res.affected).toBe(4);
    expect(res.failed).toBe(1);
  });
});
