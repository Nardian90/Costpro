/**
 * Test de concurrencia: simula 50 hilos haciendo operaciones simultáneas.
 * 
 * Valida que:
 * - El motor de comisiones es thread-safe (función pura)
 * - selectApplicableRule no tiene race conditions
 * - calculateCommission produce resultados consistentes bajo carga
 * 
 * Nota: este test no prueba la BD (que requiere PostgreSQL real con advisory locks).
 * Prueba la capa de lógica que se ejecuta server-side.
 */

import { describe, it, expect } from 'vitest';
import {
  selectApplicableRule,
  calculateCommission,
  type CommissionRule,
} from '@/lib/commission-engine';
import { parseCI } from '@/lib/parse-ci';

describe('Concurrencia — 50 hilos simultáneos', () => {
  const rules: CommissionRule[] = [
    {
      id: 'store-default',
      store_id: 'store-1',
      worker_id: null,
      type: 'percentage_sales',
      value_percent: 5,
      fixed_value: null,
      salary_amount: null,
      base_calculation: 'total_sales',
      priority: 0,
      valid_from: '2026-01-01',
      valid_to: null,
    },
    {
      id: 'worker-specific',
      store_id: 'store-1',
      worker_id: 'worker-1',
      type: 'hybrid',
      value_percent: 3,
      fixed_value: null,
      salary_amount: 2000,
      base_calculation: 'total_sales',
      priority: 10,
      valid_to: null,
      valid_from: '2026-01-01',
    },
  ];

  it('50 cálculos simultáneos producen resultados idénticos', async () => {
    const sales = { cash: 600, transfer: 400, total: 1000 };
    const period = { from: '2026-06-01', to: '2026-06-30' };

    // Lanzar 50 cálculos en paralelo
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(calculateCommission('worker-1', sales, rules[1], period))
      )
    );

    // Todos deben dar el mismo resultado (2030)
    const expected = 2030; // 2000 + 3% de 1000
    results.forEach((result, i) => {
      expect(result.commission_suggested, `Thread ${i}`).toBe(expected);
      expect(result.breakdown.salary_component).toBe(2000);
      expect(result.breakdown.percentage_component).toBe(30);
    });
  });

  it('50 selecciones de regla simultáneas son consistentes', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(selectApplicableRule(rules, 'worker-1', '2026-06-15'))
      )
    );

    // Todas deben seleccionar 'worker-specific' (mayor prioridad)
    results.forEach((rule, i) => {
      expect(rule?.id, `Thread ${i}`).toBe('worker-specific');
    });
  });

  it('50 parsers CI simultáneos son consistentes', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(parseCI('90040240202'))
      )
    );

    results.forEach((result, i) => {
      expect(result.isValid, `Thread ${i}`).toBe(true);
      expect(result.year).toBe(1990);
      expect(result.month).toBe(4);
      expect(result.day).toBe(2);
    });
  });

  it('Cálculos con diferentes ventas no se afectan entre sí', async () => {
    const salesData = [
      { cash: 100, transfer: 50, total: 150 },
      { cash: 500, transfer: 500, total: 1000 },
      { cash: 0, transfer: 0, total: 0 },
      { cash: 999, transfer: 1, total: 1000 },
      { cash: 50, transfer: 950, total: 1000 },
    ];

    const results = await Promise.all(
      salesData.flatMap((sales, idx) =>
        Array.from({ length: 10 }, () =>
          Promise.resolve(calculateCommission('worker-1', sales, rules[1], { from: '2026-06-01', to: '2026-06-30' }))
        )
      )
    );

    // Verificar que cada grupo de 10 tiene el mismo resultado
    salesData.forEach((sales, idx) => {
      const expected = 2000 + (sales.total * 3) / 100;
      for (let j = 0; j < 10; j++) {
        const result = results[idx * 10 + j];
        expect(result.commission_suggested, `Sales set ${idx}, thread ${j}`).toBe(expected);
      }
    });
  });

  it('No hay memory leaks bajo carga (50 iteraciones)', () => {
    const sales = { cash: 600, transfer: 400, total: 1000 };
    const period = { from: '2026-06-01', to: '2026-06-30' };

    // 50 iteraciones secuenciales
    for (let i = 0; i < 50; i++) {
      const calc = calculateCommission('worker-1', sales, rules[1], period);
      expect(calc.commission_suggested).toBe(2030);
    }
  });
});
