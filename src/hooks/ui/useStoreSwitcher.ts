import { useRef, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useCartStore } from '@/store/cart';
import { userService } from '@/services/user-service';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * FIX HIGH-001: Consolidated store switching logic.
 * Centralizes the store change flow with complete cache invalidation
 * to prevent stale data after switching stores.
 *
 * V2.12.41 (H-023): isSwitching global flag para bloquear operaciones durante switch
 * V2.12.41 (H-025): confirmación antes de limpiar carrito con items
 */
export function useStoreSwitcher() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  // FIX-RES-3: Concurrency guard to prevent double-click / rapid switching
  const isSwitchingRef = useRef(false);

  // V2.12.41 H-023: Flag global para bloquear operaciones durante switch
  // Se setea en el auth store para que otros componentes puedan verificarlo
  const setGlobalSwitching = (value: boolean) => {
    useAuthStore.setState({ isSwitchingStore: value });
  };

  const switchStore = useCallback(async (storeId: string, options?: { skipCartConfirm?: boolean }) => {
    if (!user) return;

    // FIX-RES-3: Prevent concurrent switches
    if (isSwitchingRef.current) {
      logger.warn('UI', 'STORE_SWITCH_IN_PROGRESS', { attemptedStoreId: storeId });
      return;
    }

    // V2.12.41 H-025: Confirmar antes de limpiar carrito con items
    const cartStore = useCartStore.getState();
    if (!options?.skipCartConfirm && cartStore.storeId && cartStore.storeId !== storeId && cartStore.items.length > 0) {
      const confirmed = window.confirm(
        `Tienes ${cartStore.items.length} producto(s) en el carrito de la tienda actual. ` +
        `Si cambias de tienda, el carrito se limpiará. ¿Continuar?`
      );
      if (!confirmed) return;
    }

    isSwitchingRef.current = true;
    setGlobalSwitching(true);

    try {
      // 1. Clear cart if switching to a different store
      useCartStore.getState().clearCartOnStoreSwitch(storeId);

      // 2. Optimistic local update
      updateUser({ activeStoreId: storeId, storeId: storeId });

      // 3. Persist to database (with membership validation from CRITICAL-001 fix)
      await userService.setActiveStore(user.id, storeId);

      // 4. Invalidate ALL store-dependent query keys
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
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['ofertas'] });
      queryClient.invalidateQueries({ queryKey: ['kardex'] });
      queryClient.invalidateQueries({ queryKey: ['taxes'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });

      toast.success('Tienda cambiada exitosamente');
    } catch (error: unknown) {
      // FIX: Revert optimistic update on DB failure
      updateUser({ activeStoreId: user.activeStoreId, storeId: user.storeId });
      logger.error('DATABASE', 'SET_ACTIVE_STORE_FAILED', { storeId, error });
      const message = error instanceof Error ? error.message : 'Error al cambiar de tienda';
      toast.error(message);
    } finally {
      isSwitchingRef.current = false;
      setGlobalSwitching(false);
    }
  }, [user, updateUser, queryClient]);

  return { switchStore, isSwitching: isSwitchingRef };
}
