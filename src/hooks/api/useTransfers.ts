import { useMutation, useQueryClient, useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { transferService, TransfersPage } from '@/services/transfer-service';
import { useSyncContext } from '@/components/providers/SyncProvider';
import { getCleanStoreId } from './base';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';
import { TransferStatus, Transfer } from '@/types';

const PAGE_SIZE = 20;

export function useIncomingTransfers(storeId?: string | null, status?: TransferStatus | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useInfiniteQuery({
    queryKey: ['transfers', 'incoming', cleanStoreId, status ?? 'ALL'],
    queryFn: ({ pageParam = 1 }) =>
      transferService.getIncomingTransfers(cleanStoreId!, {
        page: pageParam,
        pageSize: PAGE_SIZE,
        status: status || undefined,
      }),
    getNextPageParam: (lastPage: TransfersPage, allPages: TransfersPage[], lastPageParam: number) => {
      const totalLoaded = allPages.reduce((sum, p) => sum + p.transfers.length, 0);
      return totalLoaded < lastPage.total ? lastPageParam + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: !!cleanStoreId,
  });
}

export function useOutgoingTransfers(storeId?: string | null, status?: TransferStatus | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useInfiniteQuery({
    queryKey: ['transfers', 'outgoing', cleanStoreId, status ?? 'ALL'],
    queryFn: ({ pageParam = 1 }) =>
      transferService.getOutgoingTransfers(cleanStoreId!, {
        page: pageParam,
        pageSize: PAGE_SIZE,
        status: status || undefined,
      }),
    getNextPageParam: (lastPage: TransfersPage, allPages: TransfersPage[], lastPageParam: number) => {
      const totalLoaded = allPages.reduce((sum, p) => sum + p.transfers.length, 0);
      return totalLoaded < lastPage.total ? lastPageParam + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: !!cleanStoreId,
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
  const cleanStoreId = getCleanStoreId(currentStoreId);

  return useQuery({
    queryKey: ['stores', 'transferable', userId, cleanStoreId],
    queryFn: () => transferService.getTransferableStores(userId, cleanStoreId!),
    enabled: !!userId && !!cleanStoreId,
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  const { addToQueue } = useSyncContext();

  return useMutation({
    mutationFn: async (params: {
      origin_store_id: string;
      destination_store_id: string;
      items: { product_id: string; quantity: number; unit_cost: number }[];
      notes?: string;
      operationDate?: string;
    }) => {
      if (!navigator.onLine) {
        return await addToQueue('transfer', 'CREATE', params);
      }
      return transferService.createTransfer(params);
    },
    onSuccess: async (data, variables) => {
      const { user } = useAuthStore.getState();
      if (user?.id) {
        await auditService.logTransferCreated({
          userId: user.id,
          transferId: data?.id || (data as { transfer_id?: string })?.transfer_id || '',
          originStoreId: variables.origin_store_id,
          destinationStoreId: variables.destination_store_id,
          items: (variables.items || []).map((i) => ({
            productId: i.product_id,
            quantity: i.quantity,
            unitCost: i.unit_cost || 0,
          })),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      // FIX-LOG-008: Toast duplicado eliminado — se maneja únicamente en CreateTransferModal.handleCreate
    },
  });
}

export function useConfirmTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, userId, operationDate }: { transferId: string; userId: string; operationDate?: string }) =>
      transferService.confirmTransfer(transferId, userId, operationDate),
    onSuccess: async (_data, variables) => {
      const { user } = useAuthStore.getState();
      const transfer = queryClient.getQueryData<Transfer>(
        ['transfers', 'details', variables.transferId]
      );

      if (user?.id) {
        await auditService.logTransferConfirmed({
          userId: user.id,
          transferId: variables.transferId,
          originStoreId: transfer?.origin_store_id || '',
          destinationStoreId: transfer?.destination_store_id || '',
          items: (transfer?.items || []).map((i) => ({
            productId: i.product_id,
            quantity: i.quantity,
            unitCost: i.unit_cost || 0,
          })),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      // FIX-LOG-009: Toast duplicado eliminado — se maneja únicamente en TransferDetailsModal.handleConfirm
    },
  });
}

export function useCancelTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, userId }: { transferId: string; userId: string }) =>
      transferService.cancelTransfer(transferId, userId),
    onSuccess: async (_data, variables) => {
      const { user } = useAuthStore.getState();
      const transfer = queryClient.getQueryData<Transfer>(
        ['transfers', 'details', variables.transferId]
      );
      if (user?.id) {
        await auditService.logTransferCancelled({
          userId: user.id,
          transferId: variables.transferId,
          storeId: transfer?.origin_store_id || user.activeStoreId || '',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
