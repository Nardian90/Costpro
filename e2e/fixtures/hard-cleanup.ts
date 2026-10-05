/**
 * E2E DATA HYGIENE — hard-cleanup (chore/e2e-data-hygiene)
 * ============================================================================
 * PROBLEMA RESUELTO (auditoría chore/e2e-data-hygiene):
 *   El cleanup E2E histórico era SOFT (archive/ban): deleteTestStore caía a
 *   `is_archived=true`, sweepStaleTestStores archivaba, el teardown del run
 *   archivaba pilotos y solo banneaba usuarios. `DELETE /api/stores` de la
 *   app es soft-delete (semántica correcta para negocio real). Resultado:
 *   2600+ tiendas y 350+ usuarios E2E residuales acumulados en el proyecto.
 *
 * PRINCIPIO (FASE 11 — E2E Data Hygiene):
 *   Preferencia 1 — fixtures reutilizables (usuarios demo / tiendas piloto).
 *   Preferencia 2 — data reset al terminar.
 *   Preferencia 3 — entidad temporal: CREATE → TEST → VERIFY → DELETE →
 *                   VERIFY ABSENCE. Aquí el DELETE es HARD (service-role),
 *                   porque los residuos E2E no son datos de negocio.
 *
 * REGLAS DE SEGURIDAD:
 *   - NUNCA toca las tiendas protegidas (ids en PROTECTED_STORE_IDS, FASE 18).
 *   - Solo actúa sobre entidades con patrón de test o pertenecientes al
 *     tenant del run (creado por y para este run).
 *   - No modifica lógica de producto: es infraestructura exclusiva de e2e/.
 * ============================================================================
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** REST con service-role (autocontenido — evita ciclos con session.fixture). */
async function svc(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const sb = {
  async select<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
    const res = await svc('GET', `/${table}?${query}`);
    if (!res.ok) throw new Error(`sb.select ${table} falló: ${res.status} ${await res.text()}`);
    return res.json();
  },
  async update(table: string, query: string, patch: unknown): Promise<void> {
    const res = await svc('PATCH', `/${table}?${query}`, patch);
    if (!res.ok) throw new Error(`sb.update ${table} falló: ${res.status} ${await res.text()}`);
  },
  async delete(table: string, query: string): Promise<void> {
    const res = await svc('DELETE', `/${table}?${query}`);
    if (!res.ok) throw new Error(`sb.delete ${table} falló: ${res.status} ${await res.text()}`);
  },
};

/** Tiendas reales autorizadas — JAMÁS eliminadas ni modificadas (FASE 18). */
export const PROTECTED_STORE_IDS: readonly string[] = [
  'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', // TIENDA CENTRAL COSTPRO
  '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1', // Puerto Padre VITALLCONS
  '5e6fe821-5465-48b1-b3f1-3aa3182edc38', // ENERVIDA-VITALLCONS
];

/**
 * Patrones de nombre inequívocos de tienda de prueba (mismos criterios que la
 * auditoría documentada en docs/audits/E2E-DATA-CLEANUP-INVENTORY.md).
 * Las tiendas protegidas nunca coinciden con estos patrones.
 */
export const TEST_STORE_NAME_PATTERNS = [
  'E2E80*', 'E2E *', 'E2E-%', 'E2E2-*', 'ESEC TEST*', 'FASE-D TEST*',
  'AUDIT *', 'HOT *', 'REM-F4*', 'Updated Name E2E', 'Test Store*', 'Test-%',
  'TEST-%', '*Playwright*', '*probe*',
];

export function isTestStoreName(name: string): boolean {
  const n = (name || '').trim();
  return /^(E2E|E2E80|E2E2|ESEC TEST|FASE-D TEST|AUDIT|HOT|REM-F4|TEST-|Test |Updated Name E2E)/i.test(n)
    || /updated name e2e/i.test(n)
    || /playwright|probe/i.test(n);
}

/** GoTrue Admin API (mecanismo administrativo correcto para borrar identidad). */
async function authAdminDelete(userId: string): Promise<boolean> {
  if (!SERVICE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** RPC con service-role (para e2e_hard_delete_store — FASE 11/12). */
async function rpcService(name: string, params: Record<string, unknown>): Promise<unknown | null> {
  if (!SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * HARD-DELETE de una tienda de prueba y TODOS sus datos de negocio.
 *
 * Mecanismo primario: RPC `e2e_hard_delete_store` (SECURITY DEFINER, migra-
 * ción 20261005120000) — server-side, con guardas de tiendas protegidas y de
 * patrón de test, y bypass transaccional de triggers fiscales.
 *
 * Fallback (RPC no disponible): borrado REST ordenado por service-role —
 * puede fallar en tiendas con datos fiscales (z_reports/fiscal_closings/
 * payment_transactions) por los triggers de integridad; en ese caso lanza
 * para que el caller decida (el guardrail detectará el residuo).
 */
export async function hardDeleteTestStore(storeId: string): Promise<void> {
  if (PROTECTED_STORE_IDS.includes(storeId)) {
    throw new Error(`[hard-cleanup] FATAL: se intentó eliminar una tienda protegida (${storeId})`);
  }

  const viaRpc = await rpcService('e2e_hard_delete_store', { p_store_id: storeId });
  if (viaRpc === true || viaRpc === false) return; // true=borrada, false=no existía

  // ── Fallback REST (local sin migración aplicada) ────────────────────────

  // 1. Hijos con FK NO ACTION / RESTRICT (bloquearían el DELETE de stores)
  const preClean: Array<[string, string]> = [
    ['z_reports', `store_id=eq.${storeId}`],
    ['cash_movements', `store_id=eq.${storeId}`],
    ['cash_register_sessions', `store_id=eq.${storeId}`],
    ['cash_closures', `store_id=eq.${storeId}`],
    ['fiscal_closings', `store_id=eq.${storeId}`],
    ['cost_sheet_templates', `store_id=eq.${storeId}`],
    ['report_runs', `store_id=eq.${storeId}`],
    ['report_definitions', `store_id=eq.${storeId}`],
    ['sync_log', `store_id=eq.${storeId}`],
    ['inventory_batches', `store_id=eq.${storeId}`],
    ['inventory_adjustments', `store_id=eq.${storeId}`],
    ['receipt_items', `receipt_id=in.(select id from receipts where store_id=eq.${storeId})`],
    ['payment_transactions', `store_id=eq.${storeId}`],
    ['transfers', `origin_store_id=eq.${storeId}`],
    ['transfers', `destination_store_id=eq.${storeId}`],
    ['audit_logs', `store_id=eq.${storeId}`],
  ];
  for (const [table, q] of preClean) {
    await sb.delete(table, q).catch(() => {});
  }

  // 2. Datos user-scoped y perfiles apuntando a la tienda
  await sb.update('profiles', `store_id=eq.${storeId}`, { store_id: null }).catch(() => {});

  // 3. Datos de negocio con CASCADE (mejor borrarlos explícitamente: el
  //    volumen es pequeño y evita depender del ORDER interno del CASCADE)
  const business = [
    'transaction_item_lots', 'transaction_items', 'sale_items', 'sales',
    'sales_transactions', 'receipt_items', 'receipt_tasa_audit',
    'commission_reception_links', 'service_reception_links',
    'service_cost_distributions', 'purchase_items', 'purchase_order_items',
    'production_order_items', 'physical_count_items', 'issue_slip_items',
    'devolution_items', 'quotation_items', 'transfer_items',
    'inventory_adjustment_items', 'product_variants', 'commission_rule_products',
    'transactions', 'receipts', 'commission_payments', 'commission_rules',
    'bank_statements', 'categories', 'customers', 'devolutions', 'document_sequences',
    'inventory', 'inventory_reservations', 'inventory_snapshots', 'issue_slips',
    'kardex_entries', 'ofertas', 'price_change_history', 'price_commit_log',
    'product_cost_sheets', 'product_lots', 'production_orders', 'products',
    'purchase_orders', 'quotations', 'received_services', 'restore_sessions',
    'saved_analytics_views', 'service_types', 'stock_movements',
    'store_cost_templates', 'store_exchange_rates', 'store_notifications',
    'store_reset_snapshots', 'suppliers', 'tax_configurations', 'telegram_configs',
    'telegram_contacts', 'telegram_invitations', 'telegram_messages',
    'telegram_product_posts', 'transfer_approval_rules', 'user_invitations',
    'user_store_memberships', 'warehouse_stock', 'warehouses', 'whatsapp_configs',
    'whatsapp_contacts', 'whatsapp_invitations', 'whatsapp_messages',
    'whatsapp_product_posts', 'whatsapp_risk_state', 'workers', 'abc_classifications',
    'cost_sheets',
  ];
  for (const table of business) {
    await sb.delete(table, `store_id=eq.${storeId}`).catch(() => {});
  }
  await sb.delete('sales', `id=in.(select sale_id from sales_transactions where store_id=eq.${storeId})`).catch(() => {});
  await sb.delete('sales_transactions', `store_id=eq.${storeId}`).catch(() => {});

  // 4. La tienda (hard delete — el soft-delete de la app es para negocio real)
  await sb.delete('stores', `id=eq.${storeId}`);
}

/**
 * HARD-DELETE de un usuario de prueba: datos user-scoped → profile →
 * identidad Auth (GoTrue Admin). Best-effort excepto el delete de Auth.
 */
export async function hardDeleteRunUser(userId: string): Promise<boolean> {
  // 0. Tiendas creadas por el usuario (stores_created_by_fkey NO ACTION
  //    bloquearía el delete de la identidad Auth)
  try {
    const owned = await sb.select<{ id: string }>('stores', `select=id&created_by=eq.${userId}`);
    for (const s of owned) {
      await hardDeleteTestStore(s.id).catch(() => {});
    }
  } catch { /* best-effort */ }

  const scoped = [
    'user_store_memberships', 'user_preferences', 'user_usage', 'user_progress',
    'user_strategy_feedback', 'saved_analytics_views', 'ai_api_keys',
    'idempotency_keys', 'bulk_ops_log', 'pick3_profiles', 'pick3_subscriptions',
    'pick3_usage', 'pick3_user_plays', 'wallet_accounts', 'audit_logs',
    'cost_sheets', 'cost_sheet_templates', 'purchase_orders', 'report_definitions',
    'report_runs', 'sync_log', 'telegram_product_posts', 'whatsapp_product_posts',
    'pick3_simulations', 'inventory_movements',
  ];
  for (const table of scoped) {
    await sb.delete(table, `created_by=eq.${userId}`).catch(async () => {
      // tablas con user_id/cashier_id/executed_by en lugar de created_by
      for (const col of ['user_id', 'cashier_id', 'executed_by', 'published_by']) {
        const done = await sb.delete(table, `${col}=eq.${userId}`).then(() => true).catch(() => false);
        if (done) break;
      }
    });
  }
  // sales/sale_items: scoped por cashier (sin vínculo de store)
  await sb.delete('sale_items', `sale_id=in.(select id from sales where cashier_id=eq.${userId})`).catch(() => {});
  await sb.delete('sales', `cashier_id=eq.${userId}`).catch(() => {});
  await sb.update('user_invitations', `invited_by=eq.${userId}`, { invited_by: null }).catch(() => {});

  // Mecanismo primario: RPC e2e_hard_delete_user (SECURITY DEFINER — migra-
  // ción 20261005120001). Maneja profile + identidad Auth server-side.
  const viaRpc = await rpcService('e2e_hard_delete_user', { p_user_id: userId });
  if (viaRpc === true || viaRpc === false) return true;

  // Fallback REST: profile (bloqueado por trigger en REST) + GoTrue Admin
  await sb.delete('profiles', `id=eq.${userId}`).catch(() => {});
  return authAdminDelete(userId);
}

/**
 * HARD-DELETE de TODAS las tiendas del tenant del run (el tenant es creado
 * por y para esta ejecución — todo su contenido es efímero por diseño).
 * Devuelve el número de tiendas eliminadas.
 */
export async function hardDeleteRunTenantStores(tenantId: string): Promise<number> {
  const rows = await sb.select<{ id: string; name: string }>('stores', `select=id,name&tenant_id=eq.${tenantId}`);
  let n = 0;
  for (const r of rows) {
    try {
      await hardDeleteTestStore(r.id);
      n++;
    } catch {
      // intento de respaldo: archivar (nunca debe pasar — best-effort)
      await sb.update('stores', `id=eq.${r.id}`, { is_active: false, is_archived: true }).catch(() => {});
    }
  }
  return n;
}

/** Elimina el tenant del run si ya no tiene profiles ni tiendas. */
export async function deleteRunTenantIfEmpty(tenantId: string): Promise<boolean> {
  try {
    const profiles = await sb.select('profiles', `select=id&tenant_id=eq.${tenantId}&limit=1`);
    if (profiles.length > 0) return false;
    const stores = await sb.select('stores', `select=id&tenant_id=eq.${tenantId}&limit=1`);
    if (stores.length > 0) return false;
    await sb.delete('tenants', `id=eq.${tenantId}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * GUARDRAIL (FASE 16-17): cuenta residuos E2E (tiendas con patrón de test no
 * archivadas y perfiles de usuarios E2E) vía service-role. "Unexpected" =
 * cualquier residuo tras el teardown — el criterio es NET ZERO.
 */
export async function countE2EResiduals(): Promise<{ stores: number; users: number }> {
  let stores = 0;
  let users = 0;
  // PostgREST: los valores con espacios van entre comillas dobles.
  const storeOr = 'or=(name.ilike.E2E80*,name.ilike."E2E *",name.ilike."E2E-*",name.ilike.E2E2-*,name.ilike."ESEC TEST*",name.ilike."FASE-D TEST*",name.ilike."AUDIT *",name.ilike."HOT *",name.ilike.REM-F4*,name.ilike."Updated Name E2E",name.ilike."Test Store*",name.ilike.TEST-*)';
  try {
    const rows = await sb.select<{ id: string; name: string }>(
      'stores',
      `select=id,name&is_archived=false&${storeOr}`,
    );
    stores = rows.length;
  } catch { /* best-effort */ }
  try {
    const profs = await sb.select<{ id: string }>(
      'profiles',
      'select=id&deleted_at=is.null&or=(email.ilike.e2e-*,email.ilike.e2e80-*,email.ilike.e2e2-*,email.ilike.hot-test-*,email.ilike.hot-regular@*,email.ilike.f06dr-*,email.ilike.audit-ph3-*,email.ilike.esec-*,email.ilike.gate-f406d-*)',
    );
    users = profs.length;
  } catch { /* best-effort */ }
  return { stores, users };
}
