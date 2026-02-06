
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { GenericReportPDF } from '@/components/pdf/GenericReportPDF';
import { CostSheetPDF } from '@/components/pdf/CostSheetPDF';
import React from 'react';
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

    // Special case for cost_sheet: data is already provided in the body
    if (type === 'cost_sheet') {
      data = body.data?.sections || [];
    }

    switch (type as ReportType) {
      case 'sales':
        const { data: salesData, error: salesError } = await supabase
          .rpc('get_transactions', {
            p_store_id: store_id,
            p_date_from: from ? from + 'T00:00:00' : null,
            p_date_to: to ? to + 'T23:59:59' : null,
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
            p_date_from: from ? from + 'T00:00:00' : null,
            p_date_to: to ? to + 'T23:59:59' : null,
            p_limit: 10000
          });
        if (auditError) throw auditError;
        data = auditData || [];
        break;

      case 'profit':
        // Reuse transactions but ensure cost and profit are included
        const { data: profitData, error: profitError } = await supabase
          .rpc('get_transactions', {
            p_store_id: store_id,
            p_date_from: from ? from + 'T00:00:00' : null,
            p_date_to: to ? to + 'T23:59:59' : null,
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

      case 'daily_income':
        const { data: incData, error: incError } = await supabase
          .rpc('get_transactions', {
            p_store_id: store_id,
            p_date_from: from ? from + 'T00:00:00' : null,
            p_date_to: to ? to + 'T23:59:59' : null,
            p_limit: 10000
          });
        if (incError) throw incError;
        const gIncome = (incData || []).reduce((acc: any, curr: any) => {
            const date = curr.created_at.split('T')[0];
            if (!acc[date]) acc[date] = 0;
            acc[date] += Number(curr.total_amount);
            return acc;
        }, {});
        data = Object.keys(gIncome).map(date => ({
            date,
            total_income: gIncome[date]
        })).sort((a, b) => b.date.localeCompare(a.date));
        break;

      case 'daily_expenses':
        let eQuery = supabase.from('receipts').select('*');
        if (store_id) eQuery = eQuery.eq('store_id', store_id);
        if (from) eQuery = eQuery.gte('created_at', from);
        if (to) eQuery = eQuery.lte('created_at', to);
        const { data: eData, error: eError } = await eQuery.order('created_at', { ascending: false }).limit(1000);
        if (eError) throw eError;
        const gExp = (eData || []).reduce((acc: any, curr: any) => {
            const date = curr.created_at.split('T')[0];
            if (!acc[date]) acc[date] = 0;
            acc[date] += Number(curr.total_cost);
            return acc;
        }, {});
        data = Object.keys(gExp).map(date => ({
            date,
            total_expenses: gExp[date]
        })).sort((a, b) => b.date.localeCompare(a.date));
        break;

      case 'cost_sheet':
        // Data already handled above
        break;

      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    // 3. Generate PDF
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    let pdfBuffer: Buffer | Uint8Array;

    if (type === 'cost_sheet') {
       // For cost_sheet in report generator, we try to use the same CostSheetPDF component
       // if the data matches. If not, we might need another component.
       // Based on the code, body.data.sections exists.

       // Converting the specific format of reports/generate to CalculationResult-like format
       const result: any = {
           fichaId: body.data.header.code,
           fichaName: body.data.header.name,
           metadata: { header: body.data.header },
           rows: [],
           anexos: body.calculatedAnnexes.map((a: any) => ({
               id: a.id,
               name: a.title,
               rows: a.data
           })),
           summary: {
               totalCost: body.calculatedValues['12']?.total || 0,
               totalMargin: body.calculatedValues['13.1']?.total || 0,
               totalTax: body.calculatedValues['13.2']?.total || 0,
               grandTotal: body.calculatedValues['14']?.total || 0,
           },
           audits: []
       };

       // Flatten rows
       const flatten = (uiRows: any[]) => {
           uiRows.forEach(r => {
               const calc = body.calculatedValues[r.id] || {};
               result.rows.push({
                   ...r,
                   total: calc.total || 0,
                   valor_historico: calc.valor_historico || 0
               });
               if (r.children) flatten(r.children);
           });
       };
       body.data.sections.forEach((s: any) => flatten(s.rows));

       pdfBuffer = await renderToBuffer(
           <CostSheetPDF
               result={result}
               exportOptions={{
                   includeFC: true,
                   includeAudit: false,
                   includeAnnexes: result.anexos.map((a: any) => a.id),
                   consolidated: true,
                   skipZeros: false,
                   includeFinancialSummary: true
               }}
           /> as any
       );
    } else {
        const tableHeaders: string[] = (columns && columns.length > 0) ? columns : Object.keys(data[0] || {}).slice(0, 7);
        pdfBuffer = await renderToBuffer(
            <GenericReportPDF
                name={name}
                type={type}
                from={from}
                to={to}
                timestamp={timestamp}
                columns={tableHeaders}
                data={data}
            /> as any
        );
    }

    // 4. Upload to Storage
    if (!runData?.id) {
        throw new Error('Error al crear el registro de ejecución del reporte');
    }

    const fileName = `reports/${type}/${runData.id}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reports')
      .upload(fileName, pdfBuffer as any, {
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
