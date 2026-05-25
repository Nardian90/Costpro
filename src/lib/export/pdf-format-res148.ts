import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FormatContext,
  PG, BLU, LBL, LGR,
  sanitizeText, fmtCell, safeLocale, shouldSkip, addRes148Footer,
  addAnnexTotalRow, addSignatureBlock, addGeneralDataTable,
  calcUtilidadPercent,
  getConversionCtx, convertValue, convertUM, getConversionDisclosureNote,
} from './pdf-shared';
import { AnnexLayout } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';

// ── Helpers for Res 148/2023 ──

/** Strip "De ello:" / "DE ELLO:" / "De ello" prefix from child labels */
function cleanChildLabel(raw: string): string {
  return sanitizeText(raw)!
    .replace(/^[Dd][Ee]\s+[Ee][Ll][Ll][Oo][:.\s-]*/i, '')
    .replace(/^[Dd][Ee]\s+[Ee][Ll][Ll][Oo]\s*/i, '')
    .trim();
}

/** Check if a section is a cost section (FILA 1-4) — used only for visual separator */
function isCostSection(label: string): boolean {
  const l = label.toLowerCase();
  return /gasto\s*material/.test(l) || /salario\s*directo/.test(l) ||
         /otros\s*gastos\s*directos/.test(l) || /gastos\s*asociados/.test(l);
}

/**
 * RES 148/2023 FORMAT
 * Faithfully renders ALL data from the ficha de costo — no invented rows,
 * no recalculation, no hardcoded labels. The ficha IS the structure.
 *
 * The data already has all sections (1-N) with their rows, labels, UM,
 * and calculated values. We simply render them as-is in the official
 * Res 148/2023 visual style.
 */
export function renderRes148(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, annexes,
    skipZeros, includeAudit, showDateTime, includeUtilityNote, includedAnnexIds,
    pageWidth, pageHeight, body } = ctx;
  const cc = getConversionCtx(header);

  const pw = pageWidth;
  let y = 10;

  // ══════════════════════════════════════════
  // INSTITUTIONAL HEADER
  // ══════════════════════════════════════════
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);

  // Top border line
  doc.setDrawColor(...BLU);
  doc.setLineWidth(1);
  doc.line(14, y, pw - 14, y);
  y += 4;

  // Ministry title (centered)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pw / 2, y + 3, { align: 'center' });
  y += 6;

  // Subtitle
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text('FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACION DE PRECIOS Y TARIFAS', pw / 2, y + 2, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLU);
  doc.text('(RES 148/2023)', pw / 2, y + 2, { align: 'center' });
  y += 6;

  // Bottom border line
  doc.setDrawColor(...BLU);
  doc.setLineWidth(0.5);
  doc.line(14, y, pw - 14, y);
  y += 4;

  // ══════════════════════════════════════════
  // DATOS GENERALES — Unified 5-column grid (Res 148 blue theme)
  // ══════════════════════════════════════════
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: LBL, hdrText: BLU,
    fcFill: LBL, fcText: BLU,
    fieldText: [30, 30, 30],
    tableTheme: 'grid',
    tableLineColor: [180, 200, 220], tableLineWidth: 0.3,
    priceFill: LBL, priceText: [0, 40, 100],
  });

  // ══════════════════════════════════════════
  // MAIN TABLE — Faithful to the ficha de costo data
  // ══════════════════════════════════════════
  // The ficha already has ALL sections with their rows, labels, UM,
  // and calculated values. We simply render them as-is.
  // The data IS the structure — no categorization, no recalculation.
  const mainRows: any[][] = [];

  // Helper: process rows recursively from the ficha data
  const processRows = (rows: any[], depth = 0) => {
    if (depth > 8) return;
    rows.forEach((row: any) => {
      if (shouldSkip(row, calculatedValues, skipZeros)) return;
      const c = calculatedValues[row.id] || {};
      const total = parseFloat(String(c.total ?? row.total ?? 0));
      // FIX: Use calculatedVH (engine result from vhFormula) before valorHistorico (initial/raw value).
      // The web UI uses calculatedVH ?? valorHistorico, and the PDF must match.
      // For rows with vhFormula (e.g. "10.1 - Contrib. Seg. Social"), valorHistorico stays at 0
      // while calculatedVH holds the actual computed value.
      const vh = parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? row.valorHistorico ?? 0));
      const indent = '  '.repeat(depth);
      const hasChildren = row.children && row.children.length > 0;
      const isParent = depth === 0 && hasChildren;

      // Strip "De ello:" from label for children
      const rawLabel = sanitizeText(row.label || row.id)!;
      const cleanLabel = depth > 0 ? cleanChildLabel(rawLabel) : rawLabel;

      // Skip rows with empty label after cleaning (avoids blank rows)
      if (!cleanLabel.trim()) return;

      const prefix = depth > 0 ? '- ' : '';
      const label = `${indent}${prefix}${cleanLabel}`;

      // Use the row's own ID as FILA (matches the web view numbering)
      const filaStr = row.id || '-';

      mainRows.push([
        { content: label, styles: { fontStyle: isParent ? 'bold' : 'normal' } },
        filaStr,
        convertUM(row.um || row.unit || header.currency || 'CUP', cc),
        fmtCell(convertValue(vh, cc)),
        fmtCell(convertValue(total, cc)),
      ]);

      if (row.children) processRows(row.children, depth + 1);
    });
  };

  // Find the last cost section index for visual separator placement
  let lastCostIdx = -1;
  sections.forEach((section: any, idx: number) => {
    const label = section.label || section.id || '';
    if (isCostSection(label)) lastCostIdx = idx;
  });

  // Render ALL sections in order — the data IS the structure
  sections.forEach((section: any, sectionIdx: number) => {
    // Add visual separator after cost sections (before summary/expense sections)
    if (sectionIdx === lastCostIdx + 1 && lastCostIdx >= 0) {
      mainRows.push([
        { content: '', styles: { fillColor: [200, 200, 200], minCellHeight: 1 } },
        { content: '', styles: { fillColor: [200, 200, 200] } },
        { content: '', styles: { fillColor: [200, 200, 200] } },
        { content: '', styles: { fillColor: [200, 200, 200] } },
        { content: '', styles: { fillColor: [200, 200, 200] } },
      ]);
    }

    processRows(section.rows || []);
  });

  // ── Render the main table ──
  autoTable(doc, {
    startY: y,
    head: [['CONCEPTOS DE GASTOS', 'FILA', 'UM', 'INDICE', 'TOTAL']],
    body: mainRows,
    theme: 'grid',
    headStyles: {
      fillColor: LBL,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    styles: { fontSize: 7, cellPadding: 1.2 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    didParseCell(data) {
      // Highlight key summary rows with light blue background
      const raw = data.cell.raw;
      const text = typeof raw === 'object' && raw !== null ? (raw as any).content : raw;
      if (typeof text === 'string') {
        const t = text.trim().toUpperCase();
        if (t.startsWith('COSTO TOTAL') || t.startsWith('TOTAL DE COSTOS') ||
            t.startsWith('TOTAL DE GASTOS') || t.startsWith('PRECIO O TARIFA') ||
            t.startsWith('VENTA UNITARIA')) {
          data.cell.styles.fillColor = LBL;
        }
      }
      // Gray separator rows (empty content cells)
      if (typeof raw === 'object' && raw !== null && (raw as any).content === '' && data.section === 'body') {
        data.cell.styles.fillColor = [200, 200, 200];
      }
    },
  });

  let finalY = (doc as any).lastAutoTable.finalY + 5;

  // ══════════════════════════════════════════
  // NOTA BOX (with optional utility percentage)
  // ══════════════════════════════════════════
  // Calculate utility % when includeUtilityNote is enabled: 13.1 / 14.1 * 100
  let utilityPercentStr = '';
  if (includeUtilityNote) {
    // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
    const pct = calcUtilidadPercent(calculatedValues);
    const utilityVal = calculatedValues['13.1']?.total ?? calculatedValues['13']?.total ?? 0;
    if (pct > 0 || utilityVal !== 0) {
      utilityPercentStr = `% Utilidad: ${pct.toFixed(1)}% (Fila 13.1 / 14.1 x 100)`;
    }
  }

  const hasConvNote = cc && cc.active;
  const notaLineCount = (utilityPercentStr ? 3 : 2) + (hasConvNote ? 1 : 0);
  const notaBoxH = 8 + notaLineCount * 3.5;
  const needsNewPage = finalY + notaBoxH > pageHeight - 26;

  if (!needsNewPage) {
    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.rect(14, finalY, pw - 28, notaBoxH);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text('Nota:', 16, finalY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(80);
    let ly = finalY + 8;
    doc.text('Los calculos se realizan conforme a la Resolucion 148/2023 del MFP.', 16, ly); ly += 3.5;
    doc.text('Los valores en cero se representan con guion (-).', 16, ly); ly += 3.5;
    if (utilityPercentStr) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLU);
      doc.text(utilityPercentStr, 16, ly); ly += 3.5;
    }
    if (hasConvNote) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(100);
      doc.text(getConversionDisclosureNote(cc!), 16, ly);
    }
    finalY += notaBoxH + 4;
  } else {
    doc.addPage();
    finalY = 20;
  }

  // ══════════════════════════════════════════
  // SIGNATURE LINES
  // ══════════════════════════════════════════
  addSignatureBlock(doc, finalY, pw, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(`Fecha: ${header.date || new Date().toLocaleDateString('es-CU')}`, pw - 14, finalY + 12, { align: 'right' });

  // ── FOOTER (official document style on every page) ──
  addRes148Footer(doc, pw);

  // ══════════════════════════════════════════
  // ANNEXES for res148 (only totalize the last numeric column)
  // ══════════════════════════════════════════
  const annexLayout: AnnexLayout = (ctx.exportOptions as any)?.annexLayout || 'together';
  const calcAnnexes = body.calculatedAnnexes || [];
  const calcAnnexMap = new Map<string, any>();
  for (const ca of calcAnnexes) calcAnnexMap.set(ca.id, ca);

  let isFirstAnnex = true;
  let annexY = 20;

  for (const annex of annexes) {
    if (includedAnnexIds && !includedAnnexIds.includes(annex.id)) continue;
    const calcAnnex = calcAnnexMap.get(annex.id);
    const annexData = calcAnnex?.data || annex.data || [];

    // Skip empty annexes or annexes with no numeric values
    if (skipZeros) {
      const hasAnyValue = annexData.some((r: any) =>
        Object.values(r).some((v: any) => typeof v === 'number' && v !== 0)
      );
      if (!hasAnyValue) continue;
    }
    if (annexData.length === 0) continue;

    // Page break logic based on annexLayout option
    if (annexLayout === 'separate') {
      // One annex per page (original behavior)
      doc.addPage();
      annexY = 20;
    } else {
      // Together: consecutive on same page(s)
      if (isFirstAnnex) {
        doc.addPage();
        annexY = 20;
        isFirstAnnex = false;
      } else {
        // Check remaining space — if less than 60mm, start new page
        const lastTableY = (doc as any).lastAutoTable?.finalY || 0;
        if (lastTableY > 0 && (pageHeight - lastTableY) < 60) {
          doc.addPage();
          annexY = 20;
        } else {
          annexY = lastTableY + 10;
        }
      }
    }

    // Annex header with official styling
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLU);
    doc.text(`ANEXO ${sanitizeText(annex.id)} - ${sanitizeText(annex.title || '')}`, 14, annexY);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text('Conforme Res. 148/2023 MINCIN', pw - 14, annexY, { align: 'right' });

    // Blue line under annex header
    annexY += 2;
    doc.setDrawColor(...BLU);
    doc.setLineWidth(0.5);
    doc.line(14, annexY, pw - 14, annexY);
    annexY += 5;

    const columns = annex.columns || [];
    const colHeaders = columns.map((c: any) => sanitizeText(c.label || c.title || c.key) || '-');
    const tableData = annexData.map((r: any) =>
      columns.map((c: any) => {
        const v = r[c.key];
        if (v === undefined || v === null) return '-';
        return typeof v === 'number' ? fmtCell(v) : sanitizeText(String(v)) || '-';
      })
    );

    // Only totalize the last numeric column (Total/Importe) — summing norms or
    // unit prices is meaningless in Cuban financial forms
    addAnnexTotalRow(tableData, columns, annexData, 2, true);

    autoTable(doc, {
      startY: annexY,
      head: [colHeaders],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: LBL, textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
      didParseCell(data) {
        if (data.row.index === tableData.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = LBL;
        }
      },
    });
  }

  // Re-add footer for annex pages
  addRes148Footer(doc, pw);

  // Nota de Utilidad removed per user request

  // Audit page for res148
  if (includeAudit) {
    doc.addPage();
    let ay = 20;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PG);
    doc.text('TRAZABILIDAD - AUDITORIA', 14, ay);
    ay += 4;
    doc.setDrawColor(...PG);
    doc.setLineWidth(0.5);
    doc.line(14, ay, pw - 14, ay);
    ay += 6;

    autoTable(doc, {
      startY: ay,
      body: [
        ['Producto', sanitizeText(header.name) || '-'],
        ['Codigo', sanitizeText(header.code) || '-'],
        ['Resolucion', sanitizeText(header.resolution || 'Res 148/2023')],
        ['Empresa', sanitizeText(header.company || header.empresa) || '-'],
        ['Organismo', sanitizeText(header.organism || header.organismo) || '-'],
        ['Union', sanitizeText(header.union) || '-'],
        ['Elaborado por', sanitizeText(header.elaboratedBy || header.prepared_by) || '-'],
        ['Aprobado por', sanitizeText(header.approvedBy || header.approved_by) || '-'],
        ['Fecha', sanitizeText(header.date) || '-'],
        ['Exportado', new Date().toLocaleString('es-CU')],
        ['Formato PDF', 'res148 - Res 148/2023'],
        ['Omitir ceros', skipZeros ? 'Si' : 'No'],
        ['Anexos incluidos', includedAnnexIds ? includedAnnexIds.join(', ') || 'Ninguno' : 'Todos'],
      ],
      theme: 'grid',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
    addRes148Footer(doc, pw);
  }

  // DateTime footer for res148
  if (showDateTime) {
    const pageCount = doc.getNumberOfPages();
    const timestamp = new Date().toLocaleString('es-CU');
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140);
      doc.text(`${timestamp}  |  Pag. ${i}/${pageCount}  |  CostPro`, pageWidth / 2, pageHeight - 14, { align: 'center' });
    }
  }
}
