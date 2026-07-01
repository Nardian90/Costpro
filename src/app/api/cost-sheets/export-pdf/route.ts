import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { generateFCPdf } from '@/lib/export/generate-fc-pdf';

export const runtime = 'nodejs';

/**
 * POST /api/cost-sheets/export-pdf
 *
 * Exporta una Ficha de Costo como PDF.
 * Requiere autenticación (withAuth).
 *
 * FIX-FC-PDF-REFACTOR: PDF generation logic extracted to @/lib/export/generate-fc-pdf
 * so that quick-pdf can call it directly without internal HTTP fetch.
 */
async function exportPdfHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // FIX-AUDIT-12: CSRF validation on PDF export
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    // Rate limit by authenticated user ID
    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 });
    }

    const pdfUint8Array = await generateFCPdf({
      data: body.data || body,
      options: body.options || body.exportOptions || {},
      calculatedValues: body.calculatedValues || {},
      calculatedHeader: body.calculatedHeader || null,
      calculatedAnnexes: body.calculatedAnnexes || [],
      exportMode: body.exportMode || 'single',
      comparisonData: body.comparisonData,
      activeScenarioIds: body.activeScenarioIds,
    });

    const pdfBuffer = Buffer.from(pdfUint8Array);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ficha-costo.pdf"',
      },
    });
  } catch (error: unknown) {
    console.error('PDF Export Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? errMsg : 'Error interno del servidor' }, { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(exportPdfHandler as any) as any,
  'POST /api/cost-sheets/export-pdf'
);
