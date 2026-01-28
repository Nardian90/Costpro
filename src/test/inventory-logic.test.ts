import { describe, test, expect } from 'vitest';
import { calcularAjusteInventario } from '../lib/inventory-logic';

describe('calcularAjusteInventario', () => {
  // Caso A: Reducción de stock al 100%
  test('Caso A: Reducción de stock al 100% (Stock final = 0, Importe final = 0)', () => {
    const result = calcularAjusteInventario({
      stock_actual: 10,
      costo_total_actual: 100,
      ajuste_unidades: -10
    });
    expect(result.nuevo_stock).toBe(0);
    expect(result.nuevo_costo_total).toBe(0);
    expect(result.nuevo_costo_unitario).toBe(0);
  });

  // Caso B: Reducción de stock parcial con cambio de costo
  test('Caso B: Reducción de stock parcial con cambio de costo (re-valuación)', () => {
    // Retiramos 5 unidades pero decimos que salieron a $0, por lo que las 5 restantes mantienen los $100
    const result = calcularAjusteInventario({
      stock_actual: 10,
      costo_total_actual: 100,
      ajuste_unidades: -5,
      ajuste_valor_unitario: 0
    });
    expect(result.nuevo_stock).toBe(5);
    expect(result.nuevo_costo_total).toBe(100);
    expect(result.nuevo_costo_unitario).toBe(20);
  });

  // Caso C: Incremento de unidades con valor $0
  test('Caso C: Incremento de unidades con valor $0 (Dilución de costo)', () => {
    const result = calcularAjusteInventario({
      stock_actual: 10,
      costo_total_actual: 100,
      ajuste_unidades: 10,
      ajuste_valor_unitario: 0
    });
    expect(result.nuevo_stock).toBe(20);
    expect(result.nuevo_costo_total).toBe(100);
    expect(result.nuevo_costo_unitario).toBe(5);
  });

  test('Cálculo de Salida Estándar (sin ajuste_valor_unitario)', () => {
    const result = calcularAjusteInventario({
      stock_actual: 10,
      costo_total_actual: 100,
      ajuste_unidades: -2
    });
    // Salida de 2 unidades a $10 c/u = $20. Quedan 8 unidades con valor $80.
    expect(result.nuevo_stock).toBe(8);
    expect(result.nuevo_costo_total).toBe(80);
    expect(result.nuevo_costo_unitario).toBe(10);
  });

  test('Incremento con costo específico', () => {
    const result = calcularAjusteInventario({
      stock_actual: 10,
      costo_total_actual: 100,
      ajuste_unidades: 5,
      ajuste_valor_unitario: 20
    });
    // Entran 5 unidades a $20 = $100. Total $200 / 15 unidades.
    expect(result.nuevo_stock).toBe(15);
    expect(result.nuevo_costo_total).toBe(200);
    expect(result.nuevo_costo_unitario).toBeCloseTo(13.333, 3);
  });

  test('Guardrail: No permitir stock negativo', () => {
    const result = calcularAjusteInventario({
      stock_actual: 5,
      costo_total_actual: 50,
      ajuste_unidades: -10
    });
    expect(result.nuevo_stock).toBe(0);
    expect(result.nuevo_costo_total).toBe(0);
  });

  test('Ajuste de valor sin cambio de unidades', () => {
    const result = calcularAjusteInventario({
      stock_actual: 10,
      costo_total_actual: 100,
      ajuste_unidades: 0,
      ajuste_valor_unitario: 15
    });
    expect(result.nuevo_stock).toBe(10);
    expect(result.nuevo_costo_total).toBe(150);
    expect(result.nuevo_costo_unitario).toBe(15);
  });

  test('Manejo de decimales pequeños', () => {
    const result = calcularAjusteInventario({
      stock_actual: 100,
      costo_total_actual: 1,
      ajuste_unidades: 1,
      ajuste_valor_unitario: 0.01
    });
    // $1.00 + (1 * $0.01) = $1.01
    // $1.01 / 101 unidades = $0.01 c/u
    expect(result.nuevo_stock).toBe(101);
    expect(result.nuevo_costo_total).toBe(1.01);
    expect(result.nuevo_costo_unitario).toBe(0.01);
  });
});
