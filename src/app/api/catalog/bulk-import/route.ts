import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logInfo, logError } from '@/lib/observability/logger';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { createApiError } from '@/lib/api-errors';

/**
 * POST /api/catalog/bulk-import
 *
 * Bulk upsert products from Excel import.
 * Uses the user's JWT token to authenticate with Supabase.
 * Requires either SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) or
 * a proper RLS policy on the products table.
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

    // ── Step 2: Parse body ────────────────────────────────────
    let body: { products: any[] };
    try {
      body = await req.json();
    } catch (parseErr: unknown) {
      console.error(`[${route}] Body parse error:`, parseErr instanceof Error ? parseErr.message : String(parseErr));
      return NextResponse.json(
        createApiError('INVALID_JSON'),
        { status: 400 }
      );
    }

    const { products } = body;

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

    // ── Step 3: Validate each product ─────────────────────────
    for (const p of products) {
      if (!p.store_id || !p.sku || !p.name) {
        return NextResponse.json(
          { ...createApiError('BULK_IMPORT_INVALID_PRODUCT'), sku: p.sku || 'sin SKU' },
          { status: 400 }
        );
      }
      if (typeof p.cost_price !== 'number' || typeof p.price !== 'number') {
        return NextResponse.json(
          { ...createApiError('BULK_IMPORT_INVALID_PRICES'), sku: p.sku },
          { status: 400 }
        );
      }
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
    } else {
      // Strategy 2: user-token client (respects RLS)
      client = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${session.token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      usingServiceRole = false;
    }

    // ── FIX-SEC-H2: Validate store membership ────────────────
    // User must have active membership for every store_id in the import
    const uniqueStoreIds = [...new Set(products.map(p => p.store_id))];
    const isAdmin = (session.user as any).role === 'admin';
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

    // ── Step 5: Upsert products ───────────────────────────────

    // FIX-SEC-H2: When using service_role, add store_id filter to ensure RLS-equivalent isolation
    // Filter products to only those stores the user has access to (defense in depth)
    const authorizedProducts = isAdmin ? products : products.filter(p => accessibleStoreIds.has(p.store_id));

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
