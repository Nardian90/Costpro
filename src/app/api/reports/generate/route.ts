
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { ReportType } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
    const from = date_range?.from;
    const to = date_range?.to;

    switch (type as ReportType) {
      case 'sales':
        const { data: salesData, error: salesError } = await supabase
          .rpc('get_transactions', {
            p_store_id: store_id,
            p_limit: 10000
          });
        if (salesError) throw salesError;
        data = salesData || [];
        // Filter by date if needed (RPC might already do it or need params)
        if (from && to) {
            data = data.filter(item => {
                const date = new Date(item.created_at);
                return date >= new Date(from) && date <= new Date(to);
            });
        }
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
            p_limit: 10000
          });
        if (auditError) throw auditError;
        data = auditData || [];
        if (from && to) {
            data = data.filter((item: any) => {
                const date = new Date(item.created_at);
                return date >= new Date(from) && date <= new Date(to);
            });
        }
        break;

      case 'profit':
        // Reuse transactions but ensure cost and profit are included
        const { data: profitData, error: profitError } = await supabase
          .rpc('get_transactions', {
            p_store_id: store_id,
            p_limit: 10000
          });
        if (profitError) throw profitError;
        data = profitData || [];
        if (from && to) {
            data = data.filter((item: any) => {
                const date = new Date(item.created_at);
                return date >= new Date(from) && date <= new Date(to);
            });
        }
        break;

      case 'kardex':
        if (!filters?.product_id) throw new Error('Se requiere product_id para el reporte de Kardex');
        const { data: kardexData, error: kardexError } = await supabase
          .rpc('get_product_stock_ledger_paginated', {
            p_product_id: filters.product_id,
            p_store_id: store_id,
            p_limit: 1000,
            p_offset: 0
          });
        if (kardexError) throw kardexError;
        data = kardexData || [];
        break;

      case 'purchases':
        let query = supabase.from('receipts').select('*');
        if (store_id) query = query.eq('store_id', store_id);
        if (from) query = query.gte('created_at', from);
        if (to) query = query.lte('created_at', to);

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
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text(name || 'Reporte de Sistema', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Tipo: ${type.toUpperCase()}`, 14, 30);
    doc.text(`Periodo: ${from || 'N/A'} - ${to || 'N/A'}`, 14, 35);
    doc.text(`Generado: ${timestamp}`, 14, 40);

    // Separator Line
    doc.setDrawColor(200);
    doc.line(14, 45, pageWidth - 14, 45);

    // Table
    const tableHeaders: string[] = columns.length > 0 ? columns : Object.keys(data[0] || {}).slice(0, 7);
    const tableData = data.map((row: any) => tableHeaders.map((col: string) => {
        const val = row[col];
        if (typeof val === 'object') return JSON.stringify(val);
        return val?.toString() || '';
    }));

    autoTable(doc, {
      startY: 50,
      head: [tableHeaders.map(h => h.toUpperCase())],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { top: 50 },
      didDrawPage: (data) => {
        // Footer
        const str = `Página ${doc.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.text(str, pageWidth - 30, doc.internal.pageSize.getHeight() - 10);
        doc.text('Documento generado automáticamente por CostPro', 14, doc.internal.pageSize.getHeight() - 10);
      }
    });

    const pdfBuffer = doc.output('arraybuffer');

    // 4. Upload to Storage
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
        await supabase
            .from('report_runs')
            .update({ status: 'failed', error_message: 'Error al subir a storage: ' + uploadError.message })
            .eq('id', runData.id);
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
