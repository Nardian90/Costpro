import { jsPDF } from 'jspdf';
import { createPDFDocument } from './lazy-pdf';
import autoTable from 'jspdf-autotable';

// Returns '-' for zero/empty, locale string otherwise — matches Res 148/2023 convention
// Uses dot as decimal separator as per Cuban official reference provided
function fmtCell(val: any): string {
  const n = parseFloat(String(val));
  if (isNaN(n) || n === 0) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Returns formatted number with 4 decimal places (for contabilidad and indices)
function fmtCell4(val: any): string {
  const n = parseFloat(String(val));
  if (isNaN(n) || n === 0) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// Checks if a row should be skipped (when skipZeros === true)
function shouldSkip(row: any, calcValues: Record<string, any>, skipZeros: boolean): boolean {
  if (!skipZeros) return false;
  const c = calcValues[row.id] || {};
  return (parseFloat(String(c.total ?? 0)) === 0) && (parseFloat(String(c.valorHistorico ?? 0)) === 0);
}

// Translation map for bilingue format
const ES_TO_EN: Record<string, string> = {
  'Gasto Material': 'Material Expense',
  'Materias primas': 'Raw Materials',
  'Insumos': 'Inputs',
  'Combustibles': 'Fuels',
  'Energía': 'Energy',
  'Salario Directo': 'Direct Labor',
  'Salarios': 'Wages',
  'Vacaciones': 'Vacation Pay',
  'Otros Gastos Directos': 'Other Direct Costs',
  'Reparaciones': 'Repairs',
  'Depreciación': 'Depreciation',
  'Alquiler': 'Rent',
  'Alimentación': 'Meals',
  'Transportación': 'Transportation',
  'Gastos Asociados': 'Associated Costs',
  'Gastos Generales': 'General Expenses',
  'Gastos de Distribución': 'Distribution Expenses',
  'Gastos Financieros': 'Financial Expenses',
  'Gastos Tributarios': 'Tax Expenses',
  'Seguridad Social': 'Social Security',
  'Impuesto': 'Tax',
  'Utilidad': 'Profit',
  'Precio': 'Price',
  'Costo Total': 'Total Cost',
  'Valor Histórico': 'Historical Value',
  'Concepto': 'Concept',
};

function translateLabel(label: string): string {
  for (const [es, en] of Object.entries(ES_TO_EN)) {
    if (label.toLowerCase().includes(es.toLowerCase())) return en;
  }
  return label;
}

// Adds the Res 148/2023 standard footer to every page
function addRes148Footer(doc: jsPDF, pageWidth: number) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.height;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    doc.text(
      'FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS (RES 148/2023)',
      pageWidth / 2, ph - 8, { align: 'center' }
    );
    doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pageWidth / 2, ph - 4, { align: 'center' });
  }
}

function safeLocale(val: any, decimals = 2): string {
  if (val === undefined || val === null || val === '') return '0.00';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function addHeader(doc: jsPDF, title: string, color: [number, number, number] = [21, 128, 61]) {
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(title, 14, 20);
  return 28;
}

function validateComparisonData(body: any): boolean {
  return !!(body.baseScenario && body.scenarios && Array.isArray(body.scenarios));
}

export async function generateCostSheetPDF(body: any): Promise<jsPDF> {
  const exportOptions = body.options || body.exportOptions || {};
  const exportMode = body.exportMode || 'standard';

  if (exportMode === 'comparison') {
    if (!validateComparisonData(body)) {
      throw new Error('Comparison data is invalid');
    }
    const doc = await createPDFDocument('l', 'mm', 'a4');
    const pw = doc.internal.pageSize.width;
    const PG: [number, number, number] = [21, 128, 61];
    let y = addHeader(doc, 'ANÁLISIS COMPARATIVO DE ESCENARIOS', PG);

    const base = body.baseScenario;
    const scenarios = body.scenarios;
    const headers = ['Concepto', 'UM', 'Base', ...scenarios.map((s: any) => s.name)];

    const rows: any[][] = [];
    base.sections.forEach((section: any) => {
      rows.push([{ content: section.label || section.id, colSpan: headers.length, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }]);
      const processRows = (sectionRows: any[], depth = 0) => {
        sectionRows.forEach((row: any) => {
          const baseVal = body.calculatedValues?.[row.id]?.total || 0;
          const rowData = [
            '  '.repeat(depth) + (row.label || row.id),
            row.um || '-',
            safeLocale(baseVal)
          ];
          scenarios.forEach((s: any) => {
            const sVal = s.calculatedValues?.[row.id]?.total || 0;
            rowData.push(safeLocale(sVal));
          });
          rows.push(rowData);
          if (row.children) processRows(row.children, depth + 1);
        });
      };
      processRows(section.rows || []);
    });

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
    return doc;
  }

  const sheetData        = body.data || body;
  const calculatedValues = body.calculatedValues || {};
  const calculatedHeader = body.calculatedHeader || null;
  const header           = {
    ...(sheetData?.header || {}),
    ...(calculatedHeader || {}),
    ...(body.calculationResult?.metadata?.header || {})
  };
  const sections         = sheetData?.sections || [];
  const annexes          = sheetData?.annexes  || [];
  const calculatedAnnexes = body.calculatedAnnexes || [];

  const pdfFormat         = exportOptions.pdfFormat || 'standard';
  const skipZeros         = exportOptions.skipZeros  ?? true;
  const showDateTime      = exportOptions.showDateTime !== false;
  const includeUtilityNote = exportOptions.includeUtilityNote ?? true;
  const includeAudit      = exportOptions.includeAudit ?? false;
  const logo              = exportOptions.logo;
  const includedAnnexIds  = exportOptions.includeAnnexes || annexes.map((a: any) => a.id);

  const calcAnnexMap = new Map<string, any>();
  for (const ca of calculatedAnnexes) calcAnnexMap.set(ca.id, ca);

  const PG = [21, 128, 61] as [number, number, number];       // CostPro green
  const BLU = [21, 68, 128] as [number, number, number];      // Official blue
  const LBL = [230, 243, 255] as [number, number, number];    // Light blue bg (Res 148)
  const GRY = [245, 245, 245] as [number, number, number];    // Light gray alt rows

  const orientation = (pdfFormat === 'bilingue' || pdfFormat === 'comparativo') ? 'l' : 'p';
  const doc = await createPDFDocument(orientation, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;

  if (pdfFormat === 'res148') {
    // ── Page setup ──
    let y = 10;
    const pw = pageWidth;

    // ── Institutional header ──
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);

    // Top title box
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pw / 2, y + 5, { align: 'center' });
    y += 8;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS', pw / 2, y + 4, { align: 'center' });
    doc.text('(RES 148/2023)', pw / 2, y + 9, { align: 'center' });
    y += 14;

    // FC logo box (left side, 18×14mm)
    doc.setDrawColor(100);
    doc.setLineWidth(0.5);
    doc.rect(14, y, 18, 14);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('FC', 23, y + 9, { align: 'center' });

    // Metadata block (right of logo)
    const col1x = 34;
    const col2x = pw / 2 + 2;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40);

        const meta1 = [
      [`ORGANISMO: ${header.organismo || '-'}`,  `ID: ${header.code || header.id || '-'}`],
      [`UNION: ${header.union || '-'}`,           `COD. PROD: ${header.productCode || header.code || '-'}`],
      [`EMPRESA: ${header.empresa || '-'}`,       `PRODUCTO: ${header.name || 'S/N'}`],
      [`CODIGO EMPRESA: ${header.codigoEmpresa || '-'}`, `UM: ${header.unit || header.um || 'U'}`],
      [`CATEGORÍA: ${header.category || header.categoriaProducto || '-'}`, `TIPO COSTO: ${header.costType || header.tipoCosto || '-'}`],
    ];
    meta1.forEach(([left, right], i) => {
      doc.text(left, col1x, y + 3 + i * 3.5);
      doc.text(right, col2x, y + 3 + i * 3.5);
    });
    y += 16;

    // Second metadata row
    doc.setFont('helvetica', 'bold');
    doc.text('Nivel de Producción:', 14, y + 3);
    doc.text('Cliente:', 70, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(`${header.productionLevel || header.nivelProduccion || '1'}`, 45, y + 3);
    doc.text(`${header.client || header.cliente || '-'}`, 88, y + 3);
    doc.text('Cantidad:', pw / 2, y + 3);
    doc.text(`${header.quantity || header.cantidad || '1'}`, pw / 2 + 20, y + 3);

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('% Utilización capacidad:', 14, y + 3);
    doc.text('Destino:', 70, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(`${header.capacityUtilization || header.porcentajeCapacidad || '100'}%`, 50, y + 3);
    doc.text(`${header.destination || header.destino || '-'}`, 88, y + 3);
    doc.text(`Moneda: ${header.currency || header.moneda || 'CUP'}`, pw / 2, y + 3);

    // PRECIO highlighted box
    const precio = calculatedHeader?.salePrice || calculatedHeader?.precioVenta || 0;
    doc.setFillColor(...LBL);
    doc.rect(pw - 50, y - 1, 36, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('PRECIO:', pw - 49, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(safeLocale(precio), pw - 15, y + 3, { align: 'right' });
    y += 10;

    // ── MAIN TABLE ──
    const mainRows: any[][] = [];

    const processRes148Rows = (rows: any[], depth = 0) => {
      if (depth > 6) return;
      rows.forEach((row: any) => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c    = calculatedValues[row.id] || {};
        const total = parseFloat(String(c.total || row.total || 0));
        const vh    = parseFloat(String(c.valorHistorico || row.valorHistorico || 0));
        const indent = '  '.repeat(depth);
        const isParent = depth === 0 && row.children && row.children.length > 0;
        const label = `${indent}${isParent ? '● ' : depth === 1 ? 'De ello: -' : '-'}${row.label || row.id}`;

        mainRows.push([
          { content: label, styles: { fontStyle: isParent ? 'bold' : 'normal' } },
          row.id,
          row.um || row.unit || 'CUP',
          fmtCell(vh),
          fmtCell(total),
        ]);

        if (row.children) processRes148Rows(row.children, depth + 1);
      });
    };

    sections.forEach((section: any) => {
      processRes148Rows(section.rows || []);
    });

    // Append computed summary rows
    const ct  = calculatedHeader?.totalCost || calculatedHeader?.costoTotal || 0;
    const tg  = calculatedHeader?.totalGastos || 0;
    const tcg = parseFloat(String(ct)) + parseFloat(String(tg));
    const util = calculatedHeader?.utility || calculatedHeader?.utilidad || 0;
    const pai  = parseFloat(String(tcg)) + parseFloat(String(util));
    const imp  = calculatedHeader?.tax || calculatedHeader?.impuesto || (parseFloat(String(pai)) * 0.10);
    const pvf  = parseFloat(String(pai)) + parseFloat(String(imp));

    const summaryRows: [string, string, string, string, string][] = [
      ['COSTO TOTAL (1+2+3+4)', '5', 'CUP', fmtCell4(calculatedHeader?.costoCoef || ''), fmtCell(ct)],
      ['● Gastos Generales y de Administración', '6', 'CUP', '-', fmtCell(calculatedHeader?.s6 || 0)],
      ['● Gastos de Distribución y Venta', '7', 'CUP', fmtCell4(calculatedHeader?.s7Coef || 0), fmtCell(calculatedHeader?.s7 || 0)],
      ['● Gastos Financieros', '8', 'CUP', '-', '-'],
      ['● Gasto por Financiamiento Entregado al OSDE', '9', 'CUP', '-', '-'],
      ['● Gastos Tributarios', '10', 'CUP', '-', fmtCell(calculatedHeader?.s10 || 0)],
      ['TOTAL DE GASTOS (suma de las filas 6,7,8,9 y 10)', '11', 'CUP', '-', fmtCell(tg)],
      ['TOTAL DE COSTOS Y GASTOS(5+11)', '12', 'CUP', '-', fmtCell(tcg)],
      ['Utilidad', '13', 'CUP', '-', fmtCell(util)],
      ['Precio antes de impuestos (12 + 13)', '14', 'CUP', '-', fmtCell(pai)],
      ['Imp 10% s/ Ventas y Servicios', '15', 'CUP', '-', fmtCell(imp)],
      ['Precio o Tarifa (14 + 15)', '16', 'CUP', '-', fmtCell(pvf)],
      ['Precio o Tarifa Unitaria Ajustado', '17', 'CUP', '-', '-'],
      ['Datos sobre precios de referencia', '18', 'CUP', '-', '-'],
    ];

    summaryRows.forEach(([label, fila, um, idx, tot]) => {
      const isBold = ['5', '11', '12', '13', '14', '15', '16'].includes(fila);
      mainRows.push([
        { content: label, styles: { fontStyle: isBold ? 'bold' : 'normal' } },
        fila, um, idx,
        { content: tot, styles: { fontStyle: isBold ? 'bold' : 'normal', halign: 'right' } },
      ]);
    });

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
        const totalLabel = data.cell.raw;
        if (
          typeof totalLabel === 'object' &&
          ((totalLabel as any)?.content?.toString().startsWith('COSTO TOTAL')) ||
          (typeof totalLabel === 'string' && totalLabel.startsWith('COSTO TOTAL'))
        ) {
          data.cell.styles.fillColor = LBL;
        }
      },
    });

    let finalY = (doc as any).lastAutoTable.finalY + 5;

    const summaryBottom = [
      ['COSTO TOTAL UNITARIO', '19', 'U', safeLocale(ct)],
      ['PRECIO TOTAL.', '20', 'U', safeLocale(pvf)],
      ['UTILIDAD (%)', '21', '%', safeLocale(calculatedHeader?.utilityPercent || calculatedHeader?.porcentajeUtilidad || 0)],
    ];
    autoTable(doc, {
      startY: finalY,
      body: summaryBottom,
      theme: 'grid',
      styles: { fontSize: 7, fontStyle: 'bold', cellPadding: 1.2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });
    finalY = (doc as any).lastAutoTable.finalY + 6;

    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.rect(14, finalY, pageWidth - 28, 14);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text('Nota:', 16, finalY + 4);
    finalY += 20;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Realizado por:', 14, finalY);
    doc.text('Aprobado por:', pageWidth / 2, finalY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha: ${header.date || new Date().toLocaleDateString('es-CU')}`, pageWidth - 14, finalY + 6, { align: 'right' });

    addRes148Footer(doc, pageWidth);
  } else if (pdfFormat === 'standard' || !pdfFormat) {
    let y = addHeader(doc, 'FICHA DE COSTO');
    const pw = pageWidth;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    [
      `Nombre: ${header.name || 'S/N'}`,
      `Código: ${header.code || 'S/N'}`,
      `UM: ${header.unit || '-'} | Cantidad: ${header.quantity || '1'}`,
    ].forEach((line, i) => { doc.text(line, 14, y + i * 5); });
    if (calculatedHeader) {
      doc.setTextColor(...PG);
      doc.text(`Costo Total: ${safeLocale(calculatedHeader.totalCost || 0)}  |  Precio: ${safeLocale(calculatedHeader.salePrice || 0)}`, 14, y + 15);
    }
    y += 22;
    for (const section of sections) {
      if (y > 260) { doc.addPage(); y = 20; }
      const rows: any[][] = [];
      const walk = (r: any[], d = 0) => {
        if (d > 6) return;
        r.forEach(row => {
          if (shouldSkip(row, calculatedValues, skipZeros)) return;
          const c = calculatedValues[row.id] || {};
          rows.push([
            `${'  '.repeat(d)}${row.id}`,
            `${'  '.repeat(d)}${row.label || ''}`,
            row.um || '-',
            fmtCell(c.valorHistorico || 0),
            fmtCell(c.total || 0),
          ]);
          if (row.children) walk(row.children, d + 1);
        });
      };
      walk(section.rows || []);
      if (rows.length === 0) continue;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80);
      doc.text(section.label || section.id, 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['No.', 'Concepto', 'UM', 'V. Histórico', 'Total']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: PG, textColor: 255, fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
  } else if (pdfFormat === 'pro') {
    const pw = pageWidth;
    let y = 8;
    if (logo) {
      try {
        const logoData = logo.includes(',') ? logo.split(',')[1] : logo;
        doc.addImage(logoData, 'PNG', 14, y, 30, 14);
      } catch { }
    }
    doc.setFillColor(...PG);
    doc.rect(logo ? 48 : 14, y, pw - (logo ? 62 : 28), 16, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255);
    doc.text('FICHA DE COSTO', logo ? (pw - 14 + 48) / 2 : pw / 2, y + 10, { align: 'center' });
    y += 22;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text(`${header.name || 'S/N'}  |  Código: ${header.code || '-'}  |  Cantidad: ${header.quantity || '1'}`, 14, y);
    if (calculatedHeader) {
      y += 5;
      doc.setTextColor(...PG);
      doc.text(`Costo Total: ${safeLocale(calculatedHeader.totalCost || 0)}   Precio: ${safeLocale(calculatedHeader.salePrice || 0)}   Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}%`, 14, y);
    }
    y += 8;
    for (const section of sections) {
      if (y > 260) { doc.addPage(); y = 20; }
      const rows: any[][] = [];
      const walk = (r: any[], d = 0) => {
        r.forEach(row => {
          if (shouldSkip(row, calculatedValues, skipZeros)) return;
          const c = calculatedValues[row.id] || {};
          rows.push([
            `${'  '.repeat(d)}${row.id}`, `${'  '.repeat(d)}${row.label || ''}`,
            row.um || '-', fmtCell(c.valorHistorico || 0), fmtCell(c.total || 0),
          ]);
          if (row.children) walk(row.children, d + 1);
        });
      };
      walk(section.rows || []);
      if (rows.length === 0) continue;
      autoTable(doc, {
        startY: y,
        head: [[{ content: section.label || section.id, colSpan: 5, styles: { fillColor: PG, textColor: 255, fontStyle: 'bold', fontSize: 8 } }],
               ['No.', 'Concepto', 'UM', 'V. Histórico', 'Total']],
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
  } else if (pdfFormat === 'ejecutivo') {
    let y = addHeader(doc, 'INFORME EJECUTIVO — ' + (header.name || 'FICHA DE COSTO'));
    const ct = calculatedHeader?.totalCost || 0;
    const pv = calculatedHeader?.salePrice || 0;
    const up = calculatedHeader?.utilityPercent || 0;
    const mg = parseFloat(String(pv)) - parseFloat(String(ct));
    const kpis = [
      { label: 'Costo Total', value: safeLocale(ct) },
      { label: 'Precio Venta', value: safeLocale(pv) },
      { label: 'Utilidad %', value: `${safeLocale(up)}%` },
      { label: 'Margen', value: safeLocale(mg) },
    ];
    const bw = (pageWidth - 28 - 9) / 4;
    kpis.forEach((kpi, i) => {
      const x = 14 + i * (bw + 3);
      doc.setFillColor(245, 251, 246);
      doc.setDrawColor(...PG);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, bw, 20, 2, 2, 'FD');
      doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      doc.text(kpi.label, x + bw / 2, y + 5, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PG);
      doc.text(kpi.value, x + bw / 2, y + 14, { align: 'center' });
    });
    y += 28;
    const ranked = sections
      .map((s: any) => {
        const pr = s.rows?.[0];
        const val = pr ? parseFloat(String((calculatedValues[pr.id] || {}).total || 0)) : 0;
        return { label: s.label || s.id, val };
      })
      .filter((s: any) => s.val > 0)
      .sort((a: any, b: any) => b.val - a.val)
      .slice(0, 6);
    const maxVal = ranked[0]?.val || 1;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(60);
    doc.text('ESTRUCTURA DE COSTOS — TOP SECCIONES', 14, y); y += 5;
    ranked.forEach((s: any) => {
      const barW = ((s.val / maxVal) * (pageWidth - 70));
      doc.setFillColor(...PG);
      doc.rect(60, y - 3.5, barW, 5, 'F');
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      doc.text(s.label.substring(0, 30), 14, y);
      doc.text(safeLocale(s.val), pageWidth - 14, y, { align: 'right' });
      y += 8;
    });
  } else if (pdfFormat === 'contabilidad') {
    const pw = pageWidth;
    let y = addHeader(doc, 'FICHA DE COSTO — CONTABILIDAD');
    for (const section of sections) {
      if (y > 255) { doc.addPage(); y = 20; }
      const rows: any[][] = [];
      const walk = (r: any[], d = 0) => {
        r.forEach(row => {
          if (shouldSkip(row, calculatedValues, skipZeros)) return;
          const c = calculatedValues[row.id] || {};
          rows.push([
            `${'  '.repeat(d)}${row.id}`,
            `${'  '.repeat(d)}${row.label || ''}`,
            row.um || '-',
            fmtCell4(c.valorHistorico || 0),
            fmtCell4(c.total || 0),
            row.accountCode || '',
            row.reference || '',
          ]);
          if (row.children) walk(row.children, d + 1);
        });
      };
      walk(section.rows || []);
      if (rows.length === 0) continue;
      const sTotal = rows.reduce((s, r) => s + parseFloat(String(r[4]).replace(new RegExp('\\.', 'g'), '').replace(',', '.') || '0'), 0);
      rows.push([{ content: `Subtotal: ${section.label}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: GRY } },
        { content: fmtCell4(sTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: GRY } }, '', '']);
      autoTable(doc, {
        startY: y,
        head: [['No.', 'Concepto', 'UM', 'V. Histórico', 'Total', 'Cta. Contable', 'Ref.']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [0, 110, 120], textColor: 255, fontSize: 6.5 },
        styles: { fontSize: 6.5, cellPadding: 1 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 5;
    }
    const grandTotal = calculatedHeader?.totalCost || 0;
    autoTable(doc, {
      startY: y,
      body: [[{ content: 'COSTO TOTAL GENERAL', colSpan: 4, styles: { fontStyle: 'bold', fillColor: PG, textColor: 255 } },
        { content: fmtCell4(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: PG, textColor: 255 } }, '', '']],
      theme: 'grid', styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
    doc.text('Verificado por: _______________________', 14, y);
    doc.text('Fecha: _______________', pw - 14, y, { align: 'right' });
  } else if (pdfFormat === 'auditoria') {
    const pw = pageWidth;
    let y = addHeader(doc, 'FICHA DE COSTO — AUDITORÍA');
    autoTable(doc, {
      startY: y,
      body: [
        ['Producto', header.name || '-'], ['Código', header.code || '-'],
        ['Elaborado por', header.prepared_by || header.elaboratedBy || '-'],
        ['Aprobado por', header.approved_by || header.approvedBy || '-'],
        ['Fecha', header.date || new Date().toLocaleDateString('es-CU')],
        ['Fecha exportación', new Date().toLocaleString('es-CU')],
        ['Formato', 'Auditoría — RES 148/2023'],
        ['Omitir ceros', skipZeros ? 'Sí' : 'No'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [200, 100, 0], textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    for (const section of sections) {
      if (y > 230) { doc.addPage(); y = 20; }
      const rows: any[][] = [];
      const walk = (r: any[], d = 0) => {
        r.forEach(row => {
          if (shouldSkip(row, calculatedValues, skipZeros)) return;
          const c = calculatedValues[row.id] || {};
          rows.push([`${'  '.repeat(d)}${row.id}`, `${'  '.repeat(d)}${row.label || ''}`, row.um || '-', fmtCell(c.valorHistorico || 0), fmtCell(c.total || 0)]);
          if (row.children) walk(row.children, d + 1);
        });
      };
      walk(section.rows || []);
      if (rows.length === 0) continue;
      autoTable(doc, {
        startY: y,
        head: [['No.', section.label || section.id, 'UM', 'V. Histórico', 'Total']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [200, 100, 0], textColor: 255, fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 2;
      doc.setDrawColor(180); doc.setLineWidth(0.3);
      doc.rect(14, y, pw - 28, 10);
      doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
      doc.text('Observaciones:', 16, y + 4);
      y += 14;
    }
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
    ['Elaborador: _____________________', 'Revisor: _____________________', 'Aprobador: _____________________'].forEach((line, i) => {
      doc.text(line, 14 + i * 62, y);
    });
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(48); doc.setFont('helvetica', 'bold');
      doc.setTextColor(200, 200, 200);
      const cx = pw / 2; const cy = doc.internal.pageSize.height / 2;
      doc.text('CONFIDENCIAL', cx, cy, { align: 'center', angle: 45 });
    }
  } else if (pdfFormat === 'simplificado') {
    let y = addHeader(doc, 'FICHA DE COSTO — RESUMEN');
    const rows: any[][] = [];
    let count = 0;
    for (const section of sections) {
      if (count >= 12) {
        rows.push([{ content: `(+ ${sections.length - 12} secciones omitidas)`, colSpan: 3, styles: { fontStyle: 'italic', textColor: [150, 150, 150] } }]);
        break;
      }
      const pr = section.rows?.[0];
      if (!pr) continue;
      const total = parseFloat(String((calculatedValues[pr.id] || {}).total || 0));
      if (skipZeros && total === 0) continue;
      const pct = (calculatedHeader?.totalCost || 0) > 0 ? (total / (calculatedHeader?.totalCost || 1) * 100).toFixed(1) : '0.0';
      rows.push([section.label || section.id, safeLocale(total), `${pct}%`]);
      count++;
    }
    autoTable(doc, {
      startY: y,
      head: [['Sección', 'Total', '% Costo']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    if (calculatedHeader) {
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PG);
      doc.text(
        `Costo Total: ${safeLocale(calculatedHeader.totalCost || 0)}  |  Precio: ${safeLocale(calculatedHeader.salePrice || 0)}  |  Utilidad: ${safeLocale(calculatedHeader.utilityPercent || 0)}%`,
        14, Math.min(finalY, 280)
      );
    }
  } else if (pdfFormat === 'bilingue') {
    const pw = pageWidth;
    let y = 14;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PG);
    doc.text('COST SHEET / FICHA DE COSTO', pw / 2, y, { align: 'center' }); y += 6;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`${header.name || 'S/N'}  |  ${new Date().toLocaleDateString('es-CU')}`, pw / 2, y, { align: 'center' }); y += 8;
    const rows: any[][] = [];
    const walk = (r: any[], d = 0) => {
      r.forEach(row => {
        if (shouldSkip(row, calculatedValues, skipZeros)) return;
        const c = calculatedValues[row.id] || {};
        const indent = '  '.repeat(d);
        rows.push([
          `${indent}${row.id}`, `${indent}${row.label || ''}`, row.um || '-',
          fmtCell(c.valorHistorico || 0), fmtCell(c.total || 0),
          `${indent}${row.id}`, `${indent}${translateLabel(row.label || '')}`, row.um || '-',
          fmtCell(c.valorHistorico || 0), fmtCell(c.total || 0),
        ]);
        if (row.children) walk(row.children, d + 1);
      });
    };
    sections.forEach((s: any) => walk(s.rows || []));
    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto (ES)', 'UM', 'V.H.', 'Total', 'No.', 'Concept (EN)', 'UoM', 'H.V.', 'Total']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [50, 50, 150], textColor: 255, fontSize: 6.5 },
      styles: { fontSize: 6.5, cellPadding: 1 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    });
    const ph = doc.internal.pageSize.height;
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
      doc.text('CostPro Export / Exportación CostPro', pw / 2, ph - 5, { align: 'center' });
    }
  } else if (pdfFormat === 'comparativo') {
    const pw = pageWidth;
    let y = 14;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PG);
    doc.text('ANÁLISIS DE SENSIBILIDAD — ' + (header.name || 'FICHA DE COSTO'), pw / 2, y, { align: 'center' }); y += 8;
    const factors = [1.0, 1.1, 1.2, 0.9];
    const labels  = ['BASE', '+10%', '+20%', '-10%'];
    const rows: any[][] = [];
    sections.forEach((section: any) => {
      rows.push([{ content: section.label || section.id, colSpan: 8, styles: { fontStyle: 'bold', fillColor: GRY } }]);
      const walk = (r: any[], d = 0) => {
        r.forEach(row => {
          const c = calculatedValues[row.id] || {};
          const base = parseFloat(String(c.total || 0));
          const vars = factors.map(f => base * f);
          const deltaMaxPct = base > 0 ? (Math.max(...vars.map(v => Math.abs(v - base))) / base * 100) : 0;
          rows.push([
            `${'  '.repeat(d)}${row.id}`,
            `${'  '.repeat(d)}${row.label || ''}`,
            row.um || '-',
            ...vars.map(v => fmtCell(v)),
            { content: `${deltaMaxPct.toFixed(1)}%`, styles: { textColor: deltaMaxPct > 15 ? [185, 28, 28] : [40, 40, 40] } },
          ]);
          if (row.children) walk(row.children, d + 1);
        });
      };
      walk(section.rows || []);
    });
    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto', 'UM', ...labels, 'Δ MAX']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 6.5 },
      styles: { fontSize: 6.5, cellPadding: 1 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    });
  } else if (pdfFormat === 'exportacion') {
    const pw = pageWidth;
    let y = addHeader(doc, 'FICHA DE COSTO — PARA EXPORTACIÓN');
    const rate = parseFloat(String(header.exchangeRate || 1));
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`País destino: ${header.destinationCountry || 'N/A'}   Incoterm: ${header.incoterm || 'N/A'}   Tasa CUP/USD: ${rate === 1 ? 'N/C' : rate}`, 14, y); y += 6;
    const rows: any[][] = [];
    sections.forEach((section: any) => {
      rows.push([{ content: section.label || section.id, colSpan: 6, styles: { fontStyle: 'bold', fillColor: LBL } }]);
      const walk = (r: any[], d = 0) => {
        r.forEach(row => {
          if (shouldSkip(row, calculatedValues, skipZeros)) return;
          const c = calculatedValues[row.id] || {};
          const cup = parseFloat(String(c.total || 0));
          const usd = rate !== 1 ? cup / rate : null;
          const pct = (calculatedHeader?.totalCost || 0) > 0 ? (cup / (calculatedHeader?.totalCost || 1) * 100).toFixed(1) : '-';
          rows.push([
            `${'  '.repeat(d)}${row.id}`,
            `${'  '.repeat(d)}${row.label || ''}`,
            row.um || '-',
            fmtCell(cup),
            usd !== null ? fmtCell(usd) : 'N/C',
            `${pct}%`,
          ]);
          if (row.children) walk(row.children, d + 1);
        });
      };
      walk(section.rows || []);
    });
    autoTable(doc, {
      startY: y,
      head: [['No.', 'Concepto', 'UM', 'CUP', 'USD', '% Costo']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [0, 120, 80], textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    if (rate === 1) {
      doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(150);
      doc.text('* Tasa de cambio no configurada — columna USD no disponible', 14, (doc as any).lastAutoTable.finalY + 4);
    }
    const ph = doc.internal.pageSize.height;
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
      doc.text('This document complies with Cuban cost accounting standards (Res. 148/2023) / Generado por CostPro', pw / 2, ph - 5, { align: 'center' });
    }
  }

  if (pdfFormat !== 'simplificado') {
    let annexY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : undefined;
    for (const annex of annexes) {
      if (!includedAnnexIds.includes(annex.id)) continue;
      const calcAnnex = calcAnnexMap.get(annex.id);
      const annexData = calcAnnex?.data || annex.data || [];
      const columns   = annex.columns || [];
      const filteredData = skipZeros
        ? annexData.filter((r: any) => Object.values(r).some(v => parseFloat(String(v)) !== 0))
        : annexData;
      if (filteredData.length === 0) continue;
      doc.addPage();
      annexY = 20;
      if (pdfFormat === 'res148') {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLU);
        doc.text(`ANEXO ${annex.id} — ${annex.title || ''}`, 14, annexY);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
        doc.text('Conforme Res. 148/2023 MINCIN', pageWidth - 14, annexY, { align: 'right' });
      } else {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PG);
        doc.text(`ANEXO ${annex.id}: ${annex.title || ''}`, 14, annexY);
      }
      annexY += 6;
      const colHeaders = columns.map((c: any) => c.label || c.title || c.key);
      const tableData  = filteredData.map((row: any) =>
        columns.map((c: any) => {
          const v = row[c.key];
          if (v === undefined || v === null) return '-';
          return typeof v === 'number' ? fmtCell(v) : String(v);
        })
      );
      autoTable(doc, {
        startY: annexY,
        head: [colHeaders],
        body: tableData,
        theme: pdfFormat === 'pro' ? 'grid' : 'striped',
        headStyles: {
          fillColor: pdfFormat === 'res148' ? LBL : PG,
          textColor: pdfFormat === 'res148' ? [0, 0, 0] : 255,
          fontSize: 7,
        },
        styles: { fontSize: 7, cellPadding: 1.5 },
        margin: { left: 14, right: 14 },
      });
      annexY = (doc as any).lastAutoTable.finalY + 8;
    }
  }
  if (includeUtilityNote && calculatedHeader && pdfFormat !== 'simplificado') {
    const up  = calculatedHeader.utilityPercent || calculatedHeader.porcentajeUtilidad || 0;
    const ct  = calculatedHeader.totalCost || calculatedHeader.costoTotal || 0;
    const pv  = calculatedHeader.salePrice || calculatedHeader.precioVenta || 0;
    const lastY = (doc as any).lastAutoTable?.finalY || 200;
    const noteY = Math.min(lastY + 8, doc.internal.pageSize.height - 20);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(60);
    doc.text(`Nota de Utilidad: ${safeLocale(up)}%  |  Costo: ${safeLocale(ct)}  |  Precio Venta: ${safeLocale(pv)}`, 14, noteY);
  }
  if (includeAudit) {
    doc.addPage();
    let ay = 20;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PG);
    doc.text('TRAZABILIDAD — AUDITORÍA', 14, ay); ay += 8;
    autoTable(doc, {
      startY: ay,
      body: [
        ['Producto', header.name || '-'], ['Código', header.code || '-'],
        ['Elaborado por', header.prepared_by || '-'], ['Aprobado por', header.approved_by || '-'],
        ['Fecha', header.date || '-'], ['Exportado', new Date().toLocaleString('es-CU')],
        ['Formato PDF', pdfFormat], ['Omitir ceros', skipZeros ? 'Sí' : 'No'],
        ['Anexos incluidos', includedAnnexIds.join(', ') || 'Ninguno'],
      ],
      theme: 'grid',
      headStyles: { fillColor: PG, textColor: 255, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    });
  }
  if (showDateTime) {
    const pageCount = doc.getNumberOfPages();
    const timestamp = new Date().toLocaleString('es-CU');
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(140);
      doc.text(
        `${timestamp}  |  Pág. ${i}/${pageCount}  |  CostPro`,
        pageWidth / 2,
        doc.internal.pageSize.height - (pdfFormat === 'res148' ? 14 : 6),
        { align: 'center' }
      );
    }
  }
  return doc;
}
