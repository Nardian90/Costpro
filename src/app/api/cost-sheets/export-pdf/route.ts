import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculationResult } from '@/lib/cost-engine/types';

export async function POST(req: NextRequest) {
  try {
    const result: CalculationResult = await req.json();

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // Formal Header
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(8);
    doc.text("FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS", pageWidth / 2, 20, { align: "center" });

    // Title
    doc.setFontSize(16);
    doc.text("FICHA DE COSTO CALCULADA", 14, 35);
    doc.setFontSize(10);
    doc.text(`ID: ${result.fichaId}`, 14, 42);

    // Summary Table
    const summaryData = [
      ['Costo Total', result.summary.totalCost.toLocaleString()],
      ['Margen', result.summary.totalMargin.toLocaleString()],
      ['Impuestos', result.summary.totalTax.toLocaleString()],
      ['Precio Final', result.summary.grandTotal.toLocaleString()],
    ];

    autoTable(doc, {
      startY: 50,
      head: [['Concepto', 'Valor']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40] },
    });

    // Rows Table
    const rowHeaders = ['Clasif.', 'Concepto', 'Tipo', 'Total'];
    const rowData = result.rows.map(r => [
      r.classification,
      r.label,
      r.type,
      r.total.toLocaleString()
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [rowHeaders],
      body: rowData,
      theme: 'striped',
      headStyles: { fillColor: [80, 80, 80] },
      styles: { fontSize: 8 }
    });

    const pdfBuffer = doc.output('arraybuffer');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ficha-${result.fichaId}.pdf"`
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
