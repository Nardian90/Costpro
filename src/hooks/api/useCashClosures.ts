import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashService } from '@/services/cash-service';
import { CashClosure } from '@/types';
import { toast } from 'sonner';

export function useCashClosures(storeId?: string | null, isAdmin = false) {
  return useQuery({
    queryKey: ['cash-closures', storeId, isAdmin],
    queryFn: () => {
      if (!storeId && !isAdmin) return [];
      return cashService.getClosures(storeId || '', isAdmin);
    },
    enabled: isAdmin || !!storeId,
  });
}

export function useSalesSinceLastClosure(storeId?: string | null) {
  return useQuery({
    queryKey: ['sales-since-last-closure', storeId],
    queryFn: () => {
      if (!storeId) return null;
      return cashService.getSalesSinceLastClosure(storeId);
    },
    enabled: !!storeId,
  });
}

export function useCreateCashClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (closure: Partial<CashClosure>) => cashService.createClosure(closure),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
      toast.success('Declaración de fondos registrada correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al registrar declaración: ${error.message}`);
    },
  });
}

export function useUpdateCashClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, closure }: { id: string; closure: Partial<CashClosure> }) =>
      cashService.updateClosure(id, closure),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
      toast.success('Cierre de caja finalizado correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al finalizar cierre: ${error.message}`);
    },
  });
}
