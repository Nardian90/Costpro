/**
 * product-operational-class.test.ts — CP-OPERATIONAL-CLASS-001.
 *
 * Contrato del módulo compartido: opciones canónicas, etiquetas seguras y
 * normalización fail-closed de celdas de importación (misión §2: los valores
 * no reconocidos NO se adivinan; la celda vacía = Sin clasificar, jamás un
 * valor inventado).
 */
import { describe, it, expect } from 'vitest';
import {
  OPERATIONAL_CLASS_OPTIONS,
  OPERATIONAL_CLASS_LABELS,
  UNCLASSIFIED_LABEL,
  operationalClassLabel,
  parseOperationalClassCell,
} from '@/lib/product-operational-class';

describe('CP-OPERATIONAL-CLASS-001 · módulo compartido de clasificación operativa', () => {

  it('expone exactamente las 4 opciones del enum de BD con sus etiquetas', () => {
    expect(OPERATIONAL_CLASS_OPTIONS.map((o) => o.value)).toEqual([
      'venta', 'insumo', 'activo_fijo', 'util_herramienta',
    ]);
    expect(OPERATIONAL_CLASS_OPTIONS.map((o) => o.label)).toEqual([
      'Venta', 'Insumo', 'Activo Fijo', 'Útil/Herramienta',
    ]);
    expect(OPERATIONAL_CLASS_LABELS.venta).toBe('Venta');
    expect(OPERATIONAL_CLASS_LABELS.insumo).toBe('Insumo');
    expect(OPERATIONAL_CLASS_LABELS.activo_fijo).toBe('Activo Fijo');
    expect(OPERATIONAL_CLASS_LABELS.util_herramienta).toBe('Útil/Herramienta');
    expect(UNCLASSIFIED_LABEL).toBe('Sin clasificar');
  });

  it('operationalClassLabel: null/undefined → «Sin clasificar» (nunca un valor inventado)', () => {
    expect(operationalClassLabel(null)).toBe('Sin clasificar');
    expect(operationalClassLabel(undefined)).toBe('Sin clasificar');
    expect(operationalClassLabel('venta')).toBe('Venta');
    expect(operationalClassLabel('util_herramienta')).toBe('Útil/Herramienta');
  });

  describe('parseOperationalClassCell — fail-closed', () => {
    it('celda vacía/ausente → null (Sin clasificar)', () => {
      expect(parseOperationalClassCell('')).toEqual({ value: null });
      expect(parseOperationalClassCell('   ')).toEqual({ value: null });
      expect(parseOperationalClassCell(null)).toEqual({ value: null });
      expect(parseOperationalClassCell(undefined)).toEqual({ value: null });
    });

    it('reconoce los 4 valores con tildes, mayúsculas, guiones y subrayados', () => {
      expect(parseOperationalClassCell('Venta')).toEqual({ value: 'venta' });
      expect(parseOperationalClassCell('VENTA')).toEqual({ value: 'venta' });
      expect(parseOperationalClassCell('insumo')).toEqual({ value: 'insumo' });
      expect(parseOperationalClassCell('Activo Fijo')).toEqual({ value: 'activo_fijo' });
      expect(parseOperationalClassCell('activo_fijo')).toEqual({ value: 'activo_fijo' });
      expect(parseOperationalClassCell('activo-fijo')).toEqual({ value: 'activo_fijo' });
      expect(parseOperationalClassCell('Útil/Herramienta')).toEqual({ value: 'util_herramienta' });
      expect(parseOperationalClassCell('util/herramienta')).toEqual({ value: 'util_herramienta' });
      expect(parseOperationalClassCell('util herramienta')).toEqual({ value: 'util_herramienta' });
      expect(parseOperationalClassCell('HERRAMIENTA')).toEqual({ value: 'util_herramienta' });
    });

    it('valor no reconocido → error con los valores válidos (no adivina)', () => {
      const r = parseOperationalClassCell('decoración');
      expect(r.error).toBeTruthy();
      expect(r.value).toBeNull();
      expect(r.error).toContain('Venta, Insumo, Activo Fijo, Útil/Herramienta');
      expect(parseOperationalClassCell('42').error).toBeTruthy();
      expect(parseOperationalClassCell('servicio').error).toBeTruthy(); // «servicio» es el TIPO, no la clasificación operativa
    });
  });
});
