import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseClient';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { reportsGenerateSchema } from '@/validation/api-schemas';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { COLUMN_LABELS } from '@/contracts/reports';

async function generateReportHandler(
  req: NextRequest,
  session: AuthenticatedSession
) {
  try {
    const body = await req.json();
    const validatedBody = reportsGenerateSchema.safeParse(body);

    if (!validatedBody.success) {
      return NextResponse.json({
        error: 'Datos de reporte inválidos',
        details: validatedBody.error.format()
      }, { status: 400 });
    }

    const { type, from, to, store_id, columns, name } = validatedBody.data;
    const supabase = createServerClient();

    const userMetadata = (session.user as any);
    const effectiveStoreId = store_id || userMetadata?.activeStoreId || userMetadata?.active_store_id;

    const { data: runData, error: runError } = await supabase
      .from('report_runs')
      .insert({
        report_definition_id: body.definition_id || null,
        status: 'processing',
        parameters_snapshot: body,
        executed_by: session.user.id
      })
      .select()
      .single();

    if (runError) throw runError;

    let data: any[] = [];
    const fromDate = from ? from + 'T00:00:00' : null;
    const toDate = to ? to + 'T23:59:59' : null;

    switch (type) {
      case 'sales': {
        const { data: salesData, error: salesError } = await supabase.rpc('get_transactions', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (salesError) throw salesError;
        data = salesData || [];
        break;
      }
      case 'inventory': {
        const { data: invData, error: invError } = await supabase.rpc('get_paginated_products', {
          p_store_id: effectiveStoreId,
          p_limit: 10000,
          p_offset: 0,
          p_category: body.filters?.category || null
        });
        if (invError) throw invError;
        data = invData || [];
        break;
      }
      case 'profit': {
        const { data: profitData, error: profitError } = await supabase.rpc('get_profit_report', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (profitError) throw profitError;
        data = profitData || [];
        break;
      }
      case 'purchases': {
        const { data: purchaseData, error: purchaseError } = await supabase.from('receipts')
          .select('*')
          .eq('store_id', effectiveStoreId)
          .gte('created_at', from || '1970-01-01')
          .lte('created_at', to || '2100-01-01')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (purchaseError) throw purchaseError;
        data = purchaseData || [];
        break;
      }
      case 'daily_income': {
        const { data: incomeData, error: incomeError } = await supabase.rpc('get_daily_income_aggregated', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate
        });
        if (incomeError) throw incomeError;
        data = incomeData || [];
        break;
      }
      case 'daily_expenses': {
        const { data: expData, error: expError } = await supabase.rpc('get_daily_expenses_aggregated', {
          p_store_id: effectiveStoreId,
          p_date_from: from || null,
          p_date_to: to || null
        });
        if (expError) throw expError;
        data = expData || [];
        break;
      }
      case 'kardex': {
        const productId = body.filters?.product_id;
        if (!productId) {
          data = [];
          break;
        }
        const { data: kardexData, error: kardexError } = await supabase.rpc('get_product_stock_ledger_paginated', {
          p_product_id: productId,
          p_store_id: effectiveStoreId,
          p_limit: 1000,
          p_offset: 0
        });
        if (kardexError) throw kardexError;
        data = kardexData || [];
        break;
      }
      case 'audit': {
        const { data: auditData, error: auditError } = await supabase.rpc('get_audit_logs', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (auditError) throw auditError;
        data = auditData || [];
        break;
      }
      case 'transfer': {
        const { data: transferData, error: transferError } = await supabase.rpc('get_transfers', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_status: null,
          p_limit: 1000
        });
        if (transferError) throw transferError;
        data = transferData || [];
        break;
      }
      case 'cash': {
        const { data: cashData, error: cashError } = await supabase.rpc('get_cash_closures', {
          p_store_id: effectiveStoreId,
          p_date_from: from || null,
          p_date_to: to || null,
          p_limit: 1000
        });
        if (cashError) throw cashError;
        data = cashData || [];
        break;
      }
      case 'cost_sheet':
        break;
      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    const doc = await createPDFDocument(body.orientation || 'portrait', 'mm', body.format || 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    if (type === 'cost_sheet') {
      const costData = body.data as any;
      const calcValues = body.calculatedValues || {};
      const calcAnnexes = body.calculatedAnnexes || [];
      if (!costData) throw new Error('Datos de ficha de costo requeridos');
      doc.setFontSize(10);
      doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2, 15, { align: "center" });
      doc.setFontSize(16);
      doc.text(costData.header.name?.toUpperCase() || "FICHA DE COSTO", 14, 35);
      // Simplified table for logic verification
      autoTable(doc, { startY: 50, head: [["CONCEPT", "TOTAL"]], body: [["Total Cost", "0.00"]] });
    } else {
      doc.setFontSize(20);
      doc.text(name || 'Reporte de Sistema', 14, 22);
      const tableHeaders = (columns && columns.length > 0) ? columns : Object.keys(data[0] || {}).slice(0, 7);
      const tableData = data.map((row: any) => tableHeaders.map((col: string) => row[col]?.toString() || ''));
      const displayHeaders = tableHeaders.map(h => (COLUMN_LABELS[h] || h).toUpperCase());
      autoTable(doc, { startY: 50, head: [displayHeaders], body: tableData });
    }

    const pdfBuffer = doc.output('arraybuffer');
    const fileName = `reports/${type}/${runData.id}.pdf`;
    await supabase.storage.from('reports').upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);
    await supabase.from('report_runs').update({ status: 'completed', file_url: urlData.publicUrl, executed_at: new Date().toISOString() }).eq('id', runData.id);
    return NextResponse.json({ success: true, url: urlData.publicUrl, run_id: runData.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withTracing(withRole('manager', generateReportHandler as any), 'POST /api/reports/generate');
