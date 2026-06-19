'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

/**
 * Monitors whether the user's active store still exists.
 * If another admin soft-deletes the store while the user is active,
 * this hook detects it and forces a store re-selection.
 *
 * Uses a polling approach (every 30s) + Supabase Realtime subscription
 * for near-instant detection when available.
 */
export function useStoreDeletedMonitor() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  const hasWarnedRef = useRef(false);

  useEffect(() => {
    if (!user?.activeStoreId || !user?.id) return;

    const storeId = user.activeStoreId;

    // Poll every 30 seconds to check if store is still active
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('stores')
          .select('is_active')
          .eq('id', storeId)
          .single();

        if (data && !data.is_active && !hasWarnedRef.current) {
          hasWarnedRef.current = true;
          toast.error('La tienda actual ha sido eliminada', {
            description: 'Serás redirigido para seleccionar otra tienda.',
            duration: 8000,
          });

          // Clear active store
          updateUser({ activeStoreId: undefined, storeId: undefined });

          // Invalidate all store-dependent data
          queryClient.invalidateQueries({ queryKey: ['stores'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
      } catch {
        // Store might not exist at all (hard deleted edge case)
      }
    }, 30_000);

    // Also subscribe to Supabase Realtime for store changes
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`store-monitor-${storeId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'stores',
            filter: `id=eq.${storeId}`,
          },
          (payload) => {
            if (payload.new && !(payload.new as any).is_active && !hasWarnedRef.current) {
              hasWarnedRef.current = true;
              toast.error('La tienda actual ha sido eliminada', {
                description: 'Serás redirigido para seleccionar otra tienda.',
                duration: 8000,
              });

              updateUser({ activeStoreId: undefined, storeId: undefined });
              queryClient.invalidateQueries({ queryKey: ['stores'] });
              queryClient.invalidateQueries({ queryKey: ['products'] });
              queryClient.invalidateQueries({ queryKey: ['transactions'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['inventory'] });
            }
          }
        )
        .subscribe();
    } catch {
      // Realtime may not be configured — polling is the fallback
    }

    return () => {
      clearInterval(pollInterval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.activeStoreId, user?.id, updateUser, queryClient]);
}
