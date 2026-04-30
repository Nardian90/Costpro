import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useIncomingTransfers, useCreateTransfer, useConfirmTransfer } from '../useTransfers';
import { transferService } from '@/services/transfer-service';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/services/transfer-service', () => ({
  transferService: {
    getIncomingTransfers: vi.fn(),
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

  it('devuelve transferencias donde destination_store_id === storeId', async () => {
    const mockTransfers = [{ id: 't1', destination_store_id: 's1' }];
    (transferService.getIncomingTransfers as any).mockResolvedValue(mockTransfers);
    const { result } = renderHook(() => useIncomingTransfers('s1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTransfers);
  });

  it('useConfirmTransfer mutation llama a transferService.confirmTransfer', async () => {
    (transferService.confirmTransfer as any).mockResolvedValue({ success: true });
    (useAuthStore.getState as any).mockReturnValue({ user: { id: 'u1' } });
    const { result } = renderHook(() => useConfirmTransfer(), { wrapper: Wrapper });
    await result.current.mutateAsync({ transferId: 't1', userId: 'u1' });
    expect(transferService.confirmTransfer).toHaveBeenCalledWith('t1', 'u1');
  });
});
