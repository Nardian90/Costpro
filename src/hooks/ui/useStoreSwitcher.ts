import { useAuthStore } from '@/store';
import { userService } from '@/services/user-service';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * FIX HIGH-001: Consolidated store switching logic.
 * Centralizes the store change flow with complete cache invalidation
 * to prevent stale data after switching stores.
 *
 * Usage:
 *   const { switchStore } = useStoreSwitcher();
 *   await switchStore(newStoreId);
 */
export function useStoreSwitcher() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const switchStore = async (storeId: string) => {
    if (!user) return;

    try {
      // 1. Optimistic local update
      updateUser({ activeStoreId: storeId, storeId: storeId });

      // 2. Persist to database (with membership validation from CRITICAL-001 fix)
      await userService.setActiveStore(user.id, storeId);

      // 3. Invalidate ALL store-dependent query keys
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['cost-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['stores'] });

      toast.success('Tienda cambiada exitosamente');
    } catch (error: any) {
      // FIX: Revert optimistic update on DB failure
      updateUser({ activeStoreId: user.activeStoreId, storeId: user.storeId });
      logger.error('DATABASE', 'SET_ACTIVE_STORE_FAILED', { storeId, error });
      toast.error(error.message || 'Error al cambiar de tienda');
    }
  };

  return { switchStore };
}
