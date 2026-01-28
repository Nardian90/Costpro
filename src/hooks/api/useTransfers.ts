import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { transferService } from '@/services/transfer-service';
import { useSyncContext } from '@/components/providers/SyncProvider';

export function useIncomingTransfers(storeId?: string | null) {
  return useQuery({
    queryKey: ['transfers', 'incoming', storeId],
    queryFn: () => transferService.getIncomingTransfers(storeId!),
    enabled: !!storeId,
  });
}

export function useOutgoingTransfers(storeId?: string | null) {
  return useQuery({
    queryKey: ['transfers', 'outgoing', storeId],
    queryFn: () => transferService.getOutgoingTransfers(storeId!),
    enabled: !!storeId,
  });
}

export function useTransferDetails(transferId?: string | null) {
  return useQuery({
    queryKey: ['transfers', 'details', transferId],
    queryFn: () => transferService.getTransferDetails(transferId!),
    enabled: !!transferId,
  });
}

export function useTransferableStores(userId: string, currentStoreId?: string | null) {
  return useQuery({
    queryKey: ['stores', 'transferable', userId, currentStoreId],
    queryFn: () => transferService.getTransferableStores(userId, currentStoreId!),
    enabled: !!userId && !!currentStoreId,
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  const { addToQueue } = useSyncContext();

  return useMutation({
    mutationFn: async (params: any) => {
      if (!navigator.onLine) {
        return await addToQueue('transfer', 'CREATE', params);
      }
      return transferService.createTransfer(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
}

export function useConfirmTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, userId }: { transferId: string, userId: string }) =>
      transferService.confirmTransfer(transferId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}
