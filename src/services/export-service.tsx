import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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

    // Dynamic import to avoid CSP issues in main bundle load
    const { pdf, Document, Page, Image } = await import('@react-pdf/renderer');

    const MyDoc = (
      // @ts-ignore
      <Document>
        {/* @ts-ignore */}
        <Page size="A4">
          {/* @ts-ignore */}
          <Image src={imgData} />
        </Page>
      </Document>
    );

    const blob = await pdf(MyDoc).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("PDF generado con éxito", { id: toastId });
  } catch (err) {
    console.error("PDF Export error:", err);
    toast.error("Error al generar el PDF", { id: toastId });
    if (originalTheme) {
      document.documentElement.setAttribute('data-theme', originalTheme);
    }
  }
};

export const exportToCSV = (data: any, calculatedValues: any, fileName: string) => {
  try {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Concepto,Valor Historico,Metodo,Base,Coeficiente,Total\n";

    const flatten = (rows: any[], level = 0) => {
      rows.forEach(row => {
        const calc = calculatedValues[row.id] || {};
        const label = row.label.replace(/,/g, '');
        const vh = calc.valor_historico || 0;
        const method = row.calculation_method || (row.formula ? 'Fórmula' : 'Libre');
        const base = row.base_ref || '-';
        const coef = calc.coeficiente || 0;
        const total = calc.total || 0;

        csvContent += `${row.id},${"  ".repeat(level)}${label},${vh},${method},${base},${coef},${total}\n`;

        if (row.children) {
          flatten(row.children, level + 1);
        }
      });
    };

    data.sections.forEach((s: any) => {
      csvContent += `\n--- ${s.label.toUpperCase()} ---\n`;
      flatten(s.rows);
    });

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

export const exportToExcel = (data: any[], columns: string[], columnLabels: Record<string, string>, fileName: string) => {
  try {
    const toastId = toast.loading("Preparando Excel...");

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
