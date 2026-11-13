/**
 * worker-eligibility.test.ts — MisiÓN TRABAJADORES↔NÓMINAS (2026-11-13).
 *
 * Unit tests de `evaluateWorkerEligibility` (WorkerSearchSelect): la MISMA
 * semántica del motor servidor fn_payroll_validate_items (trabajador activo
 * de la tienda + tarifa vigente al período + sin duplicados en el documento)
 * + las explicaciones que el selector muestra en lugar de ocultar.
 */
import { describe, it, expect } from 'vitest';
import { evaluateWorkerEligibility, type SelectableWorker } from '@/components/views/terminal/views/workers/nominas/WorkerSearchSelect';

const base: SelectableWorker = {
  worker_id: 'w-1',
  first_name: 'Dup',
  last_name: 'Test',
  ci: '99010192524',
  status: 'active',
  rate_type: 'daily',
  rate_amount: 1000,
  rate_currency: 'CUP',
  rate_valid_from: '2026-11-01',
  rate_valid_to: null,
  has_any_rate: true,
};

describe('evaluateWorkerEligibility — misma semántica que fn_payroll_validate_items', () => {
  it('elegible: activo, con tarifa vigente y no agregado', () => {
    const e = evaluateWorkerEligibility(base, new Set(), '2026-11-01', '2026-11-13');
    expect(e.eligible).toBe(true);
    expect(e.reason).toBeNull();
    expect(e.label).toBe('');
  });

  it('trabajador inactivo → deshabilitado con explicación (no oculto)', () => {
    const e = evaluateWorkerEligibility({ ...base, status: 'inactive' }, new Set(), '2026-11-01', '2026-11-13');
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe('inactivo');
    expect(e.label).toBe('Trabajador inactivo');
  });

  it('ya agregado a la nómina → ERR_DUPLICATE_WORKER anticipado en UX', () => {
    const e = evaluateWorkerEligibility(base, new Set(['w-1']), '2026-11-01', '2026-11-13');
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe('ya_agregado');
    expect(e.label).toBe('Ya agregado a esta nómina');
  });

  it('sin ninguna tarifa configurada (has_any_rate=false) → mensaje específico', () => {
    const e = evaluateWorkerEligibility(
      { ...base, rate_amount: null, rate_type: null, rate_valid_from: null, has_any_rate: false },
      new Set(),
      '2026-11-01',
      '2026-11-13',
    );
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe('sin_tarifa');
    expect(e.label).toBe('Trabajador sin tarifa salarial configurada');
  });

  it('con tarifa histórica pero NO vigente para el período (has_any_rate=true) → mensaje de período', () => {
    // El listado ya evalúa la tarifa contra el período: rate_amount=null con
    // has_any_rate=true significa que la tarifa existe pero no cubre el rango.
    const e = evaluateWorkerEligibility(
      { ...base, rate_amount: null, rate_type: null, rate_valid_from: null, has_any_rate: true },
      new Set(),
      '2026-10-16',
      '2026-10-31',
    );
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe('tarifa_no_vigente');
    expect(e.label).toBe('Tarifa no vigente para el período seleccionado');
  });

  it('sin período definido aún → mensaje genérico de vigencia', () => {
    const e = evaluateWorkerEligibility(
      { ...base, rate_amount: null, rate_type: null, has_any_rate: true },
      new Set(),
      '',
      '',
    );
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe('tarifa_no_vigente');
    expect(e.label).toBe('Sin tarifa salarial vigente');
  });

  it('la tarifa la evalúa el listado (período), no la re-deriva aquí — con rate vigente es elegible aunque el período cambie', () => {
    // El componente recibe workers YA evaluados para el período objetivo
    // (refetch del editor); la función confía en ese dato — el servidor
    // revalida SIEMPRE al guardar (trust boundary).
    const e = evaluateWorkerEligibility(base, new Set(), '2026-11-01', '2026-11-30');
    expect(e.eligible).toBe(true);
  });

  it('inactivo tiene prioridad explicativa sobre ya-agregado (estado del trabajador primero)', () => {
    const e = evaluateWorkerEligibility({ ...base, status: 'inactive' }, new Set(['w-1']), '', '');
    expect(e.reason).toBe('inactivo');
  });
});
