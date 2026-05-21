import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FormatContext,
  PG,
  sanitizeText, fmtCell, safeLocale, shouldSkip,
  addAnnexTotalRow, addSignatureBlock, addGeneralDataFull, calcSectionTotal,
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
  // DATOS GENERALES — Same 5-column grid as Res 148 but B&W, no borders
  // ══════════════════════════════════════════
  const precio = calculatedHeader?.salePrice || calculatedHeader?.precioVenta || header.sale_price || 0;
  const moneda = sanitizeText(header.currency || 'CUP');

  // B&W styles (no colored fills, no colored text)
  const hdrTitle: any = { fontStyle: 'bold', fontSize: 8, halign: 'center', fillColor: LGR, textColor: [...BLK], cellPadding: 2, lineWidth: 0 };
  const fcStyle: any = { fontStyle: 'bold', fontSize: 18, halign: 'center', valign: 'middle', fillColor: WHT, textColor: [...BLK], cellPadding: 4, lineWidth: 0 };
  const d: any = { fontSize: 6.5, cellPadding: 1.8, textColor: [30, 30, 30], lineWidth: 0 };

  // Shorthand: combined "Label: Value" cell
  const lv = (label: string, value: string | number, extra?: any) => ({
    content: `${label}: ${value}`,
    styles: { ...d, ...extra },
  });

  const metaRows: any[][] = [
    // ── Header: DATOS GENERALES (centered, spans all 5 cols) ──
    [
      { content: 'DATOS GENERALES', colSpan: 5, styles: hdrTitle },
    ],
    // ── Row 1 (FC starts rowSpan:4): Organismo, Union, Cod. Empresa ──
    [
      { content: 'FC', rowSpan: 4, styles: fcStyle },
      lv('Organismo', sanitizeText(header.organism || header.organismo || '-')),
      lv('Union', sanitizeText(header.union || '-')),
      { ...lv('Cod. Empresa', sanitizeText(header.codigoEmpresa || header.code || '-')), colSpan: 2 },
    ],
    // ── Row 2: Empresa, Cliente ──
    [
      { ...lv('Empresa', sanitizeText(header.company || header.empresa || '-')), colSpan: 2 },
      { ...lv('Cliente', sanitizeText(header.client || header.clientePrincipal || '-')), colSpan: 2 },
    ],
    // ── Row 3: ID, Cod. Prod, Producto ──
    [
      lv('ID', sanitizeText(header.code || header.id || '-')),
      lv('Cod. Prod', sanitizeText(header.product_code || header.code || '-')),
      { ...lv('Producto', sanitizeText(header.name || 'S/N')), colSpan: 2 },
    ],
    // ── Row 4: Nivel Prod., UM, Cantidad, Resolucion ──
    [
      lv('Nivel Prod.', sanitizeText(header.production_level || header.nivelProduccion || '1')),
      lv('UM', sanitizeText(header.unit || header.um || 'U')),
      lv('Cantidad', sanitizeText(header.quantity || header.cantidadBase || '1')),
      lv('Resolucion', sanitizeText(header.resolution || 'Res 148/2023')),
    ],
    // ── Classification (5 cols, no FC) ──
    [
      lv('% Util. Cap.', sanitizeText(header.capacity_utilization || header.capacidadInstalada || '100')),
      lv('Destino', sanitizeText(header.destination || header.destinoProduccion || 'Ventas')),
      lv('Tipo Costo', sanitizeText(header.type || header.tipoCosto || 'EMPRESA')),
      lv('Categoria', sanitizeText(header.category || header.categoriaProducto || 'General')),
      lv('Moneda', moneda),
    ],
    // ── PRECIO highlighted row (5 cols, B&W: light gray bg, black bold text) ──
    [
      { content: 'PRECIO', colSpan: 4, styles: { fontStyle: 'bold', fontSize: 9, halign: 'right', fillColor: LGR, textColor: [...BLK], cellPadding: 2, lineWidth: 0 } },
      { content: safeLocale(precio), styles: { fontStyle: 'bold', fontSize: 9, halign: 'left', fillColor: LGR, textColor: [...BLK], cellPadding: 2, lineWidth: 0 } },
    ],
  ];

  autoTable(doc, {
    startY: y,
    body: metaRows,
    theme: 'plain',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.8,
      lineWidth: 0,
      lineColor: [255, 255, 255],
      textColor: [30, 30, 30],
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

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
      const prefix = depth > 0 ? '- ' : '';
      const label = `${indent}${prefix}${cleanLabel}`;

      // Use the row's own ID as FILA (matches the web view numbering)
      const filaStr = row.id || '-';

      mainRows.push([
        { content: label, styles: { fontStyle: isParent ? 'bold' : 'normal' } },
        filaStr,
        row.um || row.unit || header.currency || 'CUP',
        fmtCell(vh),
        fmtCell(total),
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
    const totalCostVal = calculatedValues['12.1']?.total ?? calculatedValues['12']?.total ?? 0;
    const utilityVal   = calculatedValues['13.1']?.total ?? calculatedValues['13']?.total ?? 0;
    // FIX: Only require denominator > 0; utility can be 0% (valid) or negative (loss)
    if (totalCostVal > 0) {
      const pct = (utilityVal / totalCostVal) * 100;
      utilityPercentStr = utilityVal >= 0
        ? `% Utilidad sobre Costo: ${pct.toFixed(1)}% (Fila 13.1 / 12.1 x 100)`
        : `% Pérdida sobre Costo: ${pct.toFixed(1)}% (Fila 13.1 / 12.1 x 100)`;
    }
  }

  const notaLineCount = utilityPercentStr ? 3 : 2;
  const notaBoxH = 8 + notaLineCount * 3.5;
  const needsNewPage = finalY + notaBoxH > pageHeight - 45;

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
    doc.text('Los calculos se realizan conforme a la Resolucion 148/2023 del MFP.', 16, startY + 8);
    doc.text('Los valores en cero se representan con guion (-).', 16, startY + 11.5);
    if (utilityPercentStr) {
      // B&W: bold black instead of blue
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLK);
      doc.text(utilityPercentStr, 16, startY + 15);
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
// PRO FORMAT — Kept intact (corporate branded, separate from standard)
// ══════════════════════════════════════════

/**
 * PRO FORMAT — Corporate branded format with: green header bar, logo, KPI row,
 * section tables with subtotals, cost breakdown bars, and branded footer.
 */
export function renderPro(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros,
    pageWidth, pageHeight, logo } = ctx;
  const pw = pageWidth;

  let y = addHeader(doc, 'FICHA DE COSTO', pw, ctx.showDateTime, 'pro', logo);

  // Full header data
  y = addGeneralDataFull(doc, header, y, pw);

  // ── KPI strip ──
  if (calculatedHeader) {
    const ct = calculatedHeader.totalCost || 0;
    const pv = calculatedHeader.salePrice || 0;
    const up = calculatedHeader.utilityPercent || 0;
    const mg = parseFloat(String(pv)) - parseFloat(String(ct));
    const kpis = [
      { label: 'COSTO TOTAL', value: safeLocale(ct), color: PG as [number, number, number] },
      { label: 'PRECIO VENTA', value: safeLocale(pv), color: [21, 68, 128] as [number, number, number] },
      { label: 'UTILIDAD %', value: `${safeLocale(up)}%`, color: [0, 120, 80] as [number, number, number] },
      { label: 'MARGEN', value: safeLocale(mg), color: [140, 80, 0] as [number, number, number] },
    ];
    const bw = (pw - 28 - 9) / 4;
    kpis.forEach((kpi, i) => {
      const x = 14 + i * (bw + 3);
      doc.setFillColor(245, 251, 246);
      doc.setDrawColor(...PG);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, bw, 16, 2, 2, 'FD');
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(kpi.label, x + bw / 2, y + 4, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40);
      doc.text(kpi.value, x + bw / 2, y + 11, { align: 'center' });
    });
    y += 22;
  }

  // ── Sections with subtotals ──
  let grandTotalVH = 0;
  let grandTotal = 0;

  for (const section of sections) {
    if (y > 250) { doc.addPage(); y = 20; }
    const rows: any[][] = [];
    let sTotalVH = 0;
    let sTotal = 0;
    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c = calculatedValues[row.id] || {};
        const vhVal = parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? 0));
        const tVal = parseFloat(String(c.total || 0));
        sTotalVH += vhVal;
        sTotal += tVal;
        rows.push([
          `${'  '.repeat(d)}${sanitizeText(row.id)}`,
          `${'  '.repeat(d)}${sanitizeText(row.label || '')}`,
          row.um || '-',
          fmtCell(c.calculatedVH ?? c.valorHistorico ?? 0),
          fmtCell(c.total || 0),
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);
    if (rows.length === 0) continue;

    // Subtotal row
    rows.push([
      { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [230, 243, 255] } },
      { content: fmtCell(sTotalVH), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 243, 255] } },
      { content: fmtCell(sTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 243, 255] } },
    ]);

    grandTotalVH += sTotalVH;
    grandTotal += sTotal;

    autoTable(doc, {
      startY: y,
      head: [[{ content: sanitizeText(section.label || section.id)!, colSpan: 5, styles: { fillColor: PG, textColor: 255, fontStyle: 'bold', fontSize: 8 } }],
             ['No.', 'Concepto', 'UM', 'V. Historico', 'Total']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 251, 246] },
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── GRAND TOTAL ──
  if (y > 260) { doc.addPage(); y = 20; }
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'COSTO TOTAL GENERAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: PG, textColor: 255, fontSize: 9 } },
      { content: fmtCell(grandTotalVH), styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255, fontSize: 9 } },
      { content: fmtCell(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255, fontSize: 9 } },
    ]],
    theme: 'grid', styles: { fontSize: 9, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Cost Structure bars ──
  if (y < pageHeight - 80) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    doc.text('ESTRUCTURA DE COSTOS', 14, y);
    y += 5;

    const maxVal = Math.max(...sections.map(s => calcSectionTotal(s, calculatedValues)), 1);
    sections.forEach((section: any) => {
      const val = calcSectionTotal(section, calculatedValues);
      if (val === 0) return;
      const barW = (val / maxVal) * (pw - 70);
      const pct = grandTotal > 0 ? (val / grandTotal * 100).toFixed(1) : '0';
      doc.setFillColor(...PG);
      doc.roundedRect(55, y - 3, barW, 5, 1, 1, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60);
      doc.text(sanitizeText((section.label || section.id).substring(0, 25))!, 14, y);
      doc.text(`${safeLocale(val)} (${pct}%)`, pw - 14, y, { align: 'right' });
      y += 7;
    });
    y += 4;
  }

  // ── Signature block ──
  addSignatureBlock(doc, y, pageWidth, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );

  // ── Pro branded footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180);
    doc.text('Documento generado por CostPro', 14, pageHeight - 12);
    doc.text(`Pag. ${i}/${pageCount}`, pw - 14, pageHeight - 12, { align: 'right' });
  }
}

// ── Shared addHeader helper for pro format ──
function addHeader(d: jsPDF, title: string, pageWidth: number, showDateTime: boolean, pdfFormat: string, logo?: string): number {
  let y = 15;
  if (pdfFormat === 'pro' && logo) {
    try {
      const logoData = logo.split(',')[1] || logo;
      const mimeMatch = logo.match(/data:image\/([a-zA-Z]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1].toUpperCase() : 'PNG';
      d.addImage(logoData, mimeType as any, 14, 8, 30, 15);
      y = 30;
    } catch (e) {
      console.warn('Logo render failed:', e);
    }
  }

  if (pdfFormat === 'pro') {
    d.setFillColor(...PG);
    d.rect(0, 0, pageWidth, 25, 'F');
    d.setTextColor(255, 255, 255);
    d.setFontSize(18);
    d.setFont('helvetica', 'bold');
    d.text(title, pageWidth / 2, 17, { align: 'center' });
    d.setTextColor(0, 0, 0);
    return 35;
  } else {
    d.setFontSize(16);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...PG);
    d.text(title, 14, 20);

    // Thin green line under title
    d.setDrawColor(...PG);
    d.setLineWidth(0.8);
    d.line(14, 23, pageWidth - 14, 23);

    if (showDateTime) {
      const ts = new Date().toLocaleString('es-CU');
      d.setFontSize(8);
      d.setFont('helvetica', 'normal');
      d.setTextColor(100);
      d.text(ts, pageWidth - 14, 20, { align: 'right' });
    }

    d.setTextColor(0, 0, 0);
    return 30;
  }
}
