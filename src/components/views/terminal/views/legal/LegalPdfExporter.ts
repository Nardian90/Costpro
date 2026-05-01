import { logger } from '@/lib/logger';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { format } from 'date-fns';

export async function generateLegalPdf(model: any, data: any, options: { skipCopy?: boolean } = {}) {
  const orientation = 'p';
  const unit = 'mm';
  const format_size = data.paper_size === 'A4' ? 'a4' : 'letter';
  const doc = await createPDFDocument(orientation as 'p' | 'l', unit as 'mm', format_size);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const drawReceipt = (docInstance: any, receiptData: any, yOffset: number, copyLabel: string) => {
    // Header Section Box
    docInstance.setDrawColor(0);
    docInstance.setLineWidth(0.5);
    docInstance.rect(10, yOffset + 10, pageWidth - 20, 28);

    const hasLogo = !!receiptData.logo_url;
    const textStartX = hasLogo ? 40 : 15;

    if (hasLogo) {
      try {
        const logoFormat = receiptData.logo_url.split(';')[0].split('/')[1].toUpperCase();
        docInstance.addImage(receiptData.logo_url, logoFormat === 'PNG' ? 'PNG' : 'JPEG', 15, yOffset + 14, 20, 20);
      } catch (e) {
        logger.warn('DATABASE', 'COULD_NOT_ADD_LOGO_TO_PDF', { data: e })
      }
    }

    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(10);
    docInstance.text('ENTIDAD:', textStartX, yOffset + 18);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(String(receiptData.entidad_nombre || ''), textStartX + 25, yOffset + 18);

    docInstance.setFont('helvetica', 'bold');
    docInstance.text('CÓDIGO:', textStartX, yOffset + 26);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(String(receiptData.entidad_codigo || ''), textStartX + 25, yOffset + 26);

    // Model ID & Copy Label
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(12);
    docInstance.text('MODELO ' + model.code, pageWidth - 65, yOffset + 18);
    docInstance.setFontSize(8);
    docInstance.setFont('helvetica', 'italic');
    docInstance.text('Uso Obligatorio' + (copyLabel ? ' - ' + copyLabel : ''), pageWidth - 65, yOffset + 23);

    // Dates and Serial No
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(8);
    docInstance.text('FECHA DE EMISIÓN:', 15, yOffset + 33);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(String(receiptData.fecha_emision || ''), 45, yOffset + 33);

    docInstance.setFont('helvetica', 'bold');
    docInstance.text('FECHA DEL COBRO:', 80, yOffset + 33);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(String(receiptData.fecha_emision || ''), 110, yOffset + 33);

    docInstance.setFont('helvetica', 'bold');
    docInstance.text('NO. CONSECUTIVO:', pageWidth - 65, yOffset + 33);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(String(receiptData.numero_consecutivo || ''), pageWidth - 35, yOffset + 33);

    // Main Title
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(14);
    docInstance.text(model.name, pageWidth / 2, yOffset + 48, { align: 'center' });

    // Persona entrega
    docInstance.setFontSize(10);
    docInstance.setFont('helvetica', 'bold');
    docInstance.text('RECIBÍ DE:', 15, yOffset + 58);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(String(receiptData.persona_entrega || '').toUpperCase(), 40, yOffset + 58);

    // Table for concepts
    const tableRows = (receiptData.conceptos_tabla || []).map((row: any) => [
      String(row.concept || row.concepto || '').toUpperCase(),
      Number(row.amount || row.importe || 0).toFixed(2)
    ]);

    (docInstance as any).autoTable({
      startY: yOffset + 63,
      head: [['CONCEPTO', 'IMPORTE ($)']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], halign: 'center', fontSize: 9 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: pageWidth - 60 }, 1: { halign: 'right', cellWidth: 30 } },
      margin: { left: 15, right: 15 }
    });

    const finalY = (docInstance as any).lastAutoTable.finalY;

    // Total Line
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(11);
    docInstance.text('TOTAL:', pageWidth - 60, finalY + 12);
    docInstance.text(Number(receiptData.total || 0).toFixed(2), pageWidth - 30, finalY + 12, { align: 'right' });

    // Amount in words
    docInstance.setFontSize(9);
    docInstance.text('CANTIDAD EN LETRAS:', 15, finalY + 20);
    docInstance.setFont('helvetica', 'normal');
    const textWidth = pageWidth - 30;
    docInstance.text(String(receiptData.cantidad_letras || 'CERO').toUpperCase(), 15, finalY + 26, { maxWidth: textWidth });

    // Signature section
    const sigY = finalY + 45;
    docInstance.setLineWidth(0.2);
    docInstance.line(20, sigY, 80, sigY);
    docInstance.setFontSize(7);
    docInstance.setFont('helvetica', 'bold');
    docInstance.text('FIRMA CAJERO', 35, sigY + 5);

    docInstance.line(pageWidth - 85, sigY, pageWidth - 15, sigY);
    docInstance.text('FIRMA DE LA PERSONA QUE ENTREGA EL EFECTIVO', pageWidth - 85, sigY + 5, { maxWidth: 70, align: 'center' });
  };

  if (model.code === 'SC-3-01') {
    if (data.isMassExport && data.receipts) {
      for (let i = 0; i < data.receipts.length; i += 2) {
        if (i > 0) doc.addPage();
        drawReceipt(doc, data.receipts[i], 0, "");
        if (data.receipts[i+1]) {
          doc.setLineDashPattern([2, 2], 0);
          doc.setDrawColor(150);
          doc.line(0, pageHeight / 2, pageWidth, pageHeight / 2);
          doc.setLineDashPattern([], 0);
          doc.setDrawColor(0);
          drawReceipt(doc, data.receipts[i+1], pageHeight / 2, "");
        }
      }
    } else {
      drawReceipt(doc, data, 0, "ORIGINAL");
      if (!options || !options.skipCopy) {
        doc.setLineDashPattern([2, 2], 0);
        doc.setDrawColor(150);
        doc.line(0, pageHeight / 2, pageWidth, pageHeight / 2);
        doc.setLineDashPattern([], 0);
        doc.setDrawColor(0);
        drawReceipt(doc, data, pageHeight / 2, "COPIA");
      }
    }
  } else {
    // Other models layout...
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(model.name, pageWidth / 2, 65, { align: 'center' });
  }

  doc.save(`${model.code}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}
