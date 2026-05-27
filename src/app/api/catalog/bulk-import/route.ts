import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logInfo, logError } from '@/lib/observability/logger';

/**
 * POST /api/catalog/bulk-import
 *
 * Bulk upsert products from Excel import.
 * Uses the user's JWT token to authenticate with Supabase.
 * Requires either SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) or
 * a proper RLS policy on the products table.
 */
export async function POST(req: NextRequest) {
  const route = 'POST /api/catalog/bulk-import';
  const startTime = Date.now();

  try {
    // ── Step 1: Authenticate ──────────────────────────────────
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }
    console.log(`[${route}] Authenticated user: ${session.user.id}`);

    // ── Step 2: Parse body ────────────────────────────────────
    let body: { products: any[] };
    try {
      body = await req.json();
    } catch (parseErr: any) {
      console.error(`[${route}] Body parse error:`, parseErr.message);
      return NextResponse.json(
        { error: 'Cuerpo de la petición inválido (JSON malformado)' },
        { status: 400 }
      );
    }

    const { products } = body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'No se proporcionaron productos para importar' },
        { status: 400 }
      );
    }

    if (products.length > 500) {
      return NextResponse.json(
        { error: 'Máximo 500 productos por importación' },
        { status: 400 }
      );
    }

    // ── Step 3: Validate each product ─────────────────────────
    for (const p of products) {
      if (!p.store_id || !p.sku || !p.name) {
        return NextResponse.json(
          { error: `Producto inválido: store_id, sku y name son obligatorios (SKU: "${p.sku || 'sin SKU'}")` },
          { status: 400 }
        );
      }
      if (typeof p.cost_price !== 'number' || typeof p.price !== 'number') {
        return NextResponse.json(
          { error: `Costo y precio deben ser numéricos (SKU: "${p.sku}")` },
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
        { error: 'Supabase no está configurado' },
        { status: 500 }
      );
    }

    let client: ReturnType<typeof createClient>;
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

    // ── Step 5: Upsert products ───────────────────────────────
    console.log(`[${route}] Upserting ${products.length} products...`);

    let upsertResult = await client
      .from('products')
      .upsert(products as any[], { onConflict: 'sku,store_id' });

    // If column mismatch, retry without optional columns
    if (upsertResult.error) {
      const errMsg = upsertResult.error.message || '';
      const errCode = upsertResult.error.code || '';
      console.warn(`[${route}] First upsert attempt failed:`, { code: errCode, message: errMsg });

      if (errCode === 'PGRST204' || errMsg.toLowerCase().includes('column')) {
        console.log(`[${route}] Retrying without barcode/min_stock/supplier columns`);
        const minimalProducts = products.map(
          ({ barcode, barcode_type, min_stock, supplier, ...rest }: any) => rest
        );
        upsertResult = await client
          .from('products')
          .upsert(minimalProducts as any[], { onConflict: 'sku,store_id' });
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
            error: 'Sin permisos para insertar/actualizar productos (RLS)',
            detail: `SUPABASE_SERVICE_ROLE_KEY ${serviceRoleKey ? 'configurada pero falló' : 'no configurada'}. ${!usingServiceRole ? 'La política RLS bloquea la operación.' : ''}`,
            hint: !serviceRoleKey
              ? 'Solución 1: Agregue SUPABASE_SERVICE_ROLE_KEY a su archivo .env (Settings → API en Supabase Dashboard). Solución 2: Cree una política RLS en la tabla products: CREATE POLICY "users_manage_store_products" ON products FOR ALL TO authenticated USING (store_id IN (SELECT store_id FROM user_store_memberships WHERE user_id = auth.uid() AND status = \'active\')) WITH CHECK (store_id IN (SELECT store_id FROM user_store_memberships WHERE user_id = auth.uid() AND status = \'active\'));'
              : undefined,
          },
          { status: 403 }
        );
      }

      // Constraint violation (e.g., unique constraint on sku+store_id)
      if (errCode === '23505') {
        return NextResponse.json(
          {
            error: 'Conflicto de datos: SKU duplicado para la misma tienda',
            detail: errMsg,
          },
          { status: 409 }
        );
      }

      // Generic database error
      return NextResponse.json(
        {
          error: 'Error al importar productos',
          detail: errMsg,
          code: errCode,
        },
        { status: 500 }
      );
    }

    // ── Step 7: Success ───────────────────────────────────────
    const duration = Date.now() - startTime;
    console.log(`[${route}] Success: ${products.length} products upserted in ${duration}ms`);
    logInfo(route, `Import completed: ${products.length} products (${duration}ms)`, { count: products.length, duration });

    return NextResponse.json({
      success: true,
      count: products.length,
      inserted: ((upsertResult.data as any[])?.length) ?? products.length,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[${route}] UNHANDLED exception after ${duration}ms:`, error);
    logError(route, `Unhandled exception: ${error?.message}`, error);

    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
