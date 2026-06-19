import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { quickPdfSchema } from '@/validation/api-schemas';
import { autoGenerateFC, type FCGenerationResult, type FCGenerationError } from '@/lib/integration/fc-generator-service';
import { getAdminClient } from '@/lib/supabase-admin';
import { auditService } from '@/services/audit-service';
import type { FCStoreTemplateInput, FCExistingCostSheetInput } from '@/lib/integration/fc-automation';

export const runtime = 'nodejs';

/**
 * POST /api/product-cost-sheets/auto-generate
 *
 * Genera automáticamente la FC para un producto usando la plantilla
 * de la tienda. Pipeline completo:
 *   1. Validar acceso al producto y la tienda
 *   2. Obtener datos del producto desde Supabase
 *   3. Resolver plantilla de la tienda
 *   4. Calcular FC con el cost-engine
 *   5. Guardar resultado via RPC atómica
 *   6. Retornar FC generada
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `fc-auto-generate:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });

    const body = await req.json();
    const validated = quickPdfSchema.safeParse({
      product_id: body.product_id,
      store_id: body.store_id,
      pdf_format: body.pdf_format,
    });
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const { product_id, store_id, pdf_format } = validated.data;
    const admin = await getAdminClient();

    // 1. Fetch product data
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, name, sku, cost_price, price, unit_of_measure, category, store_id, cost_sheet_id, fc_auto_enabled')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(createApiError('PRODUCT_NOT_FOUND'), { status: 404 });
    }

    // 2. Resolve store_id
    const resolvedStoreId = store_id || product.store_id;
    if (!resolvedStoreId) {
      return NextResponse.json(createApiError('INVALID_DATA', 'Producto sin tienda asignada'), { status: 400 });
    }

    // 3. Validate store access
    const isAdmin = session.user.role === 'admin';
    const memberships = session.user.memberships || [];
    const hasAccess = isAdmin || memberships.some(
      m => m.store_id === resolvedStoreId && m.status === 'active' && ['admin', 'manager', 'encargado', 'costo'].includes(m.role)
    );
    if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

    // 4. Check fc_auto_enabled
    if (product.fc_auto_enabled === false) {
      return NextResponse.json({
        data: {
          product_id,
          fc_status: 'sin_fc',
          message: 'La generación automática de FC está deshabilitada para este producto.',
        },
      });
    }

    // 5. Get store template
    const { data: storeTemplate, error: templateError } = await admin
      .from('store_cost_templates')
      .select('*')
      .eq('store_id', resolvedStoreId)
      .eq('is_active', true)
      .maybeSingle();

    if (templateError) {
      console.error('[FC Auto-Generate] Template fetch error:', templateError.message);
      return NextResponse.json(createApiError('STORE_COST_TEMPLATE_FETCH_FAILED'), { status: 500 });
    }

    if (!storeTemplate) {
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

    // 6. If product already has a valid FC, fetch it
    let existingCostSheet: FCExistingCostSheetInput | null = null;
    if (product.cost_sheet_id) {
      const { data: csData } = await admin
        .from('product_cost_sheets')
        .select('*')
        .eq('id', product.cost_sheet_id)
        .is('deleted_at', null)
        .single();

      if (csData) {
        existingCostSheet = {
          id: csData.id as string,
          product_id: csData.product_id as string,
          store_id: (csData.store_id as string) || resolvedStoreId,
          template_id: (csData.template_id as string) || '',
          modalidad: (csData.modalidad as 'produccion' | 'servicios' | 'comercializacion') || 'produccion',
          calculated_data: (csData.calculated_data as Record<string, unknown>) || {},
          cost_price: typeof csData.cost_price === 'string' ? parseFloat(csData.cost_price) : ((csData.cost_price as number) ?? 0),
          cost_price_updated_at: (csData.cost_price_updated_at as string) ?? new Date().toISOString(),
          sync_status: (csData.sync_status as 'pending' | 'synced' | 'conflict') ?? 'synced',
          created_at: (csData.created_at as string) ?? new Date().toISOString(),
          updated_at: (csData.updated_at as string) ?? new Date().toISOString(),
          deleted_at: (csData.deleted_at as string | null) ?? null,
        };
      }
    }

    // 7. Generate FC
    const storeTemplateInput: FCStoreTemplateInput = {
      template_id: storeTemplate.template_id,
      template_data: storeTemplate.template_data,
      modalidad: storeTemplate.modalidad,
      pdf_format: storeTemplate.pdf_format,
      is_active: storeTemplate.is_active,
    };

    const genResult = await autoGenerateFC({
      product: {
        name: product.name,
        sku: product.sku,
        cost_price: product.cost_price,
        price: product.price,
        unit_of_measure: product.unit_of_measure,
        category: product.category,
      },
      product_id,
      store_id: resolvedStoreId,
      storeTemplate: storeTemplateInput,
      existingCostSheet,
      fc_auto_enabled: product.fc_auto_enabled,
    });

    if (!genResult.success) {
      const err = genResult as FCGenerationError;
      return NextResponse.json({
        data: {
          product_id,
          store_id: resolvedStoreId,
          fc_status: 'pendiente',
          generation_error: err.error,
          error_code: err.code,
        },
      }, { status: 422 });
    }

    const result = genResult as FCGenerationResult;

    // 8. Save cost sheet directly (FIX-FC-PERSIST-V3: replaced admin.rpc('save_product_cost_sheet')
    //    with direct queries because the RPC uses is_global_admin()/has_store_role() which
    //    rely on auth.uid() and always fail when called with the service role key.
    //    Authorization is already validated above (lines 67-72).
    //    NOTE: Cannot use upsert with onConflict='product_id' because the unique index
    //    is a partial index (WHERE deleted_at IS NULL), which Supabase doesn't support
    //    in onConflict. Use check-then-insert/update pattern instead.

    // Validate modalidad (same check the RPC did)
    if (!['produccion', 'servicios', 'comercializacion'].includes(result.modalidad)) {
      return NextResponse.json(createApiError('INVALID_DATA', 'Modalidad inválida'), { status: 400 });
    }

    // Check if an active cost sheet already exists for this product
    const { data: existingCS } = await admin
      .from('product_cost_sheets')
      .select('id')
      .eq('product_id', product_id)
      .is('deleted_at', null)
      .maybeSingle();

    let csData: { id: string; product_id: string; cost_price: number; cost_price_updated_at?: string; sync_status: string } | null = null;

    if (existingCS) {
      // Update existing cost sheet
      const { data, error: updateErr } = await admin
        .from('product_cost_sheets')
        .update({
          template_id: result.template_id,
          modalidad: result.modalidad,
          calculated_data: result.calculated_data,
          cost_price: result.cost_price,
          sync_status: 'synced',
        })
        .eq('id', existingCS.id)
        .select('id, product_id, cost_price, cost_price_updated_at, sync_status')
        .single();

      if (updateErr) {
        console.error('[FC Auto-Generate] Error updating cost sheet:', updateErr.message);
        return NextResponse.json({
          data: { product_id, store_id: resolvedStoreId, fc_status: 'pendiente', calculated: true, cost_price: result.cost_price },
        }, { status: 500 });
      }
      csData = data;
    } else {
      // Insert new cost sheet
      const { data, error: insertErr } = await admin
        .from('product_cost_sheets')
        .insert({
          product_id,
          store_id: resolvedStoreId,
          template_id: result.template_id,
          modalidad: result.modalidad,
          calculated_data: result.calculated_data,
          cost_price: result.cost_price,
          sync_status: 'synced',
        })
        .select('id, product_id, cost_price, cost_price_updated_at, sync_status')
        .single();

      if (insertErr) {
        console.error('[FC Auto-Generate] Error inserting cost sheet:', insertErr.message);
        return NextResponse.json({
          data: { product_id, store_id: resolvedStoreId, fc_status: 'pendiente', calculated: true, cost_price: result.cost_price },
        }, { status: 500 });
      }
      csData = data;
    }

    // Link product to cost sheet
    await admin
      .from('products')
      .update({ cost_sheet_id: csData!.id })
      .eq('id', product_id);

    const saveData = csData;

    // 9. Audit log
    await auditService.logFCGenerated({
      userId: session.user.id,
      productId: product_id,
      storeId: resolvedStoreId,
      templateId: result.template_id,
      costPrice: result.cost_price,
      salePrice: result.sale_price ?? product.price,
      isAutoGenerated: true,
    });

    // 10. Return success
    return NextResponse.json({
      data: {
        ...saveData,
        fc_status: 'vigente',
        generated: true,
        cost_price: result.cost_price,
        total_cost: result.total_cost,
        total_margin: result.total_margin,
        total_tax: result.total_tax,
        grand_total: result.grand_total,
        elapsed_ms: result.elapsed_ms,
        validation_errors: result.validation_errors,
        pdf_format: pdf_format || storeTemplate.pdf_format,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FC Auto-Generate] Unexpected error:', message);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

export const POST = withTracing(
  withRole('encargado', postHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/product-cost-sheets/auto-generate',
);
