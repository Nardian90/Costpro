import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { reportsGenerateSchema } from '@/validation/api-schemas';
import { fetchReportData } from '@/lib/reports/data-fetcher';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { COLUMN_LABELS } from '@/contracts/reports';

async function generateReportHandler(
  req: NextRequest,
  session: AuthenticatedSession
) {
  try {
    // FIX-AUDIT-12: CSRF validation on report generation
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
    }

    const body = await req.json();
    const validatedBody = reportsGenerateSchema.safeParse(body);

    if (!validatedBody.success) {
      return NextResponse.json(
        { error: 'Datos de reporte inválidos', details: validatedBody.error.format() },
        { status: 400 },
      );
    }

    const { type, from, to, store_id, columns, name } = validatedBody.data;
    // FIX-AUDIT-9: Use authenticated client (respects RLS) instead of anon client
    const supabase = getSupabaseAuthClient(session.token);

    const userMetadata = session.user as Record<string, unknown>;
    const effectiveStoreId = store_id
      || (userMetadata?.activeStoreId as string)
      || (userMetadata?.active_store_id as string);

    // FIX-SEC-M1: store_id is now mandatory — no unfiltered queries allowed
    if (!effectiveStoreId) {
      return NextResponse.json(
        { error: 'Solicitud inválida', message: 'Se requiere store_id para generar reportes' },
        { status: 400 }
      );
    }

    // Validate store access (admins bypass)
    if (effectiveStoreId) {
      const memberships = (session.user as any).memberships || [];
      const isAdmin = (session.user as any).role === 'admin';
      if (!isAdmin && !memberships.some((m: any) => m.store_id === effectiveStoreId && m.status === 'active')) {
        return NextResponse.json(
          { error: 'Prohibido', message: 'No tienes acceso a esta tienda' },
          { status: 403 }
        );
      }
    }

    // ── Create run record ──
    const { data: runData, error: runError } = await supabase
      .from('report_runs')
      .insert({
        report_definition_id: body.definition_id || null,
        status: 'processing',
        parameters_snapshot: body,
        executed_by: session.user.id,
      })
      .select()
      .single();

    if (runError) throw runError;

    // ── Fetch data using shared fetcher (DRY) ──
    let data: Record<string, unknown>[] = [];

    if (type !== 'cost_sheet') {
      data = await fetchReportData(supabase, {
        type,
        storeId: effectiveStoreId,
        from,
        to,
        filters: body.filters,
      });
    }

    // ── Generate PDF ──
    const doc = await createPDFDocument(body.orientation || 'portrait', 'mm', body.format || 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    if (type === 'cost_sheet') {
      const costData = body.data as Record<string, unknown> | undefined;
      const calcValues = body.calculatedValues || {};
      if (!costData) throw new Error('Datos de ficha de costo requeridos');
      doc.setFontSize(10);
      doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(16);
      const headerName = (costData.header as Record<string, unknown>)?.name as string;
      doc.text((headerName || 'FICHA DE COSTO').toUpperCase(), 14, 35);
      autoTable(doc, {
        startY: 50,
        head: [['CONCEPT', 'TOTAL']],
        body: [['Total Cost', '0.00']],
      });
    } else {
      doc.setFontSize(20);
      doc.text(name || 'Reporte de Sistema', 14, 22);

      const tableHeaders =
        columns && columns.length > 0
          ? columns
          : Object.keys(data[0] || {}).slice(0, 7);
      const tableData = data.map((row) =>
        tableHeaders.map((col) => String(row[col] ?? '')),
      );
      const displayHeaders = tableHeaders.map((h) =>
        (COLUMN_LABELS[h] || h).toUpperCase(),
      );

      autoTable(doc, {
        startY: 50,
        head: [displayHeaders],
        body: tableData,
      });
    }

    // ── Upload PDF to Supabase Storage ──
    const pdfBuffer = doc.output('arraybuffer');
    const fileName = `reports/${type}/${runData.id}.pdf`;

    const { error: uploadError } = await supabase.storage.from('reports').upload(fileName, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (uploadError) {
      // Mark run as failed so we don't leave orphan records in 'processing'
      await supabase
        .from('report_runs')
        .update({
          status: 'failed',
          error_message: `Storage upload failed: ${uploadError.message}`,
          executed_at: new Date().toISOString(),
        })
        .eq('id', runData.id);
      throw new Error(`Error al subir PDF: ${uploadError.message}`);
    }

    // Use signed URL for financial security (expires in 24h)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('reports')
      .createSignedUrl(fileName, 86400);

    if (signedUrlError || !signedUrlData) {
      // Fallback to public URL if signed URL creation fails
      const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);
      await supabase
        .from('report_runs')
        .update({
          status: 'completed',
          file_url: urlData.publicUrl,
          executed_at: new Date().toISOString(),
        })
        .eq('id', runData.id);

      return NextResponse.json({
        success: true,
        url: urlData.publicUrl,
        run_id: runData.id,
      });
    }

    await supabase
      .from('report_runs')
      .update({
        status: 'completed',
        file_url: signedUrlData.signedUrl,
        executed_at: new Date().toISOString(),
      })
      .eq('id', runData.id);

    return NextResponse.json({
      success: true,
      url: signedUrlData.signedUrl,
      run_id: runData.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido al generar el reporte';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withTracing(
  withRole('manager', generateReportHandler as Parameters<typeof withRole>[1]),
  'POST /api/reports/generate',
);
