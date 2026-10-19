/**
 * useGlobalOperationDate-validate.test.ts — AUDIT-2026-10-15 (misión comisiones)
 * + MISIÓN FECHA OPERATIVA (2026-10-17) + MISIÓN POLÍTICA TEMPORAL (2026-10-18).
 *
 * Caso borde del validador forward-only: un input DATE-ONLY (YYYY-MM-DD) se estampa
 * al mediodía (formatOperationDateForRPC → T12:00:00). La validación debe comparar
 * ese estampado real, no medianoche: una 2ª venta del MISMO día debe ser válida
 * contra un mínimo tipo `YYYY-MM-DD 12:00+00` (producto de una venta previa).
 *
 * MISIÓN POLÍTICA TEMPORAL (2026-10-18): el mínimo ahora se compara por DÍA DE
 * NEGOCIO (America/Havana), inclusivo — dos operaciones legítimas del mismo día
 * quedan permitidas sea cual sea su hora intradía (reparación del bloqueo
 * 23:59:59 recepción > 12:00:00 venta). El tope superior también es por día.
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

  it('datetime ISO del mismo día de negocio → válido (inclusivo por día)', () => {
    // MISIÓN POLÍTICA TEMPORAL: antes se comparaba el instante completo y una
    // fecha a medianoche quedaba bloqueada contra un mínimo al mediodía del
    // MISMO día. La regla del negocio es por DÍA: 2026-10-14T16:00Z (mediodía
    // Habana del 14) vs mínimo 2026-10-14 12:00Z → mismo día → permitido.
    const res = validateOperationDate('2026-10-14T16:00:00.000Z', '2026-10-14 12:00:00+00');
    expect(res.valid).toBe(true);
  });

  it('datetime ISO que cae en el día de negocio anterior → inválido', () => {
    // 2026-10-14T00:00Z = 20:00 Habana del DÍA 13 → día de negocio 13 < 14.
    const res = validateOperationDate('2026-10-14T00:00:00.000Z', '2026-10-14 12:00:00+00');
    expect(res.valid).toBe(false);
  });
});

// ── MISIÓN FECHA OPERATIVA (2026-10-17): tope superior opcional (max = hoy Habana) ──
describe('validateOperationDate — tope superior (maxAllowedDate)', () => {
  it('rechaza una fecha futura aunque no haya mínimo de tienda', () => {
    // Tienda sin documentos (minAllowedDate null) pero con tope = hoy: la fecha
    // de mañana debe inválida (misión §4.1 — no fechas futuras).
    const res = validateOperationDate('2026-10-18', null, '2026-10-17');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/no puede ser futura/i);
  });

  it('acepta el propio día del tope (hoy) y fechas pasadas', () => {
    expect(validateOperationDate('2026-10-17', null, '2026-10-17').valid).toBe(true);
    expect(validateOperationDate('2026-10-15', null, '2026-10-17').valid).toBe(true);
  });

  it('tope y mínimo combinados: rechaza fuera de ambos extremos', () => {
    expect(validateOperationDate('2026-10-10', '2026-10-14', '2026-10-17').valid).toBe(false);
    expect(validateOperationDate('2026-10-18', '2026-10-14', '2026-10-17').valid).toBe(false);
    expect(validateOperationDate('2026-10-15', '2026-10-14', '2026-10-17').valid).toBe(true);
  });

  it('sin tope (undefined) mantiene el comportamiento original', () => {
    expect(validateOperationDate('2030-01-01', null).valid).toBe(true);
    expect(validateOperationDate('2026-10-14', '2026-10-14 12:00:00+00').valid).toBe(true);
  });
});

// ── MISIÓN POLÍTICA TEMPORAL (2026-10-18): granularidad de DÍA DE NEGOCIO ──
describe('validateOperationDate — mínimo inclusivo por día de negocio (Habana)', () => {
  it('recepción 23:59 Habana (03:59Z día siguiente) NO bloquea la venta del MISMO día', () => {
    // Defecto real corregido: la recepción retro-fechada al 2026-10-15 se enviaba
    // como T23:59:59 local Habana = 2026-10-16T03:59:59Z. Con comparación de
    // instantes, una venta del mismo 2026-10-15 al mediodía (2026-10-15T16:00Z)
    // quedaba BLOQUEADA (12:00 < 23:59 del mismo día). Regla correcta: por día.
    const minRecepcion = '2026-10-16T03:59:59.000Z'; // día de negocio Habana: 2026-10-15
    expect(validateOperationDate('2026-10-15', minRecepcion).valid).toBe(true);
    // Y también un datetime ISO de la venta al mediodía del mismo día:
    expect(validateOperationDate('2026-10-15T16:00:00.000Z', minRecepcion).valid).toBe(true);
  });

  it('el día anterior al mínimo sí queda bloqueado (forward-only por día)', () => {
    const minRecepcion = '2026-10-16T03:59:59.000Z'; // día de negocio 2026-10-15
    const res = validateOperationDate('2026-10-14', minRecepcion);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/15\/10\/2026/); // mensaje con el DÍA mínimo (DD/MM/YYYY)
  });

  it('navegador al oeste de Habana: date-only se interpreta por día de negocio', () => {
    // El input date-only '2026-10-15' con mínimo tipo 2026-10-15T07:59Z (23:59
    // del día anterior en un navegador UTC-8) → mismo día de negocio → válido.
    expect(validateOperationDate('2026-10-15', '2026-10-15T07:59:59.000Z').valid).toBe(true);
    // El día previo sigue bloqueado:
    expect(validateOperationDate('2026-10-14', '2026-10-15T07:59:59.000Z').valid).toBe(false);
  });

  it('mínimo date-only se compara directamente como día', () => {
    // get_global_max_operation_date puede devolver ya un valor date-only.
    expect(validateOperationDate('2026-10-15', '2026-10-15').valid).toBe(true);
    expect(validateOperationDate('2026-10-14', '2026-10-15').valid).toBe(false);
  });

  it('mínimo malformado no bloquea (fail-open documentado)', () => {
    expect(validateOperationDate('2026-10-15', 'no-es-una-fecha').valid).toBe(true);
  });

  it('fecha intraducible → inválida con mensaje claro', () => {
    const res = validateOperationDate('fecha-invalida', null);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/no es válida/i);
  });

  it('tope por día: datetime ISO del propio día del tope pasa, del día siguiente no', () => {
    // 2026-10-17T23:00Z = 19:00 Habana del 17 → día de negocio 17 == tope → OK
    expect(validateOperationDate('2026-10-17T23:00:00.000Z', null, '2026-10-17').valid).toBe(true);
    // 2026-10-18T01:00Z = 21:00 Habana del 17 → día de negocio 17 == tope → OK
    expect(validateOperationDate('2026-10-18T01:00:00.000Z', null, '2026-10-17').valid).toBe(true);
    // 2026-10-18T05:00Z = 01:00 Habana del 18 → día 18 > tope 17 → rechazado
    expect(validateOperationDate('2026-10-18T05:00:00.000Z', null, '2026-10-17').valid).toBe(false);
  });
});
