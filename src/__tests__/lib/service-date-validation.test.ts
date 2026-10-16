/**
 * service-date-validation.test.ts — MISIÓN ENCARGADO-SERVICIOS (2026-10-17).
 *
 * Regla del negocio: al crear un servicio recibido el usuario ESCOGE la
 * fecha (no se infiere la actual) y esa fecha:
 *   · NO puede ser posterior al día actual (Habana).
 *   · NO puede ser anterior a la última fecha NO anulada registrada de la
 *     tienda (el IGUAL sí es válido).
 * Función pura compartida por la UI (feedback inmediato) y el POST de la API
 * (la última barrera SIEMPRE es el servidor).
 */
import { describe, it, expect } from 'vitest';
import {
  validateServiceCreationDate,
  todayHavanaISO,
  SERVICE_DATE_RE,
} from '@/lib/received-services/service-date-validation';

const TODAY = '2026-10-17';

describe('validateServiceCreationDate — reglas de fecha del negocio', () => {
  it('sin fecha (null/undefined/vacía) → ok (el RPC usa hoy; compatibilidad)', () => {
    expect(validateServiceCreationDate(null, null, TODAY).ok).toBe(true);
    expect(validateServiceCreationDate(undefined, '2026-10-01', TODAY).ok).toBe(true);
    expect(validateServiceCreationDate('', '2026-10-01', TODAY).ok).toBe(true);
  });

  it('fecha de hoy → permitida (caso por defecto del formulario)', () => {
    expect(validateServiceCreationDate(TODAY, null, TODAY)).toEqual({ ok: true });
  });

  it('fecha pasada sin servicios previos → permitida (backdate dentro de la ventana del RPC)', () => {
    expect(validateServiceCreationDate('2026-10-01', null, TODAY).ok).toBe(true);
    expect(validateServiceCreationDate('2026-05-20', null, TODAY).ok).toBe(true);
  });

  it('fecha FUTURA → rechazada con mensaje claro', () => {
    const r = validateServiceCreationDate('2026-10-18', null, TODAY);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no puede ser posterior al día actual (2026-10-17)');
  });

  it('fecha ANTERIOR a la última registrada → rechazada citando la última fecha', () => {
    const r = validateServiceCreationDate('2026-10-15', '2026-10-16', TODAY);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no puede ser anterior a la última fecha registrada (2026-10-16)');
  });

  it('fecha IGUAL a la última registrada → permitida (el igual no es «menor»)', () => {
    expect(validateServiceCreationDate('2026-10-16', '2026-10-16', TODAY)).toEqual({ ok: true });
  });

  it('fecha posterior a la última y ≤ hoy → permitida (cronología creciente)', () => {
    expect(validateServiceCreationDate('2026-10-17', '2026-10-16', TODAY)).toEqual({ ok: true });
  });

  it('formato inválido → rechazado (no es comparable con seguridad)', () => {
    expect(validateServiceCreationDate('17/10/2026', null, TODAY).ok).toBe(false);
    expect(validateServiceCreationDate('2026-10', null, TODAY).ok).toBe(false);
    expect(validateServiceCreationDate('no-fecha', null, TODAY).ok).toBe(false);
  });

  it('última fecha con espacios se normaliza (defensa en profundidad)', () => {
    expect(validateServiceCreationDate('2026-10-16', ' 2026-10-15 ', TODAY).ok).toBe(true);
    expect(validateServiceCreationDate('2026-10-14', ' 2026-10-15 ', TODAY).ok).toBe(false);
  });

  it('última fecha con formato corrupto NO bloquea la creación (se ignora, no falsea)', () => {
    expect(validateServiceCreationDate('2026-10-16', 'corrupta', TODAY).ok).toBe(true);
  });

  it('«hoy» interno corrupto → rechazo interno (invariante de comparación protegido)', () => {
    const r = validateServiceCreationDate('2026-10-16', null, 'BAD');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Error interno');
  });
});

describe('todayHavanaISO — día de negocio Habana', () => {
  it('devuelve YYYY-MM-DD válido', () => {
    expect(SERVICE_DATE_RE.test(todayHavanaISO())).toBe(true);
  });

  it('es coherente con el día civil de Habana (no la TZ del host)', () => {
    const now = new Date();
    const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(now);
    expect(todayHavanaISO()).toBe(expected);
  });
});
