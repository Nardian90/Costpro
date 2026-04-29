import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUpdateReception, useVoidReception } from '../useReceptions';
import { supabase } from '@/lib/supabaseClient';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'receipt-1' }, error: null }))
            }))
          }))
        }))
      }))
    }))
  }
}));

vi.mock('@/services/audit-service', () => ({
  auditService: {
    logReceptionVoided: vi.fn()
  }
}));

vi.mock('@/store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'user-1' } }))
  }
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useReceptions Mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useUpdateReception should update reception header', async () => {
    const { result } = renderHook(() => useUpdateReception(), { wrapper });

    await result.current.mutateAsync({
      receiptId: 'receipt-1',
      supplier: 'New Supplier'
    });

    expect(supabase.from).toHaveBeenCalledWith('receipts');
  });

  it('useVoidReception should void reception and log audit', async () => {
    const { result } = renderHook(() => useVoidReception(), { wrapper });

    await result.current.mutateAsync({
      receiptId: 'receipt-1',
      storeId: 'store-1',
      reason: 'Testing'
    });

    expect(supabase.from).toHaveBeenCalledWith('receipts');
    expect(auditService.logReceptionVoided).toHaveBeenCalled();
  });
});
