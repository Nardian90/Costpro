import { isAdminLevel } from '@/lib/roles';
import { isTenantRlsEnabled } from '@/lib/rls-middleware';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logInfo, logError } from '@/lib/observability/logger';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';
import { bulkImportProductSchema, type BulkImportProduct } from '@/validation/api-schemas';

/**
 * POST /api/catalog/bulk-import
 *
 * Bulk upsert products from Excel import.
 * Uses the user's JWT token to authenticate with Supabase.
 * Requires either SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) or
 * a proper RLS policy on the products table.
 *
 * CP-CATÁLOGO MAESTRO (2026-10-28) — autorización por fila en el servidor:
 * El service_role SOLO es el transporte de escritura; la autorización se
 * resuelve explícitamente aquí y nunca se delega en el cliente:
 *   1. Cada fila valida su tienda contra `stores` leído del servidor y su
 *      organización (`stores.tenant_id`); el `tenant_id` de cada fila se
 *      ESTAMPA desde el servidor (patrón resolveStoreTenantId, CP-CAT-004).
 *      Antes de este fix, con service_role todas las filas entraban con
 *      tenant_id NULL (sin trigger que lo derive en BD).
 *   2. Con USE_TENANT_RLS=true el admin ordinario queda limitado a tiendas
 *      de SU organización (superadmin conserva alcance de plataforma).
 *   3. Los no-admin conservan el check de membresía activa por tienda
 *      (FIX-SEC-H2) y, además, la organización de la fila debe coincidir
 *      con la del llamante (defensa en profundidad).
 */
// FIX-SEC-H2: Wrap with withAuth for membership-enriched session
async function bulkImportHandler(req: NextRequest, session: AuthenticatedSession) {
  const route = 'POST /api/catalog/bulk-import';
  const startTime = Date.now();

  try {
    // FIX-AUDIT-12: CSRF validation on bulk import
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    // ── Step 1: Authenticate (handled by withAuth) ────────────
    console.log(`[${route}] Authenticated user: ${session.user.id}`);

    // ── Step 2: Parse body ────────────────────────────────────
    let body: { products?: unknown[] };
    try {
      body = await req.json();
    } catch (parseErr: unknown) {
      console.error(`[${route}] Body parse error:`, parseErr instanceof Error ? parseErr.message : String(parseErr));
      return NextResponse.json(
        createApiError('INVALID_JSON'),
        { status: 400 }
      );
    }

    const products = body.products;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        createApiError('BULK_IMPORT_NO_PRODUCTS'),
        { status: 400 }
      );
    }

    if (products.length > 500) {
      return NextResponse.json(
        createApiError('BULK_IMPORT_LIMIT'),
        { status: 400 }
      );
    }

    // ── Step 3: Validate each product (CP-CAT-005: Zod fail-closed por fila) ─
    // El contrato completo vive en @/validation/api-schemas (fuente única).
    // .strict() rechaza propiedades desconocidas: nada fuera del contrato
    // documentado del importador llega al upsert (antes, cualquier propiedad
    // extra viajaba al INSERT confiando en el error PGRST204 de PostgREST).
    const rowErrors: Array<{ row: number; sku: string; issues: string[] }> = [];
    const validatedProducts: BulkImportProduct[] = [];
    products.forEach((p: unknown, idx: number) => {
      const parsed = bulkImportProductSchema.safeParse(p);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .slice(0, 5)
          .map(i => `${i.path.join('.') || '(fila)'}: ${i.message}`);
        const rawSku = (p as Record<string, unknown> | null)?.sku;
        rowErrors.push({
          row: idx,
          sku: rawSku !== undefined && rawSku !== null ? String(rawSku) : 'sin SKU',
          issues,
        });
      } else {
        validatedProducts.push(parsed.data);
      }
    });

    if (rowErrors.length > 0) {
      return NextResponse.json(
        {
          ...createApiError('BULK_IMPORT_INVALID_PRODUCT'),
          sku: rowErrors[0].sku,
          errors: rowErrors,
        },
        { status: 400 }
      );
    }

    // ── Step 4: Create Supabase client ────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        createApiError('CONFIG_ERROR'),
        { status: 500 }
      );
    }

    let client: SupabaseClient;
    let usingServiceRole = false;

    if (serviceRoleKey) {
      // Strategy 1: service_role client (bypasses RLS)
      client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      usingServiceRole = true;
      console.log(`[${route}] Using service_role client`);
    } else {
      // Strategy 2: user-token client (respects RLS)
      client = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${session.token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      usingServiceRole = false;
      console.log(`[${route}] Using user-token client (RLS applies)`);
    }

    // ── FIX-SEC-H2: Validate store membership ────────────────
    // User must have active membership for every store_id in the import.
    // NOTA (Decisión B.1 ratificada 2026-10-20): el admin global NO se filtra
    // por membresías — su alcance global está documentado con hoja de ruta
    // SaaS; este fix no reabre esa decisión.
    const uniqueStoreIds = [...new Set(validatedProducts.map(p => p.store_id))];
    // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
    const isAdmin = isAdminLevel(session.user.role);
    const memberships = (session.user as any).memberships || [];
    const accessibleStoreIds = new Set(memberships.filter((m: any) => m.status === 'active').map((m: any) => m.store_id));

    if (!isAdmin) {
      const unauthorizedStores = uniqueStoreIds.filter(sid => !accessibleStoreIds.has(sid));
      if (unauthorizedStores.length > 0) {
        return NextResponse.json(
          { ...createApiError('STORE_ACCESS_DENIED'), stores: unauthorizedStores },
          { status: 403 }
        );
      }
    }

    // ── Step 4b (CP-CATÁLOGO): autorización por fila en el servidor ──
    // Lee tiendas y el perfil del llamante DESDE LA BD (nunca del cliente) y
    // estampa el tenant_id de cada fila desde stores.tenant_id.
    type StoreRow = { id: string; tenant_id: string | null };
    const { data: storeRows, error: storesErr } = await (client as any)
      .from('stores')
      .select('id, tenant_id')
      .in('id', uniqueStoreIds);

    if (storesErr) {
      console.error(`[${route}] stores lookup failed:`, storesErr.message);
      return NextResponse.json(
        { ...createApiError('BULK_IMPORT_FAILED'), detail: storesErr.message },
        { status: 500 }
      );
    }

    const storeTenantMap = new Map<string, string>();
    const missingStores: string[] = [];
    const nullTenantStores: string[] = [];
    for (const sid of uniqueStoreIds) {
      const row = (storeRows as StoreRow[] | null)?.find(s => s.id === sid);
      if (!row) {
        missingStores.push(sid);
      } else if (!row.tenant_id) {
        nullTenantStores.push(sid);
      } else {
        storeTenantMap.set(sid, row.tenant_id);
      }
    }

    if (missingStores.length > 0) {
      return NextResponse.json(
        { ...createApiError('BULK_IMPORT_INVALID_PRODUCT'), detail: 'Tienda inexistente en filas del import.', stores: missingStores },
        { status: 400 }
      );
    }
    if (nullTenantStores.length > 0) {
      // Fail-closed: no se importan filas sin organización verificada.
      return NextResponse.json(
        { ...createApiError('STORE_ACCESS_DENIED'), detail: 'Tienda sin organización asignada (tenant_id nulo); importación bloqueada para esas filas.', stores: nullTenantStores },
        { status: 403 }
      );
    }

    // Perfil del llamante leído del servidor (rol y organización reales).
    const isSuperadmin = session.user.role === 'superadmin';
    let callerTenantId: string | null = null;
    const { data: profileRow, error: profileErr } = await (client as any)
      .from('profiles')
      .select('tenant_id')
      .eq('id', session.user.id)
      .maybeSingle();
    if (profileErr) {
      console.error(`[${route}] profile lookup failed:`, profileErr.message);
      return NextResponse.json(
        { ...createApiError('BULK_IMPORT_FAILED'), detail: profileErr.message },
        { status: 500 }
      );
    }
    callerTenantId = (profileRow as { tenant_id: string | null } | null)?.tenant_id ?? null;

    // Matriz de autorización por tienda:
    //  · superadmin: alcance de plataforma (transversal, sin membresías).
    //  · admin ordinario: global según Decisión B.1; con USE_TENANT_RLS=true
    //    se limita a tiendas de su organización (Tabla 6 del informe).
    //  · resto: membresía activa (Step 4a) + misma organización (defensa en
    //    profundidad contra tiendas cruzadas de la misma membresía)
    const tenantRestricted = !isSuperadmin && isTenantRlsEnabled();
    const unauthorizedStores: string[] = [];
    for (const sid of uniqueStoreIds) {
      const storeTenant = storeTenantMap.get(sid)!;
      if (isSuperadmin) continue;
      if (isAdmin) {
        if (tenantRestricted && callerTenantId && storeTenant !== callerTenantId) {
          unauthorizedStores.push(sid);
        }
        continue;
      }
      if (callerTenantId && storeTenant !== callerTenantId) {
        unauthorizedStores.push(sid);
      }
    }
    if (unauthorizedStores.length > 0) {
      logInfo(route, 'bulk-import cross-org blocked', {
        actor: session.user.id,
        stores: unauthorizedStores,
      });
      return NextResponse.json(
        { ...createApiError('STORE_TENANT_MISMATCH'), stores: unauthorizedStores },
        { status: 403 }
      );
    }

    // ── Step 5: Upsert products ───────────────────────────────
    console.log(`[${route}] Upserting ${products.length} products...`);

    // FIX-SEC-H2 + CP-CATÁLOGO: filtro por accesibilidad (defensa en profundidad)
    // y estampado del tenant_id desde stores.tenant_id (nunca del cliente).
    const authorizedProducts = (isAdmin && !tenantRestricted
      ? validatedProducts
      : validatedProducts.filter(p => accessibleStoreIds.has(p.store_id))
    ).map(p => ({
      ...p,
      tenant_id: storeTenantMap.get(p.store_id)!,
    }));

    if (authorizedProducts.length === 0) {
      return NextResponse.json(
        createApiError('STORE_ACCESS_DENIED'),
        { status: 403 }
      );
    }

    // ── Step 4b: CP-CAT-MAESTRO-003 — safeguard de identidad compartida ─────
    // Si la tienda destino está conectada al catálogo maestro de su
    // organización y el SKU ya existe como maestro ACTIVO, la fila se estampa
    // con master_product_id ANTES del upsert: reutiliza la identidad existente
    // (jamás una bifurcación) y el trigger trg_products_master_identity_guard
    // coerciona sku/name al maestro. Crear maestros NUEVOS desde importaciones
    // queda en el mecanismo gobernado existente (create_master_product /
    // incorporate_store_products_to_master) — fuera del alcance conservador de
    // esta ruta. Best-effort: un fallo de estampado NO bloquea la importación
    // (la reconciliación posterior puede recuperar esas filas: la RPC
    // incorporate_store_products_to_master es idempotente).
    try {
      const importStoreIds = [...new Set(authorizedProducts.map(p => p.store_id))];
      const { data: connectedLinks, error: linksErr } = await (client as any)
        .from('catalog_store_links')
        .select('store_id, tenant_id, status')
        .in('store_id', importStoreIds)
        .eq('status', 'connected');
      if (linksErr) throw linksErr;
      const connectedStoreIds = new Set<string>(((connectedLinks || []) as Array<{ store_id: string }>).map(l => l.store_id));

      if (connectedStoreIds.size > 0) {
        const skusByStore = new Map<string, Set<string>>();
        for (const p of authorizedProducts) {
          if (!connectedStoreIds.has(p.store_id)) continue;
          const sku = String(p.sku || '').trim();
          if (!sku) continue;
          if (!skusByStore.has(p.store_id)) skusByStore.set(p.store_id, new Set());
          skusByStore.get(p.store_id)!.add(sku);
        }
        const activeMasterIdByTenantSku = new Map<string, string>();
        for (const [sid, skus] of skusByStore) {
          const tid = storeTenantMap.get(sid);
          if (!tid) continue;
          const { data: masters, error: mastersErr } = await (client as any)
            .from('master_products')
            .select('id, sku, tenant_id, status')
            .eq('tenant_id', tid)
            .in('sku', [...skus]);
          if (mastersErr) throw mastersErr;
          for (const m of (masters || []) as Array<{ id: string; sku: string; tenant_id: string; status: string }>) {
            if (m.status === 'active') activeMasterIdByTenantSku.set(`${m.tenant_id}|${m.sku}`, m.id);
          }
        }
        let stamped = 0;
        for (const p of authorizedProducts) {
          const tid = storeTenantMap.get(p.store_id);
          const sku = String(p.sku || '').trim();
          const mid = tid && sku ? activeMasterIdByTenantSku.get(`${tid}|${sku}`) : undefined;
          if (mid) {
            (p as Record<string, unknown>).master_product_id = mid;
            stamped++;
          }
        }
        if (stamped > 0) {
          logInfo(route, `bulk-import master-stamp: ${stamped} fila(s) reutilizan identidad compartida existente`, { stamped });
        }
      }
    } catch (stampErr) {
      logError(route, 'bulk-import master-stamp failed (best-effort, importación continúa)', stampErr);
    }

    // Use explicit any cast for the array to avoid 'any[]' to 'never[]' assignment error
    let upsertResult = await (client
      .from('products') as any)
      .upsert(authorizedProducts as any, { onConflict: 'sku,store_id' });

    // If column mismatch, retry without optional columns
    if (upsertResult.error) {
      const errMsg = upsertResult.error.message || '';
      const errCode = upsertResult.error.code || '';
      console.warn(`[${route}] First upsert attempt failed:`, { code: errCode, message: errMsg });

      if (errCode === 'PGRST204' || errMsg.toLowerCase().includes('column')) {
        console.log(`[${route}] Retrying without barcode/min_stock/supplier columns`);
        const minimalProducts = authorizedProducts.map(
          ({ barcode, barcode_type, min_stock, supplier, ...rest }: any) => rest
        );
        upsertResult = await (client
          .from('products') as any)
          .upsert(minimalProducts as any, { onConflict: 'sku,store_id' });
      }
    }

    // ── Step 6: Handle errors ─────────────────────────────────
    if (upsertResult.error) {
      const err = upsertResult.error;
      const errMsg = err.message || '';
      const errCode = err.code || '';
      console.error(`[${route}] Upsert failed:`, { code: errCode, message: errMsg, details: err.details, hint: err.hint });

      // RLS permission denied (Postgres error 42501)
      if (errCode === '42501' || errMsg.toLowerCase().includes('row-level security') || errMsg.toLowerCase().includes('policy')) {
        return NextResponse.json(
          {
            ...createApiError('BULK_IMPORT_RLS_DENIED'),
            detail: `SUPABASE_SERVICE_ROLE_KEY ${serviceRoleKey ? 'configured but failed' : 'not configured'}. ${!usingServiceRole ? 'RLS policy blocks the operation.' : ''}`,
          },
          { status: 403 }
        );
      }

      // Constraint violation (e.g., unique constraint on sku+store_id)
      if (errCode === '23505') {
        return NextResponse.json(
          { ...createApiError('BULK_IMPORT_CONFLICT'), detail: errMsg },
          { status: 409 }
        );
      }

      // Generic database error
      return NextResponse.json(
        { ...createApiError('BULK_IMPORT_FAILED'), detail: errMsg, code: errCode },
        { status: 500 }
      );
    }

    // ── Step 7: Success ───────────────────────────────────────
    const duration = Date.now() - startTime;
    console.log(`[${route}] Success: ${authorizedProducts.length} products upserted in ${duration}ms`);
    logInfo(route, `Import completed: ${authorizedProducts.length} products (${duration}ms)`, { count: authorizedProducts.length, duration });

    return NextResponse.json({
      success: true,
      count: authorizedProducts.length,
      inserted: (upsertResult as any).data ? ((upsertResult as any).data as any[]).length : authorizedProducts.length,
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error(`[${route}] UNHANDLED exception after ${duration}ms:`, error);
    logError(route, `Unhandled exception: ${error instanceof Error ? error.message : String(error)}`, error);

    return NextResponse.json(
      { ...createApiError('INTERNAL_ERROR'), detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export const POST = withTracing(
  withAuth(bulkImportHandler as any) as any,
  'POST /api/catalog/bulk-import'
);
