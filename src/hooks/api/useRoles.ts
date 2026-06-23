import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { withTableLogging } from './base';
import { Role } from '@/types';
import { toast } from 'sonner';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('name');
      if (error) {
        logger.error('DATABASE', 'FETCH_ROLES_FAILED', { error });
        throw error;
      }
      return data as Role[];
    }
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newRole: Partial<Role>) => {
      return await withTableLogging('insert', 'roles', () =>
        supabase.from('roles').insert(newRole).select().single()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Rol creado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al crear rol: ${message}`);
    }
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Role> & { id: string }) => {
      return await withTableLogging('update', 'roles', () =>
        supabase.from('roles').update(updates).eq('id', id).select().single()
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Rol actualizado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al actualizar rol: ${message}`);
    }
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // FIX-BUG-LOG-015: Destructure error from count query and check before proceeding;
      // a failed query returns null count, which would bypass the guard.
      const { count, error: countError } = await supabase.from('profiles').select(undefined, { count: 'exact', head: true }).eq('role_id', id);
      if (countError) {
        logger.error('DATABASE', 'CHECK_ROLE_USAGE_FAILED', { error: countError, roleId: id });
        throw new Error('Error al verificar si el rol está en uso. Inténtalo de nuevo.');
      }
      if (count && count > 0) {
        throw new Error('No se puede eliminar un rol que está siendo utilizado por usuarios.');
      }

      return await withTableLogging('delete', 'roles', () =>
        supabase.from('roles').delete().eq('id', id)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Rol eliminado correctamente');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  });
}
