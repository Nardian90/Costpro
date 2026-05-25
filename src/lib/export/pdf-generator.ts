import { jsPDF } from 'jspdf';
import { createPDFDocument } from './lazy-pdf';
import autoTable from 'jspdf-autotable';
import { sanitizeAnnexTitle } from "./pdf-generator-utils";
import { ExportOptions, PDFFormat, AnnexLayout } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';
import {
  FormatContext,
  PG, LBL,
  sanitizeText, fmtCell, safeLocale, shouldSkip, addAnnexTotalRow, calcSectionTotal,
  FORMAT_ANNEX_COLORS,
  isUtilidadSection, calcUtilidadPercent, getCostBase,
} from './pdf-shared';
import { renderRes148 } from './pdf-format-res148';
import { renderStandard, renderPro } from './pdf-format-standard';
import { renderEjecutivo, renderContabilidad, renderAuditoria, renderSimplificado } from './pdf-format-special';
import { renderBilingue, renderComparativo, renderExportacion } from './pdf-format-bilingual';

export async function generateCostSheetPDF(body: any): Promise<jsPDF> {
  const exportOptions = (body.options || body.exportOptions || {}) as ExportOptions;
  const pdfFormat = exportOptions.pdfFormat || 'standard';
  const skipZeros = exportOptions.skipZeros ?? true;
  const includeAudit = exportOptions.includeAudit ?? false;
  const showDateTime = exportOptions.showDateTime !== false;
  const includeUtilityNote = exportOptions.includeUtilityNote ?? true;
  const logo = exportOptions.logo;
  const includedAnnexIds = exportOptions.includeAnnexes;

  // ════════════════════════════════════════════════════════════════
  // COMPARISON MODE — keep untouched
  // ════════════════════════════════════════════════════════════════
  if (body.exportMode === 'comparison' && body.comparisonData) {
    const sheetData = body.data || body;
    const calculatedValues = body.calculatedValues || {};
    const calculatedHeader = body.calculatedHeader || null;
    const header = {
      ...(sheetData?.header || {}),
      ...(calculatedHeader || {}),
    };
    Object.keys(header).forEach((key: any) => {
      const val = header[key];
      if (typeof val === 'string' && val.startsWith('=')) {
        if (calculatedHeader && calculatedHeader[key] !== undefined) {
          header[key] = calculatedHeader[key];
        }
      }
    });
    const sections = sheetData?.sections || [];
    const doc = await createPDFDocument('l', 'mm', 'a4');
    const pw = doc.internal.pageSize.width;
    let y = 20;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(21, 128, 61);
    doc.text('COMPARACION DE FICHAS DE COSTO', pw / 2, y, { align: 'center' });
    y += 10;
    const compData = body.comparisonData;
    const rows: any[] = [];
    sections.forEach((section: any) => {
      rows.push([{ content: sanitizeText(section.label || section.id)!, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      const process = (rs: any[], d = 0) => {
        rs.forEach((r: any) => {
          if (shouldSkip(r, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[r.id] || {};
          const calcComp = compData.calculatedValues?.[r.id] || {};
          rows.push([
            ' '.repeat(d) + sanitizeText(r.id), ' '.repeat(d) + sanitizeText(r.label),
            r.um || '-', safeLocale(calc.total), safeLocale(calcComp.total || 0)
          ]);
          if (r.children) process(r.children, d + 1);
        });
      };
      process(section.rows || []);
    });
    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto', 'UM', 'Original', 'Comparado']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [21, 128, 61] },
      styles: { fontSize: 8 },
    });
    return doc;
  }

  // ════════════════════════════════════════════════════════════════
  // STANDARD BRANCH: all 10 formats
  // ════════════════════════════════════════════════════════════════
  const sheetData = body.data || body;
  const calculatedValues = body.calculatedValues || {};
  const calculatedHeader = body.calculatedHeader || null;
  const calculationResult = body.calculationResult || null;
  const annexes = sheetData?.annexes || [];

  const header = {
    ...(sheetData?.header || {}),
    ...(calculatedHeader || {}),
    ...(calculationResult?.metadata?.header || {})
  };

  // Resolve formulas in header fields
  Object.keys(header).forEach((key: any) => {
    const val = header[key];
    if (typeof val === 'string' && val.startsWith('=')) {
      if (calculatedHeader && calculatedHeader[key] !== undefined) {
        header[key] = calculatedHeader[key];
      }
    }
  });

  const sections = sheetData?.sections || [];
  const orientation = (pdfFormat === 'bilingue' || pdfFormat === 'comparativo') ? 'l' : 'p';
  const doc = await createPDFDocument(orientation, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Build shared context
  const ctx: FormatContext = {
    doc,
    body,
    header,
    sections,
    calculatedValues,
    calculatedHeader,
    calculationResult,
    annexes,
    exportOptions,
    pdfFormat,
    skipZeros,
    includeAudit,
    showDateTime,
    includeUtilityNote,
    logo,
    includedAnnexIds,
    pageWidth,
    pageHeight,
  };

  // ── Delegate to format modules ──
  // res148 and standard are fully self-contained (handle annexes, audit, footer, datetime)
  // and return early to avoid duplication with common sections below.
  if (pdfFormat === 'res148') {
    renderRes148(ctx);
    return doc;
  }

  if (pdfFormat === 'standard' || !pdfFormat) {
    renderStandard(ctx);
    return doc;
  }

  if (pdfFormat === 'pro') {
    renderPro(ctx);
  } else if (pdfFormat === 'ejecutivo') {
    renderEjecutivo(ctx);
  } else if (pdfFormat === 'contabilidad') {
    renderContabilidad(ctx);
  } else if (pdfFormat === 'auditoria') {
    renderAuditoria(ctx);
  } else if (pdfFormat === 'simplificado') {
    renderSimplificado(ctx);
  } else if (pdfFormat === 'bilingue') {
    renderBilingue(ctx);
  } else if (pdfFormat === 'comparativo') {
    renderComparativo(ctx);
  } else if (pdfFormat === 'exportacion') {
    renderExportacion(ctx);
  }

  // ════════════════════════════════════════════════════════════════
  // ANNEXES — Common for remaining formats (not simplificado/res148/standard)
  // (res148 and standard handle their own annexes and return early above)
  // ════════════════════════════════════════════════════════════════
  if (pdfFormat !== 'simplificado') {
    const annexLayout: AnnexLayout = exportOptions.annexLayout || 'together';
    const calcAnnexes = body.calculatedAnnexes || [];
    const calcAnnexMap = new Map<string, any>();
    calcAnnexes.forEach((ca: any) => calcAnnexMap.set(ca.id, ca));

    // Determine annex colors based on format — fallback to green (PG) for unknown formats
    const ac = FORMAT_ANNEX_COLORS[pdfFormat] || { headerText: PG, headFill: PG, headText: [255,255,255], totalFill: LBL };

    let isFirstAnnex = true;
    let annexY = 20;

    for (const annex of annexes) {
      if (includedAnnexIds && !includedAnnexIds.includes(annex.id)) continue;
      const calcAnnex = calcAnnexMap.get(annex.id);
      const annexData = calcAnnex?.data || annex.data || [];

      // FIX: Enhanced zero-check — also check all numeric properties
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
          const lastTableY = (doc as any).lastAutoTable?.finalY;
          // FIX: Guard against undefined finalY — don't fall back to 0
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

      // Annex header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ac.headerText);
      doc.text(sanitizeAnnexTitle(annex.id, sanitizeText(annex.title) || ''), 14, annexY, { maxWidth: pageWidth - 28 });
      annexY += 6;

      const columns = annex.columns || [];
      const colHeaders = columns.map((c: any) => sanitizeText(c.label || c.title || c.key) || '-');
      const tableData = annexData.map((r: any) =>
        columns.map((c: any) => {
          const v = r[c.key];
          if (v === undefined || v === null) return '-';
          return typeof v === 'number' ? fmtCell(v) : sanitizeText(String(v)) || '-';
        })
      );

      // Add TOTAL row at the bottom of each annex table
      addAnnexTotalRow(tableData, columns, annexData);

      autoTable(doc, {
        startY: annexY,
        head: [colHeaders],
        body: tableData,
        theme: pdfFormat === 'pro' ? 'grid' : 'striped',
        headStyles: { fillColor: ac.headFill, textColor: ac.headText, fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        margin: { left: 14, right: 14 },
        didParseCell(data) {
          // Style the TOTAL row as bold with format-matched background
          if (data.row.index === tableData.length - 1 && data.section === 'body') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = ac.totalFill;
          }
        },
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // UTILITY NOTE (not for simplificado — those handle their own)
  // ════════════════════════════════════════════════════════════════
  if (includeUtilityNote && pdfFormat !== 'simplificado') {
    // FIX: Costo total = Section 12 only (TOTAL COSTOS Y GASTOS)
    const ct = getCostBase(sections, calculatedValues, calculatedHeader);
    const pv = parseFloat(String(calculatedHeader?.salePrice || calculatedHeader?.precioVenta || header.sale_price || 0))
      || parseFloat(String(calculatedValues?.['14.1']?.total || calculatedValues?.['14']?.total || 0));
    // FIX: % Utilidad = 13.1 / 14.1 * 100 (rentabilidad sobre precio venta)
    const up = calcUtilidadPercent(calculatedValues, calculatedHeader);
    const lastY = (doc as any).lastAutoTable?.finalY;
    if (lastY != null && lastY > 0 && (ct > 0 || pv > 0)) {
      const noteY = Math.min(lastY + 8, pageHeight - 20);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60);
      doc.text(`Nota de Utilidad: ${up.toFixed(1)}%  |  Costo: ${safeLocale(ct)}  |  Precio Venta: ${safeLocale(pv)}`, 14, noteY);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // AUDIT PAGE
  // ════════════════════════════════════════════════════════════════
  if (includeAudit) {
    doc.addPage();
    let ay = 20;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PG);
    doc.text('TRAZABILIDAD - AUDITORIA', 14, ay);
    ay += 8;
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
        ['Formato PDF', pdfFormat],
        ['Omitir ceros', skipZeros ? 'Si' : 'No'],
        ['Anexos incluidos', includedAnnexIds ? includedAnnexIds.join(', ') || 'Ninguno' : 'Todos'],
      ],
      theme: 'grid',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // DATETIME FOOTER (for formats that don't handle their own)
  // ════════════════════════════════════════════════════════════════
  if (showDateTime) {
    const pageCount = doc.getNumberOfPages();
    const timestamp = new Date().toLocaleString('es-CU');
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140);
      let footerText = `${timestamp}  |  Pag. ${i}/${pageCount}  |  CostPro`;
      if (pdfFormat === 'bilingue') footerText = `${timestamp}  |  Pag. ${i}/${pageCount}  |  CostPro Export`;
      else if (pdfFormat === 'exportacion') footerText = `${timestamp}  |  Pag. ${i}/${pageCount}  |  Generado por CostPro`;
      else if (pdfFormat === 'comparativo') footerText = `${timestamp}  |  Pag. ${i}/${pageCount}  |  CostPro - Sensibilidad`;
      doc.text(footerText, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }
  }

  return doc;
}
