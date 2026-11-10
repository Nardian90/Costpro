import { NextRequest, NextResponse } from 'next/server';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { generateFromTemplateSchema } from '@/validation/api-schemas';
import { generateFCFromTemplateData, type FCGenerationResult, type FCGenerationError } from '@/lib/integration/fc-generator-service';
import {
  getVisibleUserTemplate,
  hasStoreMembership,
  inferModalidadFromTemplate,
} from '@/lib/integration/fc-template-resolution';
import { getAdminClient } from '@/lib/supabase-admin';
import { auditService } from '@/services/audit-service';
import { invalidateCache } from '@/lib/fc-pdf-cache';

export const runtime = 'nodejs';

/**
 * POST /api/product-cost-sheets/generate-from-template
 * FC-USR-TEMPLATE (misión 2026-11-10: conexión Producto ↔ Ficha de Costo).
 *
 * Conecta un producto del inventario con una Ficha de Costo construida a partir
 * de una PLANTILLA GUARDADA POR EL USUARIO (cost_sheet_templates — «Mis Plantillas
 * Guardadas en COSTPRO»). No exige plantilla predeterminada de tienda.
 *
 * Pipeline:
 *   1. Validar payload (Zod) + CSRF + rate limit
 *   2. Cargar producto y validar pertenencia a la tienda (aislamiento multitienda)
 *   3. Validar autorización del caller en la tienda (admin|manager|encargado|costo)
 *   4. Cargar plantilla y validar visibilidad (espejo manual de la RLS de
 *      cost_sheet_templates: private→propietario; public→global o tienda con acceso)
 *   5. Generar FC con generateFCFromTemplateData (pipeline cost-engine)
 *   6. Upsert en product_cost_sheets (patrón check-then-insert/update — índice
 *      único parcial) y enlazar products.cost_sheet_id
 *   7. Invalidar caché de PDF + auditoría
 *
 * La asociación resultante es persistente (BD), sobrevive a recargas, sesiones y
 * dispositivos, y respeta el aislamiento por tienda (product_cost_sheets.store_id).
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `fc-generate-from-template:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 15 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    if (!validateOrigin(req)) return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });

    const body = await req.json();
    const validated = generateFromTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const { product_id, template_id, modalidad, pdf_format } = validated.data;
    const admin = await getAdminClient();

    // ── 2. Producto ──
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, name, sku, cost_price, price, unit_of_measure, category, store_id, cost_sheet_id, fc_auto_enabled')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(createApiError('PRODUCT_NOT_FOUND'), { status: 404 });
    }

    const resolvedStoreId = validated.data.store_id || product.store_id;
    if (!resolvedStoreId) {
      return NextResponse.json(createApiError('INVALID_DATA', 'Producto sin tienda asignada'), { status: 400 });
    }

    // Aislamiento multitienda: el producto DEBE pertenecer a la tienda objetivo.
    // Bloquea conectar productos de otra organización con plantillas de esta sesión.
    if (product.store_id && product.store_id !== resolvedStoreId) {
      return NextResponse.json(createApiError('FC_PRODUCT_STORE_MISMATCH'), { status: 403 });
    }

    // ── 3. Autorización en la tienda (mismo criterio que auto-generate) ──
    const hasAccess = hasStoreMembership(session.user, resolvedStoreId, ['admin', 'manager', 'encargado', 'costo']);
    if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

    // ── 4. Plantilla visible para el usuario ──
    const templateResult = await getVisibleUserTemplate(admin, template_id, session.user);
    if (templateResult.error) {
      // not_found (no existe) o not_visible (privada ajena / pública de tienda
      // sin acceso) — misma respuesta para no revelar existencia de plantillas
      // de otras cuentas.
      return NextResponse.json(createApiError('FC_TEMPLATE_NOT_FOUND'), { status: 404 });
    }
    const { template } = templateResult;

    if (!template.data || typeof template.data !== 'object') {
      return NextResponse.json(createApiError('FC_TEMPLATE_INVALID'), { status: 422 });
    }

    // Modalidad: explícita > inferida del header de la plantilla > produccion.
    // (La modalidad queda en el CONTEXTO de la FC — la plantilla original no se toca.)
    const effectiveModalidad = modalidad ?? inferModalidadFromTemplate(template.data);

    // ── 5. Generar FC ──
    const genResult = await generateFCFromTemplateData(
      {
        name: product.name,
        sku: product.sku,
        cost_price: typeof product.cost_price === 'string' ? parseFloat(product.cost_price) : product.cost_price,
        price: typeof product.price === 'string' ? parseFloat(product.price) : product.price,
        unit_of_measure: product.unit_of_measure,
        category: product.category,
      },
      template.data,
      template.id,
      effectiveModalidad,
    );

    if (!genResult.success) {
      const err = genResult as FCGenerationError;
      return NextResponse.json({
        data: {
          product_id,
          store_id: resolvedStoreId,
          template_id,
          fc_status: 'pendiente',
          generation_error: err.error,
          error_code: err.code,
        },
      }, { status: 422 });
    }

    const result = genResult as FCGenerationResult;

    if (!['produccion', 'servicios', 'comercializacion'].includes(result.modalidad)) {
      return NextResponse.json(createApiError('INVALID_DATA', 'Modalidad inválida'), { status: 400 });
    }

    // ── 6. Upsert product_cost_sheets (patrón FIX-FC-PERSIST-V3) ──
    const { data: existingCS } = await admin
      .from('product_cost_sheets')
      .select('id')
      .eq('product_id', product_id)
      .is('deleted_at', null)
      .maybeSingle();

    let csData: { id: string; product_id: string; cost_price: number; cost_price_updated_at?: string; sync_status: string } | null = null;

    if (existingCS) {
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
        console.error('[FC Generate-From-Template] Error updating cost sheet:', updateErr.message);
        return NextResponse.json(createApiError('PRODUCT_COST_SHEET_SAVE_FAILED'), { status: 500 });
      }
      csData = data;
    } else {
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
        console.error('[FC Generate-From-Template] Error inserting cost sheet:', insertErr.message);
        return NextResponse.json(createApiError('PRODUCT_COST_SHEET_SAVE_FAILED'), { status: 500 });
      }
      csData = data;
    }

    // Enlazar producto → FC (asociación persistente)
    await admin
      .from('products')
      .update({ cost_sheet_id: csData!.id })
      .eq('id', product_id);

    // ── 7. Invalidar caché de PDF (la FC cambió) + auditoría ──
    await invalidateCache(resolvedStoreId, product_id);

    await auditService.logFCGenerated({
      userId: session.user.id,
      productId: product_id,
      storeId: resolvedStoreId,
      templateId: result.template_id,
      costPrice: result.cost_price,
      salePrice: result.sale_price ?? product.price,
      isAutoGenerated: false,
    });

    return NextResponse.json({
      data: {
        ...csData,
        template_id: result.template_id,
        template_name: template.name,
        modalidad: result.modalidad,
        fc_status: 'vigente',
        generated: true,
        template_source: 'user',
        cost_price: result.cost_price,
        total_cost: result.total_cost,
        total_margin: result.total_margin,
        total_tax: result.total_tax,
        grand_total: result.grand_total,
        elapsed_ms: result.elapsed_ms,
        validation_errors: result.validation_errors,
        pdf_format,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FC Generate-From-Template] Unexpected error:', message);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

export const POST = withTracing(
  withRole('encargado', postHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/product-cost-sheets/generate-from-template',
);
