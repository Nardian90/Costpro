import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { withLogging, withTableLogging } from './base';
import { validateRPCArrayResponse, validateRPCResponse } from '@/lib/rpc-validator';
import { profileSchema, managedCreateUserParamsSchema, manageUserMembershipsParamsSchema, uuidRegex } from '@/validation/schemas';
import type { Profile } from '@/types';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuthStore } from '@/store'; // F4-T02: para token en bulk assign

export function useUsers(currentUserId: string, isAdmin: boolean, isEncargado: boolean, activeStoreId?: string | null, isSuperAdmin = false) {
  return useQuery({
    queryKey: ['users', currentUserId, isAdmin, isEncargado, activeStoreId, isSuperAdmin],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      if (!currentUserId) {
        logger.warn('DATABASE', 'FETCH_USERS_MISSING_USER_ID');
        return [];
      }

      // MISIÓN ORGANIZACIONES (2026-10-26): admins y SuperAdmin consumen la
      // API route (server-side): rate limit, Zod, aislamiento por empresa
      // (superadmin = todas), columna Empresa/Organización y memb/responses
      // uniformes. La lectura directa de Supabase queda SOLO para encargados
      // (su alcance por membresía la resuelve RLS).
      if (isAdmin || isSuperAdmin || isEncargado) {
        try {
          if (isAdmin || isSuperAdmin) {
            const { supabase: sb } = await import('@/lib/supabaseClient');
            const { data: { session } } = await sb.auth.getSession();
            const token = session?.access_token;
            if (!token) return [];

            const res = await fetch('/api/users?limit=100', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              logger.error('DATABASE', 'FETCH_USERS_API_FAILED', { status: res.status });
              return [];
            }
            const body = (await res.json()) as { data: Profile[] };
            const apiProfiles = Array.isArray(body.data) ? body.data : [];
            return await validateRPCArrayResponse(apiProfiles, profileSchema, 'fetch_users_api');
          }

          // Camino encargado: lectura directa (aislada por RLS), como antes.
          const profileColumns = 'id, full_name, email, role, role_id, roles, active_store_id, logo_url, is_active, store_id, created_at, plan';

          // Fetch profiles and memberships separately to avoid "memberships column not found" cache errors
          // Iteración 12 (Q6): Filtrar deleted_at IS NULL (no mostrar users soft-deleted)
          let profilesQuery = supabase.from('profiles').select(profileColumns).is('deleted_at', null).order('full_name');
          if (isEncargado) {
            profilesQuery = profilesQuery.neq('role', 'admin');
          }

          let profilesRes = await profilesQuery;

          // Fallback if full column set fails
          if (profilesRes.error && profilesRes.error.code === '42703') {
             logger.warn('DATABASE', '[USEUSERS]_COLUMN_MISSING,_RETRYING_WITH_LIMITED_C')
             let retryQuery = supabase.from('profiles').select('id, full_name, email, is_active, store_id, active_store_id, created_at').is('deleted_at', null).order('full_name');
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

/**
 * COSTPRO 4 (fix/usuarios-en-desarrollo-admin): opciones de notificación.
 * `silentSuccess` suprime el toast verde del hook para que el FLUJO que combina
 * varias mutaciones (editar = memberships + perfil) emita UN único mensaje.
 */
interface UserMutationOptions {
  silentSuccess?: boolean;
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
      // COSTPRO 4: ÚNICO punto de éxito de la creación — un solo toast verde.
      toast.success('Usuario creado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // COSTPRO 4 (caso «resultado incierto»): un fallo de red no permite
      // afirmar que la creación fracasó — el backend pudo completarla.
      if (/fetch failed|failed to fetch|networkerror|load failed/i.test(message)) {
        toast.error('No se pudo contactar al servidor. Verifica tu conexión y comprueba si el usuario fue creado antes de reintentar, para evitar duplicados.');
        return;
      }
      // Un solo toast rojo con la causa real (el mensaje ya llega limpio desde
      // /api/users/managed-create — p. ej. «Ya existe un usuario con ese correo»).
      toast.error(`Error al crear usuario: ${message}`);
    }
  });
}

export function useManageUserMemberships(options?: UserMutationOptions) {
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
      // COSTPRO 4: silenciable — el flujo de edición combina esta mutación con
      // updateUser y emite UN solo verde al final (handleUserFormSubmit).
      if (!options?.silentSuccess) toast.success('Accesos actualizados correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al actualizar accesos: ${message}`);
    }
  });
}

/**
 * F4-T02: Bulk assign memberships via HTTP endpoint (transaccional con upsert).
 * Diferencia con useManageUserMemberships: este usa el endpoint dedicado
 * /api/users/[id]/memberships/bulk que hace upsert (no replace) y reporta
 * succeeded/failed counts. Útil cuando se asignan 10+ tiendas de una vez.
 */
export function useBulkAssignMemberships() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      assignments: Array<{ store_id: string; role: string; status?: 'active' | 'revoked' }>;
    }) => {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/users/${params.userId}/memberships/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ assignments: params.assignments }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error de conexión' }));
        throw new Error(err.message || err.error || 'Error en asignación bulk');
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-store-access'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
      queryClient.invalidateQueries({ queryKey: ['store-team'] });
      toast.success(`${result.affected} tienda(s) asignadas correctamente`);
      if (result.failed > 0) {
        toast.warning(`${result.failed} asignación(es) fallaron`);
      }
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Error en asignación bulk');
    },
  });
}

export function useUpdateUser(options?: UserMutationOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rawUpdates }: { id: string } & Partial<z.input<typeof profileSchema>>) => {
      // Iteración 12 (Q3): Llamar a PATCH /api/users/[id] en vez de UPDATE directo.
      // El RPC managed_update_user valida, ejecuta y audita atómicamente.
      const updates = profileSchema.partial().parse(rawUpdates);

      const cleanUpdates: any = {};
      Object.entries(updates).forEach(([key, val]) => {
        if (['memberships', 'roles', 'id', 'created_at'].includes(key)) return;
        if (val === '') {
          cleanUpdates[key] = null;
        } else {
          cleanUpdates[key] = val;
        }
      });

      // FIX-MISIÓN-ROLES (2026-10-21): este PATCH iba SIN header Authorization.
      // withRole('admin') → getServerSession es fail-closed desde SEC-024 y SOLO
      // acepta Bearer: sin header respondía 401 {error:'No autorizado'} aunque
      // el llamador fuera admin legítimo (el sintoma «la UI muestra el cambio
      // pero da error» se debe a que manage_user_memberships —RPC directa con
      // JWT— corre ANTES y sí persiste). Patrón idéntico a useCreateUser y
      // handleToggleUserStatus: sesión FRESCA de Supabase (no token cacheado).
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Sesión inválida o expirada. Inicia sesión de nuevo.');
      }

      const response = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(cleanUpdates),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText, message: undefined }));
        // Errores diferenciados (misión §4.B): sesión inválida, permisos
        // insuficientes, usuario inexistente y fallo de persistencia — sin
        // exponer secretos ni detalles internos del servidor.
        if (response.status === 401) {
          throw new Error(err.message || 'Sesión inválida o expirada. Inicia sesión de nuevo.');
        }
        if (response.status === 403) {
          // Mensaje SIEMPRE específico: el genérico «No autorizado» del backend
          // ocultaba la causa real al usuario (misión §4.C).
          const detail = typeof err.error === 'string' && err.error && !['No autorizado', 'Forbidden'].includes(err.error)
            ? ` (${err.error})`
            : '';
          throw new Error(`Permisos insuficientes para actualizar este usuario${detail}.`);
        }
        if (response.status === 404) {
          throw new Error('Usuario no encontrado.');
        }
        if (response.status === 400 && typeof err.error === 'string' && err.error.includes('SELF_DEACTIVATE')) {
          throw new Error('No puedes desactivar tu propia cuenta.');
        }
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // COSTPRO 4: silenciable — ver useManageUserMemberships.
      if (!options?.silentSuccess) toast.success('Usuario actualizado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // FIX-MISIÓN-ROLES: un fallo de red no permite afirmar que la
      // actualización fracasó — el backend pudo completarla.
      if (/fetch failed|failed to fetch|networkerror|load failed/i.test(message)) {
        toast.error('No se pudo contactar al servidor. Verifica tu conexión y comprueba el estado real del usuario antes de reintentar, para no repetir una operación ya aplicada.');
        return;
      }
      toast.error(`Error al actualizar usuario: ${message}`);
      // FIX-MISIÓN-ROLES: si el PATCH falla, re-consultar el estado real del
      // usuario para que la lista/modal no muestren un rol que el servidor
      // no confirmó (coherencia UI ↔ servidor; la mutación de memberships,
      // que corre antes, ya pudo persistir parte del cambio).
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}
