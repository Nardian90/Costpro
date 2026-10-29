/**
 * useMasterCatalog — MISIÓN CATÁLOGO MAESTRO (PR 4).
 *
 * Hooks de cliente para el catálogo maestro por organización. Toda escritura
 * pasa por las RPC certificadas (SECURITY DEFINER con guard en servidor);
 * el cliente nunca escribe las tablas del maestro directamente.
 *
 * RPCs usadas (migraciones 20261028112000/12100):
 *  - search_master_products(p_store_id, p_search, p_limit, p_offset)
 *  - activate_master_product(p_master_id, p_store_id)
 *  - connect_store_catalog / disconnect_store_catalog(p_store_id[, p_reason])
 *  - update_master_product(p_master_id, p_changes, p_origin_store_id)
 *  - propose_master_change / review_master_proposal
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export interface MasterProductRow {
  id: string;
  sku: string;
  name: string;
  image_path: string | null;
  barcode: string | null;
  unit_of_measure: string | null;
  is_service: boolean;
  status: string;
  activated: boolean;
  local_product_id: string | null;
  total_count: number;
}

export interface CatalogStoreLink {
  id: string;
  tenant_id: string;
  store_id: string;
  status: 'connected' | 'disconnected';
  connected_at: string | null;
  disconnected_at: string | null;
  reason: string | null;
}

/** Estado del enlace catálogo↔tienda (una fila por tienda, RLS por tenant). */
export function useCatalogStoreLink(storeId?: string | null) {
  return useQuery({
    queryKey: ['catalog-store-link', storeId],
    queryFn: async (): Promise<CatalogStoreLink | null> => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from('catalog_store_links')
        .select('id, tenant_id, store_id, status, connected_at, disconnected_at, reason')
        .eq('store_id', storeId)
        .maybeSingle();
      if (error) {
        logger.error('DATABASE', 'useCatalogStoreLink: fallo de lectura', { error: error.message });
        throw error;
      }
      return (data as CatalogStoreLink) ?? null;
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

/** Identidad disponible del catálogo de la organización para una tienda conectada. */
export function useSearchMasterProducts(storeId?: string | null, search = '', onlyAvailable = false) {
  return useQuery({
    queryKey: ['master-products', storeId, search, onlyAvailable],
    queryFn: async (): Promise<MasterProductRow[]> => {
      if (!storeId) return [];
      const { data, error } = await supabase.rpc('search_master_products', {
        p_store_id: storeId,
        p_search: search,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      const rows = (data ?? []) as MasterProductRow[];
      return onlyAvailable ? rows.filter(r => r.status === 'active' && !r.activated) : rows;
    },
    enabled: !!storeId,
    staleTime: 15_000,
  });
}

function invalidateCatalog(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['master-products'] });
  qc.invalidateQueries({ queryKey: ['catalog-store-link'] });
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['catalog-products-v2'] });
}

/** Activar un maestro en la tienda activa: crea la fila local (defaults de alta manual). */
export function useActivateMasterProduct(storeId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (masterId: string) => {
      if (!storeId) throw new Error('Sin tienda activa');
      const { data, error } = await supabase.rpc('activate_master_product', {
        p_master_id: masterId,
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as { status: string; already_active: boolean; product_id: string };
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

/** Conectar la tienda al catálogo de su organización (gobernador). */
export function useConnectStoreCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (storeId: string) => {
      const { data, error } = await supabase.rpc('connect_store_catalog', { p_store_id: storeId });
      if (error) throw error;
      return data as { status: string; already_connected?: boolean };
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

/** Desconectar la tienda sin borrar productos ni historial (gobernador). */
export function useDisconnectStoreCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, reason }: { storeId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('disconnect_store_catalog', {
        p_store_id: storeId,
        p_reason: reason ?? '',
      });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

export interface MasterChanges {
  name?: string;
  description?: string | null;
  image_path?: string | null;
  barcode?: string | null;
  barcode_type?: string | null;
  unit_of_measure?: string;
  is_service?: boolean;
  sku?: string;
}

/** Editar identidad compartida (gobernador) — propaga SKU/nombre y audita por campo. */
export function useUpdateMasterProduct(originStoreId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ masterId, changes }: { masterId: string; changes: MasterChanges }) => {
      const { data, error } = await supabase.rpc('update_master_product', {
        p_master_id: masterId,
        p_changes: changes,
        p_origin_store_id: originStoreId ?? null,
      });
      if (error) throw error;
      return data as { status: string; applied: Array<{ field: string; old: string | null; new: string | null }> };
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

/** Proponer cambios de identidad desde la tienda (queda pendiente de aprobación). */
export function useProposeMasterChange(originStoreId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ masterId, changes }: { masterId: string; changes: MasterChanges }) => {
      if (!originStoreId) throw new Error('Sin tienda de origen');
      const { data, error } = await supabase.rpc('propose_master_change', {
        p_master_id: masterId,
        p_changes: changes,
        p_origin_store_id: originStoreId,
      });
      if (error) throw error;
      return data as { status: string; proposal_id: string };
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

export interface MasterProposal {
  id: string;
  master_product_id: string;
  tenant_id: string;
  changes: MasterChanges;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  created_at: string;
}

/** Cola de propuestas de la organización (gobernador). */
export function useMasterProposals(tenantId?: string | null) {
  return useQuery({
    queryKey: ['master-proposals', tenantId],
    queryFn: async (): Promise<MasterProposal[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('master_change_proposals')
        .select('id, master_product_id, tenant_id, changes, status, review_note, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MasterProposal[];
    },
    enabled: !!tenantId,
    staleTime: 15_000,
  });
}

/** Aprobar/rechazar una propuesta (gobernador). */
export function useReviewMasterProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId, decision, note }: { proposalId: string; decision: 'approved' | 'rejected'; note?: string }) => {
      const { data, error } = await supabase.rpc('review_master_proposal', {
        p_proposal_id: proposalId,
        p_decision: decision,
        p_note: note ?? '',
      });
      if (error) throw error;
      return data as { status: string; decision?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master-proposals'] });
      invalidateCatalog(qc);
    },
  });
}

/**
 * Verificación previa de alta (misión §10.1): si la tienda está conectada y el
 * SKU ya existe en el maestro de la organización, devuelve el maestro para que
 * la UI ofrezca activarlo/vincularlo en lugar de duplicar.
 * Fail-open silencioso: tienda no conectada o error de red ⇒ null (el flujo
 * de alta manual actual continúa; la unicidad real la garantiza la BD).
 */
export async function findMasterBySku(storeId: string | null | undefined, sku: string): Promise<MasterProductRow | null> {
  const cleanSku = (sku || '').trim();
  if (!storeId || !cleanSku) return null;
  try {
    const { data, error } = await supabase.rpc('search_master_products', {
      p_store_id: storeId,
      p_search: cleanSku,
      p_limit: 10,
      p_offset: 0,
    });
    if (error) return null; // p.ej. ERR_STORE_NOT_CONNECTED → tienda no conectada
    const exact = ((data ?? []) as MasterProductRow[]).find(r => r.sku.toLowerCase() === cleanSku.toLowerCase());
    return exact ?? null;
  } catch {
    return null;
  }
}
