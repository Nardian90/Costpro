import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashService } from '@/services/cash-service';
import { CashClosure } from '@/types';
import { toast } from 'sonner';
import { getCleanStoreId } from './base';
import { useAuthStore } from '@/store';
import { auditService } from '@/services/audit-service';

export function useCashClosures(storeId?: string | null, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['cash-closures', cleanStoreId, isAdmin],
    queryFn: () => {
      if (!cleanStoreId) return [];
      return cashService.getClosures(cleanStoreId || '', isAdmin);
    },
    enabled: !!cleanStoreId,
  });
}

export function useSalesSinceLastClosure(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['sales-since-last-closure', cleanStoreId],
    queryFn: () => {
      if (!cleanStoreId) return null;
      return cashService.getSalesSinceLastClosure(cleanStoreId);
    },
    enabled: !!cleanStoreId,
  });
}

export function useCreateCashClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (closure: Partial<CashClosure>) => cashService.createClosure(closure),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
      queryClient.invalidateQueries({ queryKey: ['sales-since-last-closure'] });
      toast.success('Declaración de fondos registrada correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al registrar declaración: ${message}`);
    },
  });
}

export function useUpdateCashClosure() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore.getState();
  return useMutation({
    mutationFn: ({ id, closure }: { id: string; closure: Partial<CashClosure> }) =>
      cashService.updateClosure(id, closure),
    onSuccess: async (_, variables) => {
      // Q2 (Audit-Fix): log de auditoría al finalizar cierre de caja
      if (user?.id && variables.closure.status === 'cerrado') {
        await auditService.logCashClosureFinalized({
          userId: user.id,
          closureId: variables.id,
          storeId: user.activeStoreId || '',
          declaredCash: variables.closure.declared_cash || 0,
          declaredVouchers: variables.closure.declared_vouchers || 0,
          systemExpectedTotal: variables.closure.system_expected_total || 0,
          difference: variables.closure.difference || 0,
          status: variables.closure.status,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
      queryClient.invalidateQueries({ queryKey: ['sales-since-last-closure'] });
      toast.success('Cierre de caja finalizado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al finalizar cierre: ${message}`);
    },
  });
}
