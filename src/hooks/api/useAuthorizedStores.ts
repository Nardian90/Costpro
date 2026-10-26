import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { isAdminLevel } from '@/lib/roles';

/**
 * useAuthorizedStores — fuente ÚNICA de opciones de tienda autorizadas.
 *
 * MISIÓN PI-SUPERADMIN (2026-10-26): el selector de «Nuevo Inventario Físico»
 * construía sus opciones SOLO con user.memberships. El SuperAdmin de
 * plataforma no lleva membresías POR DISEÑO (§6 de la migración
 * 20260826120000) → «Sin Tiendas Autorizadas» aunque la RLS lo autorice a
 * ver todas las tiendas (is_admin() incluye 'superadmin'; stores_tenant_select
 * lleva bypass is_superadmin() desde 20261026160000).
 *
 * Regla de autorización (espejo de la RLS — la consulta va con el token del
 * usuario, así que la base de datos SIEMPRE es la barrera final):
 *   - Nivel administrativo (admin | superadmin): tiendas ACTIVAS del alcance
 *     administrativo que la RLS le devuelva (superadmin: todas; admin
 *     ordinario: las de su tenant bajo USE_TENANT_RLS).
 *   - Roles operativos (manager/encargado/clerk/warehouse/usuario/costo):
 *     solo tiendas con membresía ACTIVA (doble barrera: filtro .in + RLS).
 *
 * Estados diferenciados (requisito de la misión §5.4):
 *   - isLoading: carga en curso (NO es «sin tiendas»).
 *   - error: fallo de red/RPC/RLS — se propaga para que la UI muestre error
 *     y reintento, jamás «Sin tiendas autorizadas».
 *   - data === []: ausencia LEGÍTIMA de tiendas autorizadas.
 *
 * Reutilizable: cualquier modal/formulario que necesite el selector de
 * tiendas autorizadas (mismo queryKey → caché compartida entre vistas).
 */

export interface AuthorizedStoreOption {
  id: string;
  name: string;
}

const MAX_ADMIN_STORES = 200;

export function useAuthorizedStores() {
  const { user } = useAuthStore();
  const isAdmin = isAdminLevel(user?.role);

  const membershipIds = useMemo(
    () =>
      (user?.memberships || [])
        .filter((m) => m.status === 'active')
        .map((m) => m.store_id)
        .filter((id): id is string => !!id),
    [user]
  );

  return useQuery<AuthorizedStoreOption[]>({
    queryKey: ['authorized-stores', isAdmin ? 'admin-level' : membershipIds.join(',')],
    queryFn: async () => {
      // Nivel administrativo (admin|superadmin): tiendas activas del alcance
      // administrativo. La RLS (stores_tenant_select) define el alcance real:
      // superadmin ve todas; admin ordinario, las de su tenant con flag RLS.
      if (isAdmin) {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name')
          .eq('is_active', true)
          .eq('is_archived', false)
          .order('name')
          .limit(MAX_ADMIN_STORES);
        if (error) throw new Error(error.message);
        return (data || []).map((s) => ({ id: s.id as string, name: s.name as string }));
      }

      // Roles operativos: SOLO tiendas con membresía activa (RLS refuerza).
      if (membershipIds.length === 0) return [];
      const { data, error } = await supabase
        .from('stores')
        .select('id, name')
        .in('id', membershipIds)
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return (data || []).map((s) => ({ id: s.id as string, name: s.name as string }));
    },
    enabled: !!user,
    staleTime: 120_000,
  });
}
