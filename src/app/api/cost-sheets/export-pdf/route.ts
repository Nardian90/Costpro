import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body.result || body;
    const exportOptions = body.exportOptions || {};

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const timestamp = new Date().toLocaleString();
    const isPro = exportOptions.pdfFormat === 'pro';
    const primaryColor: [number, number, number] = [26, 82, 118]; // Pro Blue

    const safeLocale = (val: number) => {
        if (typeof val !== 'number') return '0,00';
        return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const translate = (key: string) => {
        const dict: Record<string, string> = {
            'classification': 'Fila',
            'label': 'Concepto',
            'total': 'Total',
            'v_historico': 'V. Histórico',
            'valorhistorico': 'V. Histórico',
            'um': 'UM',
            'cantidad': 'Cant.',
            'precio': 'Precio',
            'importe': 'Importe'
        };
        return dict[key.toLowerCase()] || key;
    };

    const addHeader = (pdf: jsPDF, title: string) => {
        const h = result.metadata?.header || result.header || {};

        pdf.setDrawColor(200);
        pdf.rect(14, 10, 12, 12);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("FC", 16, 18);

        pdf.setFontSize(12);
        pdf.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
        pdf.text(title.toUpperCase(), 30, 15);

        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text("Res. 148/2023 - CONTROL INTERNO", 30, 19);

        pdf.setFontSize(6);
        pdf.text("DOCUMENTO TÉCNICO DE COSTOS", pageWidth - 14, 12, { align: "right" });
        pdf.text(`Generado: ${timestamp}`, pageWidth - 14, 15, { align: "right" });

        if (isPro) {
            pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.rect(pageWidth - 40, 18, 26, 6);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7);
            pdf.text("VIGENTE", pageWidth - 27, 22.5, { align: "center" });
        }

        pdf.setDrawColor(230);
        pdf.line(14, 26, pageWidth - 14, 26);

        pdf.setFontSize(7);
        pdf.setTextColor(120);
        pdf.setFont("helvetica", "bold");
        pdf.text("PRODUCTO / SERVICIO", 14, 31);
        pdf.text("CÓDIGO", 55, 31);
        pdf.text("UNIDAD DE MEDIDA", 95, 31);
        pdf.text("CANTIDAD", 135, 31);

        pdf.setTextColor(0);
        pdf.setFont("helvetica", "normal");
        pdf.text(h.name || result.fichaName || result.name || "-", 14, 35);
        pdf.text(h.code || result.fichaId || result.id || "-", 55, 35);
        pdf.text(h.unit || "-", 95, 35);
        pdf.text(String(h.quantity || result.meta?.quantity || 1), 135, 35);

        pdf.setTextColor(120);
        pdf.setFont("helvetica", "bold");
        pdf.text("EMPRESA", 14, 40);
        pdf.text("DESTINO", 55, 40);
        pdf.text("MONEDA", 95, 40);

        pdf.setTextColor(0);
        pdf.setFont("helvetica", "normal");
        pdf.text(h.enterprise || "-", 14, 44);
        pdf.text(h.destination || "-", 55, 44);
        pdf.text(h.currency || "CUP", 95, 44);

        const r14 = (result.rows || []).find((r: any) => r.classification === '14' || r.id === '14');
        const r16_1 = (result.rows || []).find((r: any) => r.classification === '16.1' || r.id === '16.1');
        const finalPrice = r16_1?.total || r14?.total || 0;

        if (finalPrice > 0) {
            pdf.setFillColor(255, 240, 240);
            pdf.rect(pageWidth - 44, 38, 30, 8, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(180, 0, 0);
            pdf.setFontSize(6);
            pdf.text("PRECIO VENTA", pageWidth - 29, 41, { align: "center" });
            pdf.setFontSize(9);
            pdf.text(safeLocale(finalPrice), pageWidth - 29, 45, { align: "center" });
        }

        pdf.setTextColor(0);
        return 45;
    };

    let isFirstPage = true;
    let pageTitle = "FICHA DE COSTO";
    let currentY = addHeader(doc, pageTitle);

    if (exportOptions.includeTable) {
        const headers = ['CÓDIGO', 'CONCEPTO', 'UM', 'V. HISTÓRICO', 'TOTAL'];
        const body = (result.rows || [])
            .filter((r: any) => {
                if (exportOptions.skipZeros && r.total === 0) return false;
                return true;
            })
            .map((r: any) => [
                r.classification || r.id,
                r.label,
                r.um || r.unit || '-',
                safeLocale(r.valorHistorico ?? r.calculatedVH ?? r.v_historico ?? 0),
                safeLocale(r.total ?? 0)
            ]);

        autoTable(doc, {
            startY: currentY,
            head: [headers],
            body: body,
            theme: 'plain',
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: isPro ? primaryColor : [0,0,0],
                fontSize: 8,
                fontStyle: 'bold',
                lineWidth: { bottom: 0.5 },
                lineColor: isPro ? primaryColor : [100, 100, 100]
            },
            styles: {
                fontSize: 8,
                cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
                font: "helvetica",
                lineColor: [240, 240, 240]
            },
            columnStyles: {
                0: { cellWidth: 12 }, // FILA
                1: { cellWidth: 'auto' }, // CONCEPTO
                2: { cellWidth: 12, halign: 'center' }, // UM
                3: { cellWidth: 22, halign: 'right' }, // V. HISTORICO
                4: { cellWidth: 22, halign: 'right' } // TOTAL
            },
            alternateRowStyles: {
                fillColor: [249, 249, 249]
            },
            margin: { top: 45, left: 14, right: 14 },
            didParseCell: (data) => {
                const rowIndex = data.row.index;
                const r = (result.rows || [])[rowIndex];
                if (r && data.section === 'body') {
                    const classStr = String(r.classification || r.id || '');
                    const level = (classStr.match(/\./g) || []).length;
                    const labelLower = (r.label || '').toLowerCase();
                    const isVenta = labelLower.includes('venta');
                    const isCosto = labelLower.includes('costo');
                    const isUtilidad = labelLower.includes('utilidad');
                    const isImpuesto = labelLower.includes('imp s/') || labelLower.includes('impuesto');
                    const isSpecial = isVenta || isCosto || isUtilidad || isImpuesto || ['13', '13.1', '13.2', '14', '19', '20'].includes(classStr);

                    if (data.column.index === 1) { // CONCEPTO
                        data.cell.styles.cellPadding = { left: 2 + (level * 4) };
                        if (level === 0) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fontSize = 9;
                            data.cell.text = [data.cell.text[0].toUpperCase()];
                        } else if (level === 1) {
                            data.cell.styles.fontStyle = 'normal';
                            data.cell.styles.fontSize = 8.5;
                        } else {
                            data.cell.styles.fontStyle = 'italic';
                            data.cell.styles.fontSize = 8;
                            data.cell.styles.textColor = [80, 80, 80];
                        }
                    }

                    if (isSpecial || level === 0) {
                        data.cell.styles.fontStyle = 'bold';
                        if (isVenta || isUtilidad || isImpuesto) {
                            data.cell.styles.textColor = [180, 0, 0];
                            data.cell.styles.fillColor = [255, 248, 248];
                        }
                        if (['14', '20'].includes(classStr) || labelLower.includes('total')) {
                            data.cell.styles.lineWidth = { top: 0.1, bottom: 0.3 };
                        }
                    }
                }
            },
            didDrawCell: (data) => {
                if (data.column.index === 1 && data.section === 'body') {
                    const pdf = data.doc;
                    const cell = data.cell;
                    const textWidth = pdf.getTextWidth(cell.text[0]);
                    const startX = cell.x + textWidth + 3;
                    const endX = cell.x + cell.width - 2;
                    if (endX > startX) {
                        pdf.setDrawColor(220);
                        pdf.setLineDashPattern([0.2, 1.2], 0);
                        pdf.line(startX, cell.y + cell.height - 2.8, endX, cell.y + cell.height - 2.8);
                        pdf.setLineDashPattern([], 0);
                    }
                }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
        isFirstPage = false;
    }

    const selectedAnnexes = (result.anexos || []).filter((a: any) => exportOptions.includeAnnexes?.includes(a.id));
    for (const annex of selectedAnnexes) {
        if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = addHeader(doc, `ANEXO ${annex.id}`);
        } else {
            doc.setDrawColor(240);
            doc.line(14, currentY, pageWidth - 14, currentY);
            currentY += 8;
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text((annex.name || annex.id).toUpperCase(), 14, currentY);
        currentY += 4;

        if (annex.rows && annex.rows.length > 0) {
            const allKeys = Object.keys(annex.rows[0]);
            const headers = allKeys.filter(k => k !== 'importe' && k !== 'total' && k !== 'id');
            // If amount or total exists, add it at the end
            if (allKeys.includes('importe')) headers.push('importe');
            else if (allKeys.includes('total')) headers.push('total');

            const body = annex.rows.map((r: any) => headers.map(h => {
                const val = r[h];
                if (typeof val === 'number') return safeLocale(val);
                return val;
            }));

            autoTable(doc, {
                startY: currentY,
                head: [headers.map(h => translate(h).toUpperCase())],
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [255, 255, 255], textColor: primaryColor, fontSize: 8, lineWidth: { bottom: 0.5 } },
                styles: { fontSize: 8, cellPadding: 1.5 },
                margin: { left: 14, right: 14 }
            });
            currentY = (doc as any).lastAutoTable.finalY + 10;
        }
    }

    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`COSTPRO - Reporte Generado el ${timestamp} - Página ${i} de ${pageCount}`, 14, 285);
        doc.text("Res. 148/2023 - CONTROL INTERNO", pageWidth - 14, 285, { align: "right" });
    }

    const pdfBuffer = doc.output('arraybuffer');
    const h = result.metadata?.header || result.header || {};
    const safeFilename = `ficha-${h.code || result.fichaId || result.id || 'export'}.pdf`.replace(/[\\/\?%*:|"<>]/g, '-');

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
