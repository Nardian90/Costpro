/**
 * product-completeness.ts — Utilidad para detectar por qué un producto está incompleto.
 *
 * Accessibility-Fix: el badge "Incompleto" ahora muestra un tooltip con los campos
 * que faltan para completar el producto. También se usa en EditProductModal para
 * mostrar un checklist de completitud que guía al usuario.
 *
 * Criterios de completitud (basados en campos comunes de productos):
 *  - name (requerido, pero siempre existe)
 *  - sku (recomendado para identificación)
 *  - cost_price > 0 (sin costo no se puede calcular margen)
 *  - price > 0 (precio de venta)
 *  - price > cost_price (margen positivo)
 *  - stock_current definido (no null)
 *  - min_stock definido (para alertas)
 *  - unit_of_measure (unidad de medida)
 *  - category (categoría)
 *  - image_url o public_image_url (imagen)
 *  - barcode (código de barras, opcional pero recomendado)
 *
 * Si la BD tiene el flag is_complete=false, se usa. Si no, se calcula con los campos.
 */

import type { Product } from '@/types';

export interface IncompleteReason {
  field: keyof Product;
  label: string;
  severity: 'critical' | 'recommended';
  hint: string;
}

/**
 * Devuelve la lista de campos que faltan para que el producto esté "completo".
 * Si el array está vacío, el producto está completo.
 */
export function getIncompleteReasons(product: Partial<Product>): IncompleteReason[] {
  const reasons: IncompleteReason[] = [];

  // ── Críticos (impiden operación) ──
  if (!product.sku || product.sku.trim() === '') {
    reasons.push({
      field: 'sku',
      label: 'SKU',
      severity: 'critical',
      hint: 'Identificador único del producto. Necesario para recepciones, ventas y reportes.',
    });
  }

  if (!product.cost_price || product.cost_price <= 0) {
    reasons.push({
      field: 'cost_price',
      label: 'Costo',
      severity: 'critical',
      hint: 'Costo de adquisición o producción. Sin costo no se puede calcular el margen.',
    });
  }

  if (!product.price || product.price <= 0) {
    reasons.push({
      field: 'price',
      label: 'Precio de venta',
      severity: 'critical',
      hint: 'Precio al que se vende el producto. Debe ser mayor que el costo.',
    });
  }

  if (
    product.cost_price &&
    product.cost_price > 0 &&
    product.price &&
    product.price > 0 &&
    product.price < product.cost_price
  ) {
    reasons.push({
      field: 'price',
      label: 'Margen negativo',
      severity: 'critical',
      hint: `El precio (${product.price}) es menor que el costo (${product.cost_price}). Ajusta el precio o el costo.`,
    });
  }

  if (product.stock_current == null) {
    reasons.push({
      field: 'stock_current',
      label: 'Stock actual',
      severity: 'critical',
      hint: 'Cantidad en inventario. Sin stock no se puede vender ni recibir.',
    });
  }

  // ── Recomendados (mejoran la gestión) ──
  if (!product.unit_of_measure || product.unit_of_measure.trim() === '') {
    reasons.push({
      field: 'unit_of_measure',
      label: 'Unidad de medida',
      severity: 'recommended',
      hint: 'Ej: unidad, kg, litro, caja. Necesario para recepciones y conversiones.',
    });
  }

  if (!product.category || product.category.trim() === '') {
    reasons.push({
      field: 'category',
      label: 'Categoría',
      severity: 'recommended',
      hint: 'Agrupa productos para filtros y reportes. Ej: Bebidas, Lácteos.',
    });
  }

  if (!product.min_stock || product.min_stock <= 0) {
    reasons.push({
      field: 'min_stock',
      label: 'Stock mínimo',
      severity: 'recommended',
      hint: 'Umbral para alertas de stock bajo. Recomendado para reposición automática.',
    });
  }

  if (!product.image_url && !product.public_image_url) {
    reasons.push({
      field: 'image_url',
      label: 'Imagen',
      severity: 'recommended',
      hint: 'Foto del producto. Mejora la identificación en POS y catálogo.',
    });
  }

  if (!product.barcode) {
    reasons.push({
      field: 'barcode',
      label: 'Código de barras',
      severity: 'recommended',
      hint: 'Código EAN/UPC para escaneo rápido en POS. Opcional pero acelera las ventas.',
    });
  }

  return reasons;
}

/**
 * Devuelve true si el producto está incompleto (tiene al menos 1 campo crítico faltante).
 * Usa el flag is_complete de la BD si existe, sino calcula con getIncompleteReasons.
 */
export function isProductIncomplete(product: Partial<Product>): boolean {
  // Si la BD ya marcó is_complete=false, respetarlo
  if (product.is_complete === false) return true;
  if (product.is_complete === true) return false;
  // Si no hay flag, calcular
  return getIncompleteReasons(product).some(r => r.severity === 'critical');
}

/**
 * Devuelve un string resumido de los motivos para mostrar en tooltips.
 */
export function getIncompleteSummary(product: Partial<Product>): string {
  const reasons = getIncompleteReasons(product);
  if (reasons.length === 0) return 'Producto completo';

  const critical = reasons.filter(r => r.severity === 'critical');
  const recommended = reasons.filter(r => r.severity === 'recommended');

  const parts: string[] = [];
  if (critical.length > 0) {
    parts.push(`Faltan (${critical.length}): ${critical.map(r => r.label).join(', ')}`);
  }
  if (recommended.length > 0) {
    parts.push(`Recomendado (${recommended.length}): ${recommended.map(r => r.label).join(', ')}`);
  }
  return parts.join(' · ');
}
