import { createPDFDocument } from './lazy-pdf';
import { CostSheetData, CalculatedRowValue } from '@/types/cost-sheet';

const MAX_SECTIONS = 50;
const MAX_ROWS_PER_SECTION = 200;
const MAX_SCENARIOS = 5;

function validateComparisonData(data: any): { ok: boolean; error?: string } {
    if (!data || typeof data !== 'object') return { ok: false, error: 'comparisonData inválido' };
    if (!Array.isArray(data.sections)) return { ok: false, error: 'sections debe ser array' };
    if (data.sections.length > MAX_SECTIONS) return { ok: false, error: `Máximo ${MAX_SECTIONS} secciones` };
    if (Array.isArray(data.scenarios) && data.scenarios.length > MAX_SCENARIOS)
        return { ok: false, error: `Máximo ${MAX_SCENARIOS} escenarios en comparativa` };
    for (const section of data.sections) {
        if (Array.isArray(section.rows) && section.rows.length > MAX_ROWS_PER_SECTION)
            return { ok: false, error: `Máximo ${MAX_ROWS_PER_SECTION} filas por sección` };
    }
    return { ok: true };
}

function safeLocale(val: any) {
  const n = parseFloat(String(val));
  return isNaN(n) ? val : n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateCostSheetPDF(body: any) {
    const exportMode = body.exportMode || 'single';
    if (exportMode === 'comparison' && body.comparisonData) {
        const validation = validateComparisonData(body.comparisonData);
        if (!validation.ok) throw new Error(validation.error);
    }

    const doc = await createPDFDocument(exportMode === 'comparison' ? 'l' : 'p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const timestamp = new Date().toLocaleString();
    const exportOptions = body.options || body.exportOptions || {};
    const primaryColor: [number, number, number] = [21, 128, 61];

    const addHeader = (pdf: any, title: string) => {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...primaryColor);
      pdf.text(title, 14, 20);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100);
      pdf.text(`Generado: ${timestamp}`, pageWidth - 14, 20, { align: 'right' });
      return 30;
    };

    if (exportMode === 'comparison' && body.comparisonData) {
      const { sections, scenarios, calcs, baseId } = body.comparisonData;
      let currentY = addHeader(doc, "COMPARATIVA DE ESCENARIOS");
      const activeScenarios = scenarios.filter((s: any) => (body.activeScenarioIds || []).includes(s.id));
      const headRows: string[][] = [['No.', 'Concepto', 'UM'], ['', '', '']];

      activeScenarios.forEach((s: any) => {
        headRows[0].push(s.label, '');
        headRows[1].push('VH', 'TOTAL');
        if (s.id !== baseId) {
          headRows[0].push('DIFF', '');
          headRows[1].push('ABS', '%');
        }
      });

      const tableBody: any[] = [];
      sections.forEach((section: any) => {
        tableBody.push([{ content: section.label, colSpan: headRows[0].length, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
        const processRows = (rows: any[], depth = 0) => {
          if (depth > 5) return;
          rows.forEach(row => {
            const rowData = [row.id, row.label, row.um || row.unit || '-'];
            activeScenarios.forEach((s: any) => {
              const calc = calcs[s.id]?.calculatedValues?.[row.id] || { total: 0, valorHistorico: 0 };
              rowData.push(safeLocale(calc.valorHistorico), safeLocale(calc.total));
              if (s.id !== baseId) {
                const baseCalc = calcs[baseId]?.calculatedValues?.[row.id] || { total: 0 };
                const diff = calc.total - baseCalc.total;
                rowData.push(safeLocale(diff), `${baseCalc.total !== 0 ? ((diff / baseCalc.total) * 100).toFixed(1) : '0.0'}%`);
              }
            });
            tableBody.push(rowData);
            if (row.children) processRows(row.children, depth + 1);
          });
        };
        processRows(section.rows);
      });

      (doc as any).autoTable({
        startY: currentY,
        head: headRows,
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: primaryColor, textColor: 255, halign: 'center' },
      });
    } else {
      const sheetData = body.data || body;
      const calculatedValues = body.calculatedValues || {};
      const calculatedHeader = body.calculatedHeader || null;
      const header = sheetData.header || {};

      let currentY = addHeader(doc, "FICHA DE COSTO");

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60);
      doc.text(`Nombre: ${header.name || 'S/N'}`, 14, currentY);
      currentY += 5;
      doc.text(`Código: ${header.code || 'S/N'}`, 14, currentY);
      currentY += 5;
      if (calculatedHeader) {
        doc.text(`Costo Total: ${safeLocale(calculatedHeader.totalCost || calculatedHeader.costoTotal || 0)}`, 14, currentY);
        currentY += 5;
      }
      currentY += 5;

      const processRows = (rows: any[], depth = 0): any[] => {
        if (depth > 5) return [];
        const tableBody: any[] = [];
        rows.forEach((row: any) => {
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);
          tableBody.push([
            `${indent}${row.id || ''}`,
            `${indent}${(row.label || '').replace(/,/g, '')}`,
            row.um || row.unit || '-',
            safeLocale(calc.valorHistorico || row.valorHistorico || 0),
            safeLocale(calc.total || row.total || 0),
          ]);
          if (row.children) {
            tableBody.push(...processRows(row.children, depth + 1));
          }
        });
        return tableBody;
      };

      const sections = sheetData.sections || [];
      for (const section of sections) {
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80);
        doc.text(`--- ${section.label || section.id} ---`, 14, currentY);
        currentY += 4;

        const sectionTableData = processRows(section.rows || []);
        if (sectionTableData.length > 0) {
          (doc as any).autoTable({
            startY: currentY,
            head: [['No.', 'Concepto', 'UM', 'V. Histórico', 'Total']],
            body: sectionTableData,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            margin: { left: 14, right: 14 },
          });
          currentY = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      const annexes = sheetData.annexes || [];
      const calculatedAnnexes = body.calculatedAnnexes || [];
      const calcAnnexMap = new Map<string, any>();
      for (const ca of calculatedAnnexes) {
        calcAnnexMap.set(ca.id, ca);
      }

      const includedAnnexIds = exportOptions.includeAnnexes || annexes.map((a: any) => a.id);
      for (const annex of annexes) {
        if (!includedAnnexIds.includes(annex.id)) continue;

        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...primaryColor);
        doc.text(`ANEXO ${annex.id}: ${annex.title || ''}`, 14, currentY);
        currentY += 6;

        const columns = annex.columns || [];
        const calcAnnex = calcAnnexMap.get(annex.id);
        const annexData = calcAnnex?.data || annex.data || [];

        const colHeaders = columns.map((c: any) => c.label || c.title || c.key);
        const annexTableData = annexData.map((row: any) =>
          columns.map((c: any) => {
            const val = row[c.key];
            if (val === undefined || val === null) return '';
            return typeof val === 'number' ? safeLocale(val) : String(val);
          })
        );

        if (annexTableData.length > 0) {
          (doc as any).autoTable({
            startY: currentY,
            head: [colHeaders],
            body: annexTableData,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            margin: { left: 14, right: 14 },
          });
          currentY = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      if (exportOptions.includeUtilityNote && calculatedHeader) {
        const utilPercent = calculatedHeader.utilityPercent || calculatedHeader.porcentajeUtilidad || 0;
        const costTotal = calculatedHeader.totalCost || calculatedHeader.costoTotal || 0;
        const salePrice = calculatedHeader.salePrice || calculatedHeader.precioVenta || 0;
        if (currentY > 260) { doc.addPage(); currentY = 20; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60);
        doc.text(`Nota de Utilidad: ${safeLocale(utilPercent)}% | Costo: ${safeLocale(costTotal)} | Precio Venta: ${safeLocale(salePrice)}`, 14, currentY);
      }

      if (exportOptions.showDateTime !== false) {
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(150);
          doc.text(`${timestamp} | Pag. ${i}/${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 8, { align: 'center' });
        }
      }
    }

    return doc;
}
