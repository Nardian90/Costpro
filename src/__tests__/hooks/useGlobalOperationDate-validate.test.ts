/**
 * useGlobalOperationDate-validate.test.ts — AUDIT-2026-10-15 (misión comisiones).
 *
 * Caso borde del validador forward-only: un input DATE-ONLY (YYYY-MM-DD) se estampa
 * al mediodía (formatOperationDateForRPC → T12:00:00). La validación debe comparar
 * ese estampado real, no medianoche: una 2ª venta del MISMO día debe ser válida
 * contra un mínimo tipo `YYYY-MM-DD 12:00+00` (producto de una venta previa).
 */
import { describe, it, expect } from 'vitest';
import { validateOperationDate } from '@/hooks/api/useGlobalOperationDate';

describe('validateOperationDate — secuencia global forward-only', () => {
  it('acepta una 2ª venta del mismo día (date-only == mínimo al mediodía)', () => {
    // mínimo = venta previa estampada 2026-10-14 12:00Z; el input es date-only
    const res = validateOperationDate('2026-10-14', '2026-10-14 12:00:00+00');
    expect(res.valid).toBe(true);
  });

  it('rechaza fechas realmente anteriores al mínimo', () => {
    const res = validateOperationDate('2026-10-13', '2026-10-14 12:00:00+00');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/No se puede retroceder/i);
  });

  it('acepta fechas posteriores al mínimo', () => {
    expect(validateOperationDate('2026-10-15', '2026-10-14 12:00:00+00').valid).toBe(true);
  });

  it('sin fecha o sin mínimo → válido (no bloquea)', () => {
    expect(validateOperationDate(null, '2026-10-14 12:00:00+00').valid).toBe(true);
    expect(validateOperationDate('2026-10-14', null).valid).toBe(true);
    expect(validateOperationDate(null, null).valid).toBe(true);
  });

  it('datetime ISO completo se compara tal cual (sin ajuste de mediodía)', () => {
    // datetime a medianoche vs mínimo al mediodía del mismo día → anterior → inválido
    const res = validateOperationDate('2026-10-14T00:00:00.000Z', '2026-10-14 12:00:00+00');
    expect(res.valid).toBe(false);
  });
});
