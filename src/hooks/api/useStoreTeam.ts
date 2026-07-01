'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

/**
 * F2-T05: Hook para obtener y gestionar los usuarios asignados a una tienda específica.
 *
 * Retorna la lista de usuarios con su rol y estado dentro de la tienda, más
 * acciones inline (cambiar rol, remover de la tienda). Esto habilita la vista
 * inversa: desde la tienda, ver y administrar quiénes tienen acceso.
 *
 * Diferencia con useUsers: useUsers retorna todos los usuarios del tenant (vista
 * global de admin); useStoreTeam filtra por store_id específico (vista por tienda).
 *
 * FIX-F2-T05: Originalmente intentaba un join `profile:profiles!fk(...)` vía
 * Supabase, pero el nombre exacto de la foreign key no es estable y RLS en
 * `profiles` puede bloquear el join silenciosamente devolviendo null.
 * Solución: misma estrategia que useUsers.ts — dos queries separadas
 * (memberships + profiles) y join client-side por user_id. Probado y robusto.
 *
 * Query key: ['store-team', storeId] — invalidada cuando cambian memberships.
 */
export type StoreTeamMember = {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'encargado' | 'manager' | 'clerk' | 'warehouse' | 'usuario' | 'costo';
  status: 'active' | 'revoked';
  created_at: string;
  logo_url?: string | null;
  is_active?: boolean; // is_active del profile (si el usuario está activo globalmente)
};

export function useStoreTeam(storeId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<StoreTeamMember[]>({
    queryKey: ['store-team', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      if (!storeId || !supabase) return [];

      // FIX-F2-T05: Estrategia de dos queries (igual que useUsers.ts).
      // 1. Traer todas las memberships de esta tienda.
      // 2. Traer los profiles de los user_ids encontrados.
      // 3. Join client-side por user_id.
      // Esto evita depender del nombre exacto de la foreign key y evita
      // que RLS en profiles bloquee el join silenciosamente.

      // Paso 1: memberships de la tienda
      const { data: memberships, error: mError } = await supabase
        .from('user_store_memberships')
        .select('id, user_id, role, status, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (mError) {
        logger.warn('DATABASE', 'STORE_TEAM_MEMBERSHIPS_FAILED', { storeId, error: mError.message });
        throw mError;
      }

      if (!memberships || memberships.length === 0) {
        return [];
      }

      // Paso 2: profiles de los user_ids
      const userIds = memberships.map((m: any) => m.user_id).filter(Boolean);
      let profilesMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const { data: profiles, error: pError } = await supabase
          .from('profiles')
          .select('id, full_name, email, logo_url, is_active')
          .in('id', userIds);

        if (pError) {
          // No abortar — devolver memberships con datos parciales (sin profile)
          logger.warn('DATABASE', 'STORE_TEAM_PROFILES_FAILED', { storeId, error: pError.message });
        } else if (profiles) {
          // Indexar por id para join O(1)
          for (const p of profiles) {
            profilesMap[p.id] = p;
          }
        }
      }

      // Paso 3: join client-side
      return (memberships as any[]).map((m: any) => {
        const profile = profilesMap[m.user_id];
        return {
          membership_id: m.id,
          user_id: m.user_id,
          full_name: profile?.full_name || 'Usuario sin nombre',
          email: profile?.email || '',
          role: m.role,
          status: m.status,
          created_at: m.created_at,
          logo_url: profile?.logo_url ?? null,
          is_active: profile?.is_active ?? true,
        } as StoreTeamMember;
      });
    },
    staleTime: 15_000,
  });

  // Mutación para cambiar el rol de un miembro inline
  const updateRoleMutation = useMutation({
    mutationFn: async ({ membershipId, newRole }: { membershipId: string; newRole: StoreTeamMember['role'] }) => {
      if (!supabase) throw new Error('Supabase no disponible');
      const { error } = await supabase
        .from('user_store_memberships')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-team', storeId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
    },
  });

  // Mutación para remover un usuario de la tienda (revocar membership, no eliminar usuario)
  const removeMemberMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!supabase) throw new Error('Supabase no disponible');
      const { error } = await supabase
        .from('user_store_memberships')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-team', storeId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
    },
  });

  return {
    members: data ?? [],
    isLoading,
    error,
    updateRole: async (membershipId: string, newRole: StoreTeamMember['role']) => {
      await updateRoleMutation.mutateAsync({ membershipId, newRole });
    },
    removeMember: removeMemberMutation.mutateAsync,
    isUpdatingRole: updateRoleMutation.isPending,
    isRemoving: removeMemberMutation.isPending,
  };
}
