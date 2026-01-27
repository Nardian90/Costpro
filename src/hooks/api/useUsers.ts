import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { withLogging, withTableLogging } from './base';
import type { Profile } from '@/types';
import { toast } from 'sonner';

export function useUsers(currentUserId: string, isAdmin: boolean, isEncargado: boolean, activeStoreId?: string | null) {
  return useQuery({
    queryKey: ['users', currentUserId, isAdmin, isEncargado, activeStoreId],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      if (!currentUserId) {
        logger.warn('DATABASE', 'FETCH_USERS_MISSING_USER_ID');
        return [];
      }

      if (isAdmin) {
        const profileColumns = 'id, full_name, email, role, roles, active_store_id, logo_url, is_active, store_id, created_at';
        let profilesRes: any = await supabase.from('profiles').select(profileColumns).order('full_name');

        // Fallback if full column set fails (e.g. migration not fully applied)
        if (profilesRes.error && profilesRes.error.code === '42703') {
           console.warn('[useUsers] Column missing, retrying with limited columns');
           profilesRes = await supabase.from('profiles').select('id, full_name, email, role, is_active').order('full_name');
        }

        const membershipsRes = await supabase.from('user_store_memberships').select('id, user_id, store_id, role, status, created_at, updated_at, store:stores(id, name, address, is_active, created_at)');

        if (profilesRes.error) {
          logger.error('DATABASE', 'FETCH_PROFILES_ADMIN_FAILED', { error: profilesRes.error });
          return [];
        }

        const profiles = (profilesRes.data || []) as any[];
        const allMemberships = (membershipsRes.data || []) as any[];

        return profiles.map((profile: any) => {
          const userMemberships = allMemberships.filter((m: any) => m.user_id === profile.id).map((m: any) => ({
            ...m,
            store: Array.isArray(m.store) ? m.store[0] : m.store
          }));
          return {
            ...profile,
            memberships: userMemberships
          };
        }) as unknown as Profile[];
      }

      if (isEncargado) {
        try {
          const { data: managedStores } = await supabase
            .from('user_store_memberships')
            .select('store_id')
            .eq('user_id', currentUserId)
            .in('role', ['encargado', 'manager'])
            .eq('status', 'active');

          const storeIds = (managedStores || []).map(ms => ms.store_id);
          if (storeIds.length === 0) return [];

          const profileColumns = 'id, full_name, email, role, roles, active_store_id, logo_url, is_active, store_id, created_at';
          const storeColumns = 'id, name, address, logo_url, is_active, created_at';
          const membershipColumns = `id, user_id, store_id, role, status, created_at, updated_at, store:stores(${storeColumns})`;

          let memberProfilesRes: any = await supabase
            .from('profiles')
            .select(`${profileColumns}, memberships:user_store_memberships!inner(${membershipColumns})`)
            .in('memberships.store_id', storeIds)
            .order('full_name');

          // Fallback for missing columns
          if (memberProfilesRes.error && memberProfilesRes.error.code === '42703') {
             memberProfilesRes = await supabase
                .from('profiles')
                .select(`id, full_name, email, role, is_active, memberships:user_store_memberships!inner(${membershipColumns})`)
                .in('memberships.store_id', storeIds)
                .order('full_name');
          }

          const { data: memberProfiles, error } = memberProfilesRes;

          if (error) {
            logger.error('DATABASE', 'FETCH_USERS_ENCARGADO_FAILED', { error });
            // Fallback: try with limited columns if the full set fails
            let fallbackRes: any = await supabase.from('profiles').select(profileColumns).order('full_name');
            if (fallbackRes.error && fallbackRes.error.code === '42703') {
                fallbackRes = await supabase.from('profiles').select('id, full_name, email, role, is_active').order('full_name');
            }
            return (fallbackRes.data || []) as Profile[];
          }

          return (memberProfiles || []).map((p: any) => ({
            ...p,
            memberships: (p.memberships || []).map((m: any) => ({
              ...m,
              store: Array.isArray(m.store) ? m.store[0] : m.store
            }))
          })) as unknown as Profile[];
        } catch (err) {
          logger.error('DATABASE', 'FETCH_USERS_ENCARGADO_CRASH', { err });
          return [];
        }
      }

      return [];
    },
    enabled: !!currentUserId,
  });
}

export function useUserStoreAccess(userId?: string) {
  return useQuery({
    queryKey: ['user-store-access', userId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return [];
      const data = await withTableLogging('select', 'user_store_memberships', () => supabase.from('user_store_memberships')
        .select('store_id, role')
        .eq('user_id', userId));
      return (data as any[])?.map(d => ({
        store_id: d.store_id,
        roles: [d.role]
      })) || [];
    },
    enabled: !!userId,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { p_email: string; p_full_name: string; p_role: string; p_store_id: string; p_memberships?: any[] }) => {
      const rpcName = 'managed_create_user';
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario creado correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al crear usuario: ${error.message}`);
    }
  });
}

export function useManageUserMemberships() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, memberships }: { userId: string; memberships: any[] }) => {
      const rpcName = 'manage_user_memberships';
      const params = { p_user_id: userId, p_memberships: memberships };
      return await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Accesos actualizados correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar accesos: ${error.message}`);
    }
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Profile>) => {
      return await withTableLogging('update', 'profiles', () => supabase
        .from('profiles')
        .update(updates)
        .eq('id', id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario actualizado correctamente');
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar usuario: ${error.message}`);
    }
  });
}
