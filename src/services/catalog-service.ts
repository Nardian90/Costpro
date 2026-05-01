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

    const result = await importService.parseAndValidate(file, catalogImportRowSchema, headerAliases);

    // Additional business logic: check for duplicate SKUs in the file
    const productsToUpdate: any[] = [];
    const errors = [...result.errors];
    const seenSkus = new Set<string>();

    for (const entry of result.data) {
      const { row, item } = entry;
      if (seenSkus.has(item.sku)) {
        errors.push({ row, message: `El SKU '${item.sku}' está duplicado en el archivo.` });
        continue;
      }
      seenSkus.add(item.sku);

      productsToUpdate.push({
        ...item,
        store_id: storeId,
        cost_price: item.cost,
        image_url: item.imageUrl || '',
      });
    }

    return { productsToUpdate, errors };
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
      .select('id, product_id, name, sku, price, conversion_factor, created_at, updated_at')
      .eq('product_id', productId);
    if (error) throw error;
    return data;
  }
};
