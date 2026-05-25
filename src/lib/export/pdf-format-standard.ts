import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FormatContext,
  PG,
  sanitizeText, fmtCell, safeLocale, shouldSkip,
  addAnnexTotalRow, addSignatureBlock, addGeneralDataTable, calcSectionTotal,
  isUtilidadSection, calcUtilidadPercent, getCostBase, calcSectionTotalVH,
  getConversionCtx, convertValue, convertUM, getConversionDisclosureNote,
} from './pdf-shared';
import { AnnexLayout } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';

// ── Helpers shared with Res 148/2023 ──

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

// ── B&W color constants ──
const BLK = [0, 0, 0] as [number, number, number];
const DGR = [60, 60, 60] as [number, number, number];       // Dark gray for text
const MGR = [120, 120, 120] as [number, number, number];    // Medium gray for secondary text
const LGR = [230, 230, 230] as [number, number, number];    // Light gray for highlights
const WHT = [255, 255, 255] as [number, number, number];    // White background

/**
 * STANDARD FORMAT — Identical structure to Res 148/2023 but:
 * - No borders on tables (theme: plain)
 * - Black and white only (no colored fills, no blue/green accents)
 *
 * Faithfully renders ALL data from the ficha de costo — no invented rows,
 * no recalculation, no hardcoded labels. The ficha IS the structure.
 */
export function renderStandard(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, annexes,
    skipZeros, includeAudit, showDateTime, includeUtilityNote, includedAnnexIds,
    pageWidth, pageHeight, body } = ctx;
  const cc = getConversionCtx(header);

  const pw = pageWidth;
  let y = 10;

  // ══════════════════════════════════════════
  // INSTITUTIONAL HEADER (B&W)
  // ══════════════════════════════════════════
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);

  // Top border line (black)
  doc.setDrawColor(...BLK);
  doc.setLineWidth(0.8);
  doc.line(14, y, pw - 14, y);
  y += 4;

  // Title (centered, black)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLK);
  doc.text('FICHA DE COSTOS Y GASTOS', pw / 2, y + 3, { align: 'center' });
  y += 6;

  // Subtitle (gray)
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DGR);
  doc.text('FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACION DE PRECIOS Y TARIFAS', pw / 2, y + 2, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DGR);
  doc.text('(ESTANDAR)', pw / 2, y + 2, { align: 'center' });
  y += 6;

  // Bottom border line (black, thinner)
  doc.setDrawColor(...BLK);
  doc.setLineWidth(0.5);
  doc.line(14, y, pw - 14, y);
  y += 4;

  // ══════════════════════════════════════════
  // DATOS GENERALES — Unified 5-column grid (B&W, plain)
  // ══════════════════════════════════════════
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: LGR, hdrText: BLK,
    fcFill: WHT, fcText: BLK,
    fieldText: [30, 30, 30],
    tableTheme: 'plain',
    tableLineColor: [255, 255, 255], tableLineWidth: 0,
    priceFill: LGR, priceText: BLK,
  });

  // ══════════════════════════════════════════
  // MAIN TABLE — Same structure as Res 148/2023, no borders, B&W
  // ══════════════════════════════════════════
  const mainRows: any[][] = [];

  // Helper: process rows recursively from the ficha data
  const processRows = (rows: any[], depth = 0) => {
    if (depth > 8) return;
    rows.forEach((row: any) => {
      if (shouldSkip(row, calculatedValues, skipZeros)) return;
      const c = calculatedValues[row.id] || {};
      const total = parseFloat(String(c.total ?? row.total ?? 0));
      // FIX: Use calculatedVH (engine result from vhFormula) before valorHistorico (initial/raw value).
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
    // B&W: light gray separator instead of colored
    if (sectionIdx === lastCostIdx + 1 && lastCostIdx >= 0) {
      mainRows.push([
        { content: '', styles: { fillColor: LGR, minCellHeight: 1, lineWidth: 0 } },
        { content: '', styles: { fillColor: LGR, lineWidth: 0 } },
        { content: '', styles: { fillColor: LGR, lineWidth: 0 } },
        { content: '', styles: { fillColor: LGR, lineWidth: 0 } },
        { content: '', styles: { fillColor: LGR, lineWidth: 0 } },
      ]);
    }

    processRows(section.rows || []);
  });

  // ── Render the main table (no borders, B&W) ──
  autoTable(doc, {
    startY: y,
    head: [['CONCEPTOS DE GASTOS', 'FILA', 'UM', 'INDICE', 'TOTAL']],
    body: mainRows,
    theme: 'plain',
    headStyles: {
      fillColor: LGR,
      textColor: [...BLK],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      lineWidth: 0,
    },
    styles: { fontSize: 7, cellPadding: 1.2, lineWidth: 0, lineColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    didParseCell(data) {
      // Highlight key summary rows with light gray background (B&W)
      const raw = data.cell.raw;
      const text = typeof raw === 'object' && raw !== null ? (raw as any).content : raw;
      if (typeof text === 'string') {
        const t = text.trim().toUpperCase();
        if (t.startsWith('COSTO TOTAL') || t.startsWith('TOTAL DE COSTOS') ||
            t.startsWith('TOTAL DE GASTOS') || t.startsWith('PRECIO O TARIFA') ||
            t.startsWith('VENTA UNITARIA')) {
          data.cell.styles.fillColor = LGR;
        }
      }
      // Gray separator rows (empty content cells)
      if (typeof raw === 'object' && raw !== null && (raw as any).content === '' && data.section === 'body') {
        data.cell.styles.fillColor = LGR;
      }
    },
  });

  let finalY = (doc as any).lastAutoTable.finalY + 5;

  // ══════════════════════════════════════════
  // NOTA BOX (B&W, with optional utility percentage)
  // ══════════════════════════════════════════
  let utilityPercentStr = '';
  if (includeUtilityNote) {
    // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
    const pct = calcUtilidadPercent(calculatedValues);
    const utilityVal = calculatedValues['13.1']?.total ?? calculatedValues['13']?.total ?? 0;
    if (pct > 0 || utilityVal !== 0) {
      utilityPercentStr = utilityVal >= 0
        ? `% Utilidad: ${pct.toFixed(1)}% (Fila 13.1 / 14.1 x 100)`
        : `% Perdida: ${pct.toFixed(1)}% (Fila 13.1 / 14.1 x 100)`;
    }
  }

  const hasConvNote = cc && cc.active;
  const notaLineCount = (utilityPercentStr ? 3 : 2) + (hasConvNote ? 1 : 0);
  const notaBoxH = 8 + notaLineCount * 3.5;
  // FIX: Total space needed after finalY: notaBoxH + 4(gap) + 14(sig) + footer_margin
  // Footer is at pageHeight - 8, so we need finalY + notaBoxH + 18 < pageHeight - 8
  const needsNewPage = finalY + notaBoxH > pageHeight - 26;

  const renderNotaBox = (startY: number) => {
    // B&W nota box: thin gray border
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.2);
    doc.rect(14, startY, pw - 28, notaBoxH);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DGR);
    doc.text('Nota:', 16, startY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MGR);
    let ly = startY + 8;
    doc.text('Los calculos se realizan conforme a la Resolucion 148/2023 del MFP.', 16, ly); ly += 3.5;
    doc.text('Los valores en cero se representan con guion (-).', 16, ly); ly += 3.5;
    if (utilityPercentStr) {
      // B&W: bold black instead of blue
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLK);
      doc.text(utilityPercentStr, 16, ly); ly += 3.5;
    }
    if (hasConvNote) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(100, 100, 100);
      doc.text(getConversionDisclosureNote(cc!), 16, ly);
    }
    return startY + notaBoxH + 4;
  };

  if (!needsNewPage) {
    finalY = renderNotaBox(finalY);
  } else {
    // FIX: Render the Nota Box on the new page instead of losing it
    doc.addPage();
    finalY = renderNotaBox(20);
  }

  // ══════════════════════════════════════════
  // SIGNATURE LINES (same as Res 148)
  // ══════════════════════════════════════════
  addSignatureBlock(doc, finalY, pw, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MGR);
  doc.text(`Fecha: ${header.date || new Date().toLocaleDateString('es-CU')}`, pw - 14, finalY + 12, { align: 'right' });

  // ══════════════════════════════════════════
  // ANNEXES — Same logic as Res 148 but B&W, no borders
  // ══════════════════════════════════════════
  const annexLayout: AnnexLayout = ctx.exportOptions?.annexLayout || 'together';
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
        || (typeof r.total === 'number' && r.total !== 0)
        || (typeof r.amount === 'number' && r.amount !== 0)
        || (typeof r.importe === 'number' && r.importe !== 0)
        || (typeof r.valor === 'number' && r.valor !== 0)
      );
      if (!hasAnyValue) continue;
    }
    if (annexData.length === 0) continue;

    // Page break logic based on annexLayout option
    if (annexLayout === 'separate') {
      doc.addPage();
      annexY = 20;
    } else {
      if (isFirstAnnex) {
        doc.addPage();
        annexY = 20;
        isFirstAnnex = false;
      } else {
        const lastTableY = (doc as any).lastAutoTable?.finalY;
        // FIX: Guard against undefined finalY
        if (lastTableY != null && lastTableY > 0 && (pageHeight - lastTableY) < 60) {
          doc.addPage();
          annexY = 20;
        } else if (lastTableY != null && lastTableY > 0) {
          annexY = lastTableY + 10;
        } else {
          doc.addPage();
          annexY = 20;
        }
      }
    }

    // Annex header (B&W: black text, gray line)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLK);
    doc.text(`ANEXO ${sanitizeText(annex.id)} - ${sanitizeText(annex.title || '')}`, 14, annexY);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MGR);
    doc.text('Ficha de Costos y Gastos', pw - 14, annexY, { align: 'right' });

    // Thin gray line under annex header (instead of blue)
    annexY += 2;
    doc.setDrawColor(...MGR);
    doc.setLineWidth(0.3);
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

    // Only totalize the last numeric column (same as Res 148)
    addAnnexTotalRow(tableData, columns, annexData, 2, true);

    autoTable(doc, {
      startY: annexY,
      head: [colHeaders],
      body: tableData,
      theme: 'plain',
      headStyles: { fillColor: LGR, textColor: [...BLK], fontSize: 7, fontStyle: 'bold', lineWidth: 0 },
      styles: { fontSize: 7, cellPadding: 1.5, lineWidth: 0, lineColor: [255, 255, 255] },
      margin: { left: 14, right: 14 },
      didParseCell(data) {
        if (data.row.index === tableData.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = LGR;
        }
      },
    });
  }

  // ── FOOTER (B&W, on every page — called once at the end) ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.height;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...MGR);
    doc.text(
      'FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS',
      pw / 2, ph - 8, { align: 'center' }
    );
    doc.text('Formato Estandar', pw / 2, ph - 4, { align: 'center' });
  }

  // Audit page (B&W)
  if (includeAudit) {
    doc.addPage();
    let ay = 20;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLK);
    doc.text('TRAZABILIDAD - AUDITORIA', 14, ay);
    ay += 4;
    doc.setDrawColor(...BLK);
    doc.setLineWidth(0.5);
    doc.line(14, ay, pw - 14, ay);
    ay += 6;

    autoTable(doc, {
      startY: ay,
      body: [
        ['Producto', sanitizeText(header.name) || '-'],
        ['Codigo', sanitizeText(header.code) || '-'],
        ['Resolucion', sanitizeText(header.resolution || 'Res 148/2023')],
        ['Empresa', sanitizeText(header.company || header.empresa || '-')],
        ['Organismo', sanitizeText(header.organism || header.organismo || '-')],
        ['Union', sanitizeText(header.union || '-')],
        ['Elaborado por', sanitizeText(header.elaboratedBy || header.prepared_by) || '-'],
        ['Aprobado por', sanitizeText(header.approvedBy || header.approved_by) || '-'],
        ['Fecha', sanitizeText(header.date) || '-'],
        ['Exportado', new Date().toLocaleString('es-CU')],
        ['Formato PDF', 'standard - Estandar B/N'],
        ['Omitir ceros', skipZeros ? 'Si' : 'No'],
        ['Anexos incluidos', includedAnnexIds ? includedAnnexIds.join(', ') || 'Ninguno' : 'Todos'],
      ],
      theme: 'plain',
      headStyles: { fillColor: LGR, textColor: [...BLK], fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5, lineWidth: 0 },
      margin: { left: 14, right: 14 },
    });

    // Footer on audit page too
    const auditPh = doc.internal.pageSize.height;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...MGR);
    doc.text('FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS', pw / 2, auditPh - 8, { align: 'center' });
    doc.text('Formato Estandar', pw / 2, auditPh - 4, { align: 'center' });
  }

  // DateTime footer
  if (showDateTime) {
    const totalPages = doc.getNumberOfPages();
    const timestamp = new Date().toLocaleString('es-CU');
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MGR);
      doc.text(`${timestamp}  |  Pag. ${i}/${totalPages}  |  CostPro`, pageWidth / 2, pageHeight - 14, { align: 'center' });
    }
  }
}

// ══════════════════════════════════════════
// PRO FORMAT — B&W print-friendly version (no heavy fills, saves ink)
// ══════════════════════════════════════════

/**
 * PRO FORMAT — B&W print-friendly version with: thin line header, logo support,
 * DATOS GENERALES table (same grid as Standard), KPI strip, section tables with
 * subtotals, COSTO TOTAL GENERAL row, cost structure bars, and footer.
 * All rendered in black & white to save ink when printing.
 */
export function renderPro(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros,
    pageWidth, pageHeight, logo } = ctx;
  const cc = getConversionCtx(header);
  const pw = pageWidth;

  // ── Header (B&W: thin line + title, logo if present) ──
  const hasLogo = !!logo;
  doc.setDrawColor(...BLK);
  doc.setLineWidth(0.8);
  doc.line(14, 10, pw - 14, 10);

  // Logo on the right side
  if (hasLogo) {
    try {
      const logoData = logo.split(',')[1] || logo;
      const mimeMatch = logo.match(/data:image\/([a-zA-Z]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1].toUpperCase() : 'PNG';
      doc.addImage(logoData, mimeType as any, pw - 48, 2, 36, 20);
    } catch (e) {
      console.warn('Logo render failed:', e);
    }
  }

  let y = 18;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLK);
  const titleX = hasLogo ? (pw - 48) / 2 : pw / 2;
  doc.text('FICHA DE COSTO', titleX, y, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MGR);
  doc.text('Pro Corporativo', pw / 2, y + 5, { align: 'center' });

  y = hasLogo ? 30 : 24;

  // ══════════════════════════════════════════
  // DATOS GENERALES — Unified 5-column grid (B&W, plain)
  // ══════════════════════════════════════════
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: LGR, hdrText: BLK,
    fcFill: WHT, fcText: BLK,
    fieldText: [30, 30, 30],
    tableTheme: 'plain',
    tableLineColor: [255, 255, 255], tableLineWidth: 0,
    priceFill: LGR, priceText: BLK,
  });

  // ── KPI strip (B&W: light gray boxes with thin border) ──
  // FIX: Costo total = Section 12 only (TOTAL COSTOS Y GASTOS)
  const costTotal = getCostBase(sections, calculatedValues, calculatedHeader);
  const precioVenta = calculatedValues?.['14.1']?.total ?? calculatedValues?.['14']?.total ?? parseFloat(String(calculatedHeader?.salePrice || 0));
  const precioUnitario = calculatedValues?.['16.1']?.total ?? calculatedValues?.['16']?.total ?? precioVenta;
  const utilidad = calculatedValues?.['13.1']?.total ?? calculatedValues?.['13']?.total ?? 0;
  // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
  const pctUtilidad = calcUtilidadPercent(calculatedValues, calculatedHeader);

  if (costTotal > 0 || precioVenta > 0) {
    const kpis = [
      { label: 'COSTO TOTAL', value: safeLocale(convertValue(costTotal, cc)) },
      { label: 'PRECIO VENTA', value: safeLocale(convertValue(precioVenta, cc)) },
      { label: 'PRECIO UNITARIO', value: safeLocale(convertValue(precioUnitario, cc)) },
      { label: '% UTILIDAD', value: `${pctUtilidad.toFixed(1)}%` },
    ];
    const bw = (pw - 28 - 9) / 4;
    kpis.forEach((kpi, i) => {
      const x = 14 + i * (bw + 3);
      doc.setFillColor(...LGR);
      doc.setDrawColor(...DGR);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, bw, 16, 2, 2, 'FD');
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MGR);
      doc.text(kpi.label, x + bw / 2, y + 4, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLK);
      doc.text(kpi.value, x + bw / 2, y + 11, { align: 'center' });
    });
    y += 22;
  }

  // ── Sections with subtotals ──
  let grandTotalVH = 0;
  let grandTotal = 0;

  for (const section of sections) {
    if (y > 262) { doc.addPage(); y = 20; }
    // FIX: Section 13 (Utilidad) — rows are independent items, no subtotal
    const isUtil = isUtilidadSection(section);
    const rows: any[][] = [];
    // FIX: Do NOT accumulate sTotal/sTotalVH in walk — parent rows already include children.
    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const lbl = sanitizeText(row.label || '');
        // Skip rows with empty label (avoids blank rows)
        if (!lbl.trim()) return;
        const c = calculatedValues[row.id] || {};
        rows.push([
          `${'  '.repeat(d)}${sanitizeText(row.id)}`,
          `${'  '.repeat(d)}${lbl}`,
          convertUM(row.um || header.currency || 'CUP', cc) || '-',
          fmtCell(convertValue(parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? 0)), cc)),
          fmtCell(convertValue(parseFloat(String(c.total || 0)), cc)),
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);
    if (rows.length === 0) continue;

    // FIX: Section 13 (Utilidad) — no subtotal row, don't add to grand total
    if (!isUtil) {
      // Subtotal from top-level rows only (no double-counting)
      const sTotal = calcSectionTotal(section, calculatedValues);
      const sTotalVH = calcSectionTotalVH(section, calculatedValues);
      // Subtotal row (B&W: light gray)
      rows.push([
        { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: LGR } },
        { content: fmtCell(convertValue(sTotalVH, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: LGR } },
        { content: fmtCell(convertValue(sTotal, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: LGR } },
      ]);
      grandTotalVH += sTotalVH;
      grandTotal += sTotal;
    }

    autoTable(doc, {
      startY: y,
      head: [[{ content: sanitizeText(section.label || section.id)!, colSpan: 5, styles: { fillColor: LGR, textColor: BLK, fontStyle: 'bold', fontSize: 8 } }],
             ['No.', 'Concepto', 'UM', 'V. Historico', 'Total']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: LGR, textColor: BLK, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── COSTO TOTAL GENERAL — uses Section 12 total as authoritative cost base ──
  if (y > 270) { doc.addPage(); y = 20; }
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'COSTO TOTAL GENERAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: DGR, textColor: 255 } },
      { content: fmtCell(convertValue(costTotal, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: DGR, textColor: 255 } },
      { content: fmtCell(convertValue(costTotal, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: DGR, textColor: 255 } },
    ]],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Cost Structure bars (B&W: gray bars) ──
  if (y < pageHeight - 45) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLK);
    doc.text('ESTRUCTURA DE COSTOS', 14, y);
    y += 5;

    const maxVal = Math.max(...sections.filter((s: any) => !isUtilidadSection(s)).map(s => calcSectionTotal(s, calculatedValues)), 1);
    sections.forEach((section: any) => {
      if (isUtilidadSection(section)) return; // Skip Utilidad section in cost structure
      const val = calcSectionTotal(section, calculatedValues);
      if (val === 0) return;
      const barW = (val / maxVal) * (pw - 70);
      const pct = costTotal > 0 ? (val / costTotal * 100).toFixed(1) : '0';
      doc.setFillColor(...MGR);
      doc.roundedRect(55, y - 3, barW, 5, 1, 1, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...DGR);
      doc.text(sanitizeText((section.label || section.id).substring(0, 25))!, 14, y);
      doc.text(`${safeLocale(convertValue(val, cc))} (${pct}%)`, pw - 14, y, { align: 'right' });
      y += 7;
    });
    y += 4;
  }

  // ── Signature block ──
  addSignatureBlock(doc, y, pageWidth, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );

  // ── Footer (B&W) ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MGR);
    doc.text('Documento generado por CostPro', 14, pageHeight - 12);
    doc.text(`Pag. ${i}/${pageCount}`, pw - 14, pageHeight - 12, { align: 'right' });
  }
}
