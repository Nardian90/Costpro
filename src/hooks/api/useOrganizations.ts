'use client';

/**
 * MISIÓN ORGANIZACIONES (2026-10-26) — hooks de datos.
 *
 * Todas las lecturas pasan por /api/organizations (server-side: rate limit,
 * Zod, alcance por rol). El cliente NUNCA consulta `tenants` directamente:
 * el alcance (superadmin = todas, admin = la suya) lo resuelve el servidor.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface OrganizationRow {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  plan: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stores_total: number;
  stores_active: number;
  users: number;
}

export interface OrganizationsSummary {
  organizations: number;
  active_organizations: number;
  stores: number;
  assigned_users: number;
  unassigned_users: number;
  scope: 'all' | 'own';
}

export interface OrganizationListResponse {
  data: OrganizationRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: OrganizationsSummary;
}

export interface OrganizationDetail {
  organization: OrganizationRow & {
    subscription_status: string;
    custom_domain: string | null;
    owner_name: string | null;
  };
  stores: Array<{ id: string; name: string; slug: string | null; is_active: boolean; is_archived: boolean; created_at: string }>;
  users: Array<{ id: string; full_name: string; email: string; role: string; is_active: boolean }>;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { supabase } = await import('@/lib/supabaseClient');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('No hay sesión activa.');
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
}

export function useOrganizations(params: {
  search?: string;
  status?: 'active' | 'inactive';
  hasStores?: 'true' | 'false';
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.hasStores) qs.set('has_stores', params.hasStores);
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 50));

  return useQuery<OrganizationListResponse>({
    queryKey: ['organizations', params.search, params.status, params.hasStores, params.page, params.limit],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await authedFetch(`/api/organizations?${qs.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudieron cargar las organizaciones');
      }
      return res.json();
    },
  });
}

export function useOrganizationDetail(orgId: string | null) {
  return useQuery<OrganizationDetail>({
    queryKey: ['organization-detail', orgId],
    staleTime: 30 * 1000,
    enabled: !!orgId,
    queryFn: async () => {
      const res = await authedFetch(`/api/organizations/${orgId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo cargar la organización');
      }
      return res.json();
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; is_active?: boolean }) => {
      const res = await authedFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo crear la organización');
      return body;
    },
    onSuccess: () => {
      toast.success('Organización creada');
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; is_active?: boolean }) => {
      const res = await authedFetch(`/api/organizations/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name, is_active: input.is_active }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo actualizar la organización');
      return body;
    },
    onSuccess: () => {
      toast.success('Organización actualizada');
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-detail'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const res = await authedFetch(`/api/organizations/${orgId}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 con dependencias reales: mensaje accionable para el operador.
        if (res.status === 409 && body.dependencies) {
          const d = body.dependencies;
          throw new Error(
            `No se puede eliminar: tiene ${d.stores} tienda(s) y ${d.users} usuario(s) asignados. ${body.hint || ''}`
          );
        }
        throw new Error(body.error || 'No se pudo eliminar la organización');
      }
      return body;
    },
    onSuccess: () => {
      toast.success('Organización eliminada');
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAssignUserOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      organizationId: string | null;
      confirmRemovals?: boolean;
    }) => {
      const res = await authedFetch(`/api/users/${input.userId}/assign-organization`, {
        method: 'POST',
        body: JSON.stringify({
          organization_id: input.organizationId,
          confirm_removals: input.confirmRemovals ?? false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo asignar la organización');
      return body as {
        success: boolean;
        applied?: boolean;
        requires_confirmation?: boolean;
        reason?: string;
        memberships_to_remove?: Array<{ store_id: string; store_name: string; role: string }>;
        removed_memberships?: number;
      };
    },
    onSuccess: (data) => {
      if (data.applied) {
        toast.success(
          data.removed_memberships
            ? `Empresa asignada (${data.removed_memberships} membresía(s) de otra empresa retiradas)`
            : 'Empresa asignada'
        );
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
        queryClient.invalidateQueries({ queryKey: ['organization-detail'] });
      }
      // requires_confirmation NO invalida nada: el operador aún no decidió.
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
