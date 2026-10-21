/**
 * store-tenant.ts — Canon central del RLS-FIX CP-CAT-004 para INSERT/UPSERT en `products`.
 *
 * Problema (defecto CP-CAT-004, auditoría 2026-10-16; verificado en BD viva 2026-10-22):
 * la única policy de INSERT de `products` es `products_tenant_insert`
 * (migración 20260827000005, sin flag):
 *
 *   WITH CHECK ((tenant_id = current_user_tenant_id())
 *               AND (store_id = ANY (current_user_store_ids())))
 *
 * Los inserts del catálogo que omiten `tenant_id` (columna nullable SIN default y sin
 * trigger que la derive) violan la policy con 42501
 * «new row violates row-level security policy for table products», que la UI presenta
 * como error de autorización aunque el usuario (p. ej. admin@demo en ENERVIDA-VITALLCONS)
 * tenga rol, tenant y membresías correctos.
 *
 * Solución (mismo patrón RLS-FIX ya certificado en useReceptionState /
 * useSavePendingReception): el tenant NO se toma del cliente — se lee de la BD
 * (`stores.tenant_id`) con el JWT del usuario. La policy `stores_tenant_select`
 * solo devuelve tiendas del propio tenant (o del admin), de modo que el valor
 * queda validado contra la identidad autenticada. Fail-closed: si la tienda no
 * es legible o su tenant_id es NULL, se aborta SIN ejecutar el INSERT.
 */
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export class StoreTenantResolutionError extends Error {
  readonly storeId: string;
  readonly causeKind: 'db_error' | 'not_found' | 'null_tenant';

  constructor(storeId: string, causeKind: 'db_error' | 'not_found' | 'null_tenant') {
    super(
      'No se pudo verificar la tienda activa para crear productos. ' +
        'Comprueba tu sesión y los permisos sobre la tienda, e inténtalo de nuevo.',
    );
    this.name = 'StoreTenantResolutionError';
    this.storeId = storeId;
    this.causeKind = causeKind;
  }
}

/**
 * Resuelve y devuelve el `tenant_id` verificado de una tienda, leyéndolo de la BD
 * con el JWT del usuario (fail-closed: lanza si la tienda no es legible o no tiene tenant).
 *
 * El resultado debe incluirse tal cual en el payload del INSERT/UPSERT de `products`;
 * la policy `products_tenant_insert` lo compara contra `current_user_tenant_id()`,
 * así que un usuario legítimo pasa y un atacante que falsifique el store_id sigue
 * bloqueado por `store_id = ANY (current_user_store_ids())`.
 */
export async function resolveStoreTenantId(storeId: string): Promise<string> {
  const { data, error } = await supabase
    .from('stores')
    .select('tenant_id')
    .eq('id', storeId)
    .maybeSingle();

  if (error) {
    logger.error('DATABASE', 'resolveStoreTenantId: fallo de lectura de stores (fail-closed)', {
      storeId,
      error: error.message,
    });
    throw new StoreTenantResolutionError(storeId, 'db_error');
  }
  if (!data?.tenant_id) {
    logger.error('DATABASE', 'resolveStoreTenantId: tienda ilegible o sin tenant_id (fail-closed)', {
      storeId,
      hasRow: !!data,
    });
    throw new StoreTenantResolutionError(storeId, data ? 'null_tenant' : 'not_found');
  }
  return data.tenant_id;
}
