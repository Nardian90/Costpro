
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
            const amt = parseFloat(String(curr.total_amount || '0'));
            if (!isNaN(amt)) acc[date] = (acc[date] || 0) + amt;
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
            const cost = parseFloat(String(curr.total_cost || '0'));
            if (!isNaN(cost)) acc[date] = (acc[date] || 0) + cost;
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
    const doc = new jsPDF({
      orientation: body.orientation || 'portrait',
      unit: 'mm',
      format: body.format || 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    if (type === 'cost_sheet') {
      const costData = body.data;
      const calcValues = body.calculatedValues;
      const calcAnnexes = body.calculatedAnnexes;

      // --- CUSTOM COST SHEET GENERATOR ---

      // Formal Ministry Header
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2, 15, { align: "center" });
      doc.setFontSize(8);
      doc.text("FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS", pageWidth / 2, 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text("PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS", pageWidth / 2, 24, { align: "center" });

      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(costData.header.name?.toUpperCase() || "FICHA DE COSTO", 14, 35);

      // Metadata Grid
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("DATOS GENERALES:", 14, 42);
      doc.line(14, 43, 50, 43);

      const metadata = [
        [`No. FC: ${costData.header.code}`, `Fecha: ${costData.header.date}`],
        [`UM: ${costData.header.unit}`, `Cantidad: ${costData.header.quantity}`],
        [`Moneda: ${costData.header.currency}`, `Organismo: ${costData.header.category}`],
        [`Nivel Prod: ${costData.header.productionLevel || 'N/A'}`, `Utilización: ${costData.header.utilization || 'N/A'}`],
        [`Precio Venta: ${costData.header.salePrice || 'N/A'}`, ""]
      ];

      let yPos = 48;
      doc.setFont("helvetica", "normal");
      metadata.forEach(row => {
        doc.text(row[0], 14, yPos);
        doc.text(row[1], pageWidth / 2, yPos);
        yPos += 5;
      });

      // Main Table
      const mainHeaders = ["FILA", "CONCEPTO", "VALOR HISTÓRICO", "BASE CÁLCULO", "TOTAL"];
      const mainRows: any[] = [];

      const processRows = (rows: any[], level = 0) => {
        rows.forEach(row => {
          const calc = calcValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0 };
          const prefix = "  ".repeat(level);

          let baseDisplay = '-';
          if (row.base_display_override) baseDisplay = row.base_display_override;
          else if (row.isPercent ?? row.is_percent) baseDisplay = `${((row.value || 0) * 100).toFixed(2)}%`;
          else if (calc.baseTotal > 0) baseDisplay = calc.baseTotal.toLocaleString('es-ES');

          mainRows.push([
            row.id,
            prefix + row.label.toUpperCase(),
            calc.valorHistorico > 0 ? calc.valorHistorico.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '--',
            baseDisplay,
            calc.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })
          ]);

          if (row.children) processRows(row.children, level + 1);
        });
      };

      costData.sections.forEach((section: any) => {
        mainRows.push([{ content: section.label.toUpperCase(), colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
        processRows(section.rows);
      });

      autoTable(doc, {
        startY: yPos + 5,
        head: [mainHeaders],
        body: mainRows,
        theme: 'grid',
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right', fontStyle: 'bold' }
        }
      });

      // Annexes
      let finalY = (doc as any).lastAutoTable.finalY + 10;

      calcAnnexes.forEach((annex: any) => {
        if (finalY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          finalY = 20;
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`${annex.id || ''} - ${annex.title}`.toUpperCase(), 14, finalY);

        const headers = annex.columns.map((c: any) => (c.label || c.title || c.key).toUpperCase());
        const data = annex.data.map((row: any) => annex.columns.map((col: any) => {
          const val = row[col.key];
          if (typeof val === 'number') {
              return val.toLocaleString('es-ES', {
                  minimumFractionDigits: (col.key === 'no' || col.key === 'quantity' || col.key === 'days' || col.key === 'worker_count') ? 0 : 2,
                  maximumFractionDigits: 4
              });
          }
          return val || '-';
        }));

        autoTable(doc, {
          startY: finalY + 2,
          head: [headers],
          body: data,
          theme: 'striped',
          headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 6 },
          styles: { fontSize: 6, cellPadding: 1 },
        });

        finalY = (doc as any).lastAutoTable.finalY + 10;
      });

      // Signatures
      if (finalY > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        finalY = 30;
      }

      doc.setFontSize(8);
      doc.text("__________________________", 30, finalY + 15);
      doc.text("Elaborado por", 30, finalY + 20);

      doc.text("__________________________", pageWidth - 80, finalY + 15);
      doc.text("Aprobado por", pageWidth - 80, finalY + 20);

    } else {
      // --- STANDARD REPORT GENERATOR ---
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
      const tableHeaders: string[] = (columns && columns.length > 0) ? columns : Object.keys(data[0] || {}).slice(0, 7);
      const tableData = data.map((row: any) => tableHeaders.map((col: string) => {
          const val = row[col];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val?.toString() || '';
      }));

      const displayHeaders = tableHeaders.map(h => (COLUMN_LABELS[h] || h).toUpperCase());

      autoTable(doc, {
        startY: 50,
        head: [displayHeaders],
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
    }

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
