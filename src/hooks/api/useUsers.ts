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

      if (isAdmin || isEncargado) {
        try {
          const profileColumns = 'id, full_name, email, role, role_id, roles, active_store_id, logo_url, is_active, store_id, created_at, plan';

          // Fetch profiles and memberships separately to avoid "memberships column not found" cache errors
          let profilesQuery = supabase.from('profiles').select(profileColumns).order('full_name');
          if (isEncargado) {
            profilesQuery = profilesQuery.neq('role', 'admin');
          }

          let profilesRes = await profilesQuery;

          // Fallback if full column set fails
          if (profilesRes.error && profilesRes.error.code === '42703') {
             logger.warn('DATABASE', '[USEUSERS]_COLUMN_MISSING,_RETRYING_WITH_LIMITED_C')
             let retryQuery = supabase.from('profiles').select('id, full_name, email, is_active, store_id, active_store_id, created_at').order('full_name');
             if (isEncargado) {
               retryQuery = retryQuery.neq('role', 'admin');
             }
             profilesRes = await retryQuery as any;
          }

          if (profilesRes.error) {
            logger.error('DATABASE', 'FETCH_PROFILES_FAILED', { error: profilesRes.error });
            return [];
          }

          let membershipsRes;
          try {
            membershipsRes = await supabase.from('user_store_memberships')
              .select('id, user_id, store_id, role, status, created_at, updated_at, store:stores(id, name, address, is_active, created_at)');
          } catch (mErr) {
            logger.warn('DATABASE', '[USEUSERS]_MEMBERSHIPS_FETCH_FAILED_SILENTLY:', { data: mErr })
            membershipsRes = { data: [] };
          }

          const rawProfiles = (profilesRes.data || []) as Profile[];
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

          return await validateRPCArrayResponse(joinedData, profileSchema, isAdmin ? 'fetch_users_admin' : 'fetch_users_encargado');
        } catch (err) {
          logger.error('DATABASE', 'FETCH_USERS_FAILED', { err });
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

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No hay sesión activa. Por favor, inicia sesión de nuevo.');
      }

      // Call Next.js API route instead of direct RPC to handle auth.users via Service Role
      const response = await fetch('/api/users/managed-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear usuario');
      }

      return data;
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
      // Validate partial profile updates - this also converts "" to null for UUIDs via resilientUuid
      const updates = profileSchema.partial().parse(rawUpdates);

      // Omit virtual/related fields and sanitize payload
      const cleanUpdates: any = {};
      Object.entries(updates).forEach(([key, val]) => {
        // Skip virtual fields, Primary Key and immutable fields
        if (['memberships', 'roles', 'id', 'created_at'].includes(key)) return;

        // Hardening: Ensure empty strings are treated as null for UUID compatibility
        // and to avoid 22P02 errors in PostgREST
        if (val === '') {
          cleanUpdates[key] = null;
        } else {
          cleanUpdates[key] = val;
        }
      });

      return await withTableLogging('update', 'profiles', () => supabase
        .from('profiles')
        .update(cleanUpdates)
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
