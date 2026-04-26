import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
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
  const direct = parseFloat(str);
  if (!isNaN(direct)) return direct;
  const normalized = str.replace(/\./g, '').replace(/,/g, '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

export const POST = withAuth(async (req, session) => {
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

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const timestamp = new Date().toLocaleString();

    // Support both naming conventions
    const includeFC = exportOptions.includeFC || exportOptions.includeTable;
    const includeAudit = exportOptions.includeAudit;
    const skipZeros = exportOptions.skipZeros === true;
    const showDateTime = exportOptions.showDateTime !== false;
    const includeUtilityNote = exportOptions.includeUtilityNote === true;

    const isPro = exportOptions.pdfFormat === 'pro';
    const primaryColor: [number, number, number] = isPro ? [26, 82, 118] : [0, 0, 0];
    const accentColor: [number, number, number] = isPro ? [26, 82, 118] : [60, 60, 60];
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

    // ─── HEADER ────────────────────────────────────────────────────
    const addHeader = (pdf: jsPDF, title: string) => {
      const h = { ...(result.metadata?.header || result.header || {}) };
      const formulaContext = { ...h };

      h.name = evaluateFormula(h.name, formulaContext);
      h.code = evaluateFormula(h.code, formulaContext);
      h.unit = evaluateFormula(h.unit, formulaContext);
      h.quantity = evaluateFormula(h.quantity, formulaContext);
      h.enterprise = evaluateFormula(h.enterprise, formulaContext);
      h.destination = evaluateFormula(h.destination, formulaContext);

      const marginL = 14;
      const marginR = 14;
      const contentW = pageWidth - marginL - marginR;
      const colW = contentW / 3;

      // ── Title bar with dark background ──
      const titleBg: [number, number, number] = isPro ? primaryColor : [50, 50, 50];
      pdf.setFillColor(titleBg[0], titleBg[1], titleBg[2]);
      pdf.rect(marginL, 8, contentW, 10, 'F');
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text(title.toUpperCase(), marginL + 5, 14.5);

      pdf.setFontSize(6);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(200, 210, 220);
      if (showDateTime) {
        pdf.text(`Generado: ${timestamp}`, pageWidth - marginR - 5, 14.5, { align: "right" });
      }

      // ── Logo placement (Pro mode) ──
      let hasLogo = false;
      if (isPro && logo) {
        try {
          const formatMatch = logo.match(/^data:image\/(\w+);/);
          const format = formatMatch ? formatMatch[1].toUpperCase() : 'PNG';
          pdf.addImage(logo, format, marginL + 2, 20, 14, 10);
          hasLogo = true;
        } catch (_e) { /* skip */ }
      }

      // ── Metadata grid (3-column layout) ──
      const metaStartY = hasLogo ? 21 : 21;
      const rowH = 4.5;
      const labelFontSz = 6;
      const valueFontSz = 7;

      const drawMetaRow = (y: number, leftLabel: string, leftValue: string, midLabel: string, midValue: string, rightLabel: string, rightValue: string) => {
        pdf.setFontSize(labelFontSz);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(130);
        pdf.text(leftLabel, marginL, y);
        pdf.text(midLabel, marginL + colW, y);
        pdf.text(rightLabel, marginL + colW * 2, y);

        pdf.setFontSize(valueFontSz);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(30);
        pdf.text(leftValue, marginL + 33, y);
        pdf.text(midValue, marginL + colW + 33, y);
        pdf.text(rightValue, marginL + colW * 2 + 33, y);
      };

      let y = metaStartY;
      drawMetaRow(y, "EMPRESA:", String(h.enterprise || "-").substring(0, 35),
        "PRODUCTO:", String(h.name ?? result.fichaName ?? "-").substring(0, 35),
        "CÓDIGO:", String(h.code ?? result.fichaId ?? "-"));
      y += rowH + 1.5;
      drawMetaRow(y, "DESTINO:", String(h.destination || "-").substring(0, 35),
        "UNIDAD DE MEDIDA:", String(h.unit || "-"),
        "CANTIDAD:", String(h.quantity || result.meta?.quantity || 1));
      y += rowH + 1.5;
      drawMetaRow(y, "ORGANISMO:", String(h.organismo || h.organization || "-").substring(0, 35),
        "MONEDA:", String(h.currency || "CUP"),
        "NIVEL:", String(h.productionLevel || h.nivel || "-"));

      // ── Final price badge (right-aligned) ──
      let r14 = (result.rows || []).find((r: any) => r.classification === "14" || r.id === "14");
      let r16_1 = (result.rows || []).find((r: any) => r.classification === "16.1" || r.id === "16.1");
      if (!r14 && result.metadata?.calculationSnapshot?.values) {
        r14 = result.metadata.calculationSnapshot.values["14"];
      }
      if (!r16_1 && result.metadata?.calculationSnapshot?.values) {
        r16_1 = result.metadata.calculationSnapshot.values["16.1"];
      }
      const finalPrice = r16_1?.total || r14?.total || 0;

      y += rowH + 1.5;

      if (finalPrice > 0) {
        const badgeX = marginL + colW * 2;
        const badgeW = colW;
        pdf.setFillColor(isPro ? 252 : 255, isPro ? 245 : 240, isPro ? 245 : 240);
        pdf.rect(badgeX, y - 3, badgeW, rowH + 2, 'F');
        pdf.setDrawColor(isPro ? 200 : 180, isPro ? 60 : 0, isPro ? 60 : 0);
        pdf.setLineWidth(0.3);
        pdf.rect(badgeX, y - 3, badgeW, rowH + 2);
        pdf.setLineWidth(0.2);

        pdf.setFontSize(6);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(180, 0, 0);
        pdf.text("PRECIO DE VENTA", badgeX + 3, y - 0.5);
        pdf.setFontSize(8.5);
        pdf.text(safeLocale(finalPrice), pageWidth - marginR - 3, y - 0.5, { align: "right" });
      }

      // ── Separator line ──
      y += 4;
      pdf.setDrawColor(isPro ? primaryColor[0] : 180, isPro ? primaryColor[1] : 180, isPro ? primaryColor[2] : 180);
      pdf.setLineWidth(0.5);
      pdf.line(marginL, y, pageWidth - marginR, y);
      pdf.setLineWidth(0.2);

      pdf.setTextColor(0);
      return y + 3;
    };

    // ─── MAIN TABLE ────────────────────────────────────────────────
    let currentY = addHeader(doc, "FICHA DE COSTO");

    if (includeFC) {
      const headers = ['Fila', 'CONCEPTOS DE GASTOS', 'UM', 'Total'];
      let rows = result.rows || [];

      if (skipZeros) {
        // Determine which rows are parents (no dot in classification = top-level group header)
        const parentIds = new Set(
          rows
            .filter((r: any) => {
              const c = String(r.classification || r.id || '');
              return c && !c.includes('.');
            })
            .map((r: any) => String(r.classification || r.id || ''))
        );

        rows = rows.filter((r: any) => {
          const classStr = String(r.classification || r.id || '');
          const isParent = parentIds.has(classStr);
          const total = r.total || 0;

          // Always keep parent rows (they provide structure)
          if (isParent) return true;

          // Keep child rows only if they have a non-zero total
          return total !== 0;
        });
      }

      // Build table body with hierarchical dashes
      const tableBody = rows.map((r: any) => {
        const classStr = String(r.classification || r.id || '');
        const level = classStr.split('.').length - 1;
        const label = r.label || '';

        // Add hierarchical indentation dashes: -, --, ---, etc.
        let prefix = '';
        if (level > 0) {
          prefix = '-'.repeat(level) + ' ';
        }

        return [
          classStr,
          prefix + label,
          r.um || 'Pesos',
          safeLocale(r.total || 0)
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [headers],
        body: tableBody,
        theme: 'grid',
        margin: { left: 14, right: 14 },
        headStyles: {
          fillColor: isPro ? primaryColor : [70, 70, 70],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
          cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
          halign: 'center',
          lineWidth: { bottom: 0.6 },
          lineColor: isPro ? primaryColor : [50, 50, 50]
        },
        alternateRowStyles: {
          fillColor: isPro ? [248, 250, 252] : [252, 252, 252]
        },
        styles: {
          fontSize: 7.5,
          cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
          lineColor: isPro ? [210, 215, 220] : [220, 220, 220],
          lineWidth: 0.15,
          valign: 'middle',
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center', fontStyle: 'bold', fontSize: 7 },
          1: { cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
          2: { cellWidth: 16, halign: 'center', fontSize: 7 },
          3: { cellWidth: 28, halign: 'right', fontStyle: 'bold', fontSize: 7.5 }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const rowIndex = data.row.index;
            const r = rows[rowIndex];
            if (!r) return;

            const classStr = String(r.classification || r.id || '');
            const isSpecial = !classStr.includes('.');
            const isRed = ['14', '15', '16', '16.1', '17', '20'].includes(classStr);
            const labelLower = (r.label || '').toLowerCase();
            const level = classStr.split('.').length - 1;

            // ── Parent rows (no dot = top-level section header) ──
            if (isSpecial) {
              // Bold + slightly larger for ALL cells in parent rows
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fontSize = 8;
              data.cell.styles.fillColor = isPro ? [240, 244, 248] : [245, 245, 245];

              if (isRed) {
                data.cell.styles.textColor = isPro ? [150, 0, 0] : [180, 0, 0];
                data.cell.styles.fillColor = isPro ? [252, 245, 245] : [255, 248, 248];
              }

              // Total row emphasis
              if (['14', '20'].includes(classStr) || labelLower.includes('total')) {
                data.cell.styles.lineWidth = { top: 0.3, bottom: 0.5, left: 0.15, right: 0.15 };
                data.cell.styles.lineColor = isPro ? primaryColor : [80, 80, 80];
              }
            }

            // ── Sub-level rows ──
            if (level === 1) {
              // First sub-level: semibold feel, normal weight
              data.cell.styles.fontSize = 7.5;
              data.cell.styles.textColor = isPro ? [40, 40, 40] : [50, 50, 50];
            } else if (level > 1) {
              // Deeper levels: lighter, slightly smaller
              data.cell.styles.fontSize = 7;
              data.cell.styles.textColor = isPro ? [80, 80, 80] : [100, 100, 100];
            }

            // ── Bold code column for parent rows ──
            if (data.column.index === 0 && isSpecial) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fontSize = 8;
            }

            // ── Indent concept column ──
            if (data.column.index === 1) {
              const indent = level * 3;
              data.cell.styles.cellPadding = {
                top: 1.5, bottom: 1.5,
                left: 2 + indent, right: 2
              };
            }
          }
        },
        didDrawCell: (data) => {
          // Dotted leader lines in concept column (Standard mode only)
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

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // ── Notes / Footer from result ──
      const notes = result.notes || result.footer || result.metadata?.notes || "";
      if (notes && notes.trim().length > 0) {
        if (currentY > pageHeight - 30) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...accentColor);
        doc.text("NOTAS Y OBSERVACIONES:", 14, currentY);
        currentY += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60);
        const splitNotes = doc.splitTextToSize(notes, pageWidth - 28);
        doc.text(splitNotes, 14, currentY);
        currentY += (splitNotes.length * 4) + 8;
      }
    }

    // ─── UTILITY NOTE ──────────────────────────────────────────────
    if (includeUtilityNote) {
      const r13 = (result.rows || []).find((r: any) => r.classification === "13" || r.id === "13");
      if (r13 && (r13.total || 0) > 0) {
        if (currentY > pageHeight - 40) {
          doc.addPage();
          currentY = 30;
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...accentColor);
        doc.text("NOTA SOBRE UTILIDAD Y RENTABILIDAD", 14, currentY);
        currentY += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80);
        const utilityPercent = r13.coeficiente ? (r13.coeficiente * 100).toFixed(2) : "Calculado";
        doc.text(
          `Se ha aplicado un margen de utilidad del ${utilityPercent}% sobre la base de cálculo correspondiente, resultando en un valor de ${safeLocale(r13.total)}.`,
          14, currentY, { maxWidth: pageWidth - 28 }
        );
        currentY += 12;
      }
    }

    // ─── ANNEXES ───────────────────────────────────────────────────
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
      doc.setTextColor(...accentColor);
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
            styles: {
              halign: 'right', fontStyle: 'bold', fontSize: 7.5,
              textColor: isPro ? primaryColor : [180, 0, 0],
              fillColor: isPro ? [238, 240, 243] : [255, 245, 245],
              cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }
            }
          }]],
          theme: 'grid',
          headStyles: {
            fillColor: isPro ? primaryColor : [70, 70, 70],
            textColor: [255, 255, 255],
            fontSize: 7,
            fontStyle: 'bold',
            cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            lineWidth: { bottom: 0.5 },
            lineColor: isPro ? primaryColor : [50, 50, 50]
          },
          alternateRowStyles: {
            fillColor: isPro ? [248, 250, 252] : [252, 252, 252]
          },
          styles: {
            fontSize: 7,
            cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
            lineColor: isPro ? [210, 215, 220] : [220, 220, 220],
            lineWidth: 0.15,
            valign: 'middle',
            overflow: 'linebreak'
          },
          margin: { left: 14, right: 14 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      }
    }

    // ─── AUDIT LOG ─────────────────────────────────────────────────
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
      doc.setTextColor(...accentColor);
      doc.text("INFORME DE TRAZABILIDAD Y VALIDACIÓN", 14, currentY);
      currentY += 8;

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
        headStyles: {
          fillColor: isPro ? primaryColor : [70, 70, 70],
          textColor: 255, fontSize: 7, fontStyle: 'bold',
          cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }
        },
        styles: {
          fontSize: 7, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
          lineWidth: 0.15, lineColor: [220, 220, 220], valign: 'middle'
        },
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

    // ─── SIGNATURE SECTION ─────────────────────────────────────────
    const sig = result.signature || result.metadata?.signature || {};
    const needSig = sig.prepared_by || sig.approved_by || true; // Always show signature block
    if (needSig) {
      if (currentY > pageHeight - 65) {
        doc.addPage();
        currentY = 30;
      } else {
        currentY += 10;
      }

      // Separator
      doc.setDrawColor(isPro ? primaryColor[0] : 180, isPro ? primaryColor[1] : 180, isPro ? primaryColor[2] : 180);
      doc.setLineWidth(0.4);
      doc.line(14, currentY, pageWidth - 14, currentY);
      doc.setLineWidth(0.2);
      currentY += 8;

      const halfW = (pageWidth - 28) / 2;

      // Labels
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text("ELABORADO POR:", 14, currentY);
      doc.text("APROBADO POR:", 14 + halfW, currentY);
      currentY += 5;

      // Signature lines
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.line(14, currentY, 14 + halfW - 10, currentY);
      doc.line(14 + halfW, currentY, pageWidth - 14, currentY);
      currentY += 3;

      // Name
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80);
      doc.text(String(sig.prepared_by || ""), 14, currentY);
      doc.text(String(sig.approved_by || ""), 14 + halfW, currentY);
      currentY += 5;

      // Cargo labels
      doc.setFontSize(6.5);
      doc.setTextColor(130);
      doc.text("Cargo:", 14, currentY);
      doc.text("Cargo:", 14 + halfW, currentY);
      currentY += 3.5;

      // Cargo signature lines
      doc.setDrawColor(200);
      doc.line(14, currentY, 14 + halfW - 10, currentY);
      doc.line(14 + halfW, currentY, pageWidth - 14, currentY);
      currentY += 3;

      doc.setFontSize(7);
      doc.setTextColor(80);
      doc.text(String(sig.prepared_by_cargo || sig.prepared_cargo || ""), 14, currentY);
      doc.text(String(sig.approved_by_cargo || sig.approved_cargo || ""), 14 + halfW, currentY);
      currentY += 5;

      // Firma labels
      doc.setFontSize(6.5);
      doc.setTextColor(130);
      doc.text("Firma:", 14, currentY);
      doc.text("Firma:", 14 + halfW, currentY);
      currentY += 3.5;

      // Firma signature lines
      doc.line(14, currentY, 14 + halfW - 10, currentY);
      doc.line(14 + halfW, currentY, pageWidth - 14, currentY);
      currentY += 8;

      // Date
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      const dateStr = sig.date || new Date().toLocaleDateString("es-ES");
      doc.text(`Fecha: ${dateStr}`, 14, currentY);

      // Utility note at bottom of signature section
      if (includeUtilityNote) {
        const r13 = (result.rows || []).find((r: any) => r.classification === "13" || r.id === "13");
        if (r13 && (r13.total || 0) > 0) {
          const utilityPercent = r13.coeficiente ? (r13.coeficiente * 100).toFixed(2) : "Calculado";
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(100);
          doc.text(
            `Nota: El % de utilidad aplicado es del: ${utilityPercent}%`,
            14, currentY + 5
          );
        }
      }
    }

    // ─── PAGE FOOTERS ──────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      // Bottom line
      const footY = pageHeight - 10;
      doc.setDrawColor(isPro ? primaryColor[0] : 200, isPro ? primaryColor[1] : 200, isPro ? primaryColor[2] : 200);
      doc.setLineWidth(0.3);
      doc.line(14, footY - 4, pageWidth - 14, footY - 4);
      doc.setLineWidth(0.2);

      // Page number
      doc.setFontSize(7);
      doc.setTextColor(130);
      doc.text(`Página ${i} de ${pageCount}`, 14, footY);

      // Centered doc type
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(isPro ? primaryColor[0] : 100, isPro ? primaryColor[1] : 100, isPro ? primaryColor[2] : 100);
      doc.text("FICHA DE COSTO - DOCUMENTO TÉCNICO", pageWidth / 2, footY, { align: "center" });
      doc.setFont("helvetica", "normal");

      // Right side
      doc.setFontSize(6);
      doc.setTextColor(160);
      doc.text("Res. 148/2023 - CONTROL INTERNO", pageWidth - 14, footY, { align: "right" });
    }

    // ─── OUTPUT ────────────────────────────────────────────────────
    const pdfBuffer = doc.output('arraybuffer');
    const h = { ...(result.metadata?.header || result.header || {}) };
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
});
