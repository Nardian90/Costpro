/**
 * movement-types.test.ts — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Completitud y coherencia del registro canónico de tipos de movimiento:
 *   - Los 5 flujos prioritarios de la misión existen y tienen datos reales.
 *   - Los flujos descubiertos (devoluciones, ajustes, transferencias,
 *     catálogo, OC, pagos) están registrados.
 *   - Solo los tipos 'configurable' pueden tener preferencia habilitada.
 *   - IDs estables y únicos (clave de la preferencia usuario+tienda+tipo).
 *   - Cada tipo apunta a una vista real de navegación.
 */
import { describe, it, expect } from 'vitest';
import {
  MOVEMENT_TYPES,
  PREFERENCE_ENABLED_TYPES,
  WORK_DATE_AREAS,
  getMovementType,
  PRIORITY_TYPE_IDS,
} from '@/config/work-dates/movement-types';

describe('Registro de tipos de movimiento — Fechas de trabajo', () => {
  it('contiene los 5 flujos prioritarios de la misión', () => {
    for (const id of PRIORITY_TYPE_IDS) {
      const t = getMovementType(id);
      expect(t, `falta el tipo prioritario ${id}`).toBeDefined();
      expect(t!.label.length).toBeGreaterThan(3);
      expect(t!.area).toBeOneOf(WORK_DATE_AREAS);
    }
  });

  it('registra los flujos descubiertos con selector o regla documentada', () => {
    const ids = MOVEMENT_TYPES.map((t) => t.id);
    for (const expected of ['devolution', 'inventory_adjustment', 'transfer', 'catalog_sale', 'purchase_order', 'supplier_payment']) {
      expect(ids, `falta el flujo descubierto ${expected}`).toContain(expected);
    }
  });

  it('los IDs son únicos (clave estable de la preferencia por tipo)', () => {
    const ids = MOVEMENT_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('solo los tipos configurables aceptan preferencia de fecha de trabajo', () => {
    for (const t of MOVEMENT_TYPES) {
      if (t.preferenceEnabled) {
        expect(t.status, `${t.id}: preferencia habilitada en un tipo no configurable`).toBe('configurable');
        expect(PREFERENCE_ENABLED_TYPES).toContain(t.id);
      } else {
        expect(PREFERENCE_ENABLED_TYPES).not.toContain(t.id);
      }
    }
  });

  it('la caja es FIJA (ventana temporal del turno) y sin preferencia', () => {
    const cash = getMovementType('cash_shift')!;
    expect(cash.status).toBe('fija');
    expect(cash.preferenceEnabled).toBe(false);
    expect(cash.policyNote).toMatch(/ventana/i);
  });

  it('la OC es INFORMATIVA (fecha esperada de planificación)', () => {
    const po = getMovementType('purchase_order')!;
    expect(po.status).toBe('informativa');
    expect(po.preferenceEnabled).toBe(false);
  });

  it('cada tipo declara campos de fecha efectiva y técnica (auditoría §2.1)', () => {
    for (const t of MOVEMENT_TYPES) {
      expect(t.dateFields.effective.length, `${t.id}: sin fecha efectiva`).toBeGreaterThan(3);
      expect(t.dateFields.technical.length, `${t.id}: sin fecha técnica`).toBeGreaterThan(3);
    }
  });

  it('cada tipo configurable declara dónde vive el selector visible', () => {
    for (const t of MOVEMENT_TYPES.filter((x) => x.status === 'configurable')) {
      expect(t.selectorLocation.length, `${t.id}: sin ubicación del selector`).toBeGreaterThan(5);
    }
  });

  it('las áreas del filtro coinciden con las áreas del registro', () => {
    const areas = new Set(MOVEMENT_TYPES.map((t) => t.area));
    for (const a of areas) expect(WORK_DATE_AREAS).toContain(a);
  });

  it('PREFERENCE_ENABLED_TYPES cubre exactamente los tipos habilitados', () => {
    const enabled = MOVEMENT_TYPES.filter((t) => t.preferenceEnabled).map((t) => t.id);
    expect([...PREFERENCE_ENABLED_TYPES].sort()).toEqual([...enabled].sort());
  });
});
