import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { createWorkbook } from '@/lib/export/lazy-excel';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

export const exportToPDF = async (element: HTMLElement, fileName: string) => {
  const toastId = toast.loading("Generando PDF... por favor espere.");

  const originalTheme = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', 'light');

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    if (originalTheme) {
      document.documentElement.setAttribute('data-theme', originalTheme);
    }

    const imgData = canvas.toDataURL('image/png');
    const pdf = await createPDFDocument('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const ratio = canvasWidth / canvasHeight;
    const imgHeight = pdfWidth / ratio;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    toast.success("PDF generado con éxito", { id: toastId });
  } catch (err) {
    console.error("PDF Export error:", err);
    toast.error("Error al generar el PDF", { id: toastId });
    if (originalTheme) {
      document.documentElement.setAttribute('data-theme', originalTheme);
    }
  }
};

export const exportToCSV = (data: any, calculatedValues: any, fileName: string, calculatedAnnexes?: any[]) => {
  try {
    let csvContent = "data:text/csv;charset=utf-8,";

    // Header Info
    csvContent += `FICHA DE COSTO: ${data.header?.name || 'S/N'}\n`;
    csvContent += `CODIGO: ${data.header?.code || 'S/N'}\n`;
    csvContent += `FECHA: ${data.header?.date || ''}\n\n`;

    csvContent += "ID,Concepto,Valor Historico,Metodo,Base,Coeficiente,Total\n";

    const flatten = (rows: any[], level = 0) => {
      rows.forEach(row => {
        const calc = calculatedValues[row.id] || {};
        const label = (row.label || '').replace(/,/g, '');
        // FIX: Use calculatedVH (from vhFormula) before valorHistorico (initial value)
        const vh = calc.calculatedVH ?? calc.valorHistorico ?? 0;
        const method = row.calculationMethod || (row.formula ? 'Fórmula' : 'Libre');
        const base = row.baseDeCalculoRef || '-';
        const coef = calc.coeficiente || 0;
        const total = calc.total || 0;

        csvContent += `${row.id},${"  ".repeat(level)}${label},${vh},${method},${base},${coef},${total}\n`;

        if (row.children) {
          flatten(row.children, level + 1);
        }
      });
    };

    if (data.sections) {
      data.sections.forEach((s: any) => {
        csvContent += `\n--- ${s.label.toUpperCase()} ---\n`;
        flatten(s.rows || []);
      });
    }

    // Annexes Export
    if (data.annexes && data.annexes.length > 0) {
      csvContent += `\n\n=== ANEXOS ===\n`;

      // Build a map of calculated annex data (with computed totals)
      const calcAnnexMap = new Map<string, any>();
      if (calculatedAnnexes && calculatedAnnexes.length > 0) {
        for (const ca of calculatedAnnexes) {
          calcAnnexMap.set(ca.id, ca);
        }
      }

      data.annexes.forEach((annex: any) => {
        csvContent += `\n--- ANEXO ${annex.id}: ${annex.title?.toUpperCase()} ---\n`;

        // Use calculated annex data if available (has computed totals), otherwise fall back to raw data
        const calcAnnex = calcAnnexMap.get(annex.id);
        const columns = annex.columns || [];
        const headers = columns.map((c: any) => c.label || c.title || c.key);
        csvContent += headers.join(',') + "\n";

        const annexData = calcAnnex?.data || annex.data || [];

        // Rows
        if (annexData && annexData.length > 0) {
          annexData.forEach((row: any) => {
            const rowValues = columns.map((col: any) => {
              const val = row[col.key];
              if (val === undefined || val === null) return '';
              return typeof val === 'string' ? val.replace(/,/g, ';') : val;
            });
            csvContent += rowValues.join(',') + "\n";
          });
        } else {
          csvContent += "(Anexo vacío)\n";
        }
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Excel (CSV) exportado con éxito");
  } catch (error) {
    console.error("Excel Export error:", error);
    toast.error("Error al exportar a Excel");
  }
};

export const exportToExcel = async (data: any[], columns: string[], columnLabels: Record<string, string>, fileName: string) => {
  try {
    const toastId = toast.loading("Preparando Excel...");
    const XLSX = await createWorkbook();

    // Filter data to only include selected columns and map headers
    const filteredData = data.map(item => {
      const filteredItem: any = {};
      columns.forEach(col => {
        const label = columnLabels[col] || col;
        let value = item[col];

        // Format special types
        if (value instanceof Date) {
           value = value.toLocaleDateString();
        } else if (typeof value === 'object' && value !== null) {
           value = JSON.stringify(value);
        }

        filteredItem[label] = value;
      });
      return filteredItem;
    });

    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");

    XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);

    toast.success("Excel exportado con éxito", { id: toastId });
  } catch (error) {
    console.error("Excel Export error:", error);
    toast.error("Error al exportar a Excel");
  }
};
