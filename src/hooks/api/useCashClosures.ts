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
  return useMutation({
    mutationFn: async ({ id, closure }: { id: string; closure: Partial<CashClosure> }) => {
      // Iteración 11.4: si status='cerrado', usar RPC close_cash_shift via API
      if (closure.status === 'cerrado') {
        const response = await fetch('/api/cash-closures/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closure_id: id,
            declared_cash: closure.declared_cash || 0,
            declared_vouchers: closure.declared_vouchers || 0,
            notes: closure.notes || null,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }
        return response.json();
      }
      // Para updates no-cierre (declarar fondos en turno pendiente), usar path viejo
      return cashService.updateClosure(id, closure);
    },
    onSuccess: () => {
      // Iteración 11.4: audit ahora atómico en RPC — no llamar logCashClosureFinalized
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
