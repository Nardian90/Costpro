/**
 * useMovementCounts — Contadores exactos por grupo de tipo de movimiento
 * (§13 RESUMEN DE MOVIMIENTOS y §24 de Trazabilidad Global).
 *
 * Cada contador es una consulta `head: true, count: 'exact'` contra la
 * MISMA fuente de verdad (`stock_movements`) con los MISMOS filtros activos
 * (almacén + período + producto). Los contadores NUNCA ignoran los filtros
 * activos (§24) y son independientes del grupo de tipo seleccionado, para
 * que el usuario vea cuántos movimientos hay de cada tipo en el período.
 *
 * No inventa tipos: los grupos provienen de `GRUPOS_FILTRO_MOVIMIENTO`,
 * que solo contiene valores reales del enum `movement_type` en BD.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { withTableLogging, getCleanStoreId } from './base';
import { GRUPOS_FILTRO_MOVIMIENTO } from '@/lib/inventory/movementPresentation';

export interface MovementCountsResult {
  /** Conteo por id de grupo; 'todos' = suma de todos los grupos. */
  porGrupo: Record<string, number>;
  /** true si alguna consulta falló (la UI informa sin ocultar). */
  hasError: boolean;
}

export function useMovementCounts(
  storeId?: string | null,
  dateFrom?: string,
  dateTo?: string,
  productId?: string | null
) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['movement-counts', cleanStoreId, dateFrom ?? null, dateTo ?? null, productId ?? null],
    queryFn: async (): Promise<MovementCountsResult> => {
      const porGrupo: Record<string, number> = {};
      let hasError = false;

      await Promise.all(
        GRUPOS_FILTRO_MOVIMIENTO.filter(g => g.tipos.length > 0).map(async grupo => {
          let q = supabase
            .from('stock_movements')
            .select('id', { count: 'exact', head: true })
            .in('movement_type', grupo.tipos);
          if (cleanStoreId) q = q.eq('store_id', cleanStoreId);
          if (dateFrom) q = q.gte('created_at', dateFrom);
          if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999');
          if (productId) q = q.eq('product_id', productId);

          try {
            const res = await q;
            if (res.error) throw res.error;
            porGrupo[grupo.id] = res.count ?? 0;
          } catch {
            // Fallo individual: el grupo queda en 0 y se marca el error
            // global — la UI informa; nunca se oculta el problema.
            hasError = true;
            porGrupo[grupo.id] = 0;
          }
        })
      );

      porGrupo['todos'] = Object.entries(porGrupo)
        .filter(([id]) => id !== 'todos')
        .reduce((sum, [, n]) => sum + n, 0);

      return { porGrupo, hasError };
    },
    enabled: !!storeId,
    staleTime: 15 * 1000,
  });
}
