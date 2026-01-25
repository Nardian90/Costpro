import Papa from 'papaparse';
import { toast } from 'sonner';
import { Product } from '@/types';
import { supabase } from '@/lib/supabaseClient';

export const catalogService = {
  exportCatalog(products: Product[]) {
    if (products.length === 0) {
      toast.error('No hay productos para exportar');
      return;
    }

    const exportData = products.map(product => ({
      sku: product.sku,
      nombre: product.name,
      costo: product.cost_price || 0,
      precio: product.price || 0,
      imageUrl: product.public_image_url || ''
    }));

    const csv = Papa.unparse(exportData, {
      header: true,
      columns: ['sku', 'nombre', 'costo', 'precio', 'imageUrl']
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `catalogo_productos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Catálogo exportado');
  },

  downloadTemplate() {
    const templateData = [
      { sku: 'PROD-001', nombre: 'Nombre del Producto', costo: 100.50, precio: 150.75, imageUrl: 'https://ejemplo.com/imagen.png' }
    ];
    const csv = Papa.unparse(templateData, {
      header: true,
      columns: ['sku', 'nombre', 'costo', 'precio', 'imageUrl']
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_productos.csv');
    link.click();
  },

  async processImportFile(file: File, storeId: string) {
    return new Promise<{ productsToUpdate: any[], errors: any[] }>((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as any[];
          const headerAliases = {
            sku: ['sku', 'SKU', 'Identificador', 'Código', 'ID', 'id', 'urlid'],
            name: ['name', 'nombre', 'NombreProducto'],
            cost: ['cost', 'costo', 'Costo'],
            price: ['price', 'precio', 'Precio'],
            imageUrl: ['imageUrl', 'imagen', 'Imagen', 'image_url'],
          };

          const fileHeaders = results.meta.fields || [];
          const headerMapping: { [key: string]: string } = {};
          const missingHeaders: string[] = [];

          for (const canonicalHeader in headerAliases) {
            const aliases = headerAliases[canonicalHeader as keyof typeof headerAliases];
            const foundAlias = fileHeaders.find(header => aliases.includes(header.trim()));
            if (foundAlias) {
              headerMapping[canonicalHeader] = foundAlias.trim();
            } else if (canonicalHeader !== 'imageUrl') {
              missingHeaders.push(canonicalHeader);
            }
          }

          if (missingHeaders.length > 0) {
            toast.error(`Faltan las siguientes columnas requeridas: ${missingHeaders.join(', ')}`);
            resolve({ productsToUpdate: [], errors: [{ row: 0, message: `Faltan columnas: ${missingHeaders.join(', ')}` }] });
            return;
          }

          const normalizedData = data.map(row => {
            const newRow: any = {};
            for (const canonicalHeader in headerMapping) {
              newRow[canonicalHeader] = row[headerMapping[canonicalHeader]];
            }
            return newRow;
          });

          const validationErrors: { row: number; message: string }[] = [];
          const productsToUpdate = [];
          const seenSkus = new Set<string>();

          for (const [index, row] of normalizedData.entries()) {
            const rowNum = index + 2;
            let { sku, name, cost, price, imageUrl } = row;

            if (!sku || sku.trim() === '') {
                validationErrors.push({ row: rowNum, message: "El 'SKU' es obligatorio." });
                continue;
            }

            const cleanSku = sku.trim();

            if (seenSkus.has(cleanSku)) {
              validationErrors.push({ row: rowNum, message: `El SKU '${cleanSku}' está duplicado en el archivo.` });
              continue;
            }
            seenSkus.add(cleanSku);

            const costValue = parseFloat(cost);
            const priceValue = parseFloat(price);

            if (isNaN(costValue) || costValue < 0) {
              validationErrors.push({ row: rowNum, message: "El 'costo' debe ser un número válido." });
            }

            if (isNaN(priceValue) || priceValue < 0) {
              validationErrors.push({ row: rowNum, message: "El 'precio' debe ser un número válido." });
            }

            if (!isNaN(costValue) && !isNaN(priceValue) && priceValue < costValue) {
              validationErrors.push({ row: rowNum, message: "El precio de venta no puede ser menor que el costo." });
            }

            if (!name) {
              validationErrors.push({ row: rowNum, message: "El 'nombre' del producto es obligatorio." });
              continue;
            }

            productsToUpdate.push({
              sku: cleanSku,
              store_id: storeId,
              name,
              cost_price: costValue,
              price: priceValue,
              image_url: imageUrl || '',
            });
          }

          resolve({ productsToUpdate, errors: validationErrors });
        },
      });
    });
  },

  async uploadProductImage(productId: string, file: File) {
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('La imagen no debe superar los 2MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${productId}-${Math.random()}.${fileExt}`;

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

  async getProductVariants(productId: string) {
    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId);
    if (error) throw error;
    return data;
  }
};
