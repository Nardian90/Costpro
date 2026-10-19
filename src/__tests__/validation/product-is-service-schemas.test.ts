/**
 * product-is-service-schemas.test.ts — MISIÓN TIPO-DE-ARTÍCULO (2026-10-19).
 *
 * Contrato del campo `is_service` (products.is_service) en la capa Zod:
 *   1. productSchema PRESERVA is_service (antes lo strippeaba silenciosamente
 *      — z.object descarta claves desconocidas → el campo jamás llegaba al
 *      frontend desde las RPCs de lectura).
 *   2. Preprocesado resiliente: true/'true'/false/'false'/null/undefined.
 *   3. Default false en productSchema/createProductInputSchema (= DEFAULT de
 *      la BD: producto físico) — nunca NULL.
 *   4. updateProductInputSchema: is_service es OPCIONAL sin default — un
 *      PATCH parcial que no lo envía NO lo sobrescribe (patrón
 *      HARDENING-CATALOG-EDIT); cuando se envía, valida booleano.
 *   5. La categoría comercial NO determina el tipo: «Servicios» como category
 *      NO autofija is_service (independencia exigida por la misión §4).
 */
import { describe, it, expect } from 'vitest';
import {
  productSchema,
  createProductInputSchema,
  updateProductInputSchema,
} from '@/validation/schemas';

const baseProduct = {
  id: '3f0d6f9e-1c2b-4d5e-9f8a-7b6c5d4e3f2a',
  name: 'Servicio de cripiar',
  sku: '999',
  price: 1,
  cost_price: 0,
};

describe('MISIÓN TIPO-DE-ARTÍCULO — schemas Zod', () => {

  describe('productSchema preserva is_service (no strip)', () => {
    it('retorna is_service=true cuando la RPC lo envía', () => {
      const parsed = productSchema.parse({ ...baseProduct, is_service: true });
      expect(parsed.is_service).toBe(true);
    });

    it('retorna is_service=false para producto físico', () => {
      const parsed = productSchema.parse({ ...baseProduct, is_service: false });
      expect(parsed.is_service).toBe(false);
    });

    it('default false cuando la RPC no lo envía (compatibilidad)', () => {
      const parsed = productSchema.parse(baseProduct);
      expect(parsed.is_service).toBe(false);
    });

    it('preprocesa strings "true"/"false" (RPCs legacy)', () => {
      expect(productSchema.parse({ ...baseProduct, is_service: 'true' }).is_service).toBe(true);
      expect(productSchema.parse({ ...baseProduct, is_service: 'false' }).is_service).toBe(false);
    });

    it('null → default false (nunca NULL en el estado del frontend)', () => {
      const parsed = productSchema.parse({ ...baseProduct, is_service: null });
      expect(parsed.is_service).toBe(false);
    });
  });

  describe('createProductInputSchema persiste is_service', () => {
    it('servicio (is_service=true) pasa íntegro al insert', () => {
      const parsed = createProductInputSchema.parse({
        name: 'Mantenimiento de AC',
        sku: 'SVC-001',
        price: 950,
        cost_price: 0,
        is_service: true,
      });
      expect(parsed.is_service).toBe(true);
    });

    it('producto físico (is_service=false) pasa íntegro al insert', () => {
      const parsed = createProductInputSchema.parse({
        name: 'Detergente 1L',
        sku: 'PROD-001',
        price: 120,
        cost_price: 85,
        is_service: false,
      });
      expect(parsed.is_service).toBe(false);
    });

    it('sin is_service → default false explícito (columna NOT NULL de la BD)', () => {
      const parsed = createProductInputSchema.parse({
        name: 'Producto legacy',
        sku: 'LEG-001',
        price: 10,
        cost_price: 5,
      });
      expect(parsed.is_service).toBe(false);
    });

    it('la categoría «Servicios» NO autofija is_service (independencia comercial)', () => {
      const parsed = createProductInputSchema.parse({
        name: 'Kit de limpieza físico',
        sku: 'KIT-001',
        category: 'Servicios',
        price: 500,
        cost_price: 300,
        is_service: false,
      });
      // Un producto físico en categoría «Servicios» sigue siendo físico:
      // la categoría NO desactiva sus controles de existencias.
      expect(parsed.category).toBe('Servicios');
      expect(parsed.is_service).toBe(false);
    });
  });

  describe('updateProductInputSchema — PATCH parcial seguro', () => {
    it('is_service se envía como booleano cuando viene en el payload', () => {
      const parsed = updateProductInputSchema.parse({ is_service: true });
      expect(parsed.is_service).toBe(true);
      const parsedOff = updateProductInputSchema.parse({ is_service: false });
      expect(parsedOff.is_service).toBe(false);
    });

    it('is_service ausente → undefined (NO se sobrescribe el valor persistido)', () => {
      const parsed = updateProductInputSchema.parse({ description: 'solo descripción' });
      expect(parsed.is_service).toBeUndefined();
      // El resto de campos con default tampoco viaja en un PATCH mínimo.
      expect(parsed.description).toBe('solo descripción');
    });

    it('un PATCH de solo descripción NO arrastra is_service=false (anti-reclasificación)', () => {
      // Regresión crítica: si is_service tuviera .default(false) en el update,
      // editar SOLO la descripción de un servicio lo reclasificaría como
      // producto físico y volvería a exigirle stock.
      const parsed = updateProductInputSchema.parse({ description: 'nueva descripción' });
      expect('is_service' in parsed && parsed.is_service === false).toBe(false);
    });
  });
});
