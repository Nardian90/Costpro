
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculationResult } from '@/lib/cost-engine/types';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const result: CalculationResult = await req.json();

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    // Formal Header (Ministry Style)
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(8);
    doc.text("FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS", pageWidth / 2, 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("REPORTE GENERADO POR MOTOR DECLARATIVO V2", pageWidth / 2, 24, { align: "center" });

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`FICHA: ${result.fichaId}`, 14, 35);

    // Summary Box
    doc.setFontSize(9);
    doc.text("RESUMEN FINANCIERO:", 14, 45);

    const summaryData = [
      ['Costo Total', result.summary.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
      ['Margen Comercial', result.summary.totalMargin.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
      ['Impuestos', result.summary.totalTax.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
      ['PRECIO FINAL', result.summary.grandTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
    ];

    autoTable(doc, {
      startY: 48,
      head: [['Concepto', 'Valor']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    // Main Rows Table
    const rowHeaders = ['Clasif.', 'Concepto', 'Método', 'V. Histórico', 'Total'];
    const rowData = result.rows.map(r => [
      r.classification,
      r.label.toUpperCase(),
      r.calculation_method,
      r.valor_historico?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00',
      r.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [rowHeaders],
      body: rowData,
      theme: 'striped',
      headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Audit Trail (Brief)
    let finalY = (doc as any).lastAutoTable.finalY + 10;
    if (finalY > 240) {
        doc.addPage();
        finalY = 20;
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("TRAZABILIDAD DE CÁLCULO (AUDITORÍA):", 14, finalY);

    const auditData = result.audits.slice(-20).map(a => [
        a.rowId || '-',
        a.type,
        a.note,
        `${a.prev || '0'} -> ${a.now || '0'}`
    ]);

    autoTable(doc, {
        startY: finalY + 5,
        head: [['Fila', 'Tipo', 'Nota', 'Cambio']],
        body: auditData,
        theme: 'plain',
        styles: { fontSize: 6 },
        headStyles: { fontStyle: 'bold' }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.text(`Generado el: ${timestamp} - Página ${i} de ${pageCount}`, 14, 285);
    }

    const pdfBuffer = doc.output('arraybuffer');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ficha-${result.fichaId}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
