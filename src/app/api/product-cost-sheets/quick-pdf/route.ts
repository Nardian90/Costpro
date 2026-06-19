import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { quickPdfSchema } from '@/validation/api-schemas';
import { getAdminClient } from '@/lib/supabase-admin';
import { mapProductCostSheetToContract } from '@/contracts/product-cost-sheet';
import { auditService } from '@/services/audit-service';
import { getCachedPdf, setCachedPdf, buildCacheKey } from '@/lib/fc-pdf-cache';
import { generateFCPdf } from '@/lib/export/generate-fc-pdf';

export const runtime = 'nodejs';

/**
 * GET /api/product-cost-sheets/quick-pdf?product_id=xxx&store_id=xxx&pdf_format=res148
 *
 * Genera y descarga el PDF de la FC de un producto en un solo paso.
 * Si el producto tiene FC vigente, la usa. Si no, genera primero.
 * Retorna el binario PDF directamente.
 *
 * FIX-FC-PDF-DIRECT: Uses generateFCPdf() directly instead of internal HTTP fetch.
 * The previous implementation fetched /api/cost-sheets/export-pdf internally,
 * which required passing through withAuth — but service role keys aren't valid
 * NextAuth JWTs, causing 401 errors.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `fc-quick-pdf:${session.user.id}:${clientIp}`;
    // FIX-FC-RATE-LIMIT: Increased from 20 to 60 req/min — the modal can trigger
    // multiple fetches (preview + export) and during testing users retry frequently
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 60 });
    if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    const { searchParams } = new URL(req.url);
    const validated = quickPdfSchema.safeParse({
      product_id: searchParams.get('product_id'),
      store_id: searchParams.get('store_id'),
      pdf_format: searchParams.get('pdf_format'),
    });
    if (!validated.success) {
      return NextResponse.json({ ...createApiError('INVALID_DATA'), details: validated.error.format() }, { status: 400 });
    }

    const { product_id, store_id, pdf_format } = validated.data;
    const admin = await getAdminClient();

    // 1. Fetch product
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, name, cost_sheet_id, fc_auto_enabled, store_id')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json(createApiError('PRODUCT_NOT_FOUND'), { status: 404 });
    }

    const resolvedStoreId = store_id || product.store_id;
    if (!resolvedStoreId) {
      return NextResponse.json(createApiError('INVALID_DATA', 'Producto sin tienda asignada'), { status: 400 });
    }

    // 2. Validate access
    const isAdmin = session.user.role === 'admin';
    const memberships = session.user.memberships || [];
    const hasAccess = isAdmin || memberships.some(m => m.store_id === resolvedStoreId && m.status === 'active');
    if (!hasAccess) return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });

    // 3. Get cost sheet
    let costSheetData: Record<string, unknown> | null = null;
    if (product.cost_sheet_id) {
      const { data: csData } = await admin
        .from('product_cost_sheets')
        .select('*')
        .eq('id', product.cost_sheet_id)
        .is('deleted_at', null)
        .single();
      costSheetData = csData;
    }

    if (!costSheetData) {
      return NextResponse.json({
        data: {
          product_id,
          fc_status: 'sin_fc',
          message: 'Este producto no tiene FC generada. Genere la FC primero usando /api/product-cost-sheets/auto-generate',
        },
      });
    }

    // 3.5 Check cache before generating
    const cacheKey = buildCacheKey(resolvedStoreId, product_id, pdf_format || 'res148');
    const cachedPdf = await getCachedPdf(cacheKey);
    if (cachedPdf) {
      // Audit log for cached response
      await auditService.logFCPdfExported({
        userId: session.user.id,
        productId: product_id,
        storeId: resolvedStoreId,
        pdfFormat: pdf_format || 'res148',
      });

      const productSlug = product.name?.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) || product_id;
      const fileName = `FC_${productSlug}.pdf`;

      return new NextResponse(new Uint8Array(cachedPdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'private, max-age=300',
          'X-Cache': 'HIT',
        },
      });
    }

    // 4. Generate PDF directly (FIX-FC-PDF-DIRECT: no internal HTTP fetch)
    const contract = mapProductCostSheetToContract(costSheetData as unknown as import('@/contracts/product-cost-sheet').ProductCostSheetRaw);
    const calculatedData = contract.calculated_data as Record<string, unknown>;

    const pdfUint8Array = await generateFCPdf({
      data: calculatedData,
      options: {
        pdfFormat: pdf_format,
        includeAudit: false,
        includeFC: true,
      },
      calculatedValues: (calculatedData as Record<string, unknown>)?.calculatedRows || [],
      calculatedHeader: (calculatedData as Record<string, unknown>)?.header || {},
      exportMode: 'single',
    });

    // 5. Audit log
    await auditService.logFCPdfExported({
      userId: session.user.id,
      productId: product_id,
      storeId: resolvedStoreId,
      pdfFormat: pdf_format || 'res148',
    });

    // 6. Cache the PDF
    const pdfBuffer = Buffer.from(pdfUint8Array);
    await setCachedPdf(cacheKey, pdfBuffer, 'application/pdf');

    const productSlug = product.name?.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) || product_id;
    const fileName = `FC_${productSlug}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FC Quick-PDF] Unexpected error:', message);
    return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });
  }
}

export const GET = withTracing(
  withAuth(getHandler) as Parameters<typeof withTracing>[0],
  'GET /api/product-cost-sheets/quick-pdf',
);
