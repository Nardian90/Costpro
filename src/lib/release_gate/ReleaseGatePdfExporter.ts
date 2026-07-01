import autoTable from 'jspdf-autotable';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export class ReleaseGatePdfExporter {
  static async exportHealthReport(data: any) {
    if (!data || !data.shi || !data.mri) {
      console.error('Invalid health data for export');
      return;
    }

    const { shi, mri, version, timestamp } = data;

    try {
      const doc = await createPDFDocument();
      const dateStr = format(new Date(timestamp || new Date()), 'dd/MM/yyyy HH:mm', { locale: es });

      // Header
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(0, 0, 210, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORTE DE SALUD DEL SISTEMA', 15, 20);

      doc.setFontSize(10);
      doc.text(`CostPro Terminal Enterprise v${version} | ${dateStr}`, 15, 30);

      // Global Score Section
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.text('Resumen Ejecutivo', 15, 55);

      doc.setFontSize(12);
      doc.text(`System Health Index (SHI): ${shi.score}/100`, 15, 65);
      doc.text(`Estado Global: ${shi.status}`, 15, 72);
      doc.text(`Market Readiness Index (MRI): ${mri.score}/10.0`, 15, 79);

      let finalY = 90;

      // Infrastructure Metrics Table
      autoTable(doc, {
        startY: finalY,
        head: [['Categoría: Infraestructura', 'Valor']],
        body: [
          ['Uptime', `${shi.metrics?.uptime ?? 'N/A'}%`],
          ['Latencia p95', `${shi.metrics?.latency_p95 ?? 'N/A'}ms`],
          ['Uso de CPU', `${shi.metrics?.cpu_usage ?? 'N/A'}%`],
          ['Uso de Memoria', `${shi.metrics?.memory_usage ?? 'N/A'}%`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] }, // Blue-500
      });

      finalY = (doc as any).lastAutoTable?.finalY || finalY + 40;

      // Security Metrics Table
      autoTable(doc, {
        startY: finalY + 10,
        head: [['Categoría: Seguridad & GRC', 'Estado']],
        body: [
          ['Amenazas Activas', `${shi.metrics?.active_threats ?? 0}`],
          ['Logins Fallidos (1h)', `${shi.metrics?.failed_logins_1h ?? 0}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [244, 63, 94] }, // Rose-500
      });

      finalY = (doc as any).lastAutoTable?.finalY || finalY + 40;

      // MRI Breakdown
      autoTable(doc, {
        startY: finalY + 10,
        head: [['Métrica MRI', 'Valor']],
        body: [
          ['Arquitectura', `${mri.architectureHealth?.toFixed(1) ?? 'N/A'}`],
          ['Documentación', `${mri.documentationCoverage?.toFixed(1) ?? 'N/A'}`],
          ['Testing', `${mri.testCoverage?.toFixed(1) ?? 'N/A'}`],
          ['Seguridad', `${mri.securityCompliance?.toFixed(1) ?? 'N/A'}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [139, 92, 246] }, // Violet-500
      });

      finalY = (doc as any).lastAutoTable?.finalY || finalY + 40;

      // Hard Stops Status
      if (mri.hardStops && mri.hardStops.length > 0) {
        autoTable(doc, {
          startY: finalY + 10,
          head: [['Hard Stop de Gobernanza', 'Resultado']],
          body: mri.hardStops.map((hs: any) => [hs.name, hs.passed ? 'PASSED' : 'FAILED']),
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59] },
          bodyStyles: { fontStyle: 'bold' },
        });
      }

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Documento generado automáticamente por el Motor de Observabilidad de CostPro Terminal. Confidencial - Uso Interno. Página ${i} de ${pageCount}`,
          105,
          285,
          { align: 'center' }
        );
      }

      doc.save(`SystemHealth_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF report:', error);
    }
  }
}
