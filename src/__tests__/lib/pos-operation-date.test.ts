/**
 * pos-operation-date.test.ts — MISIÓN FECHA OPERATIVA EN VENDER (2026-10-17).
 *
 * Tests unitarios de la lógica pura compartida por los tres flujos de checkout
 * del POS (venta, vale de salida, express) y por las rutas API:
 *   - resolvePosOperationDate: convención "hoy → NOW()" + mediodía para retro-fechado.
 *   - checkNotFutureOperationDate: tope estricto = hoy (Habana) en cliente y rutas.
 *   - isBusinessDayBefore: semántica del aviso de operación anterior a la
 *     apertura del turno (día de negocio del instante < día elegido).
 */
import { describe, it, expect } from 'vitest';
import {
  resolvePosOperationDate,
  checkNotFutureOperationDate,
  isBusinessDayBefore,
} from '@/lib/pos/operation-date';

describe('resolvePosOperationDate — convención de envío (hoy → NOW, retro → mediodía)', () => {
  it('retorna undefined para null, undefined y vacío (el servidor estampa NOW())', () => {
    expect(resolvePosOperationDate(null, '2026-10-17')).toBeUndefined();
    expect(resolvePosOperationDate(undefined, '2026-10-17')).toBeUndefined();
    expect(resolvePosOperationDate('', '2026-10-17')).toBeUndefined();
  });

  it('fecha seleccionada == hoy (Habana) → undefined (NOW(), cero regresión)', () => {
    expect(resolvePosOperationDate('2026-10-17', '2026-10-17')).toBeUndefined();
  });

  it('fecha pasada → ISO mediodía (convención del proyecto)', () => {
    const iso = resolvePosOperationDate('2026-10-15', '2026-10-17');
    expect(iso).toBe(new Date('2026-10-15T12:00:00').toISOString());
  });

  it('formato inválido → undefined (no envía basura al servidor)', () => {
    expect(resolvePosOperationDate('17/10/2026', '2026-10-17')).toBeUndefined();
    expect(resolvePosOperationDate('no-fecha', '2026-10-17')).toBeUndefined();
  });

  it('sin todayBd explícito usa hoy Habana (no lanza)', () => {
    expect(() => resolvePosOperationDate('2026-01-01')).not.toThrow();
  });
});

describe('checkNotFutureOperationDate — tope estricto = hoy (Habana)', () => {
  it('acepta ISO dentro del día de negocio actual y de fechas pasadas', () => {
    // 2026-10-17 16:00Z == 12:00 Habana (UTC-4, DST) → día de negocio 2026-10-17
    expect(checkNotFutureOperationDate('2026-10-17T16:00:00.000Z', '2026-10-17').ok).toBe(true);
    expect(checkNotFutureOperationDate('2026-10-15T12:00:00.000Z', '2026-10-17').ok).toBe(true);
  });

  it('rechaza ISO del día siguiente al día de negocio actual', () => {
    const future = checkNotFutureOperationDate('2026-10-18T12:00:00.000Z', '2026-10-17');
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/no puede ser posterior/i);
  });

  it('acepta date-only de hoy y rechaza date-only futuro', () => {
    expect(checkNotFutureOperationDate('2026-10-17', '2026-10-17').ok).toBe(true);
    expect(checkNotFutureOperationDate('2026-10-19', '2026-10-17').ok).toBe(false);
  });

  it('mensaje incluye ambas fechas para mensajes accionables (misión §8)', () => {
    const res = checkNotFutureOperationDate('2026-11-01T12:00:00.000Z', '2026-10-17');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('2026-11-01');
      expect(res.error).toContain('2026-10-17');
    }
  });
});

describe('isBusinessDayBefore — día de negocio del instante vs día elegido', () => {
  it('instante de ayer 15:00 HV (19:00Z) es anterior a hoy', () => {
    // 2026-10-16 19:00Z == 15:00 Habana (UTC-4, DST) → día de negocio 2026-10-16
    expect(isBusinessDayBefore('2026-10-16T19:00:00.000Z', '2026-10-17')).toBe(true);
  });

  it('instante de hoy 12:00 HV (16:00Z) NO es anterior a ayer', () => {
    expect(isBusinessDayBefore('2026-10-17T16:00:00.000Z', '2026-10-16')).toBe(false);
  });

  it('date-only se respeta tal cual (ya habla en días de negocio)', () => {
    expect(isBusinessDayBefore('2026-10-16', '2026-10-17')).toBe(true);
    expect(isBusinessDayBefore('2026-10-17', '2026-10-16')).toBe(false);
  });

  it('entrada inválida → false (no bloquea por datos corruptos)', () => {
    expect(isBusinessDayBefore('garbage', '2026-10-17')).toBe(false);
  });
});
