import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useIncomingTransfers, useOutgoingTransfers, useCreateTransfer, useConfirmTransfer } from '../useTransfers';
import { transferService } from '@/services/transfer-service';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/services/transfer-service', () => ({
  transferService: {
    getIncomingTransfers: vi.fn(),
    getOutgoingTransfers: vi.fn(),
    createTransfer: vi.fn(),
    confirmTransfer: vi.fn(),
  },
}));

vi.mock('@/services/audit-service', () => ({
  auditService: {
    logTransferCreated: vi.fn(),
    logTransferConfirmed: vi.fn(),
  },
}));

vi.mock('@/store', () => ({
  useAuthStore: { getState: vi.fn() },
}));

vi.mock('@/components/providers/SyncProvider', () => ({
    useSyncContext: () => ({ addToQueue: vi.fn() })
}));

describe('useTransfers', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useIncomingTransfers fetches incoming', async () => {
    (transferService.getIncomingTransfers as any).mockResolvedValue([]);
    const { result } = renderHook(() => useIncomingTransfers('s1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess || result.current.isLoading).toBe(true));
    expect(transferService.getIncomingTransfers).toHaveBeenCalledWith('s1');
  });

  it('useOutgoingTransfers fetches outgoing', async () => {
    (transferService.getOutgoingTransfers as any).mockResolvedValue([]);
    const { result } = renderHook(() => useOutgoingTransfers('s1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess || result.current.isLoading).toBe(true));
    expect(transferService.getOutgoingTransfers).toHaveBeenCalledWith('s1');
  });

  it('useCreateTransfer calls transferService.createTransfer', async () => {
    (transferService.createTransfer as any).mockResolvedValue({ id: 't1' });
    (useAuthStore.getState as any).mockReturnValue({ user: { id: 'u1' } });
    const { result } = renderHook(() => useCreateTransfer(), { wrapper: Wrapper });
    await result.current.mutateAsync({ origin_store_id: 's1', destination_store_id: 's2', items: [] });
    expect(transferService.createTransfer).toHaveBeenCalled();
  });
});
