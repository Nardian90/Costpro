import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createSafeParser } from '@/lib/cost-engine/parser-factory';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/** Parse a value that might be a number, string, or internationalized format. Returns NaN-safe number. */
function safeParseNum(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined) return 0;
  const str = String(val).trim();
  // Try direct parse first
  const direct = parseFloat(str);
  if (!isNaN(direct)) return direct;
  // Try replacing comma-decimal with dot-decimal (e.g., "1.234,56" → "1234.56")
  const normalized = str.replace(/\./g, '').replace(/,/g, '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed, remaining, resetAt } = rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        },
      });
    }

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
    const logo = exportOptions.logo || null;

    const parser = createSafeParser();

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
            'classification': 'Cod.',
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

        // Branding / Logo
        let headerLogoPlaced = false;
        if (isPro && logo) {
            try {
                const formatMatch = logo.match(/^data:image\/(\w+);/);
                const format = formatMatch ? formatMatch[1].toUpperCase() : 'PNG';
                pdf.addImage(logo, format, 14, 7, 16, 12);
                headerLogoPlaced = true;
            } catch (e) {
                console.error('Failed to add logo to PDF:', e);
            }
        }

        // FC branding box (skip if logo was placed in Pro mode)
        if (!headerLogoPlaced) {
            pdf.setFillColor(isPro ? [240, 243, 245] : [255, 255, 255]);
            if (isPro) {
                pdf.rect(14, 8, 11, 10, 'F');
            }
            pdf.setDrawColor(200);
            pdf.rect(14, 8, 11, 10);

            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
            pdf.text("FC", 16.5, 15);
        }

        // Title — aligned after logo or FC box
        const titleX = headerLogoPlaced ? 34 : 29;
        pdf.setFontSize(isPro ? 11 : 10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
        pdf.text(title.toUpperCase(), titleX, 13);

        pdf.setFontSize(6);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120, 120, 120);
        pdf.text("Res. 148/2023 - CONTROL INTERNO", titleX, 16);

        pdf.setFontSize(5.5);
        pdf.text("DOCUMENTO TÉCNICO DE COSTOS", pageWidth - 14, 11, { align: "right" });
        if (showDateTime) {
            pdf.text(`Generado: ${timestamp}`, pageWidth - 14, 14, { align: "right" });
        }

        if (isPro) {
            pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.setLineWidth(0.4);
            pdf.rect(pageWidth - 38, 16, 24, 5);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(6);
            pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.text("VIGENTE", pageWidth - 26, 19.5, { align: "center" });
            pdf.setLineWidth(0.2);
        }

        // Separator line under header
        pdf.setDrawColor(220);
        pdf.line(14, 21, pageWidth - 14, 21);

        // Pro mode: colored accent line under title
        if (isPro) {
            pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.setLineWidth(0.4);
            pdf.line(14, 21.5, pageWidth - 14, 21.5);
            pdf.setLineWidth(0.2);
        }

        // Metadata Grid — more compact
        const metaY1 = 25;
        const metaY2 = 29;
        const metaY3 = 33;

        pdf.setFontSize(6);
        pdf.setTextColor(130);
        pdf.setFont("helvetica", "bold");
        pdf.text("PRODUCTO / SERVICIO", 14, metaY1);
        pdf.text("Cod.", 55, metaY1);
        pdf.text("UNIDAD DE MEDIDA", 90, metaY1);
        pdf.text("CANTIDAD", 125, metaY1);

        pdf.setTextColor(40);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(h.name ?? result.fichaName ?? result.name ?? "-").substring(0, 45), 14, metaY2);
        pdf.text(String(h.code ?? result.fichaId ?? result.id ?? "-"), 55, metaY2);
        pdf.text(String(h.unit || "-"), 90, metaY2);
        pdf.text(String(h.quantity || result.meta?.quantity || 1), 125, metaY2);

        pdf.setTextColor(130);
        pdf.setFont("helvetica", "bold");
        pdf.text("EMPRESA", 14, metaY3);
        pdf.text("DESTINO", 55, metaY3);
        pdf.text("MONEDA", 90, metaY3);

        pdf.setTextColor(40);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(h.enterprise || "-").substring(0, 40), 14, metaY3 + 3);
        pdf.text(String(h.destination || "-"), 55, metaY3 + 3);
        pdf.text(String(h.currency || "CUP"), 90, metaY3 + 3);

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
            if (isPro) {
                const badgeX = pageWidth - 42;
                const badgeW = 28;
                pdf.setFillColor(180, 20, 20);
                try {
                    pdf.roundedRect(badgeX, metaY1 - 1, badgeW, 9, 1.5, 1.5, 'F');
                } catch (_e) {
                    pdf.rect(badgeX, metaY1 - 1, badgeW, 9, 'F');
                }
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(4.5);
                pdf.setTextColor(255, 255, 255);
                pdf.text("PRECIO DE VENTA", badgeX + badgeW / 2, metaY1 + 1.5, { align: "center" });
                pdf.setFontSize(8.5);
                pdf.text(safeLocale(finalPrice), badgeX + badgeW / 2, metaY1 + 5.5, { align: "center" });
            } else {
                pdf.setFillColor(255, 245, 245);
                pdf.rect(pageWidth - 38, metaY1, 24, 7, "F");
                pdf.setFont("helvetica", "bold");
                pdf.setTextColor(180, 0, 0);
                pdf.setFontSize(5);
                pdf.text("PRECIO VENTA", pageWidth - 26, metaY1 + 2.5, { align: "center" });
                pdf.setFontSize(8);
                pdf.text(safeLocale(finalPrice), pageWidth - 26, metaY1 + 5.5, { align: "center" });
            }
        }

        // Separator between header metadata and main table
        const tableStartY = metaY3 + 6;
        if (isPro) {
            pdf.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            pdf.setLineWidth(0.3);
            pdf.line(14, tableStartY, pageWidth - 14, tableStartY);
            pdf.setLineWidth(0.2);
        } else {
            pdf.setDrawColor(220);
            pdf.line(14, tableStartY, pageWidth - 14, tableStartY);
        }

        pdf.setTextColor(0);
        return tableStartY + 2; // Return new Y position
    };

    let currentY = addHeader(doc, "FICHA DE COSTO");

    if (includeFC) {
        const headers = ['Cod.', 'CONCEPTO', 'UM', 'V. HISTÓRICO', 'TOTAL'];
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
            theme: 'grid',
            margin: { left: 14, right: 14 },
            headStyles: {
                fillColor: isPro ? [240, 243, 245] : [255, 255, 255],
                textColor: isPro ? primaryColor : [60, 60, 60],
                fontSize: isPro ? 7 : 7.5,
                fontStyle: 'bold',
                cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
                lineWidth: { bottom: 0.6 },
                lineColor: isPro ? primaryColor : [180, 180, 180]
            },
            alternateRowStyles: {
                fillColor: isPro ? [248, 250, 252] : [255, 255, 255]
            },
            styles: {
                fontSize: isPro ? 6.5 : 7,
                cellPadding: isPro ? { top: 1.8, bottom: 1.8, left: 2, right: 2 } : { top: 2, bottom: 2, left: 2, right: 2 },
                lineColor: isPro ? [215, 218, 222] : [210, 210, 210],
                lineWidth: 0.15,
                valign: 'middle',
                overflow: 'linebreak'
            },
            columnStyles: {
                0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                2: { cellWidth: 14, halign: 'center' },
                3: { cellWidth: 25, halign: 'right' },
                4: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
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
                            data.cell.styles.cellPadding = isPro
                                ? { top: 1.8, bottom: 1.8, left: 1.5 + (level * 3), right: 2 }
                                : { top: 2, bottom: 2, left: 2 + (level * 3), right: 2 };

                            if (level === 1) {
                                data.cell.styles.fontStyle = isPro ? 'normal' : 'normal';
                                data.cell.styles.fontSize = isPro ? 6.5 : 7;
                                data.cell.text = [label];
                            } else {
                                data.cell.styles.fontStyle = 'normal';
                                data.cell.styles.fontSize = isPro ? 6 : 6.5;
                                data.cell.styles.textColor = isPro ? [80, 80, 80] : [90, 90, 90];
                                data.cell.text = [label];
                            }

                            // Focus on elements with value
                            if (isPro && (r.total ?? 0) > 0 && level > 0) {
                                data.cell.styles.textColor = [30, 30, 30];
                            }
                        }

                        // Section headers (no dot = top-level)
                        if (isSpecial || level === 0) {
                            data.cell.styles.fontStyle = 'bold';
                            if (isRed) {
                                data.cell.styles.textColor = isPro ? [150, 0, 0] : [180, 0, 0];
                                data.cell.styles.fillColor = isPro ? [252, 245, 245] : [255, 248, 248];
                            }
                            // Consistent borders for special rows (no lineWidth override)
                            if (['14', '20'].includes(classStr) || labelLower.includes('total')) {
                                data.cell.styles.lineWidth = { top: 0.15, bottom: 0.4, left: 0.15, right: 0.15 };
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
                    const startX = cell.x + textWidth + 2;
                    const endX = cell.x + cell.width - 1.5;
                    if (endX > startX && !isPro) {
                        pdf.setDrawColor(215);
                        pdf.setLineDashPattern([0.2, 1.2], 0);
                        const midY = cell.y + cell.height / 2;
                        pdf.line(startX, midY, endX, midY);
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
                const num = safeParseNum(val);
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
                const num = safeParseNum(val);
                return acc + (isNaN(num) ? 0 : num);
            }, 0);

            autoTable(doc, {
                startY: currentY,
                head: [headers.map(h => translate(h).toUpperCase())],
                body: body,
                foot: [[{
                    content: "TOTAL ANEXO " + annex.id + ": " + safeLocale(totalSum),
                    colSpan: headers.length,
                    styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, textColor: primaryColor, fillColor: isPro ? [238, 240, 243] : [245, 245, 245], cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } }
                }]],
                theme: 'grid',
                headStyles: {
                    fillColor: isPro ? [240, 243, 245] : [255, 255, 255],
                    textColor: isPro ? primaryColor : [60, 60, 60],
                    fontSize: isPro ? 6 : 6.5,
                    fontStyle: 'bold',
                    cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
                    lineWidth: { bottom: 0.5 },
                    lineColor: isPro ? primaryColor : [180, 180, 180]
                },
                alternateRowStyles: {
                    fillColor: isPro ? [248, 250, 252] : [255, 255, 255]
                },
                styles: {
                    fontSize: isPro ? 6 : 6.5,
                    cellPadding: isPro ? { top: 1.5, bottom: 1.5, left: 2, right: 2 } : { top: 1.8, bottom: 1.8, left: 2, right: 2 },
                    lineColor: isPro ? [215, 218, 222] : [210, 210, 210],
                    lineWidth: 0.15,
                    valign: 'middle',
                    overflow: 'linebreak'
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
            headStyles: { fillColor: isPro ? primaryColor : [40, 40, 40], textColor: 255, fontSize: 6.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
            styles: { fontSize: 6.5, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, lineWidth: 0.15, lineColor: [210, 210, 210], valign: 'middle' },
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
