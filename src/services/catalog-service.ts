import { toast } from 'sonner';
import { Product } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { createWorkbook } from '@/lib/export/lazy-excel';
import { generateEAN13FromSKU, needsBarcodeAutogeneration } from '@/lib/barcode-utils';

// ============================================
// Excel Catalog Export / Import
// ============================================

interface CatalogExcelRow {
  SKU: string;
  Nombre: string;
  'Categoría': string;
  'Unidad de Medida': string;
  'Costo': number;
  'Precio Venta': number;
  'Stock Mínimo': number;
  'Código de Barras': string;
  'Proveedor': string;
  'Descripción': string;
}

/**
 * Professional Excel export for the catalog master.
 * If products array is empty, includes example rows as a template.
 * Follows international best practices: column headers in Spanish,
 * auto-width columns, frozen header row, striped rows styling.
 */
export async function exportCatalogToExcel(products: Product[], storeName?: string) {
  try {
    const XLSX = await createWorkbook();
    const workbook = XLSX.utils.book_new();

    // Build data rows — if empty, use template examples
    const isEmpty = !products || products.length === 0;
    const rows: CatalogExcelRow[] = isEmpty
      ? [
          {
            SKU: 'PROD-001',
            Nombre: 'Ejemplo: Detergente Multiusos 1L',
            'Categoría': 'Limpieza',
            'Unidad de Medida': 'unidad',
            'Costo': 85.50,
            'Precio Venta': 120.00,
            'Stock Mínimo': 10,
            'Código de Barras': '7501234567890',
            'Proveedor': 'Distribuidora ABC',
            'Descripción': 'Detergente concentrado para uso general',
          },
          {
            SKU: 'PROD-002',
            Nombre: 'Ejemplo: Arroz Extra 5kg',
            'Categoría': 'Alimentos',
            'Unidad de Medida': 'unidad',
            'Costo': 350.00,
            'Precio Venta': 480.00,
            'Stock Mínimo': 20,
            'Código de Barras': '7509876543210',
            'Proveedor': 'Alimentos del Sur',
            'Descripción': 'Arroz extra de grano largo',
          },
          {
            SKU: 'PROD-003',
            Nombre: 'Ejemplo: Aceite Vegetal 900ml',
            'Categoría': 'Alimentos',
            'Unidad de Medida': 'unidad',
            'Costo': 210.00,
            'Precio Venta': 295.00,
            'Stock Mínimo': 15,
            'Código de Barras': '7505551234567',
            'Proveedor': '',
            'Descripción': '',
          },
        ]
      : products.map((p) => ({
          SKU: p.sku || '',
          Nombre: p.name || '',
          'Categoría': p.category || '',
          'Unidad de Medida': p.unit_of_measure || 'unidad',
          'Costo': p.cost_price || 0,
          'Precio Venta': p.price || 0,
          'Stock Mínimo': p.min_stock || 0,
          'Código de Barras': p.barcode || '',
          'Proveedor': p.supplier || '',
          'Descripción': p.description || '',
        }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths based on header + data content
    const colWidths: { wch: number }[] = Object.keys(rows[0] || {}).map((key) => {
      const maxDataLen = rows.reduce(
        (max, row) => Math.max(max, String((row as any)[key] ?? '').length),
        key.length
      );
      return { wch: Math.min(Math.max(maxDataLen + 2, 12), 40) };
    });
    worksheet['!cols'] = colWidths;

    // Freeze header row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    const sheetName = isEmpty ? 'Plantilla' : 'Catálogo';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // If empty, add a "Instrucciones" sheet
    if (isEmpty) {
      const instructions = [
        { 'Campo': 'SKU', 'Descripción': 'Código único del producto (obligatorio, sin espacios)', 'Ejemplo': 'PROD-001' },
        { 'Campo': 'Nombre', 'Descripción': 'Nombre comercial del producto (obligatorio)', 'Ejemplo': 'Detergente Multiusos 1L' },
        { 'Campo': 'Categoría', 'Descripción': 'Clasificación del producto (opcional)', 'Ejemplo': 'Limpieza' },
        { 'Campo': 'Unidad de Medida', 'Descripción': 'UM base del producto (opcional, defecto: unidad)', 'Ejemplo': 'unidad, kg, litro, caja' },
        { 'Campo': 'Costo', 'Descripción': 'Precio de costo por unidad (obligatorio, numérico)', 'Ejemplo': '85.50' },
        { 'Campo': 'Precio Venta', 'Descripción': 'Precio de venta al público (obligatorio, numérico)', 'Ejemplo': '120.00' },
        { 'Campo': 'Stock Mínimo', 'Descripción': 'Nivel mínimo de alerta de stock (opcional, numérico)', 'Ejemplo': '10' },
        { 'Campo': 'Código de Barras', 'Descripción': 'Código EAN/UPC para etiquetas (opcional)', 'Ejemplo': '7501234567890' },
        { 'Campo': 'Proveedor', 'Descripción': 'Nombre del proveedor (opcional)', 'Ejemplo': 'Distribuidora ABC' },
        { 'Campo': 'Descripción', 'Descripción': 'Descripción detallada del producto (opcional)', 'Ejemplo': 'Detergente concentrado' },
      ];
      const instSheet = XLSX.utils.json_to_sheet(instructions);
      instSheet['!cols'] = [{ wch: 20 }, { wch: 55 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(workbook, instSheet, 'Instrucciones');
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = isEmpty
      ? `Plantilla_Catalogo_CostPro_${timestamp}.xlsx`
      : `Catalogo_${storeName || 'Productos'}_${timestamp}.xlsx`;

    XLSX.writeFile(workbook, fileName);

    toast.success(
      isEmpty
        ? 'Plantilla de catálogo descargada. Completa los datos y usa Importar.'
        : `${products.length} productos exportados a Excel correctamente.`
    );
  } catch (error) {
    console.error('Error exporting catalog to Excel:', error);
    toast.error('Error al exportar el catálogo a Excel');
  }
}

/**
 * Parse an Excel file and return structured catalog rows ready for import.
 * Handles flexible header mapping (Spanish/English aliases).
 * Returns both valid rows and validation errors with row numbers.
 */
export async function importCatalogFromExcel(
  file: File
): Promise<{ rows: CatalogImportProduct[]; errors: ImportError[]; totalCount: number }> {
  const XLSX = await createWorkbook();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

        if (rawData.length === 0) {
          reject(new Error('El archivo está vacío o no tiene datos en la primera hoja.'));
          return;
        }

        // Flexible header mapping: Spanish & English aliases
        const headerMap: Record<string, string[]> = {
          sku: ['sku', 'SKU', 'Sku', 'Identificador', 'Código', 'Codigo', 'ID', 'id'],
          name: ['nombre', 'Nombre', 'name', 'Name', 'Nombre del Producto', 'Producto'],
          category: ['categoría', 'categoria', 'Categoría', 'Categoria', 'category', 'Category', 'Categoría (opcional)'],
          unit_of_measure: ['unidad de medida', 'Unidad de Medida', 'UM', 'um', 'Unidad', 'unidad'],
          cost_price: ['costo', 'Costo', 'cost', 'Cost', 'Precio Costo'],
          price: ['precio venta', 'Precio Venta', 'precio', 'Precio', 'price', 'Price', 'Precio de Venta'],
          min_stock: ['stock mínimo', 'Stock Mínimo', 'Stock Minimo', 'min_stock', 'Min Stock'],
          barcode: ['código de barras', 'Código de Barras', 'Codigo de Barras', 'barcode', 'Barcode', 'EAN', 'UPC'],
          supplier: ['proveedor', 'Proveedor', 'supplier', 'Supplier'],
          description: ['descripción', 'descripcion', 'Descripción', 'Descripcion', 'description', 'Description'],
        };

        // Build reverse map: from header text to normalized key
        const reverseMap = new Map<string, string>();
        for (const [key, aliases] of Object.entries(headerMap)) {
          for (const alias of aliases) {
            reverseMap.set(alias.toLowerCase(), key);
          }
        }

        const rows: CatalogImportProduct[] = [];
        const errors: ImportError[] = [];
        const seenSkus = new Set<string>();

        rawData.forEach((rawRow, index) => {
          const rowNumber = index + 2; // Excel rows are 1-indexed + header

          // Normalize column keys using the reverse map
          const normalized: Record<string, unknown> = {};
          for (const [header, value] of Object.entries(rawRow)) {
            const key = reverseMap.get(header.toLowerCase().trim()) || header.toLowerCase().trim();
            normalized[key] = value;
          }

          const sku = String(normalized.sku || '').trim();
          const name = String(normalized.name || '').trim();

          // Validate required fields
          if (!sku && !name) return; // Skip completely empty rows
          if (!sku) {
            errors.push({ row: rowNumber, message: 'El SKU es obligatorio' });
            return;
          }
          if (!name) {
            errors.push({ row: rowNumber, message: 'El Nombre es obligatorio' });
            return;
          }
          if (seenSkus.has(sku)) {
            errors.push({ row: rowNumber, message: `SKU duplicado en el archivo: "${sku}"` });
            return;
          }
          seenSkus.add(sku);

          const costPrice = parseFloat(String(normalized.cost_price || 0));
          const price = parseFloat(String(normalized.price || 0));

          if (isNaN(costPrice) || costPrice < 0) {
            errors.push({ row: rowNumber, message: `Costo inválido para "${name}"` });
            return;
          }
          if (isNaN(price) || price < 0) {
            errors.push({ row: rowNumber, message: `Precio de venta inválido para "${name}"` });
            return;
          }

          // Auto-generate EAN-13 barcode if not provided or is a placeholder
          const rawBarcode = String(normalized.barcode || '').trim();
          const barcode = needsBarcodeAutogeneration(rawBarcode)
            ? generateEAN13FromSKU(sku)
            : rawBarcode;

          rows.push({
            sku,
            name,
            category: String(normalized.category || '').trim() || null,
            unit_of_measure: String(normalized.unit_of_measure || 'unidad').trim(),
            cost_price: costPrice,
            price: price,
            min_stock: parseFloat(String(normalized.min_stock || 0)) || 0,
            barcode,
            supplier: String(normalized.supplier || '').trim() || null,
            description: String(normalized.description || '').trim() || null,
          });
        });

        resolve({ rows, errors, totalCount: rawData.length });
      } catch (err) {
        console.error('Error importing catalog from Excel:', err);
        reject(new Error('Error al procesar el archivo Excel. Verifica que el formato sea correcto.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo seleccionado.'));
    reader.readAsArrayBuffer(file);
  });
}

export interface CatalogImportProduct {
  sku: string;
  name: string;
  category: string | null;
  unit_of_measure: string;
  cost_price: number;
  price: number;
  min_stock: number;
  barcode: string;
  supplier: string | null;
  description: string | null;
}

export interface ImportError {
  row: number;
  message: string;
}

// ============================================
// Product Image Upload Service
// ============================================

export const catalogService = {
  async uploadProductImage(productId: string, file: File) {
    // The compression pipeline (compressImage) already ensures the file is
    // under 200KB and max 1024px. We keep a generous 5MB safety net in case
    // someone calls this directly bypassing compression, but the primary
    // enforcement happens at validation time (validateImageFile: 10MB max).
    const MAX_UPLOAD_MB = 5;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new Error(
        `La imagen comprimida sigue siendo mayor a ${MAX_UPLOAD_MB} MB. ` +
        'Intenta con una imagen más pequeña o con menos resolución.'
      );
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${productId}-${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('products')
      .update({ image_url: fileName })
      .eq('id', productId);

    if (updateError) throw updateError;

    return fileName;
  },
};
