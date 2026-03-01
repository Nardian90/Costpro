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

    const safeLocale = (val: any) => {
        const n = parseFloat(String(val));
        if (isNaN(n)) return val;
        return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
            'importe': 'Importe',
            'id': 'ID',
            'name': 'Nombre',
            'title': 'Título',
            'description': 'Descripción',
            'unit': 'Unidad',
            'quantity': 'Cantidad',
            'value': 'Valor',
            'amount': 'Importe',
            'date': 'Fecha',
            'cost': 'Costo',
            'price_unit': 'P. Unitario',
            'price_total': 'P. Total',
            'depreciation_cost': 'C. Depreciación',
            'norm': 'Norma',
            'rate': 'Tarifa',
            'count': 'Cant.',
            'index': 'Índice'
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
        pdf.text(String(h.name ?? result.fichaName ?? result.name ?? "-").substring(0, 45), 14, 35);
        pdf.text(String(h.code ?? result.fichaId ?? result.id ?? "-"), 55, 35);
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

        let r14 = (result.rows || []).find((r: any) => r.classification === "14" || r.id === "14");
        let r16_1 = (result.rows || []).find((r: any) => r.classification === "16.1" || r.id === "16.1");
        if (!r14 && result.metadata?.calculationSnapshot?.values) {
            r14 = result.metadata.calculationSnapshot.values["14"] || Object.values(result.metadata.calculationSnapshot.values).find((v: any) => v.classification === "14");
        }
        if (!r16_1 && result.metadata?.calculationSnapshot?.values) {
            r16_1 = result.metadata.calculationSnapshot.values["16.1"] || Object.values(result.metadata.calculationSnapshot.values).find((v: any) => v.classification === "16.1");
        }
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
                        let calc = (result.rows || []).find((cr: any) => cr.id === r.id);
                        if (!calc && result.metadata?.calculationSnapshot?.values) {
                            const snap = result.metadata.calculationSnapshot.values[r.id];
                            if (snap) calc = { ...r, ...snap };
                        }
                        if (calc) {
                            calc = { ...r, ...calc };
                            const classStr = String(calc.classification || calc.id || '');
                            const level = (classStr.match(/\./g) || []).length;

                            // Parents (level 0, 1) always visible
                            // Children (level 2+) hidden if zero and skipZeros is true
                            const isParent = level < 2;
                            const isZero = parseFloat(String(calc.total ?? 0)) === 0;

                            if (exportOptions.skipZeros && isZero && !isParent) return;

                            tableBody.push([
                                calc.classification || calc.id,
                                calc.label,
                                calc.um || calc.unit || '-',
                                safeLocale(calc.calculatedVH ?? calc.valorHistorico ?? calc.v_historico ?? 0),
                                safeLocale(calc.total ?? 0)
                            ]);
                        }
                        if (r.children) flattenRows(r.children);
                    });
                };
                flattenRows(s.rows);
            });
        } else {
            // Fallback to flat rows or snapshot
            let sourceRows = result.rows || [];
            if (sourceRows.length === 0 && result.metadata?.calculationSnapshot?.values) {
                sourceRows = Object.entries(result.metadata.calculationSnapshot.values).map(([id, val]: [string, any]) => ({
                    id, ...val
                }));
            }
            tableBody = sourceRows
                .filter((r: any) => {
                    if (exportOptions.skipZeros) {
                        const classStr = String(r.classification || r.id || "");
                        const level = (classStr.match(/\./g) || []).length;
                        const isParent = level < 2;
                        const isZero = parseFloat(String(r.total ?? 0)) === 0;
                        if (isZero && !isParent) return false;
                    }
                    return true;
                })
                .map((r: any) => [
                    r.classification || r.id, r.label, r.um || r.unit || "-",
                    safeLocale(r.calculatedVH ?? r.valorHistorico ?? r.v_historico ?? 0),
                    safeLocale(r.total ?? 0)
                ]);
        }

        autoTable(doc, {
            startY: currentY,
            head: [headers],
            body: tableBody,
            theme: 'plain',
            headStyles: {
                fillColor: isPro ? [255, 255, 255] : [255, 255, 255],
                textColor: isPro ? [0, 0, 0] : [0, 0, 0],
                fontSize: isPro ? 8 : 8,
                fontStyle: 'bold',
                lineWidth: { bottom: isPro ? 0.8 : 0.5 },
                lineColor: isPro ? [0, 0, 0] : [100, 100, 100]
            },
            styles: {
                fontSize: 8,
                cellPadding: isPro ? { top: 2.5, bottom: 2.5, left: 3, right: 3 } : { top: 1.5, bottom: 1.5, left: 2, right: 2 },
                font: "helvetica",
                lineColor: [240, 240, 240],
                lineWidth: 0
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

                    let r = (result.rows || []).find((cr: any) => cr.classification === rowContent[0] || cr.id === rowContent[0]);
                    if (!r && result.metadata?.calculationSnapshot?.values) {
                        const snapEntries = Object.entries(result.metadata.calculationSnapshot.values);
                        const match = snapEntries.find(([id, val]: [string, any]) => id === rowContent[0] || val.classification === rowContent[0]);
                        if (match) r = { id: match[0], ...(match[1] as any) };
                    }
                    if (r) {
                        const classStr = String(r.classification || r.id || '');
                        const level = (classStr.match(/\./g) || []).length;
                        const labelLower = (r.label || '').toLowerCase();
                        const isRed = labelLower.includes('utilidad') || labelLower.includes('precio');
                        const isSpecial = isRed || ['12', '13', '13.1', '13.2', '14', '19', '20'].includes(classStr);

                        if (data.column.index === 1) { // CONCEPTO
                            const indent = isPro ? (level * 7) : (level * 4);
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
                                if (isPro) {
                                    data.cell.styles.fillColor = [250, 250, 250];
                                    (data.cell.styles.cellPadding as any).top = 3;
                                    (data.cell.styles.cellPadding as any).bottom = 3;
                                }
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
                            if (isRed) {
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

    let isFirstAnnex = true;
    for (const annex of selectedAnnexes) {
        if (isFirstAnnex || currentY > pageHeight - 60) {
            doc.addPage();
            currentY = addHeader(doc, `ANEXO ${annex.id}`);
            isFirstAnnex = false;
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

        const annexRows = annex.rows || annex.data || [];
        if (annexRows.length > 0) {
            const allKeys = Object.keys(annexRows[0]);
            const headers = allKeys.filter(k => k !== "importe" && k !== "total" && k !== "id" && k !== "classification");
            if (allKeys.includes("classification")) headers.unshift("classification");
            if (allKeys.includes("importe")) headers.push("importe");
            else if (allKeys.includes("total")) headers.push("total");

            const body = annexRows.map((r: any) => headers.map(h => {
                const val = r[h];
                if (typeof val === "number" || (typeof val === "string" && /^-?\d*\.?\d+$/.test(val.trim()))) return safeLocale(val);
                return val;
            }));

            const totalKey = allKeys.find(k => ["importe", "total", "amount", "value"].includes(k.toLowerCase())) || headers[headers.length - 1];
            const totalSum = annexRows.reduce((acc: number, r: any) => {
                const val = r[totalKey] || 0;
                const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g,""));
                return acc + (isNaN(num) ? 0 : num);
            }, 0);

            autoTable(doc, {
                startY: currentY,
                head: [headers.map(h => translate(h).toUpperCase())],
                body: body,
                foot: [[{
                    content: "TOTAL ANEXO " + annex.id + ": " + safeLocale(totalSum),
                    colSpan: headers.length,
                    styles: { halign: 'right', fontStyle: 'bold', fontSize: 8, textColor: primaryColor, fillColor: isPro ? [240, 240, 240] : [245, 245, 245] }
                }]],
                theme: isPro ? 'plain' : 'grid',
                headStyles: {
                    fillColor: isPro ? [255, 255, 255] : [255, 255, 255],
                    textColor: isPro ? [0, 0, 0] : primaryColor,
                    fontSize: 7,
                    lineWidth: { bottom: isPro ? 0.8 : 0.5 },
                    lineColor: isPro ? [60, 60, 60] : primaryColor
                },
                styles: {
                    fontSize: 7,
                    cellPadding: isPro ? 2 : 1.5,
                    lineColor: [230, 230, 230],
                    lineWidth: isPro ? 0 : 0.1
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
        doc.setFontSize(6.5);
        doc.setTextColor(150, 150, 150);

        // Use two lines to avoid horizontal overlap
        doc.text(`COSTPRO - Generado: ${timestamp}`, 14, 285);
        doc.text(`Página ${i} de ${pageCount}`, 14, 288);

        if (isPro) {
            doc.setFont("helvetica", "bold");
            doc.text("DOCUMENTO VÁLIDO PARA AUDITORÍA", pageWidth / 2, 285, { align: "center" });
            doc.setFont("helvetica", "normal");
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
