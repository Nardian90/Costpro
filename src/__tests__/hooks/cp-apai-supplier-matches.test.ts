/**
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 8 (D).
 *
 * Pruebas de la prevención de duplicados (misión §FASE 6.4): normalización
 * de nombre (la causa raíz del quirk «TiendaPueblo» auditado era una
 * variante de espaciado) y coincidencias por nombre normalizado / NIT /
 * teléfono — ADVERTENCIA previa, nunca unicidad estricta (§8.4: pueden
 * existir empresas con nombres iguales o similares).
 */
import { describe, it, expect } from 'vitest';
import { normalizeSupplierName, findSupplierMatches, type Supplier } from '@/hooks/api/useSuppliers';

const sup = (over: Partial<Supplier> & Pick<Supplier, 'id' | 'name'>): Supplier => ({
  store_id: 'st-1',
  tax_id: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  is_active: true,
  created_at: '2026-10-26T15:03:32Z',
  updated_at: '2026-10-26T15:03:32Z',
  ...over,
});

describe('normalizeSupplierName — normalización para detección (misión §8.4)', () => {
  it('«TiendaPueblo» ≡ «Tienda Pueblo» (causa raíz del quirk auditado)', () => {
    expect(normalizeSupplierName('Tienda Pueblo')).toBe(normalizeSupplierName('TiendaPueblo'));
    expect(normalizeSupplierName('Tienda Pueblo')).toBe('tiendapueblo');
  });

  it('ignora caso, diacríticos, puntuación y espaciado múltiple', () => {
    expect(normalizeSupplierName('Ferretería El  Sol')).toBe(normalizeSupplierName('ferreteriaelsol'));
    expect(normalizeSupplierName('FERRETERÍA EL SOL.')).toBe(normalizeSupplierName('ferreteria el sol'));
    expect(normalizeSupplierName('  A&B   Comercial ')).toBe('abcomercial');
  });

  it('vacíos y nulos → cadena vacía (no producen matches falsos)', () => {
    expect(normalizeSupplierName('')).toBe('');
    expect(normalizeSupplierName(null)).toBe('');
    expect(normalizeSupplierName(undefined)).toBe('');
    expect(normalizeSupplierName('   ')).toBe('');
  });
});

describe('findSupplierMatches — candidatos a advertir (misión §6.4)', () => {
  const existing: Supplier[] = [
    sup({ id: 's1', name: 'Tienda Pueblo', phone: '+53 5 123 4567' }),
    sup({ id: 's2', name: 'Pixelarte', tax_id: '12345678901' }),
    sup({ id: 's3', name: 'Cafetería La Esquina' }),
  ];

  it('match por nombre normalizado (variante de espaciado)', () => {
    const m = findSupplierMatches(existing, { name: 'TiendaPueblo' });
    expect(m.map(x => x.id)).toEqual(['s1']);
  });

  it('match por NIT/CI (identificación fiscal)', () => {
    const m = findSupplierMatches(existing, { name: 'Pixel Art Diseño', tax_id: '12345678901' });
    expect(m.map(x => x.id)).toEqual(['s2']);
  });

  it('match por teléfono (ignora formato de separadores)', () => {
    const m = findSupplierMatches(existing, { name: 'Bazar Nuevo', phone: '5351234567' });
    expect(m.map(x => x.id)).toEqual(['s1']);
  });

  it('sin coincidencias: nombres claramente distintos no advierten', () => {
    expect(findSupplierMatches(existing, { name: 'Transporte Rápido' })).toEqual([]);
    expect(findSupplierMatches(existing, { name: 'Distribuidora Central' })).toEqual([]);
  });

  it('nombres similares pero NO idénticos normalizados NO producen match falso', () => {
    // «no imponer unicidad estricta basada exclusivamente en el nombre»:
    // solo la igualdad normalizada exacta advierte (no fuzzy).
    expect(findSupplierMatches(existing, { name: 'Tienda Pueblito' })).toEqual([]);
    expect(findSupplierMatches(existing, { name: 'Cafetería La Esquinera' })).toEqual([]);
  });

  it('teléfonos cortos (<6 dígitos) no producen matches por azar', () => {
    const m = findSupplierMatches(existing, { name: 'Nuevo Proveedor', phone: '123' });
    expect(m).toEqual([]);
  });

  it('nombre vacío nunca advierte', () => {
    expect(findSupplierMatches(existing, { name: '' })).toEqual([]);
    expect(findSupplierMatches(existing, { name: '   ' })).toEqual([]);
  });
});
