import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Parser } from 'expr-eval';

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
    const skipZeros = exportOptions.skipZeros === true;
    const showDateTime = exportOptions.showDateTime !== false; // Default true
    const includeUtilityNote = exportOptions.includeUtilityNote === true;

    const isPro = exportOptions.pdfFormat === 'pro';
    const primaryColor: [number, number, number] = isPro ? [26, 82, 118] : [0, 0, 0]; // Pro Blue or Black

    const parser = new Parser();

    const safeLocale = (val: any) => {
        const n = parseFloat(String(val));
        if (isNaN(n)) return val;
        return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const evaluateFormula = (val: any, context: any = {}) => {
        const str = String(val || "");
        if (!str.startsWith('=')) return val;

        try {
            const formula = str.substring(1);
            return parser.parse(formula).evaluate(context);
        } catch (e) {
            console.error('Formula evaluation error in PDF header:', e);
            return val;
        }
    };

    const translate = (key: string) => {
        const dict: Record<string, string> = {
            'description': 'Descripción',
            'no': 'No.',
            'unit': 'UM',
            'quantity': 'Cant.',
            'price': 'Precio',
            'amount': 'Importe',
            'value': 'Valor',
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
        const h = { ...(result.metadata?.header || result.header || {}) };

        // Prepare context for formulas in header
        const formulaContext = { ...h };

        // Evaluate header fields if they are formulas
        h.name = evaluateFormula(h.name, formulaContext);
        h.code = evaluateFormula(h.code, formulaContext);
        h.unit = evaluateFormula(h.unit, formulaContext);
        h.quantity = evaluateFormula(h.quantity, formulaContext);
        h.enterprise = evaluateFormula(h.enterprise, formulaContext);
        h.destination = evaluateFormula(h.destination, formulaContext);

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
        if (showDateTime) {
            pdf.text(`Generado: ${timestamp}`, pageWidth - 14, 15, { align: "right" });
        }

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

        // Use result.rows which are already calculated by the engine
        let rows = result.rows || [];

        if (skipZeros) {
            rows = rows.filter((r: any) => {
                const isParent = rows.some((other: any) => String(other.parentId || "") === String(r.id));
                const total = r.total || 0;
                if (!isParent && total === 0) return false;
                return true;
            });
        }

        tableBody = rows.map((r: any) => [
            r.classification || r.id || '',
            r.label || '',
            r.um || 'Pesos',
            safeLocale(r.calculatedVH || r.valorHistorico || 0),
            safeLocale(r.total || 0)
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [headers],
            body: tableBody,
            theme: isPro ? 'plain' : 'grid',
            headStyles: {
                fillColor: isPro ? [255, 255, 255] : [255, 255, 255],
                textColor: isPro ? [0, 0, 0] : primaryColor,
                fontSize: 8,
                lineWidth: { bottom: isPro ? 1 : 0.5 },
                lineColor: isPro ? [60, 60, 60] : primaryColor
            },
            styles: {
                fontSize: 7.5,
                cellPadding: isPro ? 3 : 2,
                lineColor: [230, 230, 230],
                lineWidth: isPro ? 0 : 0.1
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 25, halign: 'right' },
                4: { cellWidth: 25, halign: 'right' }
            },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const rowIndex = data.row.index;
                    const r = rows[rowIndex];
                    if (r) {
                        const classStr = String(r.classification || r.id || '');
                        const isSpecial = classStr.includes('.') === false;
                        const isRed = ['14', '15', '16', '16.1', '17', '20'].includes(classStr);
                        const labelLower = (r.label || '').toLowerCase();

                        const level = classStr.split('.').length - 1;

                        // Hierarchical indentation
                        if (data.column.index === 1) {
                            const label = r.label || '';
                            data.cell.styles.cellPadding = { left: 2 + (level * 4) };

                            if (level === 1) {
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
    // General Notes / Footer
    const notes = result.notes || result.footer || result.metadata?.notes || "";
    if (notes && notes.trim().length > 0) {
        if (currentY > pageHeight - 30) {
            doc.addPage();
            currentY = 20;
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("NOTAS Y OBSERVACIONES:", 14, currentY);
        currentY += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60);
        const splitNotes = doc.splitTextToSize(notes, pageWidth - 28);
        doc.text(splitNotes, 14, currentY);
        currentY += (splitNotes.length * 4) + 8;
    }

    }

    // Utility Note
    if (includeUtilityNote) {
        const r13 = (result.rows || []).find((r: any) => r.classification === "13" || r.id === "13");
        if (r13 && (r13.total || 0) > 0) {
            if (currentY > pageHeight - 40) {
                doc.addPage();
                currentY = 30;
            }
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text("NOTA SOBRE UTILIDAD Y RENTABILIDAD", 14, currentY);
            currentY += 5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80);
            const utilityPercent = r13.coeficiente ? (r13.coeficiente * 100).toFixed(2) : "Calculado";
            doc.text(`Se ha aplicado un margen de utilidad del ${utilityPercent}% sobre la base de cálculo correspondiente, resultando en un valor de ${safeLocale(r13.total)}.`, 14, currentY, { maxWidth: pageWidth - 28 });
            currentY += 12;
        }
    }

    // Annexes
    let selectedAnnexes = (result.anexos || []).filter((a: any) => exportOptions.includeAnnexes?.includes(a.id));

    if (skipZeros) {
        selectedAnnexes = selectedAnnexes.filter((a: any) => {
            const annexRows = a.rows || a.data || [];
            if (annexRows.length === 0) return false;
            const firstRow = annexRows[0];
            const totalKey = Object.keys(firstRow).find(k => ["importe", "total", "amount", "value"].includes(k.toLowerCase())) || "total";
            const totalSum = annexRows.reduce((acc: number, r: any) => {
                const val = r[totalKey] || 0;
                const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]+/g,""));
                return acc + (isNaN(num) ? 0 : num);
            }, 0);
            return totalSum > 0;
        });
    }

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


    // Signature Section
    const sig = result.signature || result.metadata?.signature || {};
    if (sig.prepared_by || sig.approved_by) {
        if (currentY > pageHeight - 50) {
            doc.addPage();
            currentY = 30;
        } else {
            currentY += 15;
        }

        doc.setDrawColor(200);
        doc.line(14, currentY, pageWidth - 14, currentY);
        currentY += 10;

        const colWidth = (pageWidth - 28) / 2;

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);

        doc.text("ELABORADO POR:", 14, currentY);
        doc.text("APROBADO POR:", 14 + colWidth, currentY);

        currentY += 12;
        doc.line(14, currentY, 14 + colWidth - 10, currentY);
        doc.line(14 + colWidth, currentY, pageWidth - 14, currentY);

        currentY += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(String(sig.prepared_by || "__________________________"), 14, currentY, { maxWidth: colWidth - 10 });
        doc.text(String(sig.approved_by || "__________________________"), 14 + colWidth, currentY, { maxWidth: colWidth - 10 });

        currentY += 15;
    }

    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(150, 150, 150);

        // Use two lines to avoid horizontal overlap
        doc.text(`COSTPRO - Página ${i} de ${pageCount}`, 14, 285);
        if (showDateTime) {
            doc.text(`Generado: ${timestamp}`, 14, 288);
        }

        if (isPro) {
            doc.setFont("helvetica", "bold");
            doc.text("DOCUMENTO VÁLIDO PARA AUDITORÍA", pageWidth / 2, 285, { align: "center" });
            doc.setFont("helvetica", "normal");
        }

        doc.text("Res. 148/2023 - CONTROL INTERNO", pageWidth - 14, 285, { align: "right" });
    }

    const pdfBuffer = doc.output('arraybuffer');
    const h = { ...(result.metadata?.header || result.header || {}) };

    // Evaluate formulas for filename too
    h.code = evaluateFormula(h.code, h);

    const safeFilename = `ficha-${h.code || result.fichaId || result.id || 'export'}.pdf`.replace(/[\\/\\?%*:|"<>]/g, '-');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
