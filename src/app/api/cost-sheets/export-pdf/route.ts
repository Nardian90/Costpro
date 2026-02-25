import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body.result || body;
    const exportOptions = body.exportOptions || {};
    const sections = body.sections || []; // Optional sections structure

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const timestamp = new Date().toLocaleString();

    // Support both naming conventions
    const includeFC = exportOptions.includeFC || exportOptions.includeTable;
    const includeAudit = exportOptions.includeAudit;

    const isPro = exportOptions.pdfFormat === 'pro';
    const primaryColor: [number, number, number] = isPro ? [26, 82, 118] : [0, 0, 0]; // Pro Blue or Black

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

        // Branding
        pdf.setFillColor(isPro ? 240 : 255, isPro ? 240 : 255, isPro ? 240 : 255);
        if (isPro) {
            pdf.rect(14, 10, 12, 12, 'F');
        }
        pdf.setDrawColor(200);
        pdf.rect(14, 10, 12, 12);

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
        pdf.text("FC", 16, 18);

        pdf.setFontSize(12);
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
            pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.text("VIGENTE", pageWidth - 27, 22.5, { align: "center" });
        }

        pdf.setDrawColor(230);
        pdf.line(14, 26, pageWidth - 14, 26);

        // Metadata Grid
        pdf.setFontSize(7);
        pdf.setTextColor(120);
        pdf.setFont("helvetica", "bold");
        pdf.text("PRODUCTO / SERVICIO", 14, 31);
        pdf.text("CÓDIGO", 55, 31);
        pdf.text("UNIDAD DE MEDIDA", 95, 31);
        pdf.text("CANTIDAD", 135, 31);

        pdf.setTextColor(0);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(h.name || result.fichaName || result.name || "-").substring(0, 45), 14, 35);
        pdf.text(String(h.code || result.fichaId || result.id || "-"), 55, 35);
        pdf.text(String(h.unit || "-"), 95, 35);
        pdf.text(String(h.quantity || result.meta?.quantity || 1), 135, 35);

        pdf.setTextColor(120);
        pdf.setFont("helvetica", "bold");
        pdf.text("EMPRESA", 14, 40);
        pdf.text("DESTINO", 55, 40);
        pdf.text("MONEDA", 95, 40);

        pdf.setTextColor(0);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(h.enterprise || "-").substring(0, 40), 14, 44);
        pdf.text(String(h.destination || "-"), 55, 44);
        pdf.text(String(h.currency || "CUP"), 95, 44);

        const r14 = (result.rows || []).find((r: any) => r.classification === '14' || r.id === '14');
        const r16_1 = (result.rows || []).find((r: any) => r.classification === '16.1' || r.id === '16.1');
        const finalPrice = r16_1?.total || r14?.total || 0;

        if (finalPrice > 0) {
            pdf.setFillColor(isPro ? 245 : 255, 240, 240);
            pdf.rect(pageWidth - 44, 38, 30, 8, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(180, 0, 0);
            pdf.setFontSize(6);
            pdf.text("PRECIO VENTA", pageWidth - 29, 41, { align: "center" });
            pdf.setFontSize(9);
            pdf.text(safeLocale(finalPrice), pageWidth - 29, 45, { align: "center" });
        }

        pdf.setTextColor(0);
        return 48; // Return new Y position
    };

    let currentY = addHeader(doc, "FICHA DE COSTO");

    if (includeFC) {
        const headers = ['CÓDIGO', 'CONCEPTO', 'UM', 'V. HISTÓRICO', 'TOTAL'];
        let tableBody: any[] = [];

        if (sections && sections.length > 0) {
            // Group by provided sections
            sections.forEach((s: any) => {
                // Section headers removed as per request

                const flattenRows = (rows: any[]) => {
                    rows.forEach((r: any) => {
                        const calc = (result.rows || []).find((cr: any) => cr.id === r.id);
                        if (calc) {
                            const classStr = String(calc.classification || calc.id || '');
                            const level = (classStr.match(/\./g) || []).length;

                            // Parents (level 0, 1) always visible
                            // Children (level 2+) hidden if zero and skipZeros is true
                            const isParent = level < 2;
                            const isZero = (calc.total ?? 0) === 0;

                            if (exportOptions.skipZeros && isZero && !isParent) return;

                            tableBody.push([
                                calc.classification || calc.id,
                                calc.label,
                                calc.um || calc.unit || '-',
                                safeLocale(calc.valorHistorico ?? calc.calculatedVH ?? calc.v_historico ?? 0),
                                safeLocale(calc.total ?? 0)
                            ]);
                        }
                        if (r.children) flattenRows(r.children);
                    });
                };
                flattenRows(s.rows);
            });
        } else {
            // Fallback to flat rows
            tableBody = (result.rows || [])
                .filter((r: any) => {
                    if (exportOptions.skipZeros) {
                        const classStr = String(r.classification || r.id || '');
                        const level = (classStr.match(/\./g) || []).length;
                        const isParent = level < 2;
                        const isZero = (r.total ?? 0) === 0;
                        if (isZero && !isParent) return false;
                    }
                    return true;
                })
                .map((r: any) => [
                    r.classification || r.id,
                    r.label,
                    r.um || r.unit || '-',
                    safeLocale(r.valorHistorico ?? r.calculatedVH ?? r.v_historico ?? 0),
                    safeLocale(r.total ?? 0)
                ]);
        }

        autoTable(doc, {
            startY: currentY,
            head: [headers],
            body: tableBody,
            theme: isPro ? 'grid' : 'plain',
            headStyles: {
                fillColor: isPro ? [40, 40, 40] : [255, 255, 255],
                textColor: isPro ? [255, 255, 255] : [0, 0, 0],
                fontSize: isPro ? 7.5 : 8,
                fontStyle: 'bold',
                lineWidth: { bottom: 0.5 },
                lineColor: isPro ? [40, 40, 40] : [100, 100, 100]
            },
            styles: {
                fontSize: 8,
                cellPadding: isPro ? { top: 2, bottom: 2, left: 3, right: 3 } : { top: 1.5, bottom: 1.5, left: 2, right: 2 },
                font: "helvetica",
                lineColor: isPro ? [230, 230, 230] : [240, 240, 240],
                lineWidth: isPro ? 0.05 : 0
            },
            columnStyles: {
                0: { cellWidth: 15 }, // FILA
                1: { cellWidth: 'auto' }, // CONCEPTO
                2: { cellWidth: 12, halign: 'center' }, // UM
                3: { cellWidth: 25, halign: 'right' }, // V. HISTORICO
                4: { cellWidth: 25, halign: 'right' } // TOTAL
            },
            alternateRowStyles: {
                fillColor: [249, 249, 249]
            },
            margin: { top: 45, left: 14, right: 14 },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const rowContent = data.row.raw as any[];
                    if (rowContent.length === 1 && data.cell.raw && (data.cell.raw as any).content) {
                        // This is a section header row
                        return;
                    }

                    const r = (result.rows || []).find((cr: any) => cr.classification === rowContent[0] || cr.id === rowContent[0]);
                    if (r) {
                        const classStr = String(r.classification || r.id || '');
                        const level = (classStr.match(/\\./g) || []).length;
                        const labelLower = (r.label || '').toLowerCase();
                        const isVenta = labelLower.includes('venta');
                        const isCosto = labelLower.includes('costo');
                        const isUtilidad = labelLower.includes('utilidad');
                        const isImpuesto = labelLower.includes('imp s/') || labelLower.includes('impuesto');
                        const isSpecial = isVenta || isCosto || isUtilidad || isImpuesto || ['12', '13', '13.1', '13.2', '14', '19', '20'].includes(classStr);

                        if (data.column.index === 1) { // CONCEPTO
                            const indent = isPro ? (level * 6) : (level * 4);
                            data.cell.styles.cellPadding = { ...data.cell.styles.cellPadding as any, left: (data.cell.styles.cellPadding as any).left + indent };

                            let label = String(data.cell.text[0]);
                            if (isPro && level > 0) {
                                if (level === 1) label = "• " + label;
                                else label = "  - " + label;
                            }

                            if (level === 0) {
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fontSize = isPro ? 9.5 : 9;
                                data.cell.text = [label.toUpperCase()];
                            } else if (level === 1) {
                                data.cell.styles.fontStyle = isPro ? 'bold' : 'normal';
                                data.cell.styles.fontSize = isPro ? 8.5 : 8.5;
                                data.cell.text = [label];
                            } else {
                                data.cell.styles.fontStyle = 'italic';
                                data.cell.styles.fontSize = 8;
                                data.cell.styles.textColor = isPro ? [60, 60, 60] : [80, 80, 80];
                                data.cell.text = [label];
                            }

                            // Focus on elements with value
                            if (isPro && (r.total ?? 0) > 0 && level > 0) {
                                data.cell.styles.textColor = [0, 0, 0];
                                if (level >= 2) data.cell.styles.fontStyle = 'normal';
                            }
                        }

                        if (isSpecial || level === 0) {
                            data.cell.styles.fontStyle = 'bold';
                            if (isVenta || isUtilidad || isImpuesto) {
                                data.cell.styles.textColor = isPro ? [150, 0, 0] : [180, 0, 0];
                                data.cell.styles.fillColor = isPro ? [255, 245, 245] : [255, 248, 248];
                            }
                            if (['14', '20'].includes(classStr) || labelLower.includes('total')) {
                                data.cell.styles.lineWidth = { top: 0.1, bottom: 0.3 };
                            }
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
                    if (endX > startX && !isPro) { // Dots only in Standard
                        pdf.setDrawColor(220);
                        pdf.setLineDashPattern([0.2, 1.2], 0);
                        pdf.line(startX, cell.y + cell.height - 2.8, endX, cell.y + cell.height - 2.8);
                        pdf.setLineDashPattern([], 0);
                    }
                }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Annexes
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
            const headers = allKeys.filter(k => k !== 'importe' && k !== 'total' && k !== 'id' && k !== 'classification');
            if (allKeys.includes('classification')) headers.unshift('classification');
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
                theme: isPro ? 'grid' : 'grid',
                headStyles: {
                    fillColor: isPro ? [60, 60, 60] : [255, 255, 255],
                    textColor: isPro ? [255, 255, 255] : primaryColor,
                    fontSize: 7,
                    lineWidth: { bottom: 0.5 },
                    lineColor: isPro ? [60, 60, 60] : primaryColor
                },
                styles: {
                    fontSize: 7,
                    cellPadding: isPro ? 2 : 1.5,
                    lineColor: isPro ? [230, 230, 230] : [200, 200, 200],
                    lineWidth: isPro ? 0.05 : 0.1
                },
                margin: { left: 14, right: 14 }
            });
            currentY = (doc as any).lastAutoTable.finalY + 10;
        }
    }

    // Audit Log
    if (includeAudit) {
        if (currentY > pageHeight - 80) {
            doc.addPage();
            currentY = addHeader(doc, "TRAZABILIDAD Y AUDITORÍA");
        } else {
            doc.setDrawColor(240);
            doc.line(14, currentY, pageWidth - 14, currentY);
            currentY += 8;
        }

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("INFORME DE TRAZABILIDAD Y VALIDACIÓN", 14, currentY);
        currentY += 8;

        // Integrity Score (as requested by users in audit reports)
        const criticals = (result.deepValidationErrors || []).filter((v: any) => v.type === 'CRITICAL').length;
        const warnings = (result.deepValidationErrors || []).filter((v: any) => v.type === 'WARNING').length;
        const totalValidations = (result.deepValidationErrors || []).length || 5;
        const score = Math.max(0, 10 - (criticals * 1.5) - (warnings * 0.2)).toFixed(2);
        const errorProb = (criticals > 0 ? (criticals / totalValidations) * 100 : 0).toFixed(1);

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(`EVALUACIÓN DE INTEGRIDAD: ${score} / 10.00`, 14, currentY);
        doc.text(`PROBABILIDAD DE ERROR ESTIMADA: ${errorProb}%`, pageWidth - 14, currentY, { align: 'right' });
        currentY += 6;

        const auditHeaders = ['TIPO', 'CATEGORÍA', 'REF', 'MENSAJE'];
        const auditBody = (result.deepValidationErrors || []).map((v: any) => [
            v.type,
            v.category || 'Sistema',
            v.rowId || '-',
            v.message
        ]);

        if (auditBody.length === 0) {
            auditBody.push(['SUCCESS', 'Integridad', '-', 'No se detectaron inconsistencias estructurales.']);
        }

        autoTable(doc, {
            startY: currentY,
            head: [auditHeaders],
            body: auditBody,
            theme: 'grid',
            headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 2 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 0) {
                    const val = String(data.cell.raw);
                    if (val === 'CRITICAL' || val === 'ERROR') data.cell.styles.textColor = [180, 0, 0];
                    if (val === 'WARNING') data.cell.styles.textColor = [180, 100, 0];
                    if (val === 'SUCCESS') data.cell.styles.textColor = [0, 120, 0];
                }
            }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;

        doc.setFontSize(7);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100);
        doc.text("Este informe evalúa la coherencia aritmética y normativa del documento técnico.", 14, currentY);
    }

    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`COSTPRO - Reporte Generado el ${timestamp} - Página ${i} de ${pageCount}`, 14, 285);
        if (isPro) {
            doc.text("DOCUMENTO VÁLIDO PARA AUDITORÍA", pageWidth / 2, 285, { align: "center" });
        }
        doc.text("Res. 148/2023 - CONTROL INTERNO", pageWidth - 14, 285, { align: "right" });
    }

    const pdfBuffer = doc.output('arraybuffer');
    const h = result.metadata?.header || result.header || {};
    const safeFilename = `ficha-${h.code || result.fichaId || result.id || 'export'}.pdf`.replace(/[\\/\\?%*:|"<>]/g, '-');

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
