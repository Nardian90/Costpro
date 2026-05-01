
import { createWorkbook } from '@/lib/export/lazy-excel';
import { toast } from 'sonner';
import { CostSheetAnnex, CostSheetHeader, CostSheetSection, CostSheetRow } from '@/types/cost-sheet';

/**
 * Utility to export an annex to Excel
 */
export const exportAnnexToExcel = async (annex: CostSheetAnnex, fileName?: string) => {
  try {
    const XLSX = await createWorkbook();
    const name = fileName || `Anexo ${annex.id} - ${annex.title}`;

    // Map data to use labels as headers
    const excelData = annex.data.map(row => {
      const mappedRow: any = {};
      annex.columns.forEach(col => {
        const label = col.label || col.title || col.key;
        mappedRow[label] = row[col.key];
      });
      return mappedRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, annex.id);

    XLSX.writeFile(workbook, `${name}.xlsx`);
    toast.success("Excel del anexo exportado con éxito");
  } catch (error) {
    console.error("Error exporting annex to Excel:", error);
    toast.error("Error al exportar el anexo a Excel");
  }
};

/**
 * Utility to import an annex from Excel
 */
export const importAnnexFromExcel = async (file: File, annex: CostSheetAnnex): Promise<any[]> => {
  const XLSX = await createWorkbook();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        // Map labels back to keys
        const labelToKey: Record<string, string> = {};
        annex.columns.forEach(col => {
          const label = col.label || col.title || col.key;
          labelToKey[label] = col.key;
        });

        const mappedData = json.map(row => {
          const mappedRow: any = {};
          Object.keys(row).forEach(label => {
            const key = labelToKey[label] || label;
            mappedRow[key] = row[label];
          });
          return mappedRow;
        });

        resolve(mappedData);
        toast.success("Datos del anexo importados con éxito");
      } catch (err) {
        console.error("Error importing annex from Excel:", err);
        toast.error("Error al importar el anexo desde Excel");
        reject(err);
      }
    };
    reader.onerror = (err) => {
      toast.error("Error al leer el archivo");
      reject(err);
    };
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Utility to export a template for massive cost sheet generation
 */
export const exportMassiveTemplate = async () => {
  try {
    const XLSX = await createWorkbook();
    const template = [
      {
        'SKU': 'SKU001',
        'Nombre': 'Producto Ejemplo 1',
        'UM': 'u',
        'Cantidad': 1,
        'Precio Venta': 100.00,
        'Precio Costo': 60.00
      },
      {
        'SKU': 'SKU002',
        'Nombre': 'Producto Ejemplo 2',
        'UM': 'kg',
        'Cantidad': 0.5,
        'Precio Venta': 250.50,
        'Precio Costo': 120.00
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla Importación");

    XLSX.writeFile(workbook, `Plantilla_Importacion_Fichas.xlsx`);
    toast.success("Plantilla de importación descargada");
  } catch (error) {
    console.error("Error exporting template:", error);
    toast.error("Error al exportar la plantilla");
  }
};

/**
 * Utility to import product list for massive generation
 */
export const importMassiveProducts = async (file: File): Promise<any[]> => {
  const XLSX = await createWorkbook();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const mapped = json.map(row => ({
          sku: row.SKU || row.sku || '',
          name: row.Nombre || row.nombre || row.Name || row.name || 'Sin nombre',
          um: row.UM || row.um || 'u',
          quantity: parseFloat(row.Cantidad || row.cantidad) || 1,
          price: parseFloat(row['Precio Venta'] || row.price || row.precio) || 0,
          cost: parseFloat(row['Precio Costo'] || row.cost || row.costo) || 0,
          category: row['Categoría (opcional)'] || row.category || 'Importado'
        })).filter(p => p.sku || p.name);

        resolve(mapped);
        toast.success(`${mapped.length} productos importados correctamente`);
      } catch (err) {
        console.error("Error importing products:", err);
        toast.error("Error al importar el listado de productos");
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

export const exportHeaderToExcel = async (header: CostSheetHeader, fileName?: string) => {
  try {
    const XLSX = await createWorkbook();
    const name = fileName || `Encabezado - ${header.name || 'Ficha'}`;

    // Format header as a single row with labels
    const labels: Record<string, string> = {
      name: 'Nombre del Recurso',
      code: 'Código',
      date: 'Fecha',
      unit: 'Unidad',
      quantity: 'Cantidad',
      currency: 'Moneda',
      category: 'Categoría',
      type: 'Tipo'
    };

    const mappedHeader: any = {};
    Object.keys(header).forEach(key => {
      if (labels[key]) {
        mappedHeader[labels[key]] = (header as any)[key];
      }
    });

    const worksheet = XLSX.utils.json_to_sheet([mappedHeader]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Encabezado");

    XLSX.writeFile(workbook, `${name}.xlsx`);
    toast.success("Encabezado exportado con éxito");
  } catch (error) {
    console.error("Error exporting header to Excel:", error);
    toast.error("Error al exportar el encabezado a Excel");
  }
};

/**
 * Utility to import header from Excel
 */
export const importHeaderFromExcel = async (file: File): Promise<Partial<CostSheetHeader>> => {
  const XLSX = await createWorkbook();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          throw new Error("Archivo vacío");
        }

        const labels: Record<string, keyof CostSheetHeader> = {
          'Nombre del Recurso': 'name',
          'Código': 'code',
          'Fecha': 'date',
          'Unidad': 'unit',
          'Cantidad': 'quantity',
          'Moneda': 'currency',
          'Categoría': 'category',
          'Tipo': 'type'
        };

        const firstRow = json[0];
        const mappedHeader: any = {};
        Object.keys(firstRow).forEach(label => {
          const key = labels[label];
          if (key) {
            mappedHeader[key] = firstRow[label];
          }
        });

        resolve(mappedHeader);
        toast.success("Encabezado importado con éxito");
      } catch (err) {
        console.error("Error importing header from Excel:", err);
        toast.error("Error al importar el encabezado desde Excel");
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Utility to export a section of the main table to Excel
 */
export const exportSectionToExcel = async (section: CostSheetSection, calculatedValues: any, fileName?: string) => {
  try {
    const XLSX = await createWorkbook();
    const name = fileName || `Sección - ${section.label}`;

    const flattenRows = (rows: CostSheetRow[], level = 0, numbering = ''): any[] => {
      let flattened: any[] = [];
      rows.forEach((row, index) => {
        const num = numbering ? `${numbering}.${index + 1}` : `${index + 1}`;
        const calc = calculatedValues[row.id] || {};

        flattened.push({
          'No.': num,
          'Concepto': "  ".repeat(level) + row.label,
          'Valor Histórico': calc.valorHistorico || 0,
          'Formula': row.formula || '',
          'Total': calc.total || 0,
          'ID': row.id // Hidden or used for re-import
        });

        if (row.children && row.children.length > 0) {
          flattened = flattened.concat(flattenRows(row.children, level + 1, num));
        }
      });
      return flattened;
    };

    const excelData = flattenRows(section.rows);
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, section.id);

    XLSX.writeFile(workbook, `${name}.xlsx`);
    toast.success("Sección exportada con éxito");
  } catch (error) {
    console.error("Error exporting section to Excel:", error);
    toast.error("Error al exportar la sección a Excel");
  }
};

/**
 * Utility to import section rows from Excel
 */
export const importSectionFromExcel = async (file: File): Promise<CostSheetRow[]> => {
  const XLSX = await createWorkbook();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        // This is a simplified import that treats everything as a flat list if it can't reconstruct hierarchy
        // Usually, we want to at least match by ID if possible, or just create new rows.

        const mappedRows: CostSheetRow[] = json.map((row, idx) => ({
          id: row.ID || `imported-${Date.now()}-${idx}`,
          label: (row.Concepto || '').trim(),
          valorHistorico: parseFloat(row['Valor Histórico']) || 0,
          formula: row.Formula || '',
          calculationMethod: row.Formula ? 'FORMULA' : 'ValorFijo',
          children: []
        }));

        resolve(mappedRows);
        toast.success("Filas de la sección importadas con éxito");
      } catch (err) {
        console.error("Error importing section from Excel:", err);
        toast.error("Error al importar la sección desde Excel");
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
