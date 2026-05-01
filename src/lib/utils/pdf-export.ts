import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { AuditLog } from '@/types';
import { format } from 'date-fns';

export async function exportAuditToPdf(logs: AuditLog[]) {
  const doc = await createPDFDocument();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129); // Primary color
  doc.text('COSTPRO - REPORTE DE AUDITORÍA', 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 14, 30);
  doc.text(`Registros: ${logs.length}`, 14, 35);

  const tableData = logs.map(log => [
    format(new Date(log.created_at), 'dd/MM/yyyy HH:mm'),
    log.profile?.full_name || 'Sistema',
    log.action,
    log.table_name,
    log.store_name || 'Global'
  ]);

  (doc as any).autoTable({
    startY: 45,
    head: [['Fecha', 'Usuario', 'Acción', 'Módulo', 'Sucursal']],
    body: tableData,
    headStyles: { fillColor: [16, 185, 129] },
    alternateRowStyles: { fillColor: [240, 240, 240] },
    margin: { top: 45 },
  });

  doc.save(`costpro_audit_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}
