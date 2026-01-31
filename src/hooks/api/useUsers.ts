import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { withLogging, withTableLogging } from './base';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import { profileSchema, managedCreateUserParamsSchema, manageUserMembershipsParamsSchema, uuidRegex } from '@/validation/schemas';
import type { Profile } from '@/types';
import { z } from 'zod';
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
        let profilesRes = await supabase.from('profiles').select(profileColumns).order('full_name');

        // Fallback if full column set fails (e.g. migration not fully applied)
        if (profilesRes.error && profilesRes.error.code === '42703') {
           console.warn('[useUsers] Column missing, retrying with limited columns');
           const retryRes = await supabase.from('profiles').select('id, full_name, email, role, is_active, created_at').order('full_name');
           profilesRes = retryRes as any;
        }

        const membershipsRes = await supabase.from('user_store_memberships').select('id, user_id, store_id, role, status, created_at, updated_at, store:stores(id, name, address, is_active, created_at)');

        if (profilesRes.error) {
          logger.error('DATABASE', 'FETCH_PROFILES_ADMIN_FAILED', { error: profilesRes.error });
          return [];
        }

        const rawProfiles = (profilesRes.data || []) as Profile[];
        // Use a more specific type to avoid dot-access errors with Record
        interface RawMembershipRow {
          id: string;
          user_id: string;
          store_id: string;
          role: string;
          status: string;
          store: any;
        }
        const allMemberships = (membershipsRes.data || []) as RawMembershipRow[];

        const joinedData = rawProfiles.map((profile) => ({
          ...profile,
          memberships: allMemberships.filter((m) => m.user_id === profile.id)
        }));

        return await validateRPCArrayResponse(joinedData, profileSchema, 'fetch_users_admin');
      }

      if (isEncargado) {
        try {
          const profileColumns = 'id, full_name, email, role, roles, active_store_id, logo_url, is_active, store_id, created_at';
          const storeColumns = 'id, name, address, logo_url, is_active, created_at';
          const membershipColumns = `id, user_id, store_id, role, status, created_at, updated_at, store:stores(${storeColumns})`;

          let memberProfilesRes = await supabase
            .from('profiles')
            .select(`${profileColumns}, memberships:user_store_memberships(${membershipColumns})`)
            .neq('role', 'admin')
            .order('full_name');

          // Fallback for missing columns
          if (memberProfilesRes.error && memberProfilesRes.error.code === '42703') {
             const retryRes = await supabase
                .from('profiles')
                .select(`id, full_name, email, role, is_active, memberships:user_store_memberships(${membershipColumns})`)
                .neq('role', 'admin')
                .order('full_name');
             memberProfilesRes = retryRes as any;
          }

          const { data: memberProfiles, error } = memberProfilesRes;

          if (error) {
            logger.error('DATABASE', 'FETCH_USERS_ENCARGADO_FAILED', { error });
            // Fallback: try with limited columns if the full set fails
            let fallbackRes = await supabase.from('profiles').select(profileColumns).neq('role', 'admin').order('full_name');
            if (fallbackRes.error && fallbackRes.error.code === '42703') {
                const retryFallbackRes = await supabase.from('profiles').select('id, full_name, email, role, is_active, created_at').neq('role', 'admin').order('full_name');
                fallbackRes = retryFallbackRes as any;
            }
            return await validateRPCArrayResponse(fallbackRes.data || [], profileSchema, 'fetch_users_encargado_fallback');
          }

          return await validateRPCArrayResponse(memberProfiles || [], profileSchema, 'fetch_users_encargado');
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
      const data = await withTableLogging<any[]>('select', 'user_store_memberships', () => supabase.from('user_store_memberships')
        .select('store_id, role')
        .eq('user_id', userId));
      return data?.map(d => ({
        store_id: d.store_id as string,
        roles: [d.role] as string[]
      })) || [];
    },
    enabled: !!userId,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rawParams: z.input<typeof managedCreateUserParamsSchema>) => {
      const params = managedCreateUserParamsSchema.parse(rawParams);
      const rpcName = 'managed_create_user';
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, z.object({
        success: z.boolean(),
        user_id: z.string().regex(uuidRegex),
        email: z.string().email(),
        message: z.string()
      }), rpcName);
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
    mutationFn: async (rawParams: { userId: string; memberships: any[] }) => {
      const params = manageUserMembershipsParamsSchema.parse({
        p_user_id: rawParams.userId,
        p_memberships: rawParams.memberships
      });
      const rpcName = 'manage_user_memberships';
      const data = await withLogging(rpcName, params, () => supabase.rpc(rpcName, params));
      return await validateRPCResponse(data, z.any(), rpcName);
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
    mutationFn: async ({ id, ...rawUpdates }: { id: string } & Partial<z.input<typeof profileSchema>>) => {
      // Validate partial profile updates
      const updates = profileSchema.partial().parse(rawUpdates);
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
