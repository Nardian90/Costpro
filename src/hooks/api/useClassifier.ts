/**
 * useClassifier — MISIÓN CLASIFICADOR MAESTRO DE CLIENTES Y PROVEEDORES (FASE 3/4).
 *
 * Hooks de cliente para el clasificador maestro por organización. Toda
 * escritura pasa por las RPC certificadas (SECURITY DEFINER con guard en
 * servidor); el cliente NUNCA escribe las tablas del maestro directamente.
 *
 * RPCs usadas (migraciones 20261105130000/5130100):
 *  - search_master_parties(p_store_id, p_search, p_kind, p_status, p_limit, p_offset)
 *  - create_master_party(p_store_id, p_code, p_name, …) — código automático CP-#### si va vacío
 *  - update_master_party(p_party_id, p_changes, p_origin_store_id) — activar/desactivar incluido
 *  - delete_master_party(p_party_id, p_origin_store_id) — bloqueado con historial (ERR_PARTY_HAS_HISTORY)
 *  - activate_master_party(p_party_id, p_store_id) — vincula filas locales
 *  - connect_party_catalog / disconnect_party_catalog(p_store_id[, p_reason])
 *  - incorporate_store_parties_to_master(p_store_id, p_dry_run)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

/** Fila unificada del clasificador (fuente master/local). */
export interface MasterPartyRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  party_type: 'natural' | 'juridica' | string;
  is_client: boolean;
  is_supplier: boolean;
  status: 'active' | 'archived' | string;
  notes: string | null;
  /** 'master' → compartido desde el Clasificador Maestro; 'local' → registro de la tienda. */
  source: 'master' | 'local' | string;
  master_party_id: string | null;
  linked_customer_id: string | null;
  linked_supplier_id: string | null;
  total_count: number;
}

/** Clasificación comercial derivada (campo mínimo «Clasificación» de la misión). */
export function partyClassification(p: Pick<MasterPartyRow, 'is_client' | 'is_supplier'>): 'cliente' | 'proveedor' | 'ambos' | '—' {
  if (p.is_client && p.is_supplier) return 'ambos';
  if (p.is_client) return 'cliente';
  if (p.is_supplier) return 'proveedor';
  return '—';
}

export interface PartyStoreLink {
  id: string;
  tenant_id: string;
  store_id: string;
  status: 'connected' | 'disconnected';
  connected_at: string | null;
  disconnected_at: string | null;
  reason: string | null;
}

/** Fila de la trazabilidad por campo (party_change_log). */
export interface PartyChangeLogRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  origin_store_id: string | null;
  created_at: string;
}

/** Estado del enlace clasificador↔tienda (una fila por tienda, RLS por tenant). */
export function usePartyStoreLink(storeId?: string | null) {
  return useQuery({
    queryKey: ['party-store-link', storeId],
    queryFn: async (): Promise<PartyStoreLink | null> => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from('party_store_links')
        .select('id, tenant_id, store_id, status, connected_at, disconnected_at, reason')
        .eq('store_id', storeId)
        .maybeSingle();
      if (error) {
        logger.error('DATABASE', 'usePartyStoreLink: fallo de lectura', { error: error.message });
        throw error;
      }
      return (data as PartyStoreLink) ?? null;
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

/**
 * Búsqueda unificada del clasificador: identidad compartida (source='master')
 * + registros locales de la tienda sin maestro (source='local').
 * kind: 'all' | 'client' | 'supplier' | 'ambos'; status: 'active' | 'archived' | 'all'.
 */
export function useSearchMasterParties(
  storeId?: string | null,
  search = '',
  kind: 'all' | 'client' | 'supplier' | 'ambos' = 'all',
  status: 'active' | 'archived' | 'all' = 'active',
) {
  return useQuery({
    queryKey: ['master-parties', storeId, search, kind, status],
    queryFn: async (): Promise<MasterPartyRow[]> => {
      if (!storeId) return [];
      const { data, error } = await supabase.rpc('search_master_parties', {
        p_store_id: storeId,
        p_search: search,
        p_kind: kind,
        p_status: status,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as MasterPartyRow[];
    },
    enabled: !!storeId,
    staleTime: 15_000,
  });
}

/** Trazabilidad de modificaciones de un tercero (misión: 含修改追溯). */
export function usePartyChangeLog(partyId?: string | null) {
  return useQuery({
    queryKey: ['party-change-log', partyId],
    queryFn: async (): Promise<PartyChangeLogRow[]> => {
      if (!partyId) return [];
      const { data, error } = await supabase
        .from('party_change_log')
        .select('id, field, old_value, new_value, actor_id, origin_store_id, created_at')
        .eq('master_party_id', partyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PartyChangeLogRow[];
    },
    enabled: !!partyId,
    staleTime: 15_000,
  });
}

function invalidateClassifier(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['master-parties'] });
  qc.invalidateQueries({ queryKey: ['party-store-link'] });
  qc.invalidateQueries({ queryKey: ['party-change-log'] });
  qc.invalidateQueries({ queryKey: ['suppliers'] });
  qc.invalidateQueries({ queryKey: ['classifier-parties-lite'] });
  qc.invalidateQueries({ queryKey: ['classifier-parties-lite-supplier'] });
}

export interface CreateMasterPartyPayload {
  name: string;
  code?: string;       // vacío → auto CP-#### (RPC)
  address?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  party_type?: 'natural' | 'juridica';
  is_client?: boolean;
  is_supplier?: boolean;
  notes?: string;
  ci?: string;         // documento de persona natural (clientes CRM)
}

/** Alta de contraparte (modo conectado: identidad maestra + filas locales). */
export function useCreateMasterParty(storeId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateMasterPartyPayload) => {
      if (!storeId) throw new Error('Sin tienda activa');
      const { data, error } = await supabase.rpc('create_master_party', {
        p_store_id: storeId,
        p_code: payload.code?.trim() || null,
        p_name: payload.name.trim(),
        p_address: payload.address?.trim() || null,
        p_phone: payload.phone?.trim() || null,
        p_email: payload.email?.trim() || null,
        p_tax_id: payload.tax_id?.trim() || null,
        p_party_type: payload.party_type || 'natural',
        p_is_client: payload.is_client ?? true,
        p_is_supplier: payload.is_supplier ?? false,
        p_notes: payload.notes?.trim() || null,
        p_ci: payload.ci?.trim() || null,
      });
      if (error) throw error;
      return data as {
        status: string;
        master_party_id?: string;
        customer_id?: string | null;
        supplier_id?: string | null;
        source?: string;
        name_duplicates?: Array<{ id: string; code: string; name: string }>;
      };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/** Edición con trazabilidad por campo (status incluido → activar/desactivar). */
export function useUpdateMasterParty(storeId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ partyId, changes }: { partyId: string; changes: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc('update_master_party', {
        p_party_id: partyId,
        p_changes: changes,
        p_origin_store_id: storeId ?? null,
      });
      if (error) throw error;
      return data as { status: string; applied: string[] };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/** Eliminación física — SOLO sin historial (el guard vive en la RPC). */
export function useDeleteMasterParty(storeId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partyId: string) => {
      const { data, error } = await supabase.rpc('delete_master_party', {
        p_party_id: partyId,
        p_origin_store_id: storeId ?? null,
      });
      if (error) throw error;
      return data as { status: string; deleted: boolean };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/** Activar el tercero compartido en la tienda activa (crea/vincula filas locales). */
export function useActivateMasterParty(storeId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partyId: string) => {
      if (!storeId) throw new Error('Sin tienda activa');
      const { data, error } = await supabase.rpc('activate_master_party', {
        p_party_id: partyId,
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as { status: string; customer_id?: string | null; supplier_id?: string | null };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/** Conectar la tienda al clasificador de su organización (gobernador). */
export function useConnectStoreClassifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (storeId: string) => {
      const { data, error } = await supabase.rpc('connect_party_catalog', { p_store_id: storeId });
      if (error) throw error;
      return data as { status: string; connected: boolean };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/** Desconectar la tienda del clasificador — NO borra datos (gobernador). */
export function useDisconnectStoreClassifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, reason }: { storeId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('disconnect_party_catalog', {
        p_store_id: storeId,
        p_reason: reason ?? '',
      });
      if (error) throw error;
      return data as { status: string; connected: boolean };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/** Incorporar los registros locales de la tienda al maestro (gobernador). */
export function useIncorporateStoreParties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, dryRun }: { storeId: string; dryRun?: boolean }) => {
      const { data, error } = await supabase.rpc('incorporate_store_parties_to_master', {
        p_store_id: storeId,
        p_dry_run: dryRun ?? false,
      });
      if (error) throw error;
      return data as {
        status: string;
        dry_run: boolean;
        linked_existing_masters: number;
        created_masters: number;
        conflicts: number;
        conflict_rows: Array<{ table: string; local_id: string; name: string; conflict_code: string }>;
      };
    },
    onSuccess: () => invalidateClassifier(qc),
  });
}

/**
 * Traduce los errores ERR_* de las RPC a mensajes de usuario claros (es).
 * La tabla del patrón está en CatalogGovernanceSection — misma disciplina.
 */
export function translateClassifierError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg.includes('ERR_PARTY_CODE_EXISTS')) return 'Ese código ya existe en el clasificador de la organización.';
  if (msg.includes('ERR_PARTY_TAX_ID_EXISTS')) return 'Esa identificación fiscal ya pertenece a otro tercero de la organización.';
  if (msg.includes('ERR_PARTY_HAS_HISTORY')) return 'El tercero tiene operaciones históricas: solo puede desactivarse, no eliminarse.';
  if (msg.includes('ERR_PARTY_NAME_REQUIRED')) return 'El nombre es obligatorio.';
  if (msg.includes('ERR_PARTY_KIND_REQUIRED')) return 'Marca al menos un rol: cliente o proveedor.';
  if (msg.includes('ERR_PARTY_EMAIL_INVALID')) return 'Correo electrónico inválido.';
  if (msg.includes('ERR_PARTY_CODE_REQUIRED')) return 'El código es obligatorio en el clasificador compartido.';
  if (msg.includes('ERR_PARTY_STATUS_INVALID')) return 'Estado no admitido.';
  if (msg.includes('ERR_PARTY_TYPE_INVALID')) return 'Tipo de persona no admitido.';
  if (msg.includes('ERR_PARTY_NOT_FOUND')) return 'El tercero no existe (otro usuario pudo eliminarlo).';
  if (msg.includes('ERR_STORE_NOT_CONNECTED')) return 'La tienda no está conectada al clasificador de la organización.';
  if (msg.includes('ERR_TENANT_MISMATCH')) return 'La tienda no pertenece a la organización del registro.';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'No tienes permiso para esta operación.';
  if (msg.includes('ERR_UNAUTHENTICATED')) return 'Sesión expirada: vuelve a entrar.';
  return msg || 'Error inesperado del clasificador.';
}
