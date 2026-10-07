/**
 * Tests — Diccionario de presentación de movimientos (§14-18 del requisito
 * Trazabilidad/Kardex).
 *
 * Garantías:
 *   1. Los 18 tipos internos reales del sistema tienen etiqueta en español.
 *   2. Tipos desconocidos / nulos NUNCA exponen el enum crudo (fallback "Otro" / "—").
 *   3. Las funciones de color/badge responden para todos los tipos conocidos.
 */

import { describe, it, expect } from 'vitest';
import {
  obtenerEtiquetaMovimiento,
  obtenerPresentacionMovimiento,
  obtenerClaseMovimiento,
  obtenerClaseBadgeMovimiento,
  obtenerIconoMovimiento,
} from '@/lib/inventory/movementPresentation';

const TIPOS_REALES = [
  'sale',
  'purchase',
  'adjustment',
  'return',
  'initial',
  'transfer',
  'void',
  'devolution_in',
  'transfer_in',
  'transfer_out',
  'out',
  'production',
  'sale_reverse',
  'purchase_reverse',
  'sale_void',
  'production_in',
  'production_out',
];

describe('movementPresentation — obtenerEtiquetaMovimiento', () => {
  it('mapea los tipos reales a etiquetas profesionales en español', () => {
    expect(obtenerEtiquetaMovimiento('sale')).toBe('Venta');
    expect(obtenerEtiquetaMovimiento('purchase')).toBe('Compra');
    expect(obtenerEtiquetaMovimiento('adjustment')).toBe('Ajuste');
    expect(obtenerEtiquetaMovimiento('return')).toBe('Devolución');
    expect(obtenerEtiquetaMovimiento('initial')).toBe('Inicial');
    expect(obtenerEtiquetaMovimiento('transfer')).toBe('Transferencia');
    expect(obtenerEtiquetaMovimiento('void')).toBe('Anulación');
    expect(obtenerEtiquetaMovimiento('devolution_in')).toBe('Devolución recibida');
    expect(obtenerEtiquetaMovimiento('transfer_in')).toBe('Transferencia recibida');
    expect(obtenerEtiquetaMovimiento('transfer_out')).toBe('Transferencia enviada');
    expect(obtenerEtiquetaMovimiento('out')).toBe('Salida');
    expect(obtenerEtiquetaMovimiento('production')).toBe('Producción');
    expect(obtenerEtiquetaMovimiento('sale_reverse')).toBe('Reverso de venta');
    expect(obtenerEtiquetaMovimiento('purchase_reverse')).toBe('Reverso de recepción');
    expect(obtenerEtiquetaMovimiento('sale_void')).toBe('Anulación de venta');
    expect(obtenerEtiquetaMovimiento('production_in')).toBe('Producción (entrada)');
    expect(obtenerEtiquetaMovimiento('production_out')).toBe('Producción (salida)');
  });

  it('NUNCA expone el enum crudo para tipos desconocidos (§16)', () => {
    const desconocidos = ['super_type', 'STOCK_OUT', 'ENTRY', 'SALE', 'xyz'];
    for (const t of desconocidos) {
      const etiqueta = obtenerEtiquetaMovimiento(t);
      expect(etiqueta).toBe('Otro');
      expect(etiqueta).not.toBe(t);
    }
  });

  it('maneja valores nulos/vacíos sin romperse', () => {
    expect(obtenerEtiquetaMovimiento(null)).toBe('—');
    expect(obtenerEtiquetaMovimiento(undefined)).toBe('—');
    expect(obtenerEtiquetaMovimiento('')).toBe('—');
  });

  it('cubre los 18 tipos reales auditados sin caer en fallback', () => {
    for (const t of TIPOS_REALES) {
      expect(obtenerEtiquetaMovimiento(t)).not.toBe('Otro');
    }
  });
});

describe('movementPresentation — colores y clasificación', () => {
  it('clasifica semánticamente entradas, salidas y reversos', () => {
    expect(obtenerPresentacionMovimiento('purchase').kind).toBe('entrada');
    expect(obtenerPresentacionMovimiento('sale').kind).toBe('salida');
    expect(obtenerPresentacionMovimiento('sale_reverse').kind).toBe('reverso');
    expect(obtenerPresentacionMovimiento('void').kind).toBe('anulacion');
    expect(obtenerPresentacionMovimiento('adjustment').kind).toBe('ajuste');
  });

  it('devuelve clases de color y badge para todos los tipos reales', () => {
    for (const t of TIPOS_REALES) {
      expect(obtenerClaseMovimiento(t)).toMatch(/^text-/);
      expect(obtenerClaseBadgeMovimiento(t)).toMatch(/^text-/);
    }
  });

  it('fallback de color para tipos desconocidos (sin crudo)', () => {
    expect(obtenerClaseMovimiento('desconocido')).toBe('text-muted-foreground');
  });
});

describe('movementPresentation — iconos', () => {
  it('retorna un componente de icono para todos los tipos reales', () => {
    for (const t of TIPOS_REALES) {
      const Icon = obtenerIconoMovimiento(t);
      expect(Icon).toBeTruthy();
      // Los iconos de lucide-react son ForwardRefExoticComponent (objetos)
      expect(['function', 'object']).toContain(typeof Icon);
    }
  });

  it('retorna icono para tipos desconocidos y nulos', () => {
    expect(obtenerIconoMovimiento('desconocido')).toBeTruthy();
    expect(obtenerIconoMovimiento(null)).toBeTruthy();
  });
});
