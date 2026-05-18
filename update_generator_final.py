import sys

content = r"""import { jsPDF } from 'jspdf';
import { createPDFDocument } from './lazy-pdf';
import autoTable from 'jspdf-autotable';
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

  const sections = sheetData?.sections || [];

  const orientation = (pdfFormat === 'bilingue' || pdfFormat === 'comparativo') ? 'l' : 'p';
  const doc = await createPDFDocument(orientation, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const primaryColor: [number, number, number] = [21, 128, 61];

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
      d.setTextColor(0, 0, 0);
      return 30;
    }
  };

  // --- 1 & 2. Standard & Pro ---
  if (pdfFormat === 'standard' || pdfFormat === 'pro') {
    let y = addHeader(doc, 'FICHA DE COSTO');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Producto: ${header.name || 'N/A'}`, 14, y);
    doc.text(`Código: ${header.code || 'N/A'}`, pageWidth / 2, y);
    y += 6;
    doc.text(`Cantidad: ${header.quantity || '1'} ${header.unit || ''}`, 14, y);
    y += 10;

    const tableRows: any[] = [];
    sections.forEach((section: any) => {
      tableRows.push([{
        content: section.label || section.id,
        colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: [240, 240, 240] }
      }]);
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
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.3);
    doc.rect(14, y, pageWidth - 28, 30);
    doc.setFontSize(7);
    doc.setTextColor(40);
    const metaFields = [
      ['OBJETO DE COSTING:', header.name || ''],
      ['CÓDIGO:', header.code || ''],
      ['CANTIDAD:', String(header.quantity || '')],
      ['UM:', header.unit || ''],
      ['FECHA:', header.date || new Date().toLocaleDateString('es-CU')],
      ['ELABORADO POR:', header.prepared_by || header.elaboratedBy || ''],
      ['APROBADO POR:', header.approved_by || header.approvedBy || ''],
    ];
    metaFields.forEach(([label, value], i) => {
      const col = i % 2 === 0 ? 16 : pageWidth / 2;
      const row = y + 6 + Math.floor(i / 2) * 6;
      doc.text(`${label} ${value}`, col, row);
    });
    y += 35;

    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    doc.text('Conforme Res. 148/2023 MINCIN — República de Cuba', 14, y);
    y += 4;

    const res148Rows: any[] = [];
    sections.forEach((section: any) => {
      res148Rows.push([{
        content: section.label || section.id,
        colSpan: 6,
        styles: { fontStyle: 'bold', fillColor: [230, 244, 255], textColor: [21, 68, 128] }
      }]);
      const processRows = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);
          res148Rows.push([
            `${indent}${row.id || ''}`,
            `${indent}${row.label || ''}`,
            row.um || row.unit || '-',
            safeLocale(calc.valorHistorico || 0),
            safeLocale(row.coefficient || row.coeficiente || 1),
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
      res148Rows.push([{ content: `COSTO TOTAL: ${safeLocale(cost)}`, colSpan: 6, styles: { fontStyle: 'bold', fillColor: primaryColor, textColor: 255 } }]);
      res148Rows.push([{ content: `UTILIDAD: ${safeLocale(price - cost)} | PRECIO DE VENTA: ${safeLocale(price)}`, colSpan: 6, styles: { fontStyle: 'bold' } }]);
    }

    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto', 'UM', 'V. Histórico', 'Coef.', 'Total']],
      body: res148Rows,
      theme: 'grid',
      headStyles: { fillColor: [21, 68, 128], textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.2 },
      margin: { left: 14, right: 14 },
    });
  }
  // --- 4. Ejecutivo ---
  else if (pdfFormat === 'ejecutivo') {
    addHeader(doc, "RESUMEN EJECUTIVO");
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
      doc.roundedRect(x, 35, boxW, 22, 3, 3, 'FD');
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(kpi.label, x + boxW / 2, 41, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(kpi.value, x + boxW / 2, 51, { align: 'center' });
    });

    let y = 70;
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
    addHeader(doc, 'FICHA DE COSTO — RESUMEN');
    const simpleRows: any[][] = [];
    let count = 0;
    for (const section of sections) {
      if (count >= 12) {
        simpleRows.push([{ content: `(+ ${sections.length - 12} secciones omitidas)`, colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150] } }]);
        break;
      }
      const parentRow = section.rows?.[0];
      if (!parentRow) continue;
      const calc = calculatedValues[parentRow.id] || {};
      const total = Number(calc.total || 0);
      if (skipZeros && total === 0) continue;
      const pct = (calculatedHeader?.totalCost || 0) > 0 ? (total / calculatedHeader.totalCost * 100).toFixed(1) : '0.0';
      simpleRows.push([section.label || section.id, safeLocale(total), `${pct}%`]);
      count++;
    }

    autoTable(doc, {
      startY: 40,
      head: [['Sección', 'Total', '% Costo']],
      body: simpleRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    if (calculatedHeader) {
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(`Costo Total: ${safeLocale(calculatedHeader.totalCost || 0)} | Precio: ${safeLocale(calculatedHeader.salePrice || 0)} | Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}%`, 14, Math.min(finalY, 280));
    }
    // Simplificado is 1 page only
    if (showDateTime) {
        doc.setFontSize(7);
        doc.setTextColor(150);
        const ts = new Date().toLocaleString('es-CU');
        doc.text(`${ts} | Pág. 1/1 | CostPro`, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }
    return doc;
  }
  // --- 6. Contabilidad ---
  else if (pdfFormat === 'contabilidad') {
    addHeader(doc, 'FICHA DE COSTO — CONTABILIDAD');
    const contRows: any[] = [];
    sections.forEach((section: any) => {
      contRows.push([{ content: section.label, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      const process = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);
          contRows.push([
            `${indent}${row.id}`,
            `${indent}${row.label || ''}`,
            row.accountCode || row.cuenta || '-',
            row.reference || '-',
            row.um || '-',
            safeLocale(calc.total || 0, 4)
          ]);
          if (row.children) process(row.children, depth + 1);
        });
      };
      process(section.rows || []);
      const secTotal = Number(calculatedValues[section.rows?.[0]?.id]?.total || 0);
      contRows.push([{ content: `Subtotal ${section.label}: ${safeLocale(secTotal, 4)}`, colSpan: 6, styles: { fontStyle: 'bold', halign: 'right', fillColor: [250, 250, 250] } }]);
    });

    autoTable(doc, {
      startY: 35,
      head: [['No.', 'Concepto', 'Cuenta', 'Ref.', 'UM', 'Total (4 dec)']],
      body: contRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 128, 128], textColor: 255, fontSize: 7 },
      styles: { fontSize: 7 },
      margin: { left: 14, right: 14 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Verificado por: _________________  Fecha: ___________", 14, Math.min(finalY + 10, pageHeight - 20));
  }
  // --- 7. Auditoría ---
  else if (pdfFormat === 'auditoria') {
    addHeader(doc, 'FICHA DE COSTO — INFORME DE AUDITORÍA');
    doc.setFontSize(8);
    doc.text(`Versión: ${header.version || '1.0'} | Elaborado por: ${header.prepared_by || 'N/A'} | Aprobado por: ${header.approved_by || 'N/A'}`, 14, 35);
    let currentY = 40;
    sections.forEach((section: any) => {
       const rows: any[] = [];
       const process = (rs: any[], d = 0) => {
         rs.forEach((r: any) => {
           if (shouldSkipRow(r, calculatedValues, skipZeros)) return;
           const calc = calculatedValues[r.id] || {};
           rows.push(['  '.repeat(d) + r.id, '  '.repeat(d) + (r.label || ''), r.um || '-', safeLocale(calc.total || 0)]);
           if (r.children) process(r.children, d + 1);
         });
       };
       process(section.rows || []);
       if (rows.length > 0) {
           autoTable(doc, {
             startY: currentY,
             head: [[section.label, 'Concepto', 'UM', 'Total']],
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

    // Watermark handled in the end loop
  }
  // --- 8. Bilingüe ---
  else if (pdfFormat === 'bilingue') {
    addHeader(doc, 'COST SHEET / FICHA DE COSTO');
    const biRows: any[] = [];
    sections.forEach((s: any) => {
      biRows.push([{ content: `${s.label} / ${translate(s.label)}`, colSpan: 10, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
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
      startY: 30,
      head: [['No.', 'Concepto (ES)', 'UM', 'VH', 'Total', 'No.', 'Concept (EN)', 'UoM', 'HV', 'Total']],
      body: biRows,
      theme: 'grid',
      headStyles: { fillColor: [75, 0, 130], fontSize: 6 },
      styles: { fontSize: 6 },
    });
  }
  // --- 9. Comparativo ---
  else if (pdfFormat === 'comparativo') {
    addHeader(doc, 'ANÁLISIS COMPARATIVO DE ESCENARIOS');
    const factors = [1.0, 1.1, 1.2, 0.9];
    const labels = ['BASE', '+10%', '+20%', '-10%'];
    const compRows: any[] = [];
    sections.forEach((s: any) => {
      compRows.push([{ content: s.label, colSpan: 8, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
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
      startY: 30,
      head: [['No.', 'Concepto', 'UM', ...labels, 'Δ MAX']],
      body: compRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 139, 139], fontSize: 7 },
      styles: { fontSize: 7 },
    });
  }
  // --- 10. Exportación ---
  else if (pdfFormat === 'exportacion') {
    addHeader(doc, 'PARA EXPORTACIÓN / FOR EXPORT');
    const rate = Number(header.exchangeRate || 1);
    doc.setFontSize(8);
    doc.text(`País: ${header.destinationCountry || 'N/A'} | Incoterm: ${header.incoterm || 'N/A'} | Tasa: 1 USD = ${rate} CUP`, 14, 35);
    const expRows: any[] = [];
    sections.forEach((s: any) => {
      expRows.push([{ content: s.label, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
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
      startY: 40,
      head: [['No.', 'Concepto', 'UM', 'CUP', 'USD', '% Costo']],
      body: expRows,
      theme: 'striped',
      headStyles: { fillColor: [0, 100, 0], fontSize: 8 },
      styles: { fontSize: 8 },
    });
  }

  // --- Common Annexes ---
  if (pdfFormat !== 'simplificado' && pdfFormat !== 'ejecutivo') {
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
      doc.text(`ANEXO ${annex.id}: ${annex.title}`, 14, 20);
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

  // --- End of Document Loops ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Watermark for Audit
    if (pdfFormat === 'auditoria') {
        doc.saveGraphicsState();
        doc.setTextColor(220, 220, 220);
        doc.setFontSize(60);
        doc.setFont('helvetica', 'bold');
        doc.text("CONFIDENCIAL", pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
        doc.restoreGraphicsState();
    }

    // Footer
    if (showDateTime) {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.setFont('helvetica', 'normal');
      const ts = new Date().toLocaleString('es-CU');
      doc.text(`${ts} | Pág. ${i}/${pageCount} | CostPro`, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }

    // Pro mode watermark
    if (pdfFormat === 'pro') {
        doc.setFontSize(8);
        doc.setTextColor(230, 230, 230);
        doc.text("Documento generado por CostPro", 14, pageHeight - 6);
    }
  }

  // Add utility note at the end of last page if requested
  if (includeUtilityNote && calculatedHeader && pdfFormat !== 'simplificado') {
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
"""

with open('src/lib/export/pdf-generator.ts', 'w') as f:
    f.write(content)
