import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeSchema } from '@/validation/schemas';
import type { Store, StoreCostTemplate, FCModalidad, FCPdfFormat } from '@/types';
import { offlineStorage } from '@/lib/sync/offline-storage';
import { storeApiClient } from '@/services/store-api-client';
import { logger } from '@/lib/logger';

/** FIX-QC-4: Minimum UUID length for sanity check (standard UUID = 36 chars with dashes) */
const MIN_USER_ID_LENGTH = 5;

/**
 * FIX-FC-PERSIST-V2: Normalize store_cost_templates (Supabase array) → cost_template (single object)
 * Supabase returns foreign key relations as arrays, but the UI expects a single object.
 *
 * Root cause of FC deactivation bug: `as boolean` is a TypeScript assertion
 * that does NOT convert at runtime. If is_active is null/undefined/string,
 * `null as boolean ?? false` evaluates to `false`, making FC appear deactivated.
 *
 * Fix: explicit boolean conversion via toBoolean() helper.
 */
function toBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 1 || val === '1') return true;
  return false;
}

function normalizeCostTemplate(raw: Record<string, unknown>): StoreCostTemplate | undefined {
  const templates = raw.store_cost_templates;
  if (!templates) return undefined;

  let t: Record<string, unknown> | undefined;

  // Supabase one-to-many relation returns an array
  if (Array.isArray(templates)) {
    if (templates.length === 0) return undefined;
    t = templates[0] as Record<string, unknown>;
  }
  // Supabase one-to-one relation returns a single object (or null)
  else if (typeof templates === 'object') {
    t = templates as Record<string, unknown>;
  }

  if (!t) return undefined;

  const result: StoreCostTemplate = {
    id: (t.id as string) || '',
    store_id: (t.store_id as string) || '',
    template_id: (t.template_id as string) || '',
    modalidad: (t.modalidad as FCModalidad) || 'produccion',
    pdf_format: (t.pdf_format as FCPdfFormat) || 'res148',
    is_active: toBoolean(t.is_active),
  };

  // Diagnostic: log the normalized FC template for debugging
  if (result.is_active) {
    logger.info('FC', 'TEMPLATE_NORMALIZED_ACTIVE', {
      store_id: result.store_id || raw.id,
      template_id: result.template_id,
      raw_is_active: t.is_active,
      normalized_is_active: result.is_active,
    });
  }

  return result;
}

export function useStores(userId: string, isAdmin: boolean, isEncargado: boolean) {
  return useQuery({
    queryKey: ['stores', userId, isAdmin, isEncargado],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!isAdmin && (!userId || userId.length < MIN_USER_ID_LENGTH)) return [];

      try {
          // Fetch stores through the API route (role-based filtering done server-side)
          const storesData = await storeApiClient.fetchStores();

          // FIX-RES-4: Log warnings for stores that fail Zod validation instead of silently dropping
          const validatedStores: Store[] = [];
          for (const s of storesData) {
            const result = storeSchema.safeParse(s);
            if (result.success) {
              // FIX-FC-PERSIST: Normalize cost_template from Supabase relation format
              const storeObj = result.data as unknown as Record<string, unknown>;
              const costTemplate = normalizeCostTemplate(s as unknown as Record<string, unknown>);
              const finalStore = { ...storeObj, cost_template: costTemplate } as unknown as Store;
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete (finalStore as unknown as Record<string, unknown>).store_cost_templates;
              validatedStores.push(finalStore);
            } else {
              logger.warn('VALIDATION', 'STORE_SCHEMA_MISMATCH', {
                storeId: (s as unknown as Record<string, unknown>).id,
                errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
              });
            }
          }

          // Save to offline cache (already filtered per user by the API)
          await offlineStorage.saveSnapshot(`all_stores`, validatedStores);

          return validatedStores;
      } catch (err) {
          if (!navigator.onLine) {
              // Offline: return the pre-filtered cached stores directly
              const offlineStores = await offlineStorage.getSnapshot<Store[]>(`all_stores`) || [];
              return offlineStores;
          }
          throw err;
      }
    },
    enabled: isAdmin || (!!userId && userId.length >= MIN_USER_ID_LENGTH),
  });
}

/**
 * F4-T01: Mutation para operaciones bulk en tiendas (activar/desactivar/eliminar).
 * Invalida ['stores'], ['store-user-counts'], ['dashboard'] tras éxito.
 */
export function useBulkStoreAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeIds, action }: { storeIds: string[]; action: 'activate' | 'deactivate' | 'delete' }) => {
      return storeApiClient.bulkStoreAction(storeIds, action);
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['multi-store-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['store-health'] });
      logger.info('DATABASE', 'STORE_BULK_ACTION_SUCCESS', {
        action: variables.action,
        affected: result.affected,
        failed: result.failed,
      });
    },
    onError: (error) => {
      logger.error('DATABASE', 'STORE_BULK_ACTION_FAILED', { error: error.message });
    },
  });
}

/**
 * F2-T03: Mutation para toggle activar/desactivar tienda.
 *
 * Caso de uso: el admin quiere pausar una tienda temporalmente sin perder su
 * configuración, memberships ni datos operativos. Al reactivar, todo vuelve
 * a estar operativo sin reconfigurar nada.
 *
 * Diferencia con deleteStore (soft-delete):
 * - toggle: preserva memberships activas, solo cambia is_active. Reactivable.
 * - delete: además revoca memberships y limpia active_store_id de perfiles.
 *   Es una baja permanente (aunque la fila siga en la BD con is_active=false).
 *
 * Invalida ['stores'] y ['store-user-counts'] para que la UI se actualice:
 * - ['stores']: la lista de tiendas refleja el nuevo estado is_active
 * - ['store-user-counts']: aunque las memberships se preservan, el conteo
 *   visible puede cambiar si filtramos por tiendas activas en algún lado
 */
export function useToggleStoreStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, isActive }: { storeId: string; isActive: boolean }) => {
      return storeApiClient.toggleStoreStatus(storeId, isActive);
    },
    onSuccess: (updatedStore) => {
      // Invalidar queries relacionadas para refrescar UI
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      logger.info('DATABASE', 'STORE_STATUS_TOGGLED', {
        storeId: updatedStore.id,
        newStatus: updatedStore.is_active ? 'active' : 'inactive',
      });
    },
    onError: (error) => {
      logger.error('DATABASE', 'STORE_TOGGLE_FAILED', { error: error.message });
    },
  });
}
