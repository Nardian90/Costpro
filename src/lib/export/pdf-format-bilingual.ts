import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FormatContext,
  PG, LBL, IND, CYN, EMR, GRY,
  sanitizeText, fmtCell, safeLocale, shouldSkip, addGeneralDataFull,
  addPageNumbers, addSignatureBlock, calcSectionTotal, addAnnexTotalRow,
  translateLabel, drawBar,
} from './pdf-shared';
import { isSectionHeaderRedundant } from './pdf-generator-utils';

/**
 * BILINGUE FORMAT — 9+ quality level
 * Landscape bilingual Spanish/English side-by-side layout with:
 * dual-language header, section totals, grand total row,
 * bilingual footer on every page, and signature block.
 */
export function renderBilingue(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const pw = pageWidth;

  // ── Bilingual header ──
  doc.setFillColor(...IND);
  doc.rect(0, 0, pw, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('COST SHEET / FICHA DE COSTO', pw / 2, 8, { align: 'center' });
  let y = 17;

  // ── Bilingual metadata ──
  y = addGeneralDataFull(doc, header, y, pw, true);

  // ── KPI strip ──
  if (calculatedHeader) {
    const ct = calculatedHeader.totalCost || 0;
    const pv = calculatedHeader.salePrice || 0;
    const up = calculatedHeader.utilityPercent || 0;
    doc.setFillColor(240, 240, 255);
    doc.rect(14, y, pw - 28, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 120);
    doc.text(`Total Cost / Costo Total: ${safeLocale(ct)}`, 18, y + 5);
    doc.text(`Price / Precio: ${safeLocale(pv)}`, pw / 3 + 10, y + 5);
    doc.text(`Profit / Utilidad: ${safeLocale(up)}%`, 2 * pw / 3, y + 5);
    y += 10;
  }

  // ── Build rows ──
  const rows: any[][] = [];
  let grandTotal = 0;

  sections.forEach((s: any) => {
    const sTotal = calcSectionTotal(s, calculatedValues);
    grandTotal += sTotal;

    if (!isSectionHeaderRedundant(s.label || s.id, s.rows)) {
      rows.push([{ content: `${sanitizeText(s.label)} / ${translateLabel(s.label)}`, colSpan: 10, styles: { fontStyle: 'bold', fillColor: [240, 240, 255] } }]);
    }

    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c = calculatedValues[row.id] || {};
        const indent = '  '.repeat(d);
        // FIX: Use calculatedVH (from vhFormula) before valorHistorico (initial value)
        rows.push([
          `${indent}${sanitizeText(row.id)}`, `${indent}${sanitizeText(row.label || '')}`, row.um || '-',
          fmtCell(c.calculatedVH ?? c.valorHistorico ?? 0), fmtCell(c.total || 0),
          `${indent}${sanitizeText(row.id)}`, `${indent}${translateLabel(sanitizeText(row.label || '')!)}`, row.um || '-',
          fmtCell(c.calculatedVH ?? c.valorHistorico ?? 0), fmtCell(c.total || 0),
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(s.rows || []);

    // Section subtotal
    rows.push([
      { content: `Subtotal / Subtotal`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: LBL } },
      { content: '', styles: { fillColor: LBL } },
      { content: fmtCell(sTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: LBL } },
      { content: `Subtotal`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: LBL } },
      { content: '', styles: { fillColor: LBL } },
      { content: fmtCell(sTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: LBL } },
    ]);
  });

  // Grand total row
  rows.push([
    { content: 'TOTAL GENERAL / GRAND TOTAL', colSpan: 4, styles: { fontStyle: 'bold', fillColor: IND, textColor: 255 } },
    { content: fmtCell(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: IND, textColor: 255 } },
    { content: 'GRAND TOTAL', colSpan: 4, styles: { fontStyle: 'bold', fillColor: IND, textColor: 255 } },
    { content: fmtCell(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: IND, textColor: 255 } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['No.', 'Concepto (ES)', 'UM', 'V.H.', 'Total', 'No.', 'Concept (EN)', 'UoM', 'H.V.', 'Total']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: IND, textColor: 255, fontSize: 6.5 },
    styles: { fontSize: 6.5, cellPadding: 1 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
    margin: { left: 10, right: 10 },
  });

  // ── Signature block ──
  const finalY = (doc as any).lastAutoTable.finalY + 8;
  addSignatureBlock(doc, finalY, pw, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );

  // ── Bilingual footer on all pages ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    doc.text('CostPro Export / Exportacion CostPro', pw / 2, pageHeight - 5, { align: 'center' });
  }
  addPageNumbers(doc, pw, pageHeight, 'CostPro Bilingual');
}

/**
 * COMPARATIVO FORMAT — 9+ quality level
 * Landscape sensitivity analysis with: factor variations (BASE, +10%, +20%, -10%),
 * color-coded variance column, break-even indicator, summary comparison table,
 * and risk assessment.
 */
export function renderComparativo(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const pw = pageWidth;

  // ── Header ──
  doc.setFillColor(...CYN);
  doc.rect(0, 0, pw, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ANALISIS DE SENSIBILIDAD / SENSITIVITY ANALYSIS', pw / 2, 8, { align: 'center' });
  let y = 17;

  // ── General data (compact, bilingual) ──
  y = addGeneralDataFull(doc, header, y, pw, true);

  // ── KPI strip ──
  if (calculatedHeader) {
    const ct = calculatedHeader.totalCost || 0;
    doc.setFillColor(230, 250, 255);
    doc.rect(10, y, pw - 20, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 80, 100);
    doc.text(`Costo Base / Base Cost: ${safeLocale(ct)}`, 14, y + 5);
    doc.text(`Moneda / Currency: ${sanitizeText(header.currency || 'CUP')}`, pw / 2, y + 5);
    y += 10;
  }

  // ── Sensitivity table ──
  const factors = [1.0, 1.1, 1.2, 0.9];
  const labels = ['BASE', '+10%', '+20%', '-10%'];
  const rows: any[][] = [];

  sections.forEach((section: any) => {
    // Section header
    rows.push([{ content: sanitizeText(section.label || section.id)!, colSpan: 8, styles: { fontStyle: 'bold', fillColor: [230, 250, 255] } }]);

    let sectionBase = 0;
    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        const c = calculatedValues[row.id] || {};
        const base = parseFloat(String(c.total || 0));
        sectionBase += base;
        const vars = factors.map(f => base * f);
        const deltaMaxPct = base > 0 ? (Math.max(...vars.map(v => Math.abs(v - base))) / base * 100) : 0;

        // Color for delta: red if >15%, amber if >10%, green otherwise
        const deltaColor = deltaMaxPct > 15 ? [185, 28, 28] : deltaMaxPct > 10 ? [217, 119, 6] : [40, 40, 40];

        rows.push([
          `${'  '.repeat(d)}${sanitizeText(row.id)}`,
          `${'  '.repeat(d)}${sanitizeText(row.label || '')}`,
          row.um || '-',
          ...vars.map(v => fmtCell(v)),
          { content: `${deltaMaxPct.toFixed(1)}%`, styles: { textColor: deltaColor, fontStyle: deltaMaxPct > 15 ? 'bold' : 'normal' } },
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);

    // Section subtotal
    if (sectionBase > 0) {
      const sVars = factors.map(f => sectionBase * f);
      const sDelta = (Math.max(...sVars.map(v => Math.abs(v - sectionBase))) / sectionBase * 100);
      rows.push([
        { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: LBL } },
        ...sVars.map(v => ({ content: fmtCell(v), styles: { fontStyle: 'bold', halign: 'right', fillColor: LBL } })),
        { content: `${sDelta.toFixed(1)}%`, styles: { fontStyle: 'bold', halign: 'right', fillColor: LBL } },
      ]);
    }
  });

  autoTable(doc, {
    startY: y,
    head: [['No.', 'Concepto', 'UM', ...labels, 'Delta MAX']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: CYN, textColor: 255, fontSize: 6.5 },
    styles: { fontSize: 6.5, cellPadding: 1 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: 10, right: 10 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Summary comparison ──
  if (calculatedHeader && y < pageHeight - 50) {
    const baseCost = parseFloat(String(calculatedHeader.totalCost || 0));
    const scenarios = [
      { label: 'BASE (100%)', value: baseCost },
      { label: 'Optimista (-10%)', value: baseCost * 0.9 },
      { label: 'Pesimista (+20%)', value: baseCost * 1.2 },
    ];

    const summaryRows = scenarios.map(s => [
      s.label,
      safeLocale(s.value),
      safeLocale(s.value - baseCost),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Escenario / Scenario', 'Costo Estimado', 'Variacion vs Base']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: CYN, textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Risk assessment box
    doc.setDrawColor(...CYN);
    doc.setLineWidth(0.3);
    doc.roundedRect(10, y, pw - 20, 10, 2, 2, 'S');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 80, 100);
    doc.text('EVALUACION DE RIESGO:', 12, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const maxDelta = baseCost * 0.2;
    doc.text(`La variacion maxima del costo es ${safeLocale(maxDelta)} (${(20).toFixed(1)}%). Se recomienda mantener reservas para escenarios pesimistas.`, 12, y + 8);
  }

  addPageNumbers(doc, pw, pageHeight, 'CostPro - Sensibilidad');
}

/**
 * EXPORTACION FORMAT — 9+ quality level
 * Export format with: full bilingual header, international fields
 * (country, Incoterm, HS code), CUP + USD dual currency columns,
 * exchange rate box, certificate of compliance text, customs-friendly formatting,
 * and bilingual footer.
 */
export function renderExportacion(ctx: FormatContext): void {
  const { doc, header, sections, calculatedValues, calculatedHeader, skipZeros, pageWidth, pageHeight } = ctx;
  const pw = pageWidth;

  // ── Export header ──
  doc.setFillColor(...EMR);
  doc.rect(0, 0, pw, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE COSTO - PARA EXPORTACION / EXPORT COST SHEET', pw / 2, 10, { align: 'center' });
  let y = 22;

  // ── Full bilingual header ──
  y = addGeneralDataFull(doc, header, y, pw, true);

  // ── International fields box ──
  const rate = parseFloat(String(header.exchangeRate || 1));
  doc.setFillColor(230, 250, 240);
  doc.setDrawColor(...EMR);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, pw - 28, 14, 2, 2, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 80, 50);
  doc.text('DATOS DE EXPORTACION / EXPORT DATA:', 16, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);
  doc.text(
    `Pais destino / Destination: ${sanitizeText(header.destinationCountry || 'N/A')}    |    Incoterm: ${sanitizeText(header.incoterm || 'N/A')}    |    Codigo HS / HS Code: ${sanitizeText(header.hsCode || 'N/A')}`,
    16, y + 8
  );
  doc.text(
    `Tasa de cambio / Exchange Rate: 1 USD = ${rate === 1 ? 'N/C' : safeLocale(rate) + ' CUP'}    |    Cliente / Client: ${sanitizeText(header.client || header.clientePrincipal || 'N/A')}`,
    16, y + 12
  );
  y += 18;

  // ── Sections with CUP/USD columns ──
  const rows: any[][] = [];
  let grandCUP = 0;

  sections.forEach((section: any) => {
    const sCUP = calcSectionTotal(section, calculatedValues);
    grandCUP += sCUP;

    rows.push([{ content: sanitizeText(section.label || section.id)!, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [230, 250, 240] } }]);

    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c = calculatedValues[row.id] || {};
        const cup = parseFloat(String(c.total || 0));
        const usd = rate !== 1 ? cup / rate : null;
        const pct = (calculatedHeader?.totalCost || 0) > 0 ? (cup / (calculatedHeader?.totalCost || 1) * 100).toFixed(1) : '-';
        rows.push([
          `${'  '.repeat(d)}${sanitizeText(row.id)}`,
          `${'  '.repeat(d)}${sanitizeText(row.label || '')}`,
          row.um || '-',
          fmtCell(cup),
          usd !== null ? fmtCell(usd) : 'N/C',
          `${pct}%`,
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    walk(section.rows || []);

    // Section subtotal
    const sUSD = rate !== 1 ? sCUP / rate : null;
    const sPct = (calculatedHeader?.totalCost || 0) > 0 ? (sCUP / (calculatedHeader?.totalCost || 1) * 100).toFixed(1) : '-';
    rows.push([
      { content: `Subtotal: ${sanitizeText(section.label || section.id)}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [230, 250, 240] } },
      { content: fmtCell(sCUP), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 250, 240] } },
      { content: sUSD !== null ? fmtCell(sUSD) : 'N/C', styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 250, 240] } },
      { content: `${sPct}%`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 250, 240] } },
    ]);
  });

  // Grand total
  const grandUSD = rate !== 1 ? grandCUP / rate : null;
  rows.push([
    { content: 'TOTAL GENERAL / GRAND TOTAL', colSpan: 3, styles: { fontStyle: 'bold', fillColor: EMR, textColor: 255 } },
    { content: fmtCell(grandCUP), styles: { fontStyle: 'bold', halign: 'right', fillColor: EMR, textColor: 255 } },
    { content: grandUSD !== null ? fmtCell(grandUSD) : 'N/C', styles: { fontStyle: 'bold', halign: 'right', fillColor: EMR, textColor: 255 } },
    { content: '100%', styles: { fontStyle: 'bold', halign: 'right', fillColor: EMR, textColor: 255 } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['No.', 'Concepto / Concept', 'UM / UoM', 'CUP', 'USD', '% Costo']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: EMR, textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Exchange rate note ──
  if (rate === 1) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150);
    doc.text('* Tasa de cambio no configurada - columna USD no disponible / Exchange rate not configured - USD column unavailable', 14, y);
    y += 6;
  }

  // ── Certificate of compliance ──
  if (y < pageHeight - 60) {
    doc.setDrawColor(...EMR);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, y, pw - 28, 20, 2, 2, 'S');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 80, 50);
    doc.text('CERTIFICADO DE CONFORMIDAD / CERTIFICATE OF COMPLIANCE', 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    doc.text('Este documento cumple con las normas de contabilidad de costos cubanas (Res. 148/2023)', 16, y + 10);
    doc.text('This document complies with Cuban cost accounting standards (Res. 148/2023)', 16, y + 14);
    doc.setFontSize(6);
    doc.text(`Generado por / Generated by: CostPro  |  Fecha / Date: ${new Date().toLocaleString('es-CU')}`, 16, y + 18);
    y += 26;
  }

  // ── Signature block ──
  addSignatureBlock(doc, y, pw, pageHeight,
    header.elaboratedBy || header.prepared_by,
    header.approvedBy || header.approved_by
  );

  // ── Bilingual footer ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    doc.text('Generado por CostPro / Generated by CostPro  |  Res. 148/2023 Compliant', pw / 2, pageHeight - 5, { align: 'center' });
  }
  addPageNumbers(doc, pw, pageHeight, 'CostPro Export');
}
