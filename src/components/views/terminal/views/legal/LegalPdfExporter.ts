import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export async function generateLegalPdf(model: any, data: any, options: { skipCopy?: boolean } = {}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  if (model.code === 'SC-3-01') {
    // Specialized layout for Cash Receipt: Half page duplicate
    const drawReceipt = (yOffset: number, copyLabel: string) => {
      // Header Section Box
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.rect(10, yOffset + 10, pageWidth - 20, 28);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('ENTIDAD:', 15, yOffset + 18);
      doc.setFont('helvetica', 'normal');
      doc.text(String(data.entidad_nombre || ''), 40, yOffset + 18);

      doc.setFont('helvetica', 'bold');
      doc.text('CÓDIGO:', 15, yOffset + 26);
      doc.setFont('helvetica', 'normal');
      doc.text(String(data.entidad_codigo || ''), 40, yOffset + 26);

      // Model ID & Copy Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('MODELO ' + model.code, pageWidth - 65, yOffset + 18);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Uso Obligatorio - ' + copyLabel, pageWidth - 65, yOffset + 23);

      // Date and Serial No in same row (bottom of header box)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('FECHA:', 15, yOffset + 33);
      doc.setFont('helvetica', 'normal');
      doc.text(String(data.fecha_emision || ''), 30, yOffset + 33);

      doc.setFont('helvetica', 'bold');
      doc.text('NO. CONSECUTIVO:', pageWidth - 85, yOffset + 33);
      doc.setFont('helvetica', 'normal');
      doc.text(String(data.numero_consecutivo || ''), pageWidth - 45, yOffset + 33);

      // Main Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(model.name, pageWidth / 2, yOffset + 48, { align: 'center' });

      // Persona entrega
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBÍ DE:', 15, yOffset + 58);
      doc.setFont('helvetica', 'normal');
      doc.text(String(data.persona_entrega || '').toUpperCase(), 40, yOffset + 58);

      // Table for concepts
      const tableRows = (data.conceptos_tabla || []).map((row: any) => [
        String(row.concept || row.concepto || '').toUpperCase(),
        Number(row.amount || row.importe || 0).toFixed(2)
      ]);

      autoTable(doc, {
        startY: yOffset + 63,
        head: [['CONCEPTO', 'IMPORTE ($)']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], halign: 'center', fontSize: 9 },
        bodyStyles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: pageWidth - 60 }, 1: { halign: 'right', cellWidth: 30 } },
        margin: { left: 15, right: 15 }
      });

      const finalY = (doc as any).lastAutoTable.finalY;

      // Total Line (Bold and emphasized)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('TOTAL:', pageWidth - 60, finalY + 12);
      doc.text(Number(data.total || 0).toFixed(2), pageWidth - 30, finalY + 12, { align: 'right' });

      // Amount in words
      doc.setFontSize(9);
      doc.text('CANTIDAD EN LETRAS:', 15, finalY + 20);
      doc.setFont('helvetica', 'normal');
      const textWidth = pageWidth - 30;
      doc.text(String(data.cantidad_letras || 'CERO').toUpperCase(), 15, finalY + 26, { maxWidth: textWidth });

      // Signature section (Adjust based on finalY)
      const sigY = finalY + 45;
      doc.setLineWidth(0.2);
      doc.line(20, sigY, 80, sigY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('FIRMA CAJERO', 35, sigY + 5);

      doc.line(pageWidth - 80, sigY, pageWidth - 20, sigY);
      doc.text('FIRMA ENTREGA', pageWidth - 65, sigY + 5);
    };

    // Draw Original
    drawReceipt(0, "ORIGINAL");

    if (!options || !options.skipCopy) {
      // Scissor line
      doc.setLineDashPattern([2, 2], 0);
      doc.setDrawColor(150);
      doc.line(0, pageHeight / 2, pageWidth, pageHeight / 2);
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(0);

      // Draw Copy
      drawReceipt(pageHeight / 2, "COPIA");
    }

  } else {
    // Standard layout for other models (Unchanged but ensuring autoTable call)
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, pageWidth - 20, 40);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ENTIDAD:', 15, 20);
    doc.setFont('helvetica', 'normal');
    doc.text(String(data.entidad_nombre || ''), 40, 20);

    doc.setFont('helvetica', 'bold');
    doc.text('CÓDIGO:', 15, 28);
    doc.setFont('helvetica', 'normal');
    doc.text(String(data.entidad_codigo || ''), 40, 28);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('MODELO ' + model.code, pageWidth - 60, 25);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Uso Obligatorio', pageWidth - 60, 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(model.name, pageWidth / 2, 65, { align: 'center' });

    const tableRows = Object.entries(data)
      .filter(([key]) => !['entidad_nombre', 'entidad_codigo', 'total', 'cantidad_letras', 'conceptos_tabla'].includes(key))
      .map(([key, value]) => {
        const field = model.fields.find((f: any) => f.name === key);
        const label = field ? field.label : key;
        let displayValue = value;
        if (typeof value === 'object' && value !== null) displayValue = JSON.stringify(value, null, 2);
        return [label.toUpperCase(), String(displayValue || '')];
      });

    autoTable(doc, {
      startY: 75,
      head: [['CONCEPTO / DATO', 'INFORMACIÓN REGISTRADA']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold', fillColor: [245, 245, 245] } },
      margin: { left: 15, right: 15 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    if (finalY < pageHeight - 40) {
      doc.line(20, finalY + 15, 80, finalY + 15);
      doc.text('FIRMA RESPONSABLE', 30, finalY + 20);
      doc.line(pageWidth - 80, finalY + 15, pageWidth - 20, finalY + 15);
      doc.text('FIRMA RECIBIDO', pageWidth - 65, finalY + 20);
    }
  }

  // System Stamp
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('COSTPRO TERMINAL LEGAL - ' + format(new Date(), 'dd/MM/yyyy HH:mm'), 15, pageHeight - 5);

  doc.save(`${model.code}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}
