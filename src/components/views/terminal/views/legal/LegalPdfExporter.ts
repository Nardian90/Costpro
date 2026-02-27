import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';

export async function generateLegalPdf(model: any, data: any) {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, pageWidth - 20, 40);

  // Entity Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ENTIDAD:', 15, 20);
  doc.setFont('helvetica', 'normal');
  doc.text(data.entidad_nombre || '__________________________________', 40, 20);

  doc.setFont('helvetica', 'bold');
  doc.text('CÓDIGO:', 15, 28);
  doc.setFont('helvetica', 'normal');
  doc.text(data.entidad_codigo || '__________', 40, 28);

  // Model ID (Top Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MODELO ' + model.code, pageWidth - 60, 25);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Uso Obligatorio', pageWidth - 60, 32);

  // Main Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const title = model.name;
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, 65);

  // Content Table
  const tableRows = Object.entries(data)
    .filter(([key]) => !['entidad_nombre', 'entidad_codigo'].includes(key))
    .map(([key, value]) => {
      const field = model.fields.find((f: any) => f.name === key);
      const label = field ? field.label : key;
      let displayValue = value;

      if (typeof value === 'object' && value !== null) {
        displayValue = JSON.stringify(value, null, 2);
      }

      return [label.toUpperCase(), displayValue || ''];
    });

  doc.autoTable({
    startY: 75,
    head: [['CONCEPTO / DATO', 'INFORMACIÓN REGISTRADA']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 5
    },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold', fillColor: [245, 245, 245] },
      1: { cellWidth: 'auto' }
    },
    margin: { left: 15, right: 15 }
  });

  // Footer / Signatures Section
  const finalY = (doc as any).lastAutoTable.finalY + 20;

  if (finalY < doc.internal.pageSize.getHeight() - 40) {
    doc.setLineWidth(0.2);
    // Signature Lines
    doc.line(20, finalY + 15, 80, finalY + 15);
    doc.text('FIRMA RESPONSABLE', 30, finalY + 20);

    doc.line(pageWidth - 80, finalY + 15, pageWidth - 20, finalY + 15);
    doc.text('FIRMA RECIBIDO', pageWidth - 65, finalY + 20);
  }

  // System Stamp
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('GENERADO POR COSTPRO TERMINAL LEGAL - ' + format(new Date(), 'dd/MM/yyyy HH:mm'), 15, doc.internal.pageSize.getHeight() - 10);

  doc.save(`${model.code}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}
