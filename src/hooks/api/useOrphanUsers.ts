/**
 * Iteración 12 (Q4): Hooks para gestión de huérfanos y auditoría de usuarios.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface OrphanUser {
  auth_user_id: string;
  email: string | null;
  detected_at: string;
  log_status: string;
}

export function useOrphanUsers(enabled = true) {
  return useQuery({
    queryKey: ['orphan-users'],
    queryFn: async (): Promise<{ orphans: OrphanUser[]; count: number }> => {
      const response = await fetch('/api/users/orphans');
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      return await response.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useReconcileOrphan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      authUserId,
      action,
      reason,
    }: {
      authUserId: string;
      action: 'create_profile' | 'delete_auth_user' | 'ignore';
      reason: string;
    }) => {
      const response = await fetch(`/api/users/${authUserId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      return await response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orphan-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      const actionLabel = {
        create_profile: 'Profile creado',
        delete_auth_user: 'Auth user eliminado',
        ignore: 'Ignorado',
      }[variables.action];
      toast.success(`Huérfano reconciliado: ${actionLabel}`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error al reconciliar: ${message}`);
    },
  });
}

export interface UserAuditEntry {
  id: string;
  created_at: string;
  performed_by: string | null;
  performed_by_name: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export function useUserAuditHistory(userId: string | null | undefined, limit = 100) {
  return useQuery({
    queryKey: ['user-audit-history', userId, limit],
    queryFn: async (): Promise<UserAuditEntry[]> => {
      if (!userId) return [];
      const response = await fetch(`/api/users/${userId}/audit-history?limit=${limit}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.history || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
