import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import {
  getProductCostSheetSchema,
  saveProductCostSheetSchema,
  quickPdfSchema,
  uuidLoose,
} from '@/validation/api-schemas';
import { mapProductCostSheetToContract, getProductFCStatus } from '@/contracts/product-cost-sheet';
import { z } from 'zod';

const softDeleteSchema = z.object({
  cost_sheet_id: uuidLoose,
});

// Schema for list-by-store
const listByStoreSchema = z.object({
  store_id: uuidLoose,
});

/**
 * GET /api/product-cost-sheets?product_id=xxx&store_id=xxx
 * Returns the FC for a specific product, or resolves which template to apply.
 * When only store_id is provided (no product_id), returns all cost sheets for that store.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `product-cost-sheets:get:${session.user.id}:${clientIp}`;
    const { allowed, remaining } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    const { searchParams } = new URL(req.url);
    const productIdParam = searchParams.get('product_id');
    const storeIdParam = searchParams.get('store_id');

    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // List-by-store mode: when store_id is provided and no product_id
    if (storeIdParam && !productIdParam) {
      const validated = listByStoreSchema.safeParse({ store_id: storeIdParam });
      if (!validated.success) {
        return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
      }

      // Validate store access
      const isAdmin = session.user.role === 'admin';
      const memberships = session.user.memberships || [];
      const hasAccess = isAdmin || memberships.some(m => m.store_id === validated.data.store_id && m.status === 'active');
      if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

      const { data: sheets, error: sheetsError } = await admin
        .from('product_cost_sheets')
        .select('*')
        .eq('store_id', validated.data.store_id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (sheetsError) {
        console.error('[product-cost-sheets] List-by-store error:', sheetsError.message);
        return NextResponse.json(createApiError('PRODUCT_COST_SHEET_SAVE_FAILED'), { status: 500 });
      }

      const contracts = (sheets || []).map(mapProductCostSheetToContract);
      const response = NextResponse.json({ data: contracts });
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      return response;
    }

    // Original product-based lookup
    const validated = getProductCostSheetSchema.safeParse({
      product_id: productIdParam,
      store_id: storeIdParam,
    });
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const { product_id, store_id } = validated.data;

    // Fetch product with store_id (for RLS validation and store resolution)
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, name, cost_sheet_id, fc_auto_enabled, store_id, cost_price, price')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(createApiError('PRODUCT_NOT_FOUND'), { status: 404 });
    }

    // Resolve store_id: explicit parameter > product's store_id
    const resolvedStoreId = store_id || product.store_id;
    if (!resolvedStoreId) {
      return NextResponse.json(createApiError('INVALID_DATA', 'Producto sin tienda asignada'), { status: 400 });
    }

    // Validate store access
    const isAdmin = session.user.role === 'admin';
    const memberships = session.user.memberships || [];
    const hasAccess = isAdmin || memberships.some(m => m.store_id === resolvedStoreId && m.status === 'active');
    if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

    // If product has a cost_sheet_id, fetch it
    if (product.cost_sheet_id) {
      const { data: csData, error: csError } = await admin
        .from('product_cost_sheets')
        .select('*')
        .eq('id', product.cost_sheet_id)
        .is('deleted_at', null)
        .single();

      if (!csError && csData) {
        const contract = mapProductCostSheetToContract(csData);
        const fcStatus = getProductFCStatus(product.cost_sheet_id, contract.cost_price, contract.sync_status);
        return NextResponse.json({ data: { ...contract, fc_status: fcStatus } });
      }
    }

    // No FC yet — resolve template from store
    const { data: templateData, error: templateError } = await admin
      .from('store_cost_templates')
      .select('*')
      .eq('store_id', resolvedStoreId)
      .eq('is_active', true)
      .maybeSingle();

    if (templateError) {
      return NextResponse.json(createApiError('STORE_COST_TEMPLATE_FETCH_FAILED', templateError.message), { status: 500 });
    }

    if (!templateData) {
      // No template assigned — return status indicating setup needed
      return NextResponse.json({
        data: {
          product_id,
          store_id: resolvedStoreId,
          fc_status: 'sin_fc',
          needs_template: true,
          message: 'Esta tienda no tiene plantilla de FC asignada. Configure una plantilla predeterminada primero.',
        },
      });
    }

    // Template found — return resolution info (client will calculate)
    return NextResponse.json({
      data: {
        product_id,
        store_id: resolvedStoreId,
        template_id: templateData.template_id,
        template_data: templateData.template_data,
        modalidad: templateData.modalidad,
        pdf_format: templateData.pdf_format,
        fc_status: 'pendiente',
        needs_calculation: true,
        product_info: {
          name: product.name,
          cost_price: product.cost_price,
          price: product.price,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

/**
 * POST /api/product-cost-sheets
 * Saves a calculated cost sheet for a product (after engine calculation).
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `product-cost-sheets:post:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });

    const body = await req.json();
    const validated = saveProductCostSheetSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    // Validate store access
    const isAdmin = session.user.role === 'admin';
    const memberships = session.user.memberships || [];
    const hasAccess = isAdmin || memberships.some(
      m => m.store_id === validated.data.store_id && m.status === 'active' && ['admin', 'manager', 'encargado', 'costo'].includes(m.role)
    );
    if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

    const { createClient } = await import('@supabase/supabase-js');
    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supUrl || !supKey) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(supUrl, supKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // FIX-FC-PERSIST-V3: Use direct queries instead of RPC.
    // The RPC save_product_cost_sheet uses is_global_admin()/has_store_role() which
    // rely on auth.uid() and always fail with the service role key.
    // Authorization already validated above.
    // NOTE: Cannot use upsert with onConflict because the unique index is partial
    // (WHERE deleted_at IS NULL). Use check-then-insert/update pattern.

    const { data: existingCS } = await admin
      .from('product_cost_sheets')
      .select('id')
      .eq('product_id', validated.data.product_id)
      .is('deleted_at', null)
      .maybeSingle();

    let csData: { id: string; product_id: string; cost_price: number; cost_price_updated_at?: string; sync_status: string } | null = null;

    if (existingCS) {
      const { data, error: updateErr } = await admin
        .from('product_cost_sheets')
        .update({
          template_id: validated.data.template_id,
          modalidad: validated.data.modalidad,
          calculated_data: validated.data.calculated_data,
          cost_price: validated.data.cost_price,
          sync_status: 'synced',
        })
        .eq('id', existingCS.id)
        .select('id, product_id, cost_price, cost_price_updated_at, sync_status')
        .single();

      if (updateErr) {
        return NextResponse.json(createApiError('PRODUCT_COST_SHEET_SAVE_FAILED', updateErr.message), { status: 500 });
      }
      csData = data;
    } else {
      const { data, error: insertErr } = await admin
        .from('product_cost_sheets')
        .insert({
          product_id: validated.data.product_id,
          store_id: validated.data.store_id,
          template_id: validated.data.template_id,
          modalidad: validated.data.modalidad,
          calculated_data: validated.data.calculated_data,
          cost_price: validated.data.cost_price,
          sync_status: 'synced',
        })
        .select('id, product_id, cost_price, cost_price_updated_at, sync_status')
        .single();

      if (insertErr) {
        return NextResponse.json(createApiError('PRODUCT_COST_SHEET_SAVE_FAILED', insertErr.message), { status: 500 });
      }
      csData = data;
    }

    // Link product to cost sheet
    await admin
      .from('products')
      .update({ cost_sheet_id: csData!.id })
      .eq('id', validated.data.product_id);

    return NextResponse.json({ data: csData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/product-cost-sheets
 * Soft-deletes a cost sheet (sets deleted_at) and clears cost_sheet_id on products.
 * Admin-only.
 */
async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `product-cost-sheets:patch:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 3 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });

    const body = await req.json();
    const validated = softDeleteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const { cost_sheet_id } = validated.data;

    const { createClient } = await import('@supabase/supabase-js');
    const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supUrl || !supKey) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(supUrl, supKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Soft-delete: set deleted_at on the cost sheet
    const { error: updateError } = await admin
      .from('product_cost_sheets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', cost_sheet_id);

    if (updateError) {
      console.error('[product-cost-sheets] Soft-delete error:', updateError.message);
      return NextResponse.json(createApiError('PRODUCT_COST_SHEET_SAVE_FAILED'), { status: 500 });
    }

    // Clear cost_sheet_id on all products referencing this cost sheet
    await admin
      .from('products')
      .update({ cost_sheet_id: null })
      .eq('cost_sheet_id', cost_sheet_id);

    return NextResponse.json({ data: { soft_deleted: true, cost_sheet_id } }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const GET = withTracing(withAuth(getHandler) as Parameters<typeof withTracing>[0], 'GET /api/product-cost-sheets');
export const POST = withTracing(withRole('encargado', postHandler as Parameters<typeof withRole>[1]), 'POST /api/product-cost-sheets');
export const PATCH = withTracing(withRole('encargado', patchHandler as Parameters<typeof withRole>[1]), 'PATCH /api/product-cost-sheets');
