import { reportsGenerateSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { ReportType } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { COLUMN_LABELS } from '@/contracts/reports';
import { getServerSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore } from '@/lib/roles';

async function generateReportHandler(req: NextRequest, session: AuthenticatedSession) {
  try {

    const clientId = req.headers.get('x-forwarded-for') || session.user.id;
    const { allowed } = await rateLimit(clientId);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const rawBody = await req.json();
    const parsed = reportsGenerateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const body = parsed.data;
    const {
      type,
      from,
      to,
      store_id,
      columns,
      name
    } = (body as any);

    if (store_id && !canManageStore(session.user as any, store_id)) {
      return NextResponse.json({ error: 'Prohibido', message: 'No tiene permisos para acceder a esta tienda' }, { status: 403 });
    }

    const supabase = getSupabaseAuthClient(session.token);

    // 1. Create Report Run record
    const { data: runData, error: runError } = await supabase
      .from('report_runs')
      .insert({
        report_definition_id: (body as any).definition_id || '00000000-0000-0000-0000-000000000000',
        executed_by: session.user.id,
        status: 'pending',
        parameters_snapshot: body,
        store_id: store_id || null
      })
      .select()
      .single();

    if (runError) throw runError;

    // 2. Fetch Data based on Type
    let data: any[] = [];
    switch (type) {
      case 'inventory':
        const { data: invData, error: invError } = await supabase
          .from('inventory')
          .select('product:products(name, sku, category), quantity, unit_cost, total_cost:quantity*unit_cost')
          .eq('store_id', store_id);
        if (invError) throw invError;
        data = invData || [];
        break;

      case 'sales':
        let sQuery = supabase.from('sales').select('*, profiles(full_name)');
        if (store_id) sQuery = sQuery.eq('store_id', store_id);
        if (from) sQuery = sQuery.gte('created_at', from);
        if (to) sQuery = sQuery.lte('created_at', to);
        const { data: sData, error: sError } = await sQuery.order('created_at', { ascending: false });
        if (sError) throw sError;
        data = sData || [];
        break;

      case 'profit':
        let pQuery = supabase.from('sales').select('created_at, total_amount');
        if (store_id) pQuery = pQuery.eq('store_id', store_id);
        if (from) pQuery = pQuery.gte('created_at', from);
        if (to) pQuery = pQuery.lte('created_at', to);
        const { data: pData, error: pError } = await pQuery;
        if (pError) throw pError;
        const grouped = (pData || []).reduce((acc: any, curr: any) => {
            const date = curr.created_at.split('T')[0];
            if (!acc[date]) acc[date] = 0;
            acc[date] += curr.total_amount;
            return acc;
        }, {});
        data = Object.keys(grouped).map(date => ({
            date,
            total_sales: grouped[date],
            estimated_profit: null, profit_note: 'Margen no calculado — requiere configuración de costos'
        }));
        break;

      case 'purchases':
        let eQuery = supabase.from('receptions').select('created_at, total_cost');
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
    const doc = await createPDFDocument(
      (body as any).orientation || 'portrait',
      'mm',
      (body as any).format || 'a4'
    );

    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    if (type === 'cost_sheet') {
      const costData = (body as any).data;
      const calcValues = (body as any).calculatedValues;
      const calcAnnexes = (body as any).calculatedAnnexes;

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

      (doc as any).autoTable({
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
      let finalY = (doc as any).lastAutoTable?.finalY ?? 50 + 10;

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

        (doc as any).autoTable({
          startY: finalY + 2,
          head: [headers],
          body: data,
          theme: 'striped',
          headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 6 },
          styles: { fontSize: 6, cellPadding: 1 },
        });

        finalY = (doc as any).lastAutoTable?.finalY ?? 50 + 10;
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

      (doc as any).autoTable({
        startY: 50,
        head: [displayHeaders],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { top: 50 },
        didDrawPage: (_data: Record<string, unknown>) => {
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

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error interno al generar reporte';
    console.error('Report generation error:', error);
    return NextResponse.json({
      error: msg
    }, { status: 500 });
  }
}

export const POST = withTracing(withRole('manager', generateReportHandler), 'POST /api/reports/generate');
