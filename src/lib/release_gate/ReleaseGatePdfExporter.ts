import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export class ReleaseGatePdfExporter {
  static exportHealthReport(data: any) {
    const { shi, mri, version, timestamp } = data;
    const doc = new jsPDF();
    const dateStr = format(new Date(timestamp), 'dd/MM/yyyy HH:mm', { locale: es });

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

    // Infrastructure Metrics Table
    (doc as any).autoTable({
      startY: 90,
      head: [['Categoría: Infraestructura', 'Valor']],
      body: [
        ['Uptime', `${shi.metrics.uptime}%`],
        ['Latencia p95', `${shi.metrics.latency_p95}ms`],
        ['Uso de CPU', `${shi.metrics.cpu_usage}%`],
        ['Uso de Memoria', `${shi.metrics.memory_usage}%`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }, // Blue-500
    });

    // Security Metrics Table
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Categoría: Seguridad & GRC', 'Estado']],
      body: [
        ['Violaciones RLS', shi.metrics.rls_violations === 0 ? 'LIMPIO' : `${shi.metrics.rls_violations} VIOLACIONES`],
        ['Alertas RBAC', shi.metrics.rbac_alerts === 0 ? 'SIN ALERTAS' : `${shi.metrics.rbac_alerts} ALERTAS`],
        ['Logins Fallidos (1h)', `${shi.metrics.failed_logins_last_hour}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [244, 63, 94] }, // Rose-500
    });

    // Release Gate (MRI) Table
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Dominio MRI', 'Score', 'Observación']],
      body: mri.domains.map((d: any) => [d.name, d.score, d.observations[0] || '']),
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] }, // Violet-500
    });

    // Hard Stops Status
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Hard Stop de Gobernanza', 'Resultado']],
      body: mri.hardStops.map((hs: any) => [hs.name, hs.passed ? 'PASSED' : 'FAILED']),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      bodyStyles: { fontStyle: 'bold' },
    });

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
  }
}
