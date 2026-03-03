import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { MRI_DOMAINS, HARD_STOPS } from '@/lib/release-gate/mri-engine';

export async function generateReleaseGatePdf(data: any) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header Box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, pageWidth - 20, 45);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CERTIFICADO DE LIBERACIÓN', pageWidth / 2, 22, { align: 'center' });

  doc.setFontSize(10);
  doc.text('MARKET READINESS INDEX (MRI)', pageWidth / 2, 28, { align: 'center' });

  doc.setFontSize(9);
  doc.text('PRODUCTO:', 15, 40);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.productName).toUpperCase(), 45, 40);

  doc.setFont('helvetica', 'bold');
  doc.text('VERSIÓN:', 15, 48);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.version).toUpperCase(), 45, 48);

  doc.setFont('helvetica', 'bold');
  doc.text('FECHA:', pageWidth - 80, 40);
  doc.setFont('helvetica', 'normal');
  doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), pageWidth - 60, 40);

  doc.setFont('helvetica', 'bold');
  doc.text('DICTAMEN:', pageWidth - 80, 48);
  doc.text(String(data.dictamen), pageWidth - 60, 48);

  // MRI Score Badge
  doc.setFillColor(0, 0, 0);
  doc.roundedRect(pageWidth / 2 - 25, 58, 50, 20, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('MRI FINAL', pageWidth / 2, 65, { align: 'center' });
  doc.setFontSize(16);
  doc.text(String(data.mri.toFixed(2)), pageWidth / 2, 73, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Domain Scores Table
  const domainRows = MRI_DOMAINS.map(domain => [
    domain.label.toUpperCase(),
    (domain.weight * 100).toFixed(0) + '%',
    data.domainScores[domain.id] + ' / 10',
    (data.domainScores[domain.id] * domain.weight).toFixed(2)
  ]);

  autoTable(doc, {
    startY: 85,
    head: [['DOMINIO DE EVALUACIÓN', 'PESO', 'SCORE', 'PONDERADO']],
    body: domainRows,
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], halign: 'center', fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' } },
    margin: { left: 15, right: 15 }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;

  // Hard Stops section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('REGLAS DE BLOQUEO (HARD STOPS):', 15, currentY);
  currentY += 5;

  HARD_STOPS.forEach(hs => {
    const active = data.hardStops[hs.id];
    doc.setFont('helvetica', active ? 'bold' : 'normal');
    if (active) doc.setTextColor(200, 0, 0);
    doc.text(`[${active ? 'X' : ' '}] ${hs.label.toUpperCase()}`, 20, currentY + 5);
    doc.setTextColor(0, 0, 0);
    currentY += 6;
  });

  currentY += 10;

  // Risks & Recommendations
  if (data.risks.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('RIESGOS CRÍTICOS DETECTADOS:', 15, currentY);
    currentY += 5;
    doc.setFont('helvetica', 'normal');
    data.risks.forEach((risk: string) => {
      doc.text('- ' + risk.toUpperCase(), 20, currentY + 5);
      currentY += 6;
    });
    currentY += 5;
  }

  if (data.recommendations.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('RECOMENDACIONES PRIORIZADAS:', 15, currentY);
    currentY += 5;
    doc.setFont('helvetica', 'normal');
    data.recommendations.forEach((rec: string) => {
      doc.text('- ' + rec.toUpperCase(), 20, currentY + 5);
      currentY += 6;
    });
    currentY += 5;
  }

  // Footer / Signatures
  const footerY = pageHeight - 40;
  doc.setLineWidth(0.2);
  doc.line( pageWidth / 2 - 40, footerY, pageWidth / 2 + 40, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('FIRMA APROBADOR', pageWidth / 2, footerY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.approver).toUpperCase(), pageWidth / 2, footerY + 10, { align: 'center' });

  // System Stamp
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('COSTPRO ENTERPRISE RELEASE GATE - MRI ENGINE V1.0', 15, pageHeight - 10);

  doc.save(`RELEASE_CERTIFICATE_${data.productName.replace(/\s+/g, '_')}_${data.version}.pdf`);
}
