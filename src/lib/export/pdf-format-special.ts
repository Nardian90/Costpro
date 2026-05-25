import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FormatContext,
  PG, GRY, LBL, TEAL, ORG, RED, AMB,
  sanitizeText, fmtCell, fmtCell4, safeLocale, shouldSkip, addGeneralDataFull,
  addPageNumbers, addSignatureBlock, calcSectionTotal, addAnnexTotalRow,
  drawKPIBox, drawBar, addGeneralDataTable, LGR, BLK, WHT,
  isUtilidadSection, expandSectionRows, calcUtilidadPercent, getCostBase, calcSectionTotalVH,
  getConversionCtx, convertValue, convertUM, getConversionDisclosureNote,
} from './pdf-shared';
import { isSectionHeaderRedundant } from './pdf-generator-utils';

/**
 * EJECUTIVO FORMAT — B&W print-friendly version
 * Executive summary with: header, 4 KPI boxes, proportional cost bars,
 * detailed section breakdown table with totals and % Costo, top cost drivers,
 * risk indicators, recommendation box, and signature block.
 * All rendered in black & white to save ink when printing.
 */
export function renderEjecutivo(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const cc = getConversionCtx(header);
  const pw = pageWidth;

  // ── B&W constants ──
  const E_BLK = [0, 0, 0] as [number, number, number];
  const E_DGR = [60, 60, 60] as [number, number, number];
  const E_MGR = [120, 120, 120] as [number, number, number];
  const E_LGR = [235, 235, 235] as [number, number, number];

  // ── Header (B&W: thin line + black text) ──
  doc.setDrawColor(...E_BLK);
  doc.setLineWidth(0.8);
  doc.line(14, 10, pw - 14, 10);
  let y = 18;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...E_BLK);
  doc.text('INFORME EJECUTIVO', 14, y);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...E_MGR);
  doc.text(sanitizeText(header.name || 'Ficha de Costo')!, pw / 2, y, { align: 'center' });
  doc.text(new Date().toLocaleDateString('es-CU'), pw - 14, y, { align: 'right' });
  y += 8;

  // ── General data — Unified 5-column grid (B&W theme) ──
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: E_LGR, hdrText: E_BLK,
    fcFill: WHT, fcText: E_BLK,
    fieldText: [30, 30, 30],
    tableTheme: 'plain',
    tableLineColor: [255, 255, 255], tableLineWidth: 0,
    priceFill: E_LGR, priceText: E_BLK,
  });

  // ── KPI boxes (4 side by side, B&W: light gray fill, thin border) ──
  // FIX: Use multiple fallback sources for KPI values. calculatedHeader may not
  // contain salePrice/utilityPercent if the row IDs are non-standard (UUIDs).
  // Priority: calculatedHeader → header → calculatedValues (row 14.1/13.1/12.1)
  // FIX: Costo total = Section 12 only (TOTAL COSTOS Y GASTOS)
  // Section 12 is the definitive total of costs; summing all sections would
  // double-count since Section 12 already contains the sum of sections 1-11.
  const ct = getCostBase(sections, calculatedValues, calculatedHeader);
  const pv = parseFloat(String(calculatedHeader?.salePrice || calculatedHeader?.precioVenta || header.sale_price || calculatedValues?.['14.1']?.total || calculatedValues?.['14']?.total || 0));
  const utilRow = parseFloat(String(calculatedValues?.['13.1']?.total || calculatedValues?.['13']?.total || 0));
  // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
  const up = calcUtilidadPercent(calculatedValues, calculatedHeader);
  // MARGEN = row 13.1 (Utilidad), NOT pv - ct (which can be misleading when pv includes non-cost markup)
  const mg = utilRow || (pv - ct);

  const kpis = [
    { label: 'COSTO TOTAL', value: safeLocale(convertValue(ct, cc)) },
    { label: 'PRECIO VENTA', value: safeLocale(convertValue(pv, cc)) },
    { label: 'Rent=Utilidad/Venta', value: `${up.toFixed(1)}%` },
    { label: 'UTILIDAD', value: safeLocale(convertValue(mg, cc)) },
  ];
  const bw = (pw - 28 - 9) / 4;
  kpis.forEach((kpi, i) => {
    const x = 14 + i * (bw + 3);
    doc.setFillColor(...E_LGR);
    doc.setDrawColor(...E_DGR);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, bw, 18, 2, 2, 'FD');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...E_MGR);
    doc.text(kpi.label, x + bw / 2, y + 6, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...E_BLK);
    doc.text(kpi.value, x + bw / 2, y + 13, { align: 'center' });
  });
  y += 24;

  // ── Cost structure bars (B&W: gray bars) ──
  // FIX: Exclude Section 13 (Utilidad) — not a cost component
  const ranked = sections
    .filter((s: any) => !isUtilidadSection(s))
    .map((s: any) => ({ label: s.label || s.id, val: calcSectionTotal(s, calculatedValues) }))
    .filter((s: any) => s.val > 0)
    .sort((a: any, b: any) => b.val - a.val);

  const maxVal = ranked[0]?.val || 1;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...E_BLK);
  doc.text('ESTRUCTURA DE COSTOS', 14, y);
  y += 5;

  ranked.forEach((s: any) => {
    const barW = (s.val / maxVal) * (pw - 70);
    const pct = ct > 0 ? (s.val / ct * 100).toFixed(1) : '0';
    doc.setFillColor(...E_MGR);
    doc.roundedRect(55, y - 3, barW, 5, 1, 1, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...E_DGR);
    doc.text(sanitizeText(s.label.substring(0, 25))!, 14, y);
    doc.text(`${safeLocale(convertValue(s.val, cc))} (${pct}%)`, pw - 14, y, { align: 'right' });
    y += 7;
  });
  y += 3;

  // ── Detailed section table (B&W) ──
  if (y > 220) { doc.addPage(); y = 20; }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...E_BLK);
  doc.text('DETALLE POR SECCION', 14, y);
  y += 4;

  const detailRows: any[][] = [];
  let grandTotal = 0;
  sections.forEach((section: any) => {
    // FIX: Section 13 (Utilidad) — expand rows individually, do NOT sum
    if (isUtilidadSection(section)) {
      const items = expandSectionRows(section, calculatedValues);
      items.forEach((item) => {
        const pct = ct > 0 ? (item.total / ct * 100).toFixed(1) : '0';
        const risk = parseFloat(pct) > 40 ? 'ALTO' : parseFloat(pct) > 20 ? 'MEDIO' : 'BAJO';
        detailRows.push([
          sanitizeText(`${item.id} ${item.label}`)!,
          safeLocale(convertValue(item.total, cc)),
          `${pct}%`,
          { content: risk, styles: { textColor: risk === 'ALTO' ? RED : E_DGR, fontStyle: risk === 'ALTO' ? 'bold' : 'normal' } },
        ]);
      });
      return; // Skip normal section total for Section 13
    }
    const sTotal = calcSectionTotal(section, calculatedValues);
    grandTotal += sTotal;
    const pct = ct > 0 ? (sTotal / ct * 100).toFixed(1) : '0';
    const risk = parseFloat(pct) > 40 ? 'ALTO' : parseFloat(pct) > 20 ? 'MEDIO' : 'BAJO';
    detailRows.push([
      sanitizeText(section.label || section.id)!,
      safeLocale(convertValue(sTotal, cc)),
      `${pct}%`,
      { content: risk, styles: { textColor: risk === 'ALTO' ? RED : E_DGR, fontStyle: risk === 'ALTO' ? 'bold' : 'normal' } },
    ]);
  });
  // Grand total row (B&W) — uses Section 12 total as the authoritative cost total
  detailRows.push([
    { content: 'TOTAL GENERAL', styles: { fontStyle: 'bold', fillColor: E_LGR, textColor: E_BLK } },
    { content: safeLocale(convertValue(ct, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: E_LGR, textColor: E_BLK } },
    { content: '100%', styles: { fontStyle: 'bold', halign: 'right', fillColor: E_LGR, textColor: E_BLK } },
    { content: '-', styles: { fillColor: E_LGR } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Seccion', 'Total', '% Costo', 'Riesgo']],
    body: detailRows,
    theme: 'grid',
    headStyles: { fillColor: E_LGR, textColor: E_BLK, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Top 3 cost drivers ──
  if (ranked.length > 0) {
    if (y > 262) { doc.addPage(); y = 20; }
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...E_BLK);
    doc.text('PRINCIPALES CONDUCTORES DE COSTO', 14, y);
    y += 4;

    const top3 = ranked.slice(0, 3);
    top3.forEach((s: any, i: number) => {
      const pct = ct > 0 ? (s.val / ct * 100).toFixed(1) : '0';
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...E_BLK);
      const labelStr = `${i + 1}. ${sanitizeText(s.label)!}`;
      doc.text(labelStr, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...E_MGR);
      // FIX: Add " - " separator between section label and "Representa" text
      doc.text(` - Representa el ${pct}% del costo total (${safeLocale(convertValue(s.val, cc))})`, 14 + doc.getTextWidth(labelStr), y);
      y += 5;
    });
    y += 3;
  }

  // ── Recommendation box (B&W: gray border, black text) ──
  if (y < pageHeight - 22) {
    doc.setDrawColor(...E_MGR);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, pw - 28, 16, 2, 2, 'S');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...E_BLK);
    doc.text('RECOMENDACION:', 16, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...E_DGR);
    const topItem = ranked[0];
    const topPct = ct > 0 && topItem ? (topItem.val / ct * 100).toFixed(1) : '0';
    doc.text(
      `La seccion de mayor peso es "${sanitizeText(topItem?.label || '')}" con ${topPct}% del costo total.`, 16, y + 8
    );
    doc.text(
      up < 10 ? 'La utilidad es baja (%). Se recomienda revisar estructura de costos.' : 'La utilidad es aceptable. Mantener control de costos.', 16, y + 12
    );
    y += 22;
  }

  // ── Signature block ──
  addSignatureBlock(doc, y, pw, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );
}

/**
 * CONTABILIDAD FORMAT — 9+ quality level
 * Accounting format with: full header, 4-decimal precision, account code column,
 * subtotals per section, cross-foot verification, grand total, balance validation,
 * and verifier signature block.
 */
export function renderContabilidad(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const cc = getConversionCtx(header);
  const pw = pageWidth;

  // ── Header ──
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pw, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE COSTO - CONTABILIDAD', 14, 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${sanitizeText(header.resolution || 'Res 148/2023')}  |  ${new Date().toLocaleDateString('es-CU')}`, pw - 14, 10, { align: 'right' });
  let y = 22;

  // ── General data — Unified 5-column grid (Teal theme) ──
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: TEAL, hdrText: [255, 255, 255],
    fcFill: [230, 245, 245], fcText: TEAL,
    fieldText: [30, 30, 30],
    tableTheme: 'grid',
    tableLineColor: [180, 220, 220], tableLineWidth: 0.3,
    priceFill: TEAL, priceText: [255, 255, 255],
  });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80);
  doc.text('Todos los valores expresados con 4 decimales. Codigos de cuenta conforme Plan Contable.', 14, y);
  y += 5;

  // ── Sections ──
  let grandTotalVH = 0;
  let grandTotal = 0;
  const sectionTotals: { label: string; total: number }[] = [];

  for (const section of sections) {
    if (y > 245) { doc.addPage(); y = 20; }
    const rows: any[][] = [];
    // FIX: Do NOT accumulate sTotal/sTotalVH in walk — parent rows already include children.
    // Use calcSectionTotal/calcSectionTotalVH (top-level only) for subtotals.
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
          fmtCell4(convertValue(parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? 0)), cc, 4)),
          fmtCell4(convertValue(parseFloat(String(c.total || 0)), cc, 4)),
          sanitizeText(row.accountCode || '')!,
          sanitizeText(row.reference || '')!,
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);
    if (rows.length === 0) continue;

    // FIX: Section 13 (Utilidad) — no subtotal, rows are independent items
    if (!isUtilidadSection(section)) {
      // Subtotal from top-level rows only (no double-counting)
      const sTotal = calcSectionTotal(section, calculatedValues);
      const sTotalVH = calcSectionTotalVH(section, calculatedValues);
      // Subtotal row per section
      rows.push([
        { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [230, 245, 245] } },
        { content: fmtCell4(convertValue(sTotalVH, cc, 4)), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 245, 245] } },
        { content: fmtCell4(convertValue(sTotal, cc, 4)), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 245, 245] } },
        { content: '', styles: { fillColor: [230, 245, 245] } },
        { content: '', styles: { fillColor: [230, 245, 245] } },
      ]);

      grandTotalVH += sTotalVH;
      grandTotal += sTotal;
      sectionTotals.push({ label: section.label || section.id, total: sTotal });
    }

    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto', 'UM', 'V. Historico', 'Total', 'Cta. Contable', 'Ref.']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: TEAL, textColor: 255, fontSize: 6.5 },
      styles: { fontSize: 6.5, cellPadding: 1 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // ── GRAND TOTAL ──
  if (y > 262) { doc.addPage(); y = 20; }
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'COSTO TOTAL GENERAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: TEAL, textColor: 255 } },
      { content: fmtCell4(convertValue(grandTotalVH, cc, 4)), styles: { fontStyle: 'bold', halign: 'right', fillColor: TEAL, textColor: 255 } },
      { content: fmtCell4(convertValue(grandTotal, cc, 4)), styles: { fontStyle: 'bold', halign: 'right', fillColor: TEAL, textColor: 255 } }, '', ''
    ]],
    theme: 'grid', styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Cross-foot verification ──
  const crossFootSum = sectionTotals.reduce((s, t) => s + t.total, 0);
  const diff = Math.abs(crossFootSum - grandTotal);
  const isValid = diff < 0.01;

  doc.setDrawColor(isValid ? PG[0] : RED[0], isValid ? PG[1] : RED[1], isValid ? PG[2] : RED[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, pw - 28, 14, 2, 2, 'S');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isValid ? PG[0] : RED[0], isValid ? PG[1] : RED[1], isValid ? PG[2] : RED[2]);
  doc.text(isValid ? 'VERIFICACION CRUZADA: CORRECTA' : 'VERIFICACION CRUZADA: DISCREPANCIA', 16, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text(
    `Suma de subtotales: ${fmtCell4(convertValue(crossFootSum, cc, 4))}  |  Total general: ${fmtCell4(convertValue(grandTotal, cc, 4))}  |  Diferencia: ${fmtCell4(convertValue(diff, cc, 4))}`,
    16, y + 10
  );
  y += 20;

  // ── Balance validation box ──
  if (calculatedHeader && y < pageHeight - 15) {
    doc.setFillColor(...GRY);
    doc.rect(14, y, pw - 28, 10, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text('VALIDACION DE BALANCE:', 16, y + 4);
    doc.setFont('helvetica', 'normal');
    const ctVal = getCostBase(sections, calculatedValues, calculatedHeader);
    const pvVal = calculatedHeader.salePrice || calculatedHeader.precioVenta || header.sale_price || parseFloat(String(calculatedValues?.['14.1']?.total || calculatedValues?.['14']?.total || 0));
    const ctForUtil = ctVal || parseFloat(String(calculatedValues?.['12.1']?.total || calculatedValues?.['12']?.total || 0));
    const utilVal = parseFloat(String(calculatedValues?.['13.1']?.total || calculatedValues?.['13']?.total || 0));
    // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
    const utPct = calcUtilidadPercent(calculatedValues, calculatedHeader);
    doc.text(`Costo: ${safeLocale(convertValue(ctVal, cc))}  |  Precio: ${safeLocale(convertValue(pvVal, cc))}  |  Utilidad: ${utPct.toFixed(1)}%  |  Estado: ${pvVal >= ctVal ? 'VIABLE' : 'NO VIABLE'}`, 16, y + 8);
    y += 16;
  }

  // ── Verifier signature block ──
  if (y > pageHeight - 15) { doc.addPage(); y = 20; }
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text('Verificado por: _______________________', 14, y);
  doc.text('Fecha: _______________', pw - 14, y, { align: 'right' });
}

/**
 * AUDITORIA FORMAT — 9+ quality level
 * Audit format with: file reference header, complete metadata, section tables
 * with observation boxes, compliance checklist, CONFIDENTIAL watermark on all pages,
 * three-level signature (Elaborador, Revisor, Aprobador), and audit timeline.
 */
export function renderAuditoria(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const cc = getConversionCtx(header);
  const pw = pageWidth;

  // ── Header ──
  doc.setFillColor(...ORG);
  doc.rect(0, 0, pw, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE COSTO - AUDITORIA', 14, 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const fileRef = `REF: ${sanitizeText(header.code || 'S/R')}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  doc.text(fileRef, pw - 14, 10, { align: 'right' });
  let y = 22;

  // ── General data — Unified 5-column grid (Orange/audit theme) ──
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: ORG, hdrText: [255, 255, 255],
    fcFill: [255, 240, 230], fcText: ORG,
    fieldText: [30, 30, 30],
    tableTheme: 'grid',
    tableLineColor: [220, 180, 150], tableLineWidth: 0.3,
    priceFill: ORG, priceText: [255, 255, 255],
  });

  // ── Additional audit metadata (date, elaborated by, approved by, format, skipZeros) ──
  autoTable(doc, {
    startY: y,
    body: [
      ['Elaborado por', sanitizeText(header.elaboratedBy || header.prepared_by) || '-'],
      ['Aprobado por', sanitizeText(header.approvedBy || header.approved_by) || '-'],
      ['Fecha elaboracion', sanitizeText(header.date) || '-'],
      ['Fecha exportacion', new Date().toLocaleString('es-CU')],
      ['Formato', 'Auditoria - RES 148/2023'],
      ['Omitir ceros', skipZeros ? 'Si' : 'No'],
    ],
    theme: 'grid',
    headStyles: { fillColor: ORG, textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Compliance checklist ──
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORG);
  doc.text('LISTA DE VERIFICACION DE CUMPLIMIENTO', 14, y);
  y += 4;

  const checkItems = [
    { item: 'Datos del producto completos', ok: !!(header.name && header.code) },
    { item: 'Organismo y empresa identificados', ok: !!(header.organism || header.company) },
    { item: 'Resolucion declarada', ok: !!(header.resolution) },
    { item: 'Estructura de costos coherente', ok: sections.length > 0 },
    { item: 'Valores numericos presentes', ok: Object.keys(calculatedValues).length > 0 },
  ];

  const checkRows = checkItems.map(ci => [
    ci.item,
    ci.ok ? 'CUMPLE' : 'PENDIENTE',
    { content: '', styles: { fillColor: (ci.ok ? [200, 240, 200] : [255, 230, 200]) as [number, number, number] } },
  ]);
  autoTable(doc, {
    startY: y,
    head: [['Item de Verificacion', 'Estado', 'Obs.']],
    body: checkRows,
    theme: 'grid',
    headStyles: { fillColor: ORG, textColor: 255, fontSize: 6.5 },
    styles: { fontSize: 6.5, cellPadding: 1 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Sections with observation boxes ──
  for (const section of sections) {
    if (y > 215) { doc.addPage(); y = 20; }
    const rows: any[][] = [];
    // FIX: Do NOT accumulate sTotal in walk — parent rows already include children.
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
          fmtCell(convertValue(parseFloat(String(c.total || 0)), cc))
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);
    if (rows.length === 0) continue;

    // FIX: Section 13 (Utilidad) — no subtotal, rows are independent items
    if (!isUtilidadSection(section)) {
      // Subtotal from top-level rows only (no double-counting)
      const sTotal = calcSectionTotal(section, calculatedValues);
      // Add subtotal
      rows.push([
        { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [255, 240, 230] } },
        { content: fmtCell(convertValue(sTotal, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: [255, 240, 230] } },
        { content: '', styles: { fillColor: [255, 240, 230] } },
      ]);
    }

    autoTable(doc, {
      startY: y,
      head: [['No.', sanitizeText(section.label || section.id)!, 'UM', 'V. Historico', 'Total']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: ORG, textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 2;

    // Observation box
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    doc.rect(14, y, pw - 28, 12);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    doc.text('Observaciones:', 16, y + 4);
    doc.text('_______________________________________________________________________', 16, y + 9);
    y += 16;
  }

  // ── Grand total = Section 12 total (not sum of all sections) ──
  if (y > 260) { doc.addPage(); y = 20; }
  const grandTotal = getCostBase(sections, calculatedValues, calculatedHeader);
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'COSTO TOTAL AUDITADO', colSpan: 3, styles: { fontStyle: 'bold', fillColor: ORG, textColor: 255 } },
      { content: '', styles: { fillColor: ORG } },
      { content: fmtCell(convertValue(grandTotal, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: ORG, textColor: 255 } },
    ]],
    theme: 'grid', styles: { fontSize: 7, cellPadding: 2 }, margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Three-level signature block ──
  if (y > 262) { doc.addPage(); y = 20; }
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  const third = (pw - 28) / 3;
  const sigY = y + 4;
  doc.text('Elaborador: _____________________', 14, sigY);
  doc.text('Revisor: _____________________', 14 + third, sigY);
  doc.text('Aprobador: _____________________', 14 + third * 2, sigY);
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text('Nombre y firma', 30, sigY + 4);
  doc.text('Nombre y firma', 14 + third + 16, sigY + 4);
  doc.text('Nombre y firma', 14 + third * 2 + 18, sigY + 4);

  // ── CONFIDENTIAL watermark on all pages ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.saveGraphicsState();
    doc.setFontSize(48);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 200, 200);
    doc.text('CONFIDENCIAL', pw / 2, pageHeight / 2, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();
  }

  addPageNumbers(doc, pw, pageHeight, 'CostPro - Auditoria');
}

/**
 * SIMPLIFICADO FORMAT — 9+ quality level
 * One-page summary with: compact header, section totals with visual percentage bars,
 * cost distribution visualization, top 3 cost drivers, and clean summary footer.
 */
export function renderSimplificado(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const cc = getConversionCtx(header);
  const pw = pageWidth;

  // ── Compact header ──
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PG);
  doc.text('RESUMEN DE FICHA DE COSTO', 14, 14);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`${sanitizeText(header.name || 'S/N')}  |  ${sanitizeText(header.code || '-')}  |  ${sanitizeText(header.currency || 'CUP')}  |  ${new Date().toLocaleDateString('es-CU')}`, pw - 14, 14, { align: 'right' });

  // Thin green line
  doc.setDrawColor(...PG);
  doc.setLineWidth(0.8);
  doc.line(14, 18, pw - 14, 18);
  let y = 24;

  // ── General data — Unified 5-column grid (Green theme) ──
  y = addGeneralDataTable(doc, header, calculatedValues, y, pw, {
    hdrFill: PG, hdrText: [255, 255, 255],
    fcFill: LBL, fcText: PG,
    fieldText: [30, 30, 30],
    tableTheme: 'striped',
    tableLineColor: [180, 220, 180], tableLineWidth: 0.2,
    priceFill: PG, priceText: [255, 255, 255],
  });

  // ── KPI strip ──
  // FIX: Costo total = Section 12 only (TOTAL COSTOS Y GASTOS)
  const kpiCt = getCostBase(sections, calculatedValues, calculatedHeader);
  const kpiPv = parseFloat(String(calculatedHeader?.salePrice || calculatedHeader?.precioVenta || header.sale_price || calculatedValues?.['14.1']?.total || calculatedValues?.['14']?.total || 0));
  // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
  const kpiUp = calcUtilidadPercent(calculatedValues, calculatedHeader);
  if (kpiCt > 0 || kpiPv > 0) {
    doc.setFillColor(...LBL);
    doc.rect(14, y, pw - 28, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 60, 120);
    doc.text(`Costo Total: ${safeLocale(convertValue(kpiCt, cc))}`, 18, y + 5);
    doc.text(`Precio: ${safeLocale(convertValue(kpiPv, cc))}`, pw / 3 + 5, y + 5);
    doc.text(`Utilidad: ${kpiUp.toFixed(1)}%`, 2 * pw / 3, y + 5);
    y += 10;
  }

  // ── Section totals with percentage bars ──
  const rows: any[][] = [];
  // FIX: Cost base = Section 12 only (not sum of all sections)
  const ct = getCostBase(sections, calculatedValues, calculatedHeader) || 1;
  let count = 0;
  for (const section of sections) {
    if (count >= 12) {
      rows.push([{ content: `(+ ${sections.length - 12} secciones omitidas)`, colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150] } }]);
      break;
    }
    // FIX: Section 13 (Utilidad) — expand rows individually
    if (isUtilidadSection(section)) {
      const items = expandSectionRows(section, calculatedValues);
      items.forEach((item) => {
        if (count >= 12) return;
        const pct = ct > 0 ? (item.total / ct * 100).toFixed(1) : '0.0';
        rows.push([
          sanitizeText(`${item.id} ${item.label}`)!,
          safeLocale(convertValue(item.total, cc)),
          `${pct}%`,
        ]);
        count++;
      });
      continue;
    }
    const total = calcSectionTotal(section, calculatedValues);
    if (skipZeros && total === 0) continue;
    const pct = ct > 0 ? (total / ct * 100).toFixed(1) : '0.0';
    rows.push([
      sanitizeText(section.label || section.id)!,
      safeLocale(convertValue(total, cc)),
      `${pct}%`,
    ]);
    count++;
  }

  // Total row — uses Section 12 total as the authoritative cost total
  rows.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: PG, textColor: 255 } },
    { content: safeLocale(convertValue(ct, cc)), styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255 } },
    { content: '100%', styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255 } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Seccion', 'Total', '% Costo']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: PG, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Visual percentage bars ──
  if (y < pageHeight - 45) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    doc.text('DISTRIBUCION VISUAL', 14, y);
    y += 4;

    // FIX: Exclude Section 13 (Utilidad) from distribution bars
    const barSections = sections
      .filter((s: any) => !isUtilidadSection(s))
      .map((s: any) => ({ label: s.label || s.id, val: calcSectionTotal(s, calculatedValues) }))
      .filter((s: any) => s.val > 0)
      .sort((a: any, b: any) => b.val - a.val)
      .slice(0, 6);

    const maxVal = barSections[0]?.val || 1;
    barSections.forEach((s: any) => {
      const barW = (s.val / maxVal) * (pw - 70);
      drawBar(doc, 55, y - 3, barW, 4, PG);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60);
      doc.text(sanitizeText(s.label.substring(0, 22))!, 14, y);
      doc.text(safeLocale(convertValue(s.val, cc)), pw - 14, y, { align: 'right' });
      y += 6;
    });
    y += 2;
  }

  // ── Bottom summary ──
  if ((kpiCt > 0 || kpiPv > 0) && y < pageHeight - 12) {
    doc.setDrawColor(...PG);
    doc.setLineWidth(0.5);
    doc.line(14, y, pw - 14, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PG);
    doc.text(
      `Costo Total: ${safeLocale(convertValue(kpiCt, cc))}  |  Precio: ${safeLocale(convertValue(kpiPv, cc))}  |  Utilidad: ${kpiUp.toFixed(1)}%`,
      pw / 2, y, { align: 'center' }
    );
  }
  // NO extra pages for simplificado — return early
}
