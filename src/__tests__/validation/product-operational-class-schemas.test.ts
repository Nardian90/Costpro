/**
 * product-operational-class-schemas.test.ts — CP-OPERATIONAL-CLASS-001.
 *
 * Contrato Zod de persistencia (misión §2):
 *  · productSchema PRESERVA la clasificación y acepta NULL (Sin clasificar).
 *  · updateProductInputSchema permite asignarla Y QUITARLA (null) sin
 *    re-declarar defaults inventados.
 *  · bulkImportProductSchema (estricto): opcional/nullable — una importación
 *    sin la columna deja «Sin clasificar»; un valor inválido RECHAZA la fila.
 */
import { describe, it, expect } from 'vitest';
import {
  productSchema,
  createProductInputSchema,
  updateProductInputSchema,
  productOperationalClassSchema,
} from '@/validation/schemas';
import { bulkImportProductSchema } from '@/validation/api-schemas';

const base = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Detergente Multiusos 1L',
  sku: 'DET-001',
  price: 120,
  cost_price: 85,
  store_id: 'b1000000-0000-4000-8000-000000000001',
};

describe('CP-OPERATIONAL-CLASS-001 · schemas Zod', () => {

  it('productOperationalClassSchema acepta los 4 valores y rechaza otros', () => {
    expect(productOperationalClassSchema.safeParse('venta').success).toBe(true);
    expect(productOperationalClassSchema.safeParse('insumo').success).toBe(true);
    expect(productOperationalClassSchema.safeParse('activo_fijo').success).toBe(true);
    expect(productOperationalClassSchema.safeParse('util_herramienta').success).toBe(true);
    expect(productOperationalClassSchema.safeParse('venta ').success).toBe(false);
    expect(productOperationalClassSchema.safeParse('Servicio').success).toBe(false);
    expect(productOperationalClassSchema.safeParse('').success).toBe(false);
  });

  it('productSchema: sin clasificación → undefined; con NULL → null (Sin clasificar, no un default)', () => {
    const without = productSchema.parse(base);
    expect(without.operational_class).toBeUndefined();

    const nulled = productSchema.parse({ ...base, operational_class: null });
    expect(nulled.operational_class).toBeNull();
  });

  it('productSchema: preserva cada valor del enum y RECHAZA valores ajenos', () => {
    for (const v of ['venta', 'insumo', 'activo_fijo', 'util_herramienta'] as const) {
      expect(productSchema.parse({ ...base, operational_class: v }).operational_class).toBe(v);
    }
    expect(productSchema.safeParse({ ...base, operational_class: 'categoria_comercial' }).success).toBe(false);
  });

  it('createProductInputSchema: el alta puede exigir la clasificación explícita y transportarla', () => {
    const created = createProductInputSchema.parse({
      ...base,
      id: undefined,
      operational_class: 'activo_fijo',
    });
    expect(created.operational_class).toBe('activo_fijo');
  });

  it('updateProductInputSchema parcial: asignar y QUITAR (null) sin defaults espurios', () => {
    // Update parcial de SOLO la clasificación: el resto queda undefined (no 0/'CUP').
    const assign = updateProductInputSchema.parse({ operational_class: 'insumo' });
    expect(assign.operational_class).toBe('insumo');
    expect(assign.price).toBeUndefined();
    expect(assign.price_currency).toBeUndefined();

    const remove = updateProductInputSchema.parse({ operational_class: null });
    expect(remove.operational_class).toBeNull();

    // Un update que no la menciona NO la toca (undefined, no null): el PATCH
    // del modal siempre la envía, pero otros updates parciales no deben
    // des-clasificar por accidente.
    const untouched = updateProductInputSchema.parse({ price: 300 });
    expect(untouched.operational_class).toBeUndefined();
    expect(untouched.price).toBe(300);
  });

  it('bulkImportProductSchema (strict): opcional/nullable; inválido → rechazo fail-closed', () => {
    const row = { store_id: base.store_id, sku: 'X1', name: 'Producto X', cost_price: 1, price: 2 };
    // Sin la columna → Sin clasificar (persistirá NULL).
    const absent = bulkImportProductSchema.parse(row);
    expect(absent.operational_class).toBeUndefined();
    // Con null explícito.
    expect(bulkImportProductSchema.parse({ ...row, operational_class: null }).operational_class).toBeNull();
    // Con valores válidos.
    expect(bulkImportProductSchema.parse({ ...row, operational_class: 'insumo' }).operational_class).toBe('insumo');
    // Inválido → rechazo (la ruta devuelve error de fila; NO se inventa valor).
    expect(bulkImportProductSchema.safeParse({ ...row, operational_class: 'decoración' }).success).toBe(false);
    // .strict(): campos desconocidos siguen rechazándose.
    expect(bulkImportProductSchema.safeParse({ ...row, operacional_class: 'venta' }).success).toBe(false);
  });
});
