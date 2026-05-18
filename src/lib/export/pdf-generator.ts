import { jsPDF } from 'jspdf';
import { createPDFDocument } from './lazy-pdf';
import autoTable from 'jspdf-autotable';
import { sanitizeAnnexTitle, isSectionHeaderRedundant, addGeneralData } from "./pdf-generator-utils";
import { ExportOptions, PDFFormat } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';

const TRANSLATIONS: Record<string, string> = {
  'Gasto Material': 'Material Expense',
  'Salario Directo': 'Direct Labor',
  'Energía': 'Energy',
  'Depreciación': 'Depreciation',
  'Gastos Generales': 'General Expenses',
  'Precio de Venta': 'Sale Price',
  'Utilidad': 'Profit',
  'Costo Total': 'Total Cost',
  'Valor Histórico': 'Historical Value',
  'Concepto': 'Concept',
  'Combustibles y lubricantes': 'Fuels and Lubricants',
  'Agua': 'Water',
  'Insumos': 'Inputs',
  'Otros gastos directos': 'Other Direct Costs',
  'Unidad de Medida': 'Unit of Measure',
  'Cantidad': 'Quantity',
  'Código': 'Code',
};

function translate(label: string): string {
  if (!label) return '';
  for (const [es, en] of Object.entries(TRANSLATIONS)) {
    if (label.toLowerCase().includes(es.toLowerCase())) return en;
  }
  return label;
}

function safeLocale(val: number | string | undefined, decimals = 2): string {
  if (val === undefined || val === null || val === '') return '0,00';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('es-CU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function shouldSkipRow(row: any, calculatedValues: Record<string, any>, skipZeros: boolean): boolean {
  if (!skipZeros) return false;
  const calc = calculatedValues[row.id] || {};
  const total = Number(calc.total ?? row.total ?? 0);
  const vh = Number(calc.valorHistorico ?? row.valorHistorico ?? 0);
  return total === 0 && vh === 0;
}

export async function generateCostSheetPDF(body: any): Promise<jsPDF> {
  const exportOptions = (body.options || body.exportOptions || {}) as ExportOptions;
  const pdfFormat = exportOptions.pdfFormat || 'standard';
  const skipZeros = exportOptions.skipZeros ?? true;
  const includeAudit = exportOptions.includeAudit ?? false;
  const showDateTime = exportOptions.showDateTime !== false;
  const includeUtilityNote = exportOptions.includeUtilityNote ?? true;
  const logo = exportOptions.logo;
  const includedAnnexIds = exportOptions.includeAnnexes;

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
  Object.keys(header).forEach(key => {
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
  const primaryColor: [number, number, number] = [21, 128, 61]; // #15803d

  const addHeader = (d: jsPDF, title: string, color: [number, number, number] = primaryColor) => {
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
      d.setFillColor(...color);
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
      d.setTextColor(...color);
      d.text(title, 14, 20);

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
  };

  // --- 1 & 2. Standard & Pro ---
  if (pdfFormat === 'standard' || pdfFormat === 'pro') {
    let y = addHeader(doc, 'FICHA DE COSTO');
    y = addGeneralData(doc, header, y, pageWidth);

    const tableRows: any[] = [];
    sections.forEach((section: any) => {
      if (!isSectionHeaderRedundant(section.label || section.id, section.rows)) {
        tableRows.push([{
          content: section.label || section.id,
          colSpan: 5,
          styles: { fontStyle: 'bold', fillColor: [240, 240, 240] }
        }]);
      }
      const processRows = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);
          tableRows.push([
            `${indent}${row.id || ''}`,
            `${indent}${row.label || ''}`,
            row.um || row.unit || '-',
            safeLocale(calc.valorHistorico || 0),
            safeLocale(calc.total || 0)
          ]);
          if (row.children) processRows(row.children, depth + 1);
        });
      };
      processRows(section.rows || []);
    });

    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto', 'UM', 'V. Histórico', 'Total']],
      body: tableRows,
      theme: pdfFormat === 'pro' ? 'grid' : 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
      alternateRowStyles: pdfFormat === 'pro' ? { fillColor: [245, 251, 246] } : {},
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }
  // --- 3. Res 148 ---
  else if (pdfFormat === 'res148') {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pageWidth / 2, 10, { align: 'center' });
    doc.setFontSize(7);
    doc.text('FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS', pageWidth / 2, 14, { align: 'center' });
    doc.text('(RES 148/2023)', pageWidth / 2, 18, { align: 'center' });

    let y = 22;
    doc.setFontSize(24);
    doc.text('FC', 25, y + 10, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(40);

    doc.text(`ORGANISMO: -`, 60, y + 5);
    doc.text(`UNION: -`, 60, y + 10);
    doc.text(`EMPRESA: -`, 60, y + 15);
    doc.text(`CODIGO EMPRESA: -`, 60, y + 20);

    const rightCol = pageWidth - 80;
    doc.text(`ID: ${header.id || '-'}`, rightCol, y + 5);
    doc.text(`COD. PROD: ${header.code || '-'}`, rightCol, y + 10);
    doc.text(`PRODUCTO: ${header.name || '-'}`, rightCol, y + 15);
    doc.text(`UM: ${header.unit || '-'}`, rightCol, y + 20);

    y += 25;
    doc.text(`Cantidad: ${header.quantity || '1'}`, rightCol, y + 5);
    doc.setFillColor(240, 240, 240);
    doc.rect(rightCol, y + 7, 60, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(`PRECIO:`, rightCol + 2, y + 11.5);
    doc.text(`${safeLocale(header.salePrice || 0)}`, rightCol + 58, y + 11.5, { align: 'right' });

    y += 15;

    const res148Rows: any[] = [];
    sections.forEach((section: any) => {
      if (!isSectionHeaderRedundant(section.label || section.id, section.rows)) {
        res148Rows.push([{
          content: section.label || section.id,
          colSpan: 5,
          styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] }
        }]);
      }
      const processRows = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);
          res148Rows.push([
            `${indent}${row.label || ''}`,
            row.id || '',
            row.um || row.unit || '-',
            safeLocale(row.coefficient || row.coeficiente || 1, 4),
            safeLocale(calc.total || 0),
          ]);
          if (row.children) processRows(row.children, depth + 1);
        });
      };
      processRows(section.rows || []);
    });

    if (calculatedHeader) {
      const cost = calculatedHeader.totalCost || 0;
      const price = calculatedHeader.salePrice || 0;
      res148Rows.push([{ content: `COSTO TOTAL UNITARIO:`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: safeLocale(cost), styles: { fontStyle: 'bold' } }]);
      res148Rows.push([{ content: `PRECIO TOTAL:`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: safeLocale(price), styles: { fontStyle: 'bold' } }]);
      res148Rows.push([{ content: `UTILIDAD (%):`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: safeLocale(calculatedHeader.utilityPercent || 0, 4), styles: { fontStyle: 'bold' } }]);
    }

    autoTable(doc, {
      startY: y,
      head: [['CONCEPTOS DE GASTOS', 'FILA', 'UM', 'INDICE', 'TOTAL']],
      body: res148Rows,
      theme: 'grid',
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', lineWidth: 0.1 },
      styles: { fontSize: 7, cellPadding: 1.2, textColor: [0, 0, 0] },
      margin: { left: 14, right: 14 },
    });
  }
  // --- 4. Ejecutivo ---
  else if (pdfFormat === 'ejecutivo') {
    let y = addHeader(doc, "RESUMEN EJECUTIVO");
    y = addGeneralData(doc, header, y, pageWidth);
    const kpis = [
      { label: 'Costo Total', value: safeLocale(calculatedHeader?.totalCost || 0) },
      { label: 'Precio Venta', value: safeLocale(calculatedHeader?.salePrice || 0) },
      { label: 'Utilidad %', value: `${safeLocale(calculatedHeader?.utilityPercent || 0)}%` },
      { label: 'Margen', value: safeLocale((calculatedHeader?.salePrice || 0) - (calculatedHeader?.totalCost || 0)) },
    ];
    const boxW = (pageWidth - 28 - 9) / 4;
    kpis.forEach((kpi, i) => {
      const x = 14 + i * (boxW + 3);
      doc.setDrawColor(...primaryColor);
      doc.setFillColor(245, 251, 246);
      doc.roundedRect(x, y + 5, boxW, 22, 3, 3, 'FD');
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(kpi.label, x + boxW / 2, y + 11, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(kpi.value, x + boxW / 2, y + 21, { align: 'center' });
    });

    y = y + 40;
    doc.setFontSize(12);
    doc.setTextColor(60);
    doc.text('Estructura de Costos', 14, y);
    y += 10;

    const sortedSections = [...sections].sort((a, b) => {
      const totalA = Number(calculatedValues[a.rows?.[0]?.id]?.total || 0);
      const totalB = Number(calculatedValues[b.rows?.[0]?.id]?.total || 0);
      return totalB - totalA;
    }).slice(0, 5);

    sortedSections.forEach((s: any) => {
      const total = Number(calculatedValues[s.rows?.[0]?.id]?.total || 0);
      const pct = (calculatedHeader?.totalCost || 0) > 0 ? (total / calculatedHeader.totalCost) : 0;
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(s.label || s.id, 14, y);
      doc.setFillColor(240, 240, 240);
      doc.rect(60, y - 4, 100, 5, 'F');
      doc.setFillColor(...primaryColor);
      doc.rect(60, y - 4, pct * 100, 5, 'F');
      doc.text(`${(pct * 100).toFixed(1)}%`, 165, y);
      y += 10;
    });
  }
  // --- 5. Simplificado ---
  else if (pdfFormat === 'simplificado') {
    let y = addHeader(doc, 'FICHA RESUMIDA');
    y = addGeneralData(doc, header, y, pageWidth);
    const rows = sections.map(s => {
      const total = Number(calculatedValues[s.rows?.[0]?.id]?.total || 0);
      const pct = (calculatedHeader?.totalCost || 0) > 0 ? (total / calculatedHeader.totalCost * 100).toFixed(1) : '0.0';
      return [s.label, safeLocale(total), `${pct}%` ];
    });
    autoTable(doc, {
      startY: y + 5,
      head: [['Sección', 'Total', '% Costo']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor },
    });
  }
  // --- 6. Contabilidad ---
  else if (pdfFormat === 'contabilidad') {
    let y = addHeader(doc, 'FICHA DE COSTO — CONTABILIDAD');
    y = addGeneralData(doc, header, y, pageWidth);
    const contRows: any[] = [];
    sections.forEach((section: any) => {
      if (!isSectionHeaderRedundant(section.label || section.id, section.rows)) {
        contRows.push([{ content: section.label, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      }
      const process = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          contRows.push([
            ' '.repeat(depth) + row.id,
            ' '.repeat(depth) + row.label,
            row.um || '-',
            safeLocale(calc.valorHistorico || 0),
            safeLocale(calc.total || 0),
            '' // Para firmas o notas
          ]);
          if (row.children) process(row.children, depth + 1);
        });
      };
      process(section.rows || []);
    });
    autoTable(doc, {
      startY: y + 5,
      head: [['Cuenta/Fila', 'Descripción', 'UM', 'V. Histórico', 'Importe', 'Anotaciones']],
      body: contRows,
      theme: 'grid',
      headStyles: { fillColor: [50, 50, 50], fontSize: 8 },
      styles: { fontSize: 7 },
    });
  }
  // --- 7. Auditoría ---
  else if (pdfFormat === 'auditoria') {
    let y = addHeader(doc, 'FICHA DE COSTO — INFORME DE AUDITORÍA');
    y = addGeneralData(doc, header, y, pageWidth);
    doc.setFontSize(8);
    doc.text(`Versión: ${header.version || '1.0'} | Elaborado por: ${header.prepared_by || 'N/A'} | Aprobado por: ${header.approved_by || 'N/A'}`, 14, y);
    y += 10;
    let currentY = y;
    sections.forEach((section: any) => {
       const rows: any[] = [];
       const process = (rs: any[], d = 0) => {
         rs.forEach((r: any) => {
           if (shouldSkipRow(r, calculatedValues, skipZeros)) return;
           const calc = calculatedValues[r.id] || {};
           rows.push([' '.repeat(d) + r.id, r.label, r.um || '-', safeLocale(calc.total)]);
           if (r.children) process(r.children, d + 1);
         });
       };
       process(section.rows || []);
       if (rows.length > 0) {
           autoTable(doc, {
             startY: currentY,
             head: [[isSectionHeaderRedundant(section.label || section.id, section.rows) ? 'Detalle de Conceptos' : section.label, 'Concepto', 'UM', 'Total']],
             body: rows,
             theme: 'grid',
             headStyles: { fillColor: [255, 165, 0], textColor: 0 },
             styles: { fontSize: 7 },
           });
           currentY = (doc as any).lastAutoTable.finalY + 5;
           if (currentY > pageHeight - 40) { doc.addPage(); currentY = 20; }
           doc.setDrawColor(200);
           doc.rect(14, currentY, pageWidth - 28, 15);
           doc.setFontSize(6);
           doc.text("Observaciones:", 16, currentY + 4);
           currentY += 20;
       }
    });
    doc.addPage();
    doc.setFontSize(12);
    doc.text("Checklist de Cumplimiento Res. 148/2023", 14, 20);
    const checklist = [
      ['Regla', 'Cumple', 'No Cumple', 'N/A'],
      ['Cálculo de materias primas', '[ X ]', '[   ]', '[   ]'],
      ['Desglose de salario directo', '[ X ]', '[   ]', '[   ]'],
      ['Aplicación de coeficientes', '[ X ]', '[   ]', '[   ]'],
      ['Límite de utilidad', '[ X ]', '[   ]', '[   ]'],
    ];
    autoTable(doc, { startY: 25, body: checklist.slice(1), head: [checklist[0]], theme: 'grid' });
  }
  // --- 8. Bilingüe ---
  else if (pdfFormat === 'bilingue') {
    let y = addHeader(doc, 'COST SHEET / FICHA DE COSTO');
    y = addGeneralData(doc, header, y, pageWidth, true);
    const biRows: any[] = [];
    sections.forEach((s: any) => {
      if (!isSectionHeaderRedundant(s.label || s.id, s.rows)) {
        biRows.push([{ content: `${s.label} / ${translate(s.label)}`, colSpan: 10, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      }
      const process = (rs: any[], d = 0) => {
        rs.forEach((r: any) => {
          if (shouldSkipRow(r, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[r.id] || {};
          const ind = ' '.repeat(d);
          biRows.push([
            ind + r.id, ind + r.label, r.um, safeLocale(calc.valorHistorico), safeLocale(calc.total),
            ind + r.id, ind + translate(r.label), translate(r.um), safeLocale(calc.valorHistorico), safeLocale(calc.total)
          ]);
          if (r.children) process(r.children, d + 1);
        });
      };
      process(s.rows || []);
    });
    autoTable(doc, {
      startY: y + 5,
      head: [['No.', 'Concepto (ES)', 'UM', 'VH', 'Total', 'No.', 'Concept (EN)', 'UoM', 'HV', 'Total']],
      body: biRows,
      theme: 'grid',
      headStyles: { fillColor: [75, 0, 130], fontSize: 6 },
      styles: { fontSize: 6 },
    });
  }
  // --- 9. Comparativo ---
  else if (pdfFormat === 'comparativo') {
    let y = addHeader(doc, 'ANÁLISIS COMPARATIVO DE ESCENARIOS');
    y = addGeneralData(doc, header, y, pageWidth);
    const factors = [1.0, 1.1, 1.2, 0.9];
    const labels = ['BASE', '+10%', '+20%', '-10%'];
    const compRows: any[] = [];
    sections.forEach((s: any) => {
      if (!isSectionHeaderRedundant(s.label || s.id, s.rows)) {
        compRows.push([{ content: s.label, colSpan: 8, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      }
      const process = (rs: any[], d = 0) => {
        rs.forEach((r: any) => {
          const calc = calculatedValues[r.id] || {};
          const base = Number(calc.total || 0);
          const ind = ' '.repeat(d);
          const vars = factors.map(f => base * f);
          const deltaMax = Math.max(...vars.map(v => Math.abs(v - base)));
          const deltaPct = base > 0 ? (deltaMax / base * 100) : 0;
          compRows.push([
            ind + r.id, ind + r.label, r.um || '-',
            ...vars.map(v => safeLocale(v)),
            { content: `${deltaPct.toFixed(1)}%`, styles: deltaPct > 15 ? { textColor: [185, 28, 28] } : {} }
          ]);
          if (r.children) process(r.children, d + 1);
        });
      };
      process(s.rows || []);
    });
    autoTable(doc, {
      startY: y + 5,
      head: [['No.', 'Concepto', 'UM', ...labels, 'Δ MAX']],
      body: compRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 139, 139], fontSize: 7 },
      styles: { fontSize: 7 },
    });
  }
  // --- 10. Exportación ---
  else if (pdfFormat === 'exportacion') {
    let y = addHeader(doc, 'PARA EXPORTACIÓN / FOR EXPORT');
    y = addGeneralData(doc, header, y, pageWidth, true);
    const rate = Number(header.exchangeRate || 1);
    doc.setFontSize(8);
    doc.text(`País: ${header.destinationCountry || 'N/A'} | Incoterm: ${header.incoterm || 'N/A'} | Tasa: 1 USD = ${rate} CUP`, 14, y);
    y += 10;
    const expRows: any[] = [];
    sections.forEach((s: any) => {
      if (!isSectionHeaderRedundant(s.label || s.id, s.rows)) {
        expRows.push([{ content: s.label, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      }
      const process = (rs: any[], d = 0) => {
        rs.forEach((r: any) => {
          if (shouldSkipRow(r, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[r.id] || {};
          const totalCUP = Number(calc.total || 0);
          const totalUSD = totalCUP / rate;
          const pct = (calculatedHeader?.totalCost || 0) > 0 ? (totalCUP / calculatedHeader.totalCost * 100).toFixed(1) : '0.0';
          expRows.push([' '.repeat(d) + r.id, ' '.repeat(d) + r.label, r.um, safeLocale(totalCUP), safeLocale(totalUSD), `${pct}%`]);
          if (r.children) process(r.children, d + 1);
        });
      };
      process(s.rows || []);
    });
    autoTable(doc, {
      startY: y + 5,
      head: [['No.', 'Concepto', 'UM', 'CUP', 'USD', '% Costo']],
      body: expRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 100, 0], fontSize: 8 },
      styles: { fontSize: 8 },
    });
  }

  // --- Common Annexes ---
  if ((pdfFormat as any) !== 'simplificado' && pdfFormat !== 'ejecutivo') {
    const calcAnnexes = body.calculatedAnnexes || [];
    const calcAnnexMap = new Map();
    calcAnnexes.forEach((ca: any) => calcAnnexMap.set(ca.id, ca));

    for (const annex of annexes) {
      if (includedAnnexIds && !includedAnnexIds.includes(annex.id)) continue;
      const calcAnnex = calcAnnexMap.get(annex.id);
      const annexData = calcAnnex?.data || annex.data || [];
      if (skipZeros && annexData.every((r: any) => Number(r.total || r.amount || r.importe || 0) === 0)) continue;

      doc.addPage();
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(sanitizeAnnexTitle(annex.id, annex.title), 14, 20, { maxWidth: pageWidth - 28 });
      const columns = annex.columns || [];
      const colHeaders = columns.map((c: any) => c.label || c.title || c.key);
      const rows = annexData.map((r: any) => columns.map((c: any) => {
        const val = r[c.key];
        return typeof val === 'number' ? safeLocale(val) : String(val ?? '');
      }));
      autoTable(doc, {
        startY: 25,
        head: [colHeaders],
        body: rows,
        theme: pdfFormat === 'pro' ? 'grid' : 'striped',
        headStyles: { fillColor: primaryColor, fontSize: 8 },
        styles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });
    }
  }

  // --- Audit Page ---
  if (includeAudit) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('TRAZABILIDAD — AUDITORÍA', 14, 20);
    const auditData = [
      ['Campo', 'Valor'],
      ['Producto', header.name || 'N/A'],
      ['Código', header.code || 'N/A'],
      ['Elaborado por', header.prepared_by || header.elaboratedBy || 'N/A'],
      ['Aprobado por', header.approved_by || header.approvedBy || 'N/A'],
      ['Fecha elaboración', header.date || new Date().toLocaleDateString('es-CU')],
      ['Fecha exportación', new Date().toLocaleString('es-CU')],
      ['Formato PDF', pdfFormat],
      ['Omitir ceros', skipZeros ? 'Sí' : 'No'],
    ];
    autoTable(doc, {
      startY: 25,
      head: [auditData[0]],
      body: auditData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: primaryColor },
      margin: { left: 14, right: 14 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (pdfFormat === 'auditoria') {
        doc.saveGraphicsState();
        doc.setTextColor(220, 220, 220);
        doc.setFontSize(60);
        doc.setFont('helvetica', 'bold');
        doc.text("CONFIDENCIAL", pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
        doc.restoreGraphicsState();
    }
    if (showDateTime) {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.setFont('helvetica', 'normal');
      const ts = new Date().toLocaleString('es-CU');
      const dateOnly = new Date().toLocaleDateString('es-CU');
      let footerText = `${ts} | Pág. ${i}/${pageCount} | CostPro`;
      if (pdfFormat === 'bilingue') footerText = `${ts} | Pág. ${i}/${pageCount} | CostPro Export / Exportación CostPro`;
      else if (pdfFormat === 'exportacion') footerText = `${ts} | Pág. ${i}/${pageCount} | Generado por CostPro / Generated by CostPro`;
      else if (pdfFormat === 'res148') footerText = `Conforme Res. 148/2023 | Fecha: ${dateOnly} | Pág. ${i}/${pageCount}`;
      doc.text(footerText, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }
    if (pdfFormat === 'pro') {
        doc.setFontSize(8);
        doc.setTextColor(230, 230, 230);
        doc.text("Documento generado por CostPro", 14, pageHeight - 6);
    }
  }

  if (includeUtilityNote && calculatedHeader && (pdfFormat as any) !== 'simplificado') {
    doc.setPage(pageCount);
    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    const price = calculatedHeader.salePrice || 0;
    const cost = calculatedHeader.totalCost || 0;
    doc.text(`Nota de Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}% | Precio Venta: ${safeLocale(price)} | Margen: ${safeLocale(price - cost)}`, 14, Math.min(finalY + 15, pageHeight - 15));
  }

  return doc;
}
