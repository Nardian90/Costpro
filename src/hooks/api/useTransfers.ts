import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { transferService } from '@/services/transfer-service';
import { useSyncContext } from '@/components/providers/SyncProvider';
import { getCleanStoreId } from './base';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

export function useIncomingTransfers(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['transfers', 'incoming', cleanStoreId],
    queryFn: () => transferService.getIncomingTransfers(cleanStoreId!),
    enabled: !!cleanStoreId,
  });
}

export function useOutgoingTransfers(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['transfers', 'outgoing', cleanStoreId],
    queryFn: () => transferService.getOutgoingTransfers(cleanStoreId!),
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
    mutationFn: async (params: any) => {
      if (!navigator.onLine) {
        return await addToQueue('transfer', 'CREATE', params);
      }
      return transferService.createTransfer(params);
    },
    onSuccess: async (data: any, variables: any) => {
      // Audit log — fire and forget
      const { user } = useAuthStore.getState();
      if (user?.id) {
        await auditService.logTransferCreated({
          userId: user.id,
          transferId: data?.id || data?.transfer_id || '',
          originStoreId: variables.origin_store_id,
          destinationStoreId: variables.destination_store_id,
          items: (variables.items || []).map((i: any) => ({
            productId: i.product_id,
            quantity: i.quantity,
            unitCost: i.unit_cost || 0
          }))
        });
      }
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('Transferencia creada');
    },
  });
}

export function useConfirmTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, userId }: { transferId: string, userId: string }) =>
      transferService.confirmTransfer(transferId, userId),
    onSuccess: async (data: any, variables: any) => {
      const { user } = useAuthStore.getState();
      // Obtener detalles de la transferencia del cache para el audit
      const transfer = queryClient.getQueryData<any>(
        ['transfers', 'details', variables.transferId]
      );

      if (user?.id) {
        await auditService.logTransferConfirmed({
          userId: user.id,
          transferId: variables.transferId,
          originStoreId: transfer?.origin_store_id || '',
          destinationStoreId: transfer?.destination_store_id || '',
          items: (transfer?.items || []).map((i: any) => ({
            productId: i.product_id,
            quantity: i.quantity,
            unitCost: i.unit_cost || 0
          }))
        });
      }
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Transferencia confirmada');
    },
  });
}
