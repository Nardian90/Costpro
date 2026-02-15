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
        includeFinancialSummary: true,
        includeUtilityNote: false
    };

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    let pageTitle = "FICHA DE COSTO";
    let lastHeaderPage = 0;

    const addHeader = (doc: jsPDF, title: string) => {
        const pageNum = doc.getNumberOfPages();
        if (lastHeaderPage === pageNum) return;
        lastHeaderPage = pageNum;

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

    const safeLocale = (val: any) => {
        if (val === null || val === undefined || isNaN(Number(val))) return '0,00';
        return Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2 });
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
            [`Nivel de Producción: ${h.production_level || 'N/A'}`, `% Utilización capacidad: ${h.capacity_utilization || 0}%`, `Precio de Venta: ${safeLocale(h.sale_price)}`],
            [`Cliente: ${h.client || 'N/A'}`, `Moneda: ${h.currency || 'CUP'}`, `Fecha: ${h.date || format(new Date(), "yyyy-MM-dd")}`]
        ];

        autoTable(doc, {
            startY: y + 2,
            body: data,
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 1 },
            columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 60 }, 2: { cellWidth: 60 } },
            margin: { top: 35 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });

        return (doc as any).lastAutoTable.finalY;
    };

    let isFirstPage = true;
    let currentY = 0;

    // 1. Export FC
    if (exportOptions.includeFC) {
        pageTitle = "FICHA DE COSTO";
        addHeader(doc, pageTitle);
        currentY = addDataSheetHeader(doc, 38);

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
                safeLocale(r.valorHistorico),
                safeLocale(r.total)
            ];
        });

        autoTable(doc, {
            startY: currentY + 10,
            head: [rowHeaders],
            body: rowData,
            theme: 'plain',
            headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 7, fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
            columnStyles: {
                0: { cellWidth: 20 },
                3: { halign: 'right' },
                4: { halign: 'right' }
            },
            margin: { top: 35, bottom: 20 },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const rowIndex = data.row.index;
                    const r = filteredRows[rowIndex];
                    if (r) {
                        const labelLower = r.label.toLowerCase();
                        const isVenta = labelLower.includes('venta');
                        const isCosto = labelLower.includes('costo');
                        const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));

                        if (hasChildren || isVenta || isCosto) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                        if (isVenta) {
                            data.cell.styles.textColor = [180, 0, 0];
                        }
                    }
                }
            },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;

        // Utility Note logic
        if (exportOptions.includeUtilityNote) {
            const r12 = result.rows.find(r => r.classification === '12' || r.classification === '12.1');
            const r13 = result.rows.find(r => r.classification === '13.1' || r.classification === '13');

            if (r12 && r13 && r12.total > 0) {
                const ratio = (r13.total / r12.total);
                const percent = (ratio - 1) * 100;

                doc.setFontSize(7.5);
                doc.setFont("helvetica", "bold");
                const noteTitle = "NOTA SOBRE EL MARGEN DE UTILIDAD:";
                doc.text(noteTitle, 14, currentY + 8);

                doc.setFont("helvetica", "normal");
                const noteContent = `El % de utilidad con respecto al costo es del ${percent.toFixed(2)}%, resultado de la relación entre el Precio (${safeLocale(r13.total)}) y el Total de Costos (${safeLocale(r12.total)}).`;
                const splitNote = doc.splitTextToSize(noteContent, pageWidth - 28);
                doc.text(splitNote, 14, currentY + 12);
                currentY += 15 + (splitNote.length * 3.5);
            }
        }

        isFirstPage = false;
    }

    // 2. Export Annexes
    const selectedAnnexes = result.anexos.filter(a => exportOptions.includeAnnexes.includes(a.id));
    for (const annex of selectedAnnexes) {
        // Skip Zeros logic for annexes
        const totalImporte = annex.rows.reduce((sum, r) => sum + (r.importe || 0), 0);
        if (exportOptions.skipZeros && totalImporte === 0) continue;

        // Annexes ALWAYS start on a new page if consolidated, as requested
        const needsNewPage = !isFirstPage;

        if (needsNewPage) {
            doc.addPage();
            pageTitle = `ANEXO ${annex.id}`;
            addHeader(doc, pageTitle);
            currentY = 38;
        } else {
            if (isFirstPage) {
                addHeader(doc, `ANEXO ${annex.id}`);
                currentY = 38;
            } else {
                currentY += 12;
            }
        }

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text((annex.name || annex.id).toUpperCase(), 14, currentY);
        currentY += 4;

        const headers = Object.keys(annex.rows[0] || {}).filter(k => k !== 'importe');
        const body = annex.rows.map(r => headers.map(h => r[h]));

        autoTable(doc, {
            startY: currentY,
            head: [headers.map(h => h.toUpperCase())],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], textColor: 255, fontSize: 7 },
            styles: { fontSize: 6.5, cellPadding: 1 },
            margin: { top: 35, bottom: 20 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;
        isFirstPage = false;
    }

    // 3. Export Audit (always last if consolidated)
    if (exportOptions.includeAudit) {
        const needsNewPage = !exportOptions.consolidated || isFirstPage || (currentY > pageHeight - 40);

        if (needsNewPage) {
            if (!isFirstPage) doc.addPage();
            pageTitle = "TRAZABILIDAD DE CÁLCULO (AUDITORÍA)";
            addHeader(doc, pageTitle);
            currentY = 38;
        } else {
            currentY += 12;
        }

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRAZABILIDAD DE CÁLCULO (AUDITORÍA)", 14, currentY);
        currentY += 4;

        const auditData = result.audits.map(a => [
            a.rowId || '-',
            a.type,
            a.note,
            `${a.prev || '0'} -> ${a.now || '0'}`
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['Fila', 'Tipo', 'Nota', 'Cambio']],
            body: auditData,
            theme: 'plain',
            styles: { fontSize: 6 },
            headStyles: { fontStyle: 'bold' },
            margin: { top: 35, bottom: 20 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.text(`Generado el: ${timestamp} - Página ${i} de ${pageCount}`, 14, 285);
    }

    const pdfBuffer = doc.output('arraybuffer');

    const h = result.metadata?.header || {};
    const evalCode = h.code || result.fichaId || 'export';
    const evalName = h.name || result.fichaName || 'ficha';
    const safeFilename = `ficha-${evalCode}-${evalName}.pdf`.replace(/[\\/\?%*:|"<>]/g, '-');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
