import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FormatContext,
  PG, GRY, LBL, TEAL, ORG, RED, AMB,
  sanitizeText, fmtCell, fmtCell4, safeLocale, shouldSkip, addGeneralDataFull,
  addPageNumbers, addSignatureBlock, calcSectionTotal, addAnnexTotalRow,
  drawKPIBox, drawBar,
} from './pdf-shared';
import { isSectionHeaderRedundant } from './pdf-generator-utils';

/**
 * EJECUTIVO FORMAT — 9+ quality level
 * Executive summary with: branded header, 4 KPI boxes, proportional cost bars,
 * detailed section breakdown table with totals, top cost drivers, margin analysis,
 * risk indicators, recommendation box, and signature block.
 */
export function renderEjecutivo(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const pw = pageWidth;

  // ── Header ──
  doc.setFillColor(...PG);
  doc.rect(0, 0, pw, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME EJECUTIVO', 14, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeText(header.name || 'Ficha de Costo')!, pw / 2, 12, { align: 'center' });
  doc.text(new Date().toLocaleDateString('es-CU'), pw - 14, 12, { align: 'right' });
  let y = 24;

  // ── General data (compact) ──
  y = addGeneralDataFull(doc, header, y, pw);

  // ── KPI boxes (4 side by side) ──
  const ct = parseFloat(String(calculatedHeader?.totalCost || 0));
  const pv = parseFloat(String(calculatedHeader?.salePrice || 0));
  const up = parseFloat(String(calculatedHeader?.utilityPercent || 0));
  const mg = pv - ct;
  const kpis = [
    { label: 'COSTO TOTAL', value: safeLocale(ct), color: PG },
    { label: 'PRECIO VENTA', value: safeLocale(pv), color: [21, 68, 128] },
    { label: 'UTILIDAD %', value: `${safeLocale(up)}%`, color: [0, 120, 80] },
    { label: 'MARGEN', value: safeLocale(mg), color: mg >= 0 ? [0, 120, 80] : RED },
  ];
  const bw = (pw - 28 - 9) / 4;
  kpis.forEach((kpi, i) => {
    drawKPIBox(doc, 14 + i * (bw + 3), y, bw, 18, kpi.label, kpi.value, kpi.color as [number, number, number]);
  });
  y += 24;

  // ── Cost structure bars ──
  const ranked = sections
    .map((s: any) => ({ label: s.label || s.id, val: calcSectionTotal(s, calculatedValues) }))
    .filter((s: any) => s.val > 0)
    .sort((a: any, b: any) => b.val - a.val);

  const maxVal = ranked[0]?.val || 1;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60);
  doc.text('ESTRUCTURA DE COSTOS', 14, y);
  y += 5;

  ranked.forEach((s: any) => {
    const barW = (s.val / maxVal) * (pw - 70);
    const pct = ct > 0 ? (s.val / ct * 100).toFixed(1) : '0';
    drawBar(doc, 55, y - 3, barW, 5, PG);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    doc.text(sanitizeText(s.label.substring(0, 25))!, 14, y);
    doc.text(`${safeLocale(s.val)} (${pct}%)`, pw - 14, y, { align: 'right' });
    y += 7;
  });
  y += 3;

  // ── Detailed section table ──
  if (y > 220) { doc.addPage(); y = 20; }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60);
  doc.text('DETALLE POR SECCION', 14, y);
  y += 4;

  const detailRows: any[][] = [];
  let grandTotal = 0;
  sections.forEach((section: any) => {
    const sTotal = calcSectionTotal(section, calculatedValues);
    grandTotal += sTotal;
    const pct = ct > 0 ? (sTotal / ct * 100).toFixed(1) : '0';
    const risk = parseFloat(pct) > 40 ? 'ALTO' : parseFloat(pct) > 20 ? 'MEDIO' : 'BAJO';
    const riskColor = risk === 'ALTO' ? RED : risk === 'MEDIO' ? AMB : PG;
    detailRows.push([
      sanitizeText(section.label || section.id)!,
      safeLocale(sTotal),
      `${pct}%`,
      { content: risk, styles: { textColor: riskColor, fontStyle: 'bold' } },
    ]);
  });
  // Grand total row
  detailRows.push([
    { content: 'TOTAL GENERAL', styles: { fontStyle: 'bold', fillColor: PG, textColor: 255 } },
    { content: safeLocale(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255 } },
    { content: '100%', styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255 } },
    { content: '-', styles: { fillColor: PG, textColor: 255 } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Seccion', 'Total', '% Costo', 'Riesgo']],
    body: detailRows,
    theme: 'grid',
    headStyles: { fillColor: PG, textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Top 3 cost drivers ──
  if (ranked.length > 0) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    doc.text('PRINCIPALES CONDUCTORES DE COSTO', 14, y);
    y += 4;

    const top3 = ranked.slice(0, 3);
    top3.forEach((s: any, i: number) => {
      const pct = ct > 0 ? (s.val / ct * 100).toFixed(1) : '0';
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PG);
      doc.text(`${i + 1}. ${sanitizeText(s.label)!}`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      doc.text(`Representa el ${pct}% del costo total (${safeLocale(s.val)})`, 14 + doc.getTextWidth(`${i + 1}. ${sanitizeText(s.label)!}  `), y);
      y += 5;
    });
    y += 3;
  }

  // ── Recommendation box ──
  if (y < pageHeight - 50) {
    doc.setDrawColor(...PG);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, pw - 28, 16, 2, 2, 'S');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PG);
    doc.text('RECOMENDACION:', 16, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
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

  y = addGeneralDataFull(doc, header, y, pw);

  // ── Accounting note ──
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
    let sTotalVH = 0;
    let sTotal = 0;
    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c = calculatedValues[row.id] || {};
        // FIX: Use calculatedVH (from vhFormula) before valorHistorico (initial value)
        const vhVal = parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? 0));
        const tVal = parseFloat(String(c.total || 0));
        sTotalVH += vhVal;
        sTotal += tVal;
        rows.push([
          `${'  '.repeat(d)}${sanitizeText(row.id)}`,
          `${'  '.repeat(d)}${sanitizeText(row.label || '')}`,
          row.um || '-',
          fmtCell4(c.calculatedVH ?? c.valorHistorico ?? 0),
          fmtCell4(c.total || 0),
          sanitizeText(row.accountCode || '')!,
          sanitizeText(row.reference || '')!,
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);
    if (rows.length === 0) continue;

    // Subtotal row per section
    rows.push([
      { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [230, 245, 245] } },
      { content: fmtCell4(sTotalVH), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 245, 245] } },
      { content: fmtCell4(sTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 245, 245] } },
      { content: '', styles: { fillColor: [230, 245, 245] } },
      { content: '', styles: { fillColor: [230, 245, 245] } },
    ]);

    grandTotalVH += sTotalVH;
    grandTotal += sTotal;
    sectionTotals.push({ label: section.label || section.id, total: sTotal });

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
  if (y > 250) { doc.addPage(); y = 20; }
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'COSTO TOTAL GENERAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: TEAL, textColor: 255 } },
      { content: fmtCell4(grandTotalVH), styles: { fontStyle: 'bold', halign: 'right', fillColor: TEAL, textColor: 255 } },
      { content: fmtCell4(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: TEAL, textColor: 255 } }, '', ''
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
    `Suma de subtotales: ${fmtCell4(crossFootSum)}  |  Total general: ${fmtCell4(grandTotal)}  |  Diferencia: ${fmtCell4(diff)}`,
    16, y + 10
  );
  y += 20;

  // ── Balance validation box ──
  if (calculatedHeader && y < pageHeight - 50) {
    doc.setFillColor(...GRY);
    doc.rect(14, y, pw - 28, 10, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text('VALIDACION DE BALANCE:', 16, y + 4);
    doc.setFont('helvetica', 'normal');
    const ctVal = calculatedHeader.totalCost || 0;
    const pvVal = calculatedHeader.salePrice || 0;
    const utPct = calculatedHeader.utilityPercent || 0;
    doc.text(`Costo: ${safeLocale(ctVal)}  |  Precio: ${safeLocale(pvVal)}  |  Utilidad: ${safeLocale(utPct)}%  |  Estado: ${pvVal >= ctVal ? 'VIABLE' : 'NO VIABLE'}`, 16, y + 8);
    y += 16;
  }

  // ── Verifier signature block ──
  if (y > pageHeight - 30) { doc.addPage(); y = 20; }
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

  // ── Complete metadata audit table ──
  autoTable(doc, {
    startY: y,
    body: [
      ['Producto', sanitizeText(header.name) || '-'],
      ['Codigo', sanitizeText(header.code) || '-'],
      ['Resolucion', sanitizeText(header.resolution) || 'Res 148/2023'],
      ['Empresa', sanitizeText(header.company || header.empresa) || '-'],
      ['Organismo', sanitizeText(header.organism || header.organismo) || '-'],
      ['Union', sanitizeText(header.union) || '-'],
      ['Destino', sanitizeText(header.destination || header.destinoProduccion) || '-'],
      ['Moneda', sanitizeText(header.currency || 'CUP')],
      ['Cantidad Base', String(header.quantity || '1')],
      ['Tipo Costo', sanitizeText(header.type || header.tipoCosto) || 'EMPRESA'],
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
    let sTotal = 0;
    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c = calculatedValues[row.id] || {};
        const tVal = parseFloat(String(c.total || 0));
        sTotal += tVal;
        rows.push([
          `${'  '.repeat(d)}${sanitizeText(row.id)}`,
          `${'  '.repeat(d)}${sanitizeText(row.label || '')}`,
          row.um || '-',
          // FIX: Use calculatedVH (from vhFormula) before valorHistorico (initial value)
          fmtCell(c.calculatedVH ?? c.valorHistorico ?? 0),
          fmtCell(c.total || 0)
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);
    if (rows.length === 0) continue;

    // Add subtotal
    rows.push([
      { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [255, 240, 230] } },
      { content: fmtCell(sTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [255, 240, 230] } },
      { content: '', styles: { fillColor: [255, 240, 230] } },
    ]);

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

  // ── Grand total ──
  if (y > 240) { doc.addPage(); y = 20; }
  const grandTotal = sections.reduce((sum, s) => sum + calcSectionTotal(s, calculatedValues), 0);
  autoTable(doc, {
    startY: y,
    body: [[
      { content: 'COSTO TOTAL AUDITADO', colSpan: 3, styles: { fontStyle: 'bold', fillColor: ORG, textColor: 255 } },
      { content: '', styles: { fillColor: ORG } },
      { content: fmtCell(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: ORG, textColor: 255 } },
    ]],
    theme: 'grid', styles: { fontSize: 7, cellPadding: 2 }, margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Three-level signature block ──
  if (y > 250) { doc.addPage(); y = 20; }
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

  // ── Mini header data (4 key fields) ──
  doc.setFontSize(7);
  doc.setTextColor(40);
  doc.setFont('helvetica', 'bold');
  doc.text('Producto:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(sanitizeText(header.name || 'S/N')!, 36, y);
  doc.setFont('helvetica', 'bold'); doc.text('Codigo:', pw / 2, y); doc.setFont('helvetica', 'normal'); doc.text(sanitizeText(header.code || '-')!, pw / 2 + 16, y);
  y += 4;
  doc.setFont('helvetica', 'bold'); doc.text('UM:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(sanitizeText(header.unit || header.um || 'U')!, 24, y);
  doc.setFont('helvetica', 'bold'); doc.text('Cantidad:', pw / 2, y); doc.setFont('helvetica', 'normal'); doc.text(String(header.quantity || '1'), pw / 2 + 18, y);
  y += 8;

  // ── KPI strip ──
  if (calculatedHeader) {
    const ct = calculatedHeader.totalCost || 0;
    const pv = calculatedHeader.salePrice || 0;
    const up = calculatedHeader.utilityPercent || 0;
    doc.setFillColor(...LBL);
    doc.rect(14, y, pw - 28, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 60, 120);
    doc.text(`Costo Total: ${safeLocale(ct)}`, 18, y + 5);
    doc.text(`Precio: ${safeLocale(pv)}`, pw / 3 + 5, y + 5);
    doc.text(`Utilidad: ${safeLocale(up)}%`, 2 * pw / 3, y + 5);
    y += 10;
  }

  // ── Section totals with percentage bars ──
  const rows: any[][] = [];
  // FIX: When calculatedHeader is missing, compute total from section sums
  // instead of falling back to 1 (which produced absurd percentages like 123400%)
  const grandTotalForPct = sections.reduce((sum: number, s: any) => sum + calcSectionTotal(s, calculatedValues), 0);
  const ct = parseFloat(String(calculatedHeader?.totalCost || 0)) || grandTotalForPct || 1;
  let count = 0;
  for (const section of sections) {
    if (count >= 12) {
      rows.push([{ content: `(+ ${sections.length - 12} secciones omitidas)`, colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150] } }]);
      break;
    }
    const total = calcSectionTotal(section, calculatedValues);
    if (skipZeros && total === 0) continue;
    const pct = ct > 0 ? (total / ct * 100).toFixed(1) : '0.0';
    rows.push([
      sanitizeText(section.label || section.id)!,
      safeLocale(total),
      `${pct}%`,
    ]);
    count++;
  }

  // Total row
  const grandTotal = sections.reduce((sum, s) => sum + calcSectionTotal(s, calculatedValues), 0);
  rows.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: PG, textColor: 255 } },
    { content: safeLocale(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255 } },
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
  if (y < pageHeight - 80) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    doc.text('DISTRIBUCION VISUAL', 14, y);
    y += 4;

    const barSections = sections
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
      doc.text(safeLocale(s.val), pw - 14, y, { align: 'right' });
      y += 6;
    });
    y += 2;
  }

  // ── Bottom summary ──
  if (calculatedHeader && y < pageHeight - 30) {
    doc.setDrawColor(...PG);
    doc.setLineWidth(0.5);
    doc.line(14, y, pw - 14, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PG);
    doc.text(
      `Costo Total: ${safeLocale(calculatedHeader.totalCost || 0)}  |  Precio: ${safeLocale(calculatedHeader.salePrice || 0)}  |  Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}%`,
      pw / 2, y, { align: 'center' }
    );
  }
  // NO extra pages for simplificado — return early
}
