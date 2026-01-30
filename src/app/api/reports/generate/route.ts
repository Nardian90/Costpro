
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { ReportType } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLUMN_LABELS } from '@/contracts/reports';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      report_definition_id,
      type,
      filters,
      date_range,
      columns,
      store_id,
      name
    } = body;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const supabase = getSupabaseAuthClient(token);

    // Fetch Store Info
    const { data: storeInfo } = await supabase
      .from('stores')
      .select('name, logo_url')
      .eq('id', store_id)
      .single();

    // 1. Create a record in report_runs
    const { data: runData, error: runError } = await supabase
      .from('report_runs')
      .insert({
        report_definition_id,
        executed_by: (await supabase.auth.getUser()).data.user?.id,
        parameters_snapshot: body,
        status: 'pending',
        store_id
      })
      .select()
      .single();

    if (runError) throw runError;

    // 2. Fetch Data
    let data: any[] = [];
    const fromDate = date_range?.from;
    const toDate = date_range?.to;

    // Adjust dates to cover the full day range in UTC
    const dateFrom = fromDate ? `${fromDate}T00:00:00.000Z` : undefined;
    const dateTo = toDate ? `${toDate}T23:59:59.999Z` : undefined;

    switch (type as ReportType) {
      case 'sales':
        const { data: salesData, error: salesError } = await supabase
          .rpc('get_transactions_with_profit', {
            p_store_id: store_id,
            p_date_from: dateFrom,
            p_date_to: dateTo,
            p_limit: 10000
          });
        if (salesError) throw salesError;
        data = salesData || [];
        break;

      case 'inventory':
        const { data: invData, error: invError } = await supabase
          .rpc('get_paginated_products', {
            p_store_id: store_id,
            p_limit: 10000,
            p_offset: 0
          });
        if (invError) throw invError;
        data = invData || [];
        break;

      case 'audit':
        const { data: auditData, error: auditError } = await supabase
          .rpc('get_audit_logs', {
            p_store_id: store_id,
            p_date_from: dateFrom,
            p_date_to: dateTo,
            p_limit: 10000
          });
        if (auditError) throw auditError;
        data = auditData || [];
        break;

      case 'profit':
        const { data: profitData, error: profitError } = await supabase
          .rpc('get_transactions_with_profit', {
            p_store_id: store_id,
            p_date_from: dateFrom,
            p_date_to: dateTo,
            p_limit: 10000
          });
        if (profitError) throw profitError;
        data = profitData || [];
        break;

      case 'kardex':
        if (!filters?.product_id) throw new Error('Se requiere product_id para el reporte de Kardex');
        const { data: kardexData, error: kardexError } = await supabase
          .rpc('get_product_stock_ledger_paginated', {
            p_product_id: filters.product_id,
            p_store_id: store_id,
            p_page: 1,
            p_page_size: 1000
          });
        if (kardexError) throw kardexError;
        data = kardexData || [];
        break;

      case 'purchases':
        let query = supabase.from('receipts').select('*');
        if (store_id) query = query.eq('store_id', store_id);
        if (dateFrom) query = query.gte('created_at', dateFrom);
        if (dateTo) query = query.lte('created_at', dateTo);

        const { data: purchaseData, error: purchaseError } = await query.order('created_at', { ascending: false }).limit(1000);
        if (purchaseError) throw purchaseError;
        data = purchaseData || [];
        break;

      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    // 3. Generate PDF
    const doc = new jsPDF({
      orientation: body.orientation || 'portrait',
      unit: 'mm',
      format: body.format || 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    // Logo Placeholder / Store Logo
    doc.setDrawColor(230);
    doc.setFillColor(245);
    doc.roundedRect(14, 15, 25, 25, 3, 3, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("LOGO", 22, 30);

    // Store Info (Top Right)
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.setFont("helvetica", "bold");
    doc.text(storeInfo?.name || "CostPro Enterprise", pageWidth - 14, 20, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("SISTEMA DE GESTIÓN POS", pageWidth - 14, 25, { align: "right" });
    doc.text(`Generado: ${timestamp}`, pageWidth - 14, 30, { align: "right" });

    // Centered Report Title
    doc.setFontSize(22);
    doc.setTextColor(40);
    doc.setFont("helvetica", "bold");
    doc.text(name || 'Reporte de Sistema', pageWidth / 2, 55, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont("helvetica", "normal");
    doc.text(`${type.toUpperCase()} | PERIODO: ${fromDate || 'N/A'} - ${toDate || 'N/A'}`, pageWidth / 2, 62, { align: "center" });

    // Separator Line
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(14, 70, pageWidth - 14, 70);

    // Table
    const tableHeaders: string[] = (columns && columns.length > 0) ? columns : (data.length > 0 ? Object.keys(data[0]).slice(0, 7) : []);
    const tableData = data.map((row: any) => tableHeaders.map((col: string) => {
        const val = row[col];
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val?.toString() || '';
    }));

    const displayHeaders = tableHeaders.map(h => (COLUMN_LABELS[h] || h).toUpperCase());

    autoTable(doc, {
      startY: 75,
      head: [displayHeaders],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 41, 59], // Slate-800
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Slate-50
      },
      margin: { top: 75, bottom: 40 },
      didDrawPage: (data) => {
        // Signature Lines in Footer (only on last page or all pages? Usually all or last)
        // Let's do it at the bottom of every page for professionalism
        const footerY = pageHeight - 35;

        doc.setDrawColor(200);
        doc.setLineWidth(0.2);

        // Line 1
        doc.line(30, footerY, 80, footerY);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text("ELABORADO POR", 55, footerY + 5, { align: "center" });

        // Line 2
        doc.line(pageWidth - 80, footerY, pageWidth - 30, footerY);
        doc.text("REVISADO / AUTORIZADO", pageWidth - 55, footerY + 5, { align: "center" });

        // Pagination
        const str = `Página ${doc.getNumberOfPages()}`;
        doc.setFontSize(7);
        doc.text(str, pageWidth - 14, pageHeight - 10, { align: "right" });
        doc.text('Documento oficial generado por CostPro Enterprise Reporting v5.7', 14, pageHeight - 10);
      }
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 4. Upload to Storage
    if (!runData?.id) {
        throw new Error('Error al crear el registro de ejecución del reporte');
    }

    const fileName = `reports/${type}/${runData.id}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
        // Handle bucket not found by trying to use a public one or failing gracefully
        console.error('Storage error:', uploadError);
        // Update run status to failed
        if (runData?.id) {
            await supabase
                .from('report_runs')
                .update({ status: 'failed', error_message: 'Error al subir a storage: ' + uploadError.message })
                .eq('id', runData.id);
        }

        if (uploadError.message === 'Bucket not found') {
            throw new Error('El sistema de almacenamiento de reportes no está configurado (Bucket not found). Por favor, contacte al administrador.');
        }
        throw uploadError;
    }

    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);

    // 5. Update run status
    await supabase
      .from('report_runs')
      .update({
        status: 'completed',
        file_url: urlData.publicUrl,
        executed_at: new Date().toISOString()
      })
      .eq('id', runData.id);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      run_id: runData.id
    });

  } catch (error: any) {
    console.error('Report generation error:', error);
    return NextResponse.json({
      error: error.message || 'Error interno al generar reporte'
    }, { status: 500 });
  }
}
