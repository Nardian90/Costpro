'use client';

/**
 * @file React Query hooks for Product Cost Sheet (FC) data fetching and mutations.
 * @description Provides typed data-fetching and mutation hooks for a single
 * product's FC using the project's API routes.
 *
 * FC-USR-TEMPLATE (2026-11-10): useGenerateFCFromTemplate conecta un producto
 * con una Ficha de Costo generada desde una plantilla guardada por el usuario
 * (cost_sheet_templates — «Mis Plantillas Guardadas en COSTPRO»).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import type { ProductCostSheetContract, ProductFCStatus } from '@/contracts/product-cost-sheet';
import type { CostSheetTemplateRecord } from '@/services/cost-sheet-template-service';
import { mergeFCTemplateOptions } from '@/lib/integration/fc-system-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape returned by GET /api/product-cost-sheets */
interface ProductCostSheetResponse {
  data: ProductCostSheetContract & {
    fc_status?: ProductFCStatus;
    needs_template?: boolean;
    needs_calculation?: boolean;
    message?: string;
    product_info?: {
      name: string;
      cost_price: number;
      price: number;
    };
  };
}

/** Payload for saving a product cost sheet */
export interface SaveProductCostSheetPayload {
  product_id: string;
  store_id: string;
  template_id: string;
  modalidad: string;
  calculated_data: Record<string, unknown>;
  cost_price: number;
}

/** Payload for auto-generating a product cost sheet */
export interface AutoGenerateFCPayload {
  product_id: string;
  store_id: string;
  pdf_format?: string;
}

// ─── FC-USR-TEMPLATE: generación desde plantilla guardada del usuario ─────────

/** Payload for POST /api/product-cost-sheets/generate-from-template */
export interface GenerateFCFromTemplatePayload {
  product_id: string;
  store_id: string;
  /** UUID de cost_sheet_templates */
  template_id: string;
  modalidad?: 'produccion' | 'servicios' | 'comercializacion';
  pdf_format?: string;
}

/** Shape returned by POST /api/product-cost-sheets/generate-from-template */
interface GenerateFCFromTemplateResponse {
  data: Record<string, unknown> & {
    fc_status?: ProductFCStatus;
    generated?: boolean;
    template_id?: string;
    template_name?: string;
    template_source?: 'user' | 'store';
    modalidad?: string;
    cost_price?: number;
    total_cost?: number;
    total_margin?: number;
    total_tax?: number;
    grand_total?: number;
    elapsed_ms?: number;
    validation_errors?: string[];
    generation_error?: string;
    error_code?: string;
    message?: string;
  };
}

/** Shape returned by POST /api/product-cost-sheets/auto-generate */
interface AutoGenerateFCResponse {
  data: Record<string, unknown> & {
    fc_status?: ProductFCStatus;
    generated?: boolean;
    cost_price?: number;
    total_cost?: number;
    total_margin?: number;
    total_tax?: number;
    grand_total?: number;
    elapsed_ms?: number;
    validation_errors?: string[];
    needs_template?: boolean;
    message?: string;
  };
}

/** Shape returned by POST /api/product-cost-sheets (save) */
interface SaveCostSheetResponse {
  data: Record<string, unknown>;
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
    throw new Error(body.error || body.message || `Error ${res.status}`);
  }

  return res.json();
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const productCostSheetKeys = {
  all: () => ['product-cost-sheet'] as const,
  detail: (productId: string, storeId?: string) =>
    ['product-cost-sheet', productId, storeId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useProductCostSheet — Fetches the FC data for a SINGLE product.
 *
 * @param productId - The product ID (undefined disables the query)
 * @param storeId   - Optional store ID override
 */
export function useProductCostSheet(
  productId: string | undefined,
  storeId?: string,
) {
  const { user } = useAuthStore();
  const resolvedStoreId = storeId || user?.activeStoreId || '';

  const query = useQuery<ProductCostSheetResponse>({
    queryKey: productCostSheetKeys.detail(productId || '', resolvedStoreId),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('product_id', productId!);
      if (resolvedStoreId) params.set('store_id', resolvedStoreId);
      return apiFetch<ProductCostSheetResponse>(
        `/api/product-cost-sheets?${params.toString()}`,
      );
    },
    enabled: !!productId,
    staleTime: 60_000, // 1 minute — FC data doesn't change every second
    retry: 1,
  });

  const fcStatus: ProductFCStatus = query.data?.data?.fc_status ?? 'sin_fc';

  return {
    data: query.data?.data ?? null,
    fcStatus,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * useAutoGenerateFC — Mutation hook that triggers automatic FC generation
 * for a product via POST /api/product-cost-sheets/auto-generate.
 *
 * Invalidates the product-cost-sheet query on success.
 */
export function useAutoGenerateFC() {
  const queryClient = useQueryClient();

  return useMutation<AutoGenerateFCResponse, Error, AutoGenerateFCPayload>({
    mutationFn: (payload) =>
      apiFetch<AutoGenerateFCResponse>(
        '/api/product-cost-sheets/auto-generate',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: (_data, variables) => {
      // Invalidate the specific product's cost sheet query
      queryClient.invalidateQueries({
        queryKey: productCostSheetKeys.detail(
          variables.product_id,
          variables.store_id,
        ),
      });
      // Also invalidate the broader product-cost-sheets prefix used by other hooks
      queryClient.invalidateQueries({
        queryKey: ['product-cost-sheets'],
      });
      // And products cache since cost_sheet_id may have changed
      queryClient.invalidateQueries({
        queryKey: ['products'],
      });
    },
  });
}

/**
 * useSaveProductCostSheet — Mutation hook that saves a calculated cost sheet
 * via POST /api/product-cost-sheets.
 *
 * Invalidates the product-cost-sheet query on success.
 */
export function useSaveProductCostSheet() {
  const queryClient = useQueryClient();

  return useMutation<SaveCostSheetResponse, Error, SaveProductCostSheetPayload>({
    mutationFn: (payload) =>
      apiFetch<SaveCostSheetResponse>('/api/product-cost-sheets', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: productCostSheetKeys.detail(
          variables.product_id,
          variables.store_id,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['product-cost-sheets'],
      });
      queryClient.invalidateQueries({
        queryKey: ['products'],
      });
    },
  });
}

// ─── Delete (Soft-Delete) Hook ──────────────────────────────────────────────────

/** Payload for soft-deleting a product cost sheet */
export interface DeleteProductCostSheetPayload {
  cost_sheet_id: string;
}

/** Shape returned by PATCH /api/product-cost-sheets (soft-delete) */
interface DeleteCostSheetResponse {
  data: {
    soft_deleted: boolean;
    cost_sheet_id: string;
  };
}

/**
 * useDeleteProductCostSheet — Mutation hook that soft-deletes a cost sheet
 * via PATCH /api/product-cost-sheets.
 *
 * Invalidates the product-cost-sheet and inventory queries on success.
 */
export function useDeleteProductCostSheet() {
  const queryClient = useQueryClient();

  return useMutation<DeleteCostSheetResponse, Error, DeleteProductCostSheetPayload>({
    mutationFn: (payload) =>
      apiFetch<DeleteCostSheetResponse>('/api/product-cost-sheets', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      // Invalidate all FC-related queries
      queryClient.invalidateQueries({
        queryKey: ['product-cost-sheets'],
      });
      queryClient.invalidateQueries({
        queryKey: ['product-cost-sheets-batch'],
      });
      queryClient.invalidateQueries({
        queryKey: ['products'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory'],
      });
    },
  });
}

// ─── FC-USR-TEMPLATE: plantillas guardadas del usuario ─────────────────────

/**
 * useFCTemplateOptions — Plantillas de Ficha de Costo disponibles para el
 * usuario actual, con las TRES procedencias legítimas (FC-SYS-TEMPLATES
 * 2026-11-13, misión «Fichas de Costo: auditoría integral»):
 *
 *   - Sistema: catálogo incorporado por COSTPRO (13 plantillas en código —
 *     resueltas server-side por TEMPLATE_REGISTRY; no viven en BD, la
 *     persistencia no aplica: son parte del producto).
 *   - Privadas: propiedad de la cuenta (created_by = usuario, RLS).
 *   - Públicas: globales o de tiendas a las que el usuario tiene acceso (RLS).
 *
 * Las de BD se consultan con el cliente Supabase del navegador → la RLS de
 * cost_sheet_templates (migración 20261110120000) es la fuente de verdad:
 * nunca se exponen plantillas privadas de otras cuentas. Multi-dispositivo:
 * viven en el servidor, no en localStorage.
 */
export function useFCTemplateOptions() {
  return useQuery<CostSheetTemplateRecord[], Error>({
    queryKey: ['fc-template-options'],
    queryFn: async (): Promise<CostSheetTemplateRecord[]> => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user?.id) return [];

      // Privadas del usuario + públicas visibles (la RLS filtra por cuenta).
      const [privRes, pubRes] = await Promise.all([
        supabase
          .from('cost_sheet_templates')
          .select('id, name, description, category, data, type, created_by, store_id, created_at, updated_at')
          .eq('type', 'private')
          .eq('created_by', session.user.id)
          .order('updated_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('cost_sheet_templates')
          .select('id, name, description, category, data, type, created_by, store_id, created_at, updated_at')
          .eq('type', 'public')
          .order('updated_at', { ascending: false, nullsFirst: false }),
      ]);

      const rows: CostSheetTemplateRecord[] = [];
      for (const res of [privRes, pubRes]) {
        for (const row of (res.data ?? []) as Record<string, unknown>[]) {
          rows.push({
            id: String(row.id),
            name: String(row.name ?? ''),
            description: row.description != null ? String(row.description) : null,
            category: row.category != null ? String(row.category) : null,
            data: row.data as CostSheetTemplateRecord['data'],
            type: (row.type as CostSheetTemplateRecord['type']) ?? 'private',
            created_by: row.created_by != null ? String(row.created_by) : null,
            store_id: row.store_id != null ? String(row.store_id) : null,
            created_at: row.created_at != null ? String(row.created_at) : null,
            updated_at: row.updated_at != null ? String(row.updated_at) : null,
          });
        }
      }

      return mergeFCTemplateOptions(rows) as CostSheetTemplateRecord[];
    },
    staleTime: 60_000,
    retry: 1,
  });
}

// mergeFCTemplateOptions vive en src/lib/integration/fc-system-templates.ts
// (módulo puro, testeable) — fusión de las tres procedencias.

/**
 * useGenerateFCFromTemplate — Mutation que conecta un producto con una Ficha
 * de Costo generada desde una plantilla guardada del usuario.
 *
 * POST /api/product-cost-sheets/generate-from-template.
 * La asociación persiste en product_cost_sheets + products.cost_sheet_id
 * (servidor): sobrevive recargas, cierres de sesión y cambios de dispositivo.
 */
export function useGenerateFCFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation<GenerateFCFromTemplateResponse, Error, GenerateFCFromTemplatePayload>({
    mutationFn: (payload) =>
      apiFetch<GenerateFCFromTemplateResponse>(
        '/api/product-cost-sheets/generate-from-template',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: productCostSheetKeys.detail(
          variables.product_id,
          variables.store_id,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: ['product-cost-sheets'],
      });
      queryClient.invalidateQueries({
        queryKey: ['product-cost-sheets-batch'],
      });
      queryClient.invalidateQueries({
        queryKey: ['products'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory'],
      });
    },
  });
}
