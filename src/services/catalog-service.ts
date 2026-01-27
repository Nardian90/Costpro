import Papa from 'papaparse';
import { toast } from 'sonner';
import { Product } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { importService } from './import-service';
import { catalogImportRowSchema } from '@/validation/schemas';

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
    const headerAliases = {
      sku: ['sku', 'SKU', 'Identificador', 'Código', 'ID', 'id', 'urlid'],
      name: ['name', 'nombre', 'NombreProducto'],
      cost: ['cost', 'costo', 'Costo'],
      price: ['price', 'precio', 'Precio'],
      imageUrl: ['imageUrl', 'imagen', 'Imagen', 'image_url'],
    };

    const requiredHeaders = ['sku', 'name', 'cost', 'price'];

    const { data, errors } = await importService.parseCSV(
      file,
      headerAliases,
      catalogImportRowSchema,
      requiredHeaders
    );

    if (errors.some(e => e.row === 0)) {
        toast.error(errors[0].message);
        return { productsToUpdate: [], errors };
    }

    const productsToUpdate = [];
    const validationErrors = [...errors];
    const seenSkus = new Set<string>();

    for (const { rowData, rowNumber } of data) {
      const cleanSku = rowData.sku.trim();

      if (seenSkus.has(cleanSku)) {
        validationErrors.push({ row: rowNumber, message: `El SKU '${cleanSku}' está duplicado en el archivo.` });
        continue;
      }
      seenSkus.add(cleanSku);

      productsToUpdate.push({
        sku: cleanSku,
        store_id: storeId,
        name: rowData.name,
        cost_price: rowData.cost,
        price: rowData.price,
        image_url: rowData.imageUrl || '',
      });
    }

    return { productsToUpdate, errors: validationErrors.sort((a, b) => a.row - b.row) };
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
