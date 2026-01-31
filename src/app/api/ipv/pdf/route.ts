import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function POST(req: NextRequest) {
  try {
    const { report } = await req.json();

    if (!report) {
      return NextResponse.json({ error: 'Faltan datos del reporte' }, { status: 400 });
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(18);
    // doc.setTextColor(22, 163, 74); // Green 600 - some versions of jspdf use rgb values differently
    doc.text('REPORTE IPV DIARIO', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    // doc.setTextColor(100);
    doc.text(`Fecha del Reporte: ${report.fecha_reporte}`, 14, 30);
    doc.text(`Estado: ${report.estado}`, 14, 35);
    doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 40);

    // Summary
    doc.setFontSize(12);
    doc.text('RESUMEN MONETARIO', 14, 50);

    autoTable(doc, {
      startY: 55,
      head: [['Concepto', 'Monto']],
      body: [
        ['Total Ventas', `$ ${(report.total_ventas_cents / 100).toFixed(2)}`],
        ['Resumen Efectivo', `$ ${(report.resumen_efectivo_cents / 100).toFixed(2)}`],
        ['Resumen Transferencia', `$ ${(report.resumen_transferencia_cents / 100).toFixed(2)}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] }
    });

    // Details Table
    const tableData = report.filas.map((f: any) => [
      f.cod,
      f.descripcion,
      f.um,
      f.saldo_inicial_qty,
      f.entrada_salida_qty,
      f.venta_cantidad_qty,
      `$ ${(f.precio_unitario_cents / 100).toFixed(2)}`,
      `$ ${(f.importe_cents / 100).toFixed(2)}`,
      f.existencia_final_qty
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Cod', 'Producto', 'UM', 'Inicial', 'E/S', 'Venta', 'Precio', 'Importe', 'Final']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [22, 163, 74] },
      styles: { fontSize: 8 }
    });

    // Footer / Signatures
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text('__________________________', 14, finalY);
    doc.text('Firma Responsable', 14, finalY + 5);
    doc.text(`Realizado por: ${report.firmas?.realizado_por || 'Sistema'}`, 14, finalY + 10);

    const pdfBuffer = doc.output('arraybuffer');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="IPV-${report.fecha_reporte}.pdf"`
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Error al generar el PDF' }, { status: 500 });
  }
}
