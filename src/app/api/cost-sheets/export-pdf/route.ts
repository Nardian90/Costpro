
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculationResult } from '@/lib/cost-engine/types';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result: CalculationResult = body;
    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true
    };

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    const addHeader = (doc: jsPDF, title: string) => {
        // Logo Placeholder or "C"
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.rect(14, 10, 20, 20);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("C", 24, 23, { align: "center" });

        // Formal Header (Ministry Style)
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2 + 10, 15, { align: "center" });
        doc.setFontSize(8);
        doc.text("FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS", pageWidth / 2 + 10, 20, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.text(title, pageWidth / 2 + 10, 24, { align: "center" });
        doc.line(14, 32, pageWidth - 14, 32);
    };

    const addDataSheetHeader = (doc: jsPDF, y: number) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("DATOS GENERALES DE LA FICHA DE COSTO (FC)", 14, y);

        const h = result.metadata?.header || {};
        const data = [
            [`No. FC: ${h.code || result.fichaId || 'N/A'}`, `Cod. Producto: ${h.product_code || 'N/A'}`, `Producto: ${h.name || result.fichaName || 'N/A'}`],
            [`UM: ${h.unit || 'N/A'}`, `Cantidad: ${h.quantity || 1}`, `EMPRESA: ${h.company || 'N/A'}`],
            [`ORGANISMO: ${h.organism || 'N/A'}`, `UNION: ${h.union || 'N/A'}`, `Destino: ${h.destination || 'N/A'}`],
            [`Nivel de Producción: ${h.production_level || 'N/A'}`, `% Utilización capacidad: ${h.capacity_utilization || 0}%`, `Precio de Venta: ${h.sale_price?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00'}`],
            [`Cliente: ${h.client || 'N/A'}`, `Moneda: ${h.currency || 'CUP'}`, `Fecha: ${h.date || format(new Date(), "yyyy-MM-dd")}`]
        ];

        autoTable(doc, {
            startY: y + 2,
            body: data,
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 1 },
            columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 60 }, 2: { cellWidth: 60 } }
        });

        return (doc as any).lastAutoTable.finalY;
    };

    let isFirstPage = true;

    // 1. Export FC
    if (exportOptions.includeFC) {
        addHeader(doc, "FICHA DE COSTO");
        let currentY = addDataSheetHeader(doc, 38);

        if (exportOptions.includeFinancialSummary) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("RESUMEN FINANCIERO:", 14, currentY + 8);

            const row13 = result.rows.find(r => r.classification === '13');
            const row12 = result.rows.find(r => r.classification === '12');
            const utilityPercent = (row13 && row12 && row12.total > 0) ? (row13.total / row12.total) * 100 : 0;

            const summaryData = [
                ['Costo Total', result.summary.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
                ['Utilidad', (row13?.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })],
                ['% Utilidad / Costo', `${utilityPercent.toFixed(2)}%`],
                ['Margen Comercial', result.summary.totalMargin.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
                ['Impuestos', result.summary.totalTax.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
                ['PRECIO FINAL', result.summary.grandTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })],
            ];

            autoTable(doc, {
                startY: currentY + 10,
                head: [['Concepto', 'Valor']],
                body: summaryData,
                theme: 'grid',
                headStyles: { fillColor: [40, 40, 40], textColor: 255 },
                styles: { fontSize: 8 },
                columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
            });
            currentY = (doc as any).lastAutoTable.finalY;
        }

        // Main Rows Table
        const rowHeaders = ['Clasif.', 'Concepto', 'Método', 'V. Histórico', 'Total'];

        // Skip Zeros logic for children
        const filterRows = (rows: any[]) => {
            return rows.filter(r => {
                const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));
                if (!hasChildren && exportOptions.skipZeros && r.total === 0) return false;
                return true;
            });
        };

        const filteredRows = filterRows(result.rows);

        const row12Total = result.rows.find(r => r.classification === '12')?.total || 0;

        const rowData = filteredRows.map(r => {
            let label = r.label.toUpperCase();
            if (r.classification === '13' && row12Total > 0) {
                const p = (r.total / row12Total) * 100;
                label += ` (${p.toFixed(1)}% S/ COSTO)`;
            }

            return [
                r.classification,
                label,
                r.formaCalculo,
                r.valorHistorico?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00',
                r.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })
            ];
        });

        autoTable(doc, {
            startY: currentY + 10,
            head: [rowHeaders],
            body: rowData,
            theme: 'striped',
            headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            columnStyles: {
                0: { cellWidth: 20 },
                3: { halign: 'right' },
                4: { halign: 'right', fontStyle: 'bold' }
            }
        });
        isFirstPage = false;
    }

    // 2. Export Annexes
    const selectedAnnexes = result.anexos.filter(a => exportOptions.includeAnnexes.includes(a.id));
    for (const annex of selectedAnnexes) {
        // Skip Zeros logic for annexes
        const totalImporte = annex.rows.reduce((sum, r) => sum + (r.importe || 0), 0);
        if (exportOptions.skipZeros && totalImporte === 0) continue;

        if (!isFirstPage) doc.addPage();
        addHeader(doc, `ANEXO ${annex.id}`);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text((annex.name || annex.id).toUpperCase(), 14, 38);

        const headers = Object.keys(annex.rows[0] || {}).filter(k => k !== 'importe');
        const body = annex.rows.map(r => headers.map(h => r[h]));

        autoTable(doc, {
            startY: 42,
            head: [headers.map(h => h.toUpperCase())],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], textColor: 255, fontSize: 7 },
            styles: { fontSize: 6.5, cellPadding: 1 }
        });
        isFirstPage = false;
    }

    // 3. Export Audit (always last if consolidated)
    if (exportOptions.includeAudit) {
        if (!isFirstPage) doc.addPage();
        addHeader(doc, "TRAZABILIDAD DE CÁLCULO (AUDITORÍA)");

        const auditData = result.audits.map(a => [
            a.rowId || '-',
            a.type,
            a.note,
            `${a.prev || '0'} -> ${a.now || '0'}`
        ]);

        autoTable(doc, {
            startY: 38,
            head: [['Fila', 'Tipo', 'Nota', 'Cambio']],
            body: auditData,
            theme: 'plain',
            styles: { fontSize: 6 },
            headStyles: { fontStyle: 'bold' }
        });
    }

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
        'Content-Disposition': `attachment; filename="ficha-${result.fichaId || 'export'}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
