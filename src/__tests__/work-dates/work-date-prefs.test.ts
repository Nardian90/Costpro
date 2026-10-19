/**
 * work-date-prefs.test.ts — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Pruebas del store de preferencias de fecha de trabajo:
 *   - Aislamiento por USUARIO + TIENDA (scopes con claves distintas).
 *   - Aislamiento por TIPO de movimiento (cambiar uno no toca otro).
 *   - Persistencia en localStorage con la clave del scope.
 *   - Sanitización al cargar: tipos no habilitados y fechas con formato
 *     inválido se descartan (nunca llegan a los formularios).
 *   - Tipos fijos/informativos rechazan preferencia.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkDatePrefsStore, readWorkDatePref, typeSupportsPreference } from '@/store/work-date-prefs';

function localStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: () => store.clear(),
  };
}

describe('useWorkDatePrefsStore — preferencias de fecha de trabajo', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock());
    useWorkDatePrefsStore.setState({ scope: null, prefs: {} });
  });

  it('guarda y expone la preferencia de un tipo configurable', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    const ok = s.setWorkDate('sale', '2026-10-16');
    expect(ok).toBe(true);
    expect(useWorkDatePrefsStore.getState().prefs['sale']).toBe('2026-10-16');
  });

  it('rechaza tipos sin preferencia (caja fija / OC informativa)', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    expect(s.setWorkDate('cash_shift', '2026-10-16')).toBe(false);
    expect(s.setWorkDate('purchase_order', '2026-10-16')).toBe(false);
    expect(useWorkDatePrefsStore.getState().prefs['cash_shift']).toBeUndefined();
  });

  it('rechaza fechas con formato inválido', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    expect(s.setWorkDate('sale', '16/10/2026')).toBe(false);
    expect(s.setWorkDate('sale', 'not-a-date')).toBe(false);
    expect(s.setWorkDate('sale', '')).toBe(false);
  });

  it('aísla por tipo: fijar venta no toca recepción ni vales', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    s.setWorkDate('sale', '2026-10-16');
    s.setWorkDate('reception', '2026-10-17');
    const prefs = useWorkDatePrefsStore.getState().prefs;
    expect(prefs['sale']).toBe('2026-10-16');
    expect(prefs['reception']).toBe('2026-10-17');
    expect(prefs['vale_salida']).toBeUndefined();
  });

  it('aísla por usuario: scope distinto no ve la preferencia de otro', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    s.setWorkDate('sale', '2026-10-16');
    // Otro usuario EN LA MISMA tienda: claves distintas.
    useWorkDatePrefsStore.getState().loadScope('user-2', 'store-A');
    expect(useWorkDatePrefsStore.getState().prefs['sale']).toBeUndefined();
  });

  it('aísla por tienda: el mismo usuario en otra tienda no ve la preferencia', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    s.setWorkDate('sale', '2026-10-16');
    useWorkDatePrefsStore.getState().loadScope('user-1', 'store-B');
    expect(useWorkDatePrefsStore.getState().prefs['sale']).toBeUndefined();
  });

  it('persiste en localStorage bajo la clave del scope usuario:tienda', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    s.setWorkDate('reception', '2026-10-15');
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'costpro:work-date-pref:user-1:store-A',
      JSON.stringify({ reception: '2026-10-15' }),
    );
  });

  it('restaura preferencias persistidas al cargar el scope', () => {
    localStorage.setItem(
      'costpro:work-date-pref:user-1:store-A',
      JSON.stringify({ sale: '2026-10-16', reception: '2026-10-15' }),
    );
    useWorkDatePrefsStore.getState().loadScope('user-1', 'store-A');
    const prefs = useWorkDatePrefsStore.getState().prefs;
    expect(prefs['sale']).toBe('2026-10-16');
    expect(prefs['reception']).toBe('2026-10-15');
  });

  it('sanitiza al cargar: tipos no habilitados y formatos inválidos se descartan', () => {
    localStorage.setItem(
      'costpro:work-date-pref:user-1:store-A',
      JSON.stringify({
        sale: '2026-10-16',            // válido
        cash_shift: '2026-10-16',       // tipo fijo → descartado
        reception: 'mañana',            // formato inválido → descartado
        'tipo-desconocido': '2026-10-16', // fuera del registro → descartado
      }),
    );
    useWorkDatePrefsStore.getState().loadScope('user-1', 'store-A');
    const prefs = useWorkDatePrefsStore.getState().prefs;
    expect(prefs['sale']).toBe('2026-10-16');
    expect(prefs['cash_shift']).toBeUndefined();
    expect(prefs['reception']).toBeUndefined();
    expect(prefs['tipo-desconocido']).toBeUndefined();
  });

  it('clearWorkDate elimina solo el tipo indicado y persiste el cambio', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    s.setWorkDate('sale', '2026-10-16');
    s.setWorkDate('reception', '2026-10-15');
    useWorkDatePrefsStore.getState().clearWorkDate('sale');
    const prefs = useWorkDatePrefsStore.getState().prefs;
    expect(prefs['sale']).toBeUndefined();
    expect(prefs['reception']).toBe('2026-10-15'); // intacto
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      'costpro:work-date-pref:user-1:store-A',
      JSON.stringify({ reception: '2026-10-15' }),
    );
  });

  it('sin usuario o tienda no carga ni guarda nada', () => {
    useWorkDatePrefsStore.getState().loadScope(null, 'store-A');
    expect(useWorkDatePrefsStore.getState().scope).toBeNull();
    expect(useWorkDatePrefsStore.getState().setWorkDate('sale', '2026-10-16')).toBe(false);
  });

  it('readWorkDatePref y typeSupportsPreference exponen la lectura segura', () => {
    const s = useWorkDatePrefsStore.getState();
    s.loadScope('user-1', 'store-A');
    s.setWorkDate('sale', '2026-10-16');
    expect(readWorkDatePref(useWorkDatePrefsStore.getState(), 'sale')).toBe('2026-10-16');
    expect(readWorkDatePref(useWorkDatePrefsStore.getState(), 'reception')).toBeNull();
    expect(typeSupportsPreference('sale')).toBe(true);
    expect(typeSupportsPreference('cash_shift')).toBe(false);
  });
});
