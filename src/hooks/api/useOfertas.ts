/**
 * @file React Query hooks for Ofertas Comerciales CRUD + PDF export.
 * @description Provides typed data-fetching and mutation hooks
 * for the Ofertas feature using the project's API routes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import type { Oferta, OfertaStatus } from '@/types/oferta';
import type { OfertaContract } from '@/contracts/oferta';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfertaListResponse {
  data: Oferta[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Error de red' }));
    throw new Error(body.error || `Error ${res.status}`);
  }

  return res.json();
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const ofertaKeys = {
  all: (storeId: string) => ['ofertas', storeId] as const,
  list: (storeId: string, filters?: { status?: OfertaStatus; search?: string; page?: number }) =>
    ['ofertas', storeId, 'list', filters] as const,
  detail: (id: string) => ['ofertas', 'detail', id] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Fetch paginated list of ofertas for the active store (server-side search + pagination) */
export function useOfertasList(filters?: { status?: OfertaStatus; search?: string; page?: number; pageSize?: number }) {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  return useQuery<OfertaListResponse>({
    queryKey: ofertaKeys.list(storeId, filters),
    queryFn: () => apiFetch<OfertaListResponse>(`/api/ofertas?${params.toString()}`),
    enabled: !!storeId,
    staleTime: 30_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

/** Fetch a single oferta by ID */
export function useOfertaDetail(ofertaId: string | null) {
  return useQuery<{ data: Oferta }>({
    queryKey: ofertaKeys.detail(ofertaId || ''),
    queryFn: () => apiFetch<{ data: Oferta }>(`/api/ofertas/${ofertaId}`),
    enabled: !!ofertaId,
    staleTime: 30_000,
  });
}

/** Create a new oferta */
export function useCreateOferta() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  return useMutation({
    mutationFn: (data: Partial<OfertaContract>) =>
      apiFetch<{ data: Oferta }>('/api/ofertas', {
        method: 'POST',
        body: JSON.stringify({ ...data, store_id: storeId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ofertaKeys.all(storeId) });
      toast.success('Oferta creada exitosamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al crear oferta: ${error.message}`);
    },
  });
}

/** Update an existing oferta */
export function useUpdateOferta() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OfertaContract> & { id: string }) =>
      apiFetch<{ data: Oferta }>(`/api/ofertas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ofertaKeys.all(storeId) });
      queryClient.invalidateQueries({ queryKey: ofertaKeys.detail(variables.id) });
      toast.success('Oferta actualizada exitosamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar oferta: ${error.message}`);
    },
  });
}

/** Soft-delete an oferta */
export function useDeleteOferta() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  return useMutation({
    mutationFn: (ofertaId: string) =>
      apiFetch<{ success: boolean }>(`/api/ofertas/${ofertaId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ofertaKeys.all(storeId) });
      toast.success('Oferta eliminada');
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar oferta: ${error.message}`);
    },
  });
}

/** Export an oferta as PDF (by ID — from saved oferta) */
export function useExportOfertaPdf() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  return useMutation({
    mutationFn: async (params: string | { id: string; numero?: string }) => {
      const ofertaId = typeof params === 'string' ? params : params.id;
      const numero = typeof params === 'string' ? undefined : params.numero;
      const token = useAuthStore.getState().token;
      const res = await fetch('/api/ofertas/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ofertaId, store_id: storeId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error de red' }));
        throw new Error(body.error || `Error ${res.status}`);
      }

      // Download the PDF
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oferta-${numero || 'comercial'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('PDF exportado exitosamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al exportar PDF: ${error.message}`);
    },
  });
}
