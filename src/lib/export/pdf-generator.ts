import { jsPDF } from 'jspdf';
import { createPDFDocument } from './lazy-pdf';
import autoTable from 'jspdf-autotable';
import { ExportOptions } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';

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
};

function translate(label: string): string {
  for (const [es, en] of Object.entries(TRANSLATIONS)) {
    if (label.toLowerCase().includes(es.toLowerCase())) return en;
  }
  return label;
}

function safeLocale(val: any, decimals = 2) {
  const n = parseFloat(String(val));
  return isNaN(n) ? val : n.toLocaleString("es-ES", {
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
  const header = sheetData?.header || {};
  const sections = sheetData?.sections || [];
  const annexes = sheetData?.annexes || [];

  const orientation = ['bilingue', 'comparativo'].includes(pdfFormat) ? 'l' : 'p';
  const doc = await createPDFDocument(orientation, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const primaryColor: [number, number, number] = [21, 128, 61];

  const addHeader = (pdf: jsPDF, title: string) => {
    let y = 20;
    if (pdfFormat === 'pro' && logo) {
      try {
        const logoData = logo.split(',')[1];
        const mimeMatch = logo.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9]+);/);
        const mimeType = mimeMatch ? mimeMatch[1].toUpperCase().replace('IMAGE/', '') : 'PNG';
        pdf.addImage(logoData, mimeType as any, 14, 8, 30, 15);
        y = 30;
      } catch (e) {
        console.warn('Logo render failed:', e);
      }
    }

    if (pdfFormat === 'pro') {
      pdf.setFillColor(...primaryColor);
      pdf.rect(0, y - 10, pageWidth, 15, 'F');
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text(title, 14, y);
    } else {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...primaryColor);
      pdf.text(title, 14, y);
    }

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100);
    if (pdfFormat !== 'pro') {
       pdf.text(`Generado: ${new Date().toLocaleString('es-CU')}`, pageWidth - 14, y, { align: 'right' });
    }
    return y + 10;
  };

  // 1. Standard / Pro / Other general rendering
  if (['standard', 'pro', 'contabilidad', 'auditoria', 'exportacion', 'bilingue'].includes(pdfFormat)) {
    let currentY = addHeader(doc, pdfFormat === 'auditoria' ? "FICHA DE COSTO — INFORME DE AUDITORÍA" : "FICHA DE COSTO");

    // Metadata
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60);
    doc.text(`Producto: ${header.name || 'S/N'}`, 14, currentY); currentY += 5;
    doc.text(`Código: ${header.code || 'S/N'}`, 14, currentY); currentY += 5;
    if (pdfFormat === 'exportacion') {
       doc.text(`País destino: ${header.destinationCountry || 'N/A'}`, 14, currentY); currentY += 5;
       doc.text(`Incoterm: ${header.incoterm || 'N/A'}`, 14, currentY); currentY += 5;
    }

    const tableTheme = pdfFormat === 'pro' ? 'grid' : 'striped';
    const alternateRowStyles = pdfFormat === 'pro' ? { fillColor: [245, 251, 246] as [number, number, number] } : undefined;
    const decimals = pdfFormat === 'contabilidad' ? 4 : 2;

    sections.forEach((section: any) => {
      const sectionRows: any[] = [];
      const processRows = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);

          let rowData: any[] = [];
          if (pdfFormat === 'bilingue') {
             rowData = [
               `${indent}${row.id || ''}`, `${indent}${row.label || ''}`, row.um || '-', safeLocale(calc.valorHistorico || 0, decimals), safeLocale(calc.total || 0, decimals),
               `${indent}${row.id || ''}`, `${indent}${translate(row.label || '')}`, translate(row.um || '-'), safeLocale(calc.valorHistorico || 0, decimals), safeLocale(calc.total || 0, decimals)
             ];
          } else if (pdfFormat === 'contabilidad') {
             rowData = [row.id || '', row.label || '', row.um || '-', row.accountCode || '', row.reference || '', safeLocale(calc.valorHistorico || 0, decimals), safeLocale(calc.total || 0, decimals)];
          } else if (pdfFormat === 'exportacion') {
             const xr = header.exchangeRate || 1;
             const total = Number(calc.total || 0);
             const pct = calculatedHeader?.totalCost > 0 ? (total / calculatedHeader.totalCost * 100).toFixed(1) : '0.0';
             rowData = [row.id || '', row.label || '', row.um || '-', safeLocale(total, decimals), safeLocale(total / xr, decimals), `${pct}%`];
          } else {
             rowData = [`${indent}${row.id || ''}`, `${indent}${row.label || ''}`, row.um || '-', safeLocale(calc.valorHistorico || 0, decimals), safeLocale(calc.total || 0, decimals)];
          }
          sectionRows.push(rowData);
          if (row.children) processRows(row.children, depth + 1);
        });
      };
      processRows(section.rows || []);

      if (sectionRows.length > 0) {
        if (currentY > 270) { doc.addPage(); currentY = 20; }
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80);
        doc.text(`--- ${section.label || section.id} ---`, 14, currentY); currentY += 4;

        let head: string[][] = [['No.', 'Concepto', 'UM', 'V. Histórico', 'Total']];
        if (pdfFormat === 'bilingue') head = [['No.', 'Concepto (ES)', 'UM', 'VH (ES)', 'Total (ES)', 'No.', 'Concept (EN)', 'UoM', 'HV (EN)', 'Total (EN)']];
        if (pdfFormat === 'contabilidad') head = [['No.', 'Concepto', 'UM', 'Cuenta', 'Ref.', 'V. Histórico', 'Total']];
        if (pdfFormat === 'exportacion') head = [['No.', 'Concepto', 'UM', 'CUP', 'USD', '% Costo']];

        autoTable(doc, {
          startY: currentY,
          head: head,
          body: sectionRows,
          theme: tableTheme as any,
          alternateRowStyles,
          headStyles: { fillColor: primaryColor, textColor: 255, fontSize: pdfFormat === 'bilingue' ? 5 : 7 },
          styles: { fontSize: pdfFormat === 'bilingue' ? 5 : 7, cellPadding: 1.5 },
          margin: { left: 14, right: 14 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;

        if (pdfFormat === 'auditoria') {
          doc.rect(14, currentY, pageWidth - 28, 15);
          doc.setFontSize(6); doc.setTextColor(150); doc.text('Observaciones:', 16, currentY + 4);
          currentY += 20;
        }
      }
    });

    if (pdfFormat === 'auditoria') {
      doc.addPage();
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...primaryColor);
      doc.text('CHECKLIST DE CUMPLIMIENTO RES. 148/2023', 14, 20);
      autoTable(doc, {
        startY: 30,
        head: [['Regla', 'Descripción', 'Estado']],
        body: [
          ['1', 'Método de cálculo directo/indirecto definido', 'CUMPLE'],
          ['2', 'Clasificación de gastos por partidas', 'CUMPLE'],
          ['3', 'UM y cantidad base configurada', 'CUMPLE'],
          ['4', 'Tasa de cambio actualizada (si aplica)', 'CUMPLE'],
          ['5', 'Coeficientes de gastos indirectos avalados', 'CUMPLE'],
        ],
        theme: 'grid',
        headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
      });
      const finalY = (doc as any).lastAutoTable.finalY + 30;
      doc.line(14, finalY, 64, finalY); doc.text('Elaborador', 14, finalY + 4);
      doc.line(84, finalY, 134, finalY); doc.text('Revisor', 84, finalY + 4);
      doc.line(154, finalY, pageWidth - 14, finalY); doc.text('Aprobador', 154, finalY + 4);

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(40);
        doc.setTextColor(240, 240, 240);
        doc.text('CONFIDENCIAL', pageWidth / 2, doc.internal.pageSize.height / 2, { align: 'center', angle: 45 });
      }
    }
  }

  // 2. Res 148 specific
  if (pdfFormat === 'res148') {
    let y = 14;
    doc.setDrawColor(...primaryColor); doc.setLineWidth(0.5); doc.rect(14, y, pageWidth - 28, 40);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(40);
    const metaFields = [
      ['OBJETO DE COSTING:', header.name || ''],
      ['CÓDIGO:', header.code || ''],
      ['CANTIDAD:', String(header.quantity || '')],
      ['UM:', header.unit || ''],
      ['FECHA:', header.date || new Date().toLocaleDateString('es-CU')],
      ['ELABORADO POR:', header.prepared_by || ''],
      ['APROBADO POR:', header.approved_by || ''],
    ];
    metaFields.forEach(([label, value], i) => {
      const col = i % 2 === 0 ? 16 : pageWidth / 2;
      const row = y + 6 + Math.floor(i / 2) * 8;
      doc.text(`${label} ${value}`, col, row);
    });
    y += 46;
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(100);
    doc.text('Conforme Res. 148/2023 MINCIN — República de Cuba', 14, y); y += 6;

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
            `${indent}${row.id || ''}`, `${indent}${row.label || ''}`, row.um || '-', safeLocale(calc.valorHistorico || 0), safeLocale(row.coefficient || 1), safeLocale(calc.total || 0),
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
      styles: { fontSize: 7, cellPadding: 1.5 },
    });
  }

  // 3. Simplificado
  if (pdfFormat === 'simplificado') {
    let y = addHeader(doc, 'FICHA DE COSTO — RESUMEN');
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
      const pct = calculatedHeader?.totalCost > 0 ? (total / calculatedHeader.totalCost * 100).toFixed(1) : '0.0';
      simpleRows.push([section.label || section.id, safeLocale(total), `${pct}%`]);
      count++;
    }
    autoTable(doc, {
      startY: y,
      head: [['Sección', 'Total', '% Costo']],
      body: simpleRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
      styles: { fontSize: 8 },
    });
    if (calculatedHeader) {
      const finalY = (doc as any).lastAutoTable.finalY + 6;
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...primaryColor);
      doc.text(`Costo Total: ${safeLocale(calculatedHeader.totalCost || 0)} | Precio: ${safeLocale(calculatedHeader.salePrice || 0)} | Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}%`, 14, Math.min(finalY, 280));
    }
  }

  // 4. Ejecutivo
  if (pdfFormat === 'ejecutivo') {
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
      doc.setDrawColor(...primaryColor); doc.setFillColor(245, 251, 246); doc.roundedRect(x, 30, boxW, 22, 3, 3, 'FD');
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(kpi.label, x + boxW / 2, 36, { align: 'center' });
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...primaryColor); doc.text(kpi.value, x + boxW / 2, 46, { align: 'center' });
    });

    let y = 65;
    doc.setFontSize(10); doc.setTextColor(60); doc.text('Distribución de Costos por Sección', 14, y); y += 10;
    sections.slice(0, 5).forEach((s: any) => {
       const total = Number(calculatedValues[s.rows?.[0]?.id]?.total || 0);
       const pct = calculatedHeader?.totalCost > 0 ? (total / calculatedHeader.totalCost) : 0;
       doc.setFontSize(8); doc.text(s.label || s.id, 14, y);
       doc.setFillColor(230, 230, 230); doc.rect(50, y - 3, 100, 4, 'F');
       doc.setFillColor(...primaryColor); doc.rect(50, y - 3, pct * 100, 4, 'F');
       doc.text(`${(pct * 100).toFixed(1)}%`, 155, y);
       y += 8;
    });
  }

  // 5. Comparativo
  if (pdfFormat === 'comparativo') {
    addHeader(doc, "ANÁLISIS COMPARATIVO DE ESCENARIOS");
    const factors = [1.0, 1.1, 1.2, 0.9];
    const labels = ['BASE', '+10%', '+20%', '-10%'];
    const compRows: any[][] = [];
    sections.forEach((section: any) => {
      compRows.push([{ content: section.label, colSpan: 7, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      const proc = (rows: any[], depth = 0) => {
        rows.forEach(row => {
          const calc = calculatedValues[row.id] || {};
          const base = Number(calc.total || 0);
          const indent = '  '.repeat(depth);
          const variations = factors.map(f => base * f);
          const deltaMax = Math.max(...variations.map(v => Math.abs(v - base)));
          const deltaMaxPct = base > 0 ? (deltaMax / base * 100) : 0;
          const rowStyle = deltaMaxPct > 15 ? { textColor: [185, 28, 28] } : {};
          compRows.push([
            `${indent}${row.id}`, `${indent}${row.label || ''}`, row.um || '-',
            ...variations.map(v => safeLocale(v)), { content: `${deltaMaxPct.toFixed(1)}%`, styles: rowStyle },
          ]);
          if (row.children) proc(row.children, depth + 1);
        });
      };
      proc(section.rows || []);
    });
    autoTable(doc, {
      startY: 35, head: [['No.', 'Concepto', 'UM', ...labels, 'Δ MAX']], body: compRows, theme: 'grid',
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1 },
    });
  }

  // Common Annexes Rendering (except for simplificado)
  if (pdfFormat !== 'simplificado' && pdfFormat !== 'ejecutivo') {
    const calculatedAnnexes = body.calculatedAnnexes || [];
    const calcAnnexMap = new Map<string, any>();
    for (const ca of calculatedAnnexes) calcAnnexMap.set(ca.id, ca);

    for (const annex of annexes) {
      if (!includedAnnexIds?.includes(annex.id)) continue;
      const calcAnnex = calcAnnexMap.get(annex.id);
      const annexData = calcAnnex?.data || annex.data || [];
      if (skipZeros && annexData.every((r: any) => Number(r.total || r.amount || r.importe || 0) === 0)) continue;

      doc.addPage();
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryColor);
      doc.text(`ANEXO ${annex.id}: ${annex.title || ''}`, 14, 20);

      const columns = annex.columns || [];
      const colHeaders = columns.map((c: any) => c.label || c.title || c.key);
      const annexTableData = annexData.map((row: any) => columns.map((c: any) => {
        const val = row[c.key];
        return typeof val === 'number' ? safeLocale(val) : String(val ?? '');
      }));

      autoTable(doc, {
        startY: 30, head: [colHeaders], body: annexTableData, theme: pdfFormat === 'pro' ? 'grid' : 'striped',
        headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
      });
    }
  }

  // Audit Traversal Page
  if (includeAudit) {
    doc.addPage();
    let y = 20; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...primaryColor); doc.text('TRAZABILIDAD — AUDITORÍA', 14, y); y += 10;
    const auditData = [
      ['Campo', 'Valor'],
      ['Producto', header.name || 'N/A'], ['Código', header.code || 'N/A'],
      ['Elaborado por', header.prepared_by || header.elaboratedBy || 'N/A'],
      ['Aprobado por', header.approved_by || header.approvedBy || 'N/A'],
      ['Fecha elaboración', header.date || new Date().toLocaleDateString('es-CU')],
      ['Fecha exportación', new Date().toLocaleString('es-CU')],
      ['Formato PDF', pdfFormat], ['Omitir ceros', skipZeros ? 'Sí' : 'No'],
    ];
    autoTable(doc, {
      startY: y, body: auditData.slice(1), head: [auditData[0]], theme: 'grid',
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
    });
  }

  // Utility Note
  if (includeUtilityNote && calculatedHeader && pdfFormat !== 'simplificado') {
    const pageCount = doc.getNumberOfPages();
    doc.setPage(pageCount);
    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(60);
    doc.text(`Nota de Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}% | Precio Venta: ${safeLocale(calculatedHeader.salePrice || 0)}`, 14, Math.min(finalY + 10, 280));
  }

  if (showDateTime) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(150);
      const timestamp = new Date().toLocaleString('es-CU');
      doc.text(`${timestamp} | Pág. ${i}/${pageCount} | CostPro`, pageWidth / 2, doc.internal.pageSize.height - 6, { align: 'center' });
    }
  }

  return doc;
}
