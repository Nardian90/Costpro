import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────
//
// Estado mutable para `useAuthStore` — los tests cambian `mockAuthState.value`
// entre escenarios (con auth / sin auth / userId distinto). El mock captura
// la referencia, así que mutar `mockAuthState.value` se refleja en el hook.
//
// Soporta tanto el patrón selector `useAuthStore(s => s.user?.id)` como el
// patrón no-selector `useAuthStore()` (por si futuras versiones del hook lo
// usan). El hook actual usa el patrón selector.
const mockAuthState = { value: { user: { id: 'user-1' } as { id: string } | null } };

vi.mock('@/store', () => ({
  useAuthStore: (selector?: (s: any) => any) =>
    selector ? selector(mockAuthState.value) : mockAuthState.value,
}));

// `mockFrom` devuelve un builder Supabase-style con métodos chainable.
// Cada test lo configura con `mockFrom.mockReturnValue(makeBuilder(result))`.
const mockFrom = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Crea un builder Supabase-style con métodos chainable (select, eq, maybeSingle)
 * y métodos terminales (upsert). `maybeSingle` y `upsert` devuelven Promises
 * que resuelven al `result` proporcionado — el hook los await para obtener
 * `{ data, error }`.
 */
function makeBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

/** Resetea todos los mocks entre tests para evitar leak de estado. */
function resetMocks() {
  mockFrom.mockReset();
  mockAuthState.value = { user: { id: 'user-1' } };
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
}

// ─── Importación del hook (después de los mocks) ──────────────────────────

import { useUserPreferences } from '@/hooks/useUserPreferences';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('useUserPreferences (F-02b)', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ─── Escenario 1: carga desde Supabase cuando hay auth ─────────────────
  describe('carga desde Supabase con auth', () => {
    it('usa el valor de Supabase cuando existe', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 'elToque' }, error: null })
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      // Inicialmente: default + loading=true
      expect(result.current.value).toBe('BCC_seg3');
      expect(result.current.loading).toBe(true);

      // Después de cargar: valor de Supabase
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.value).toBe('elToque');

      // Verifica que se llamó a Supabase con los params correctos
      expect(mockFrom).toHaveBeenCalledWith('user_preferences');
      const builder = mockFrom.mock.results[0].value;
      // select, eq(user_id), eq(preference_key), maybeSingle
      expect(builder.select).toHaveBeenCalledWith('preference_value');
      expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(builder.eq).toHaveBeenCalledWith('preference_key', 'costeo-dinamico:rate-source');
      expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
    });

    it('también escribe el valor de Supabase en localStorage (mirror offline)', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 'elToque' }, error: null })
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });

      // El hook debe mirror el valor de Supabase a localStorage para que
      // la capa offline quede sincronizada.
      expect(window.localStorage.getItem('costpro:costeo-dinamico:rate-source')).toBe(
        JSON.stringify('elToque')
      );
    });

    it('respeta el default cuando Supabase no tiene la preference (y no hay localStorage)', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: null, error: null })
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.value).toBe('BCC_seg3');
    });
  });

  // ─── Escenario 2: fallback a localStorage cuando no hay auth ───────────
  describe('fallback a localStorage sin auth', () => {
    it('lee de localStorage cuando no hay userId', async () => {
      mockAuthState.value = { user: null };
      window.localStorage.setItem(
        'costpro:costeo-dinamico:rate-source',
        JSON.stringify('BCC_seg1')
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      // Sin auth, el hook carga de localStorage síncronamente en el effect.
      await waitFor(() => {
        expect(result.current.value).toBe('BCC_seg1');
      });
      expect(result.current.loading).toBe(false);

      // NO debe haber llamado a Supabase
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('usa default cuando no hay auth ni localStorage', async () => {
      mockAuthState.value = { user: null };

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.value).toBe('BCC_seg3');
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ─── Escenario 3: migración transparente localStorage → Supabase ───────
  describe('migración transparente', () => {
    it('si hay valor en localStorage pero no en Supabase, lo sube a Supabase', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      // Supabase no tiene la preference → data: null
      // El upsert para migrar también debe resolverse OK.
      const builder = makeBuilder({ data: null, error: null });
      mockFrom.mockReturnValue(builder);

      // localStorage SÍ tiene un valor (de F-02a, antes del deploy de F-02b)
      window.localStorage.setItem(
        'costpro:costeo-dinamico:rate-source',
        JSON.stringify('elToque')
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });

      // El hook debe haber hecho upsert para migrar el valor a Supabase.
      expect(builder.upsert).toHaveBeenCalledWith({
        user_id: 'user-1',
        preference_key: 'costeo-dinamico:rate-source',
        preference_value: 'elToque',
      });
    });

    it('si la migración falla (upsert error), el valor sigue siendo el de localStorage', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      // SELECT devuelve null (no hay en Supabase).
      // UPSERT devuelve error (red caída, permisos, etc.).
      const builder = makeBuilder({ data: null, error: null });
      // Override el upsert para que devuelva error
      builder.upsert = vi.fn(() =>
        Promise.resolve({ data: null, error: { message: 'UPSERT_FAILED' } })
      );
      mockFrom.mockReturnValue(builder);

      window.localStorage.setItem(
        'costpro:costeo-dinamico:rate-source',
        JSON.stringify('elToque')
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });
      // El hook no lanza; el valor se mantiene en localStorage para el próximo intento.
      expect(window.localStorage.getItem('costpro:costeo-dinamico:rate-source')).toBe(
        JSON.stringify('elToque')
      );
    });
  });

  // ─── Escenario 4: update() guarda en ambos ─────────────────────────────
  describe('update()', () => {
    it('guarda en Supabase y localStorage cuando hay auth', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      // Carga inicial: Supabase devuelve elToque
      const loadBuilder = makeBuilder({
        data: { preference_value: 'elToque' },
        error: null,
      });
      // update: upsert OK
      const updateBuilder = makeBuilder({ data: null, error: null });
      mockFrom.mockReturnValueOnce(loadBuilder).mockReturnValueOnce(updateBuilder);

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });

      // Llamar a update con un nuevo valor
      await act(async () => {
        await result.current.update('BCC_seg1');
      });

      // Estado local actualizado (optimístico)
      expect(result.current.value).toBe('BCC_seg1');

      // localStorage actualizado
      expect(window.localStorage.getItem('costpro:costeo-dinamico:rate-source')).toBe(
        JSON.stringify('BCC_seg1')
      );

      // Supabase upsert llamado con el nuevo valor
      expect(updateBuilder.upsert).toHaveBeenCalledWith({
        user_id: 'user-1',
        preference_key: 'costeo-dinamico:rate-source',
        preference_value: 'BCC_seg1',
      });
    });

    it('guarda solo en localStorage cuando no hay auth', async () => {
      mockAuthState.value = { user: null };

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.update('BCC_seg2');
      });

      expect(result.current.value).toBe('BCC_seg2');
      expect(window.localStorage.getItem('costpro:costeo-dinamico:rate-source')).toBe(
        JSON.stringify('BCC_seg2')
      );
      // NO debe llamar a Supabase
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('mantiene el valor en localStorage aunque Supabase falle en update', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      const loadBuilder = makeBuilder({
        data: { preference_value: 'elToque' },
        error: null,
      });
      const updateBuilder = makeBuilder({ data: null, error: null });
      // Override upsert para que falle
      updateBuilder.upsert = vi.fn(() =>
        Promise.resolve({ data: null, error: { message: 'NETWORK_ERROR' } })
      );
      mockFrom.mockReturnValueOnce(loadBuilder).mockReturnValueOnce(updateBuilder);

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });

      await act(async () => {
        await result.current.update('BCC_seg1');
      });

      // El estado local debe reflejar el valor nuevo (optimístico)
      expect(result.current.value).toBe('BCC_seg1');
      // localStorage también
      expect(window.localStorage.getItem('costpro:costeo-dinamico:rate-source')).toBe(
        JSON.stringify('BCC_seg1')
      );
    });
  });

  // ─── Escenario 5: manejo de errores (Supabase caído) ───────────────────
  describe('manejo de errores', () => {
    it('PostgREST error en SELECT → fallback a localStorage', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({
          data: null,
          error: { message: 'RLS_DENIED' },
        })
      );
      window.localStorage.setItem(
        'costpro:costeo-dinamico:rate-source',
        JSON.stringify('BCC_seg2')
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // El hook debe caer al valor de localStorage, no lanzar.
      expect(result.current.value).toBe('BCC_seg2');
    });

    it('excepción en SELECT (fetch rejects) → fallback a localStorage', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      const builder = makeBuilder({ data: null, error: null });
      // maybeSingle rechaza (simula fetch network error)
      builder.maybeSingle = vi.fn(() => Promise.reject(new Error('NETWORK_DOWN')));
      mockFrom.mockReturnValue(builder);

      window.localStorage.setItem(
        'costpro:costeo-dinamico:rate-source',
        JSON.stringify('elToque')
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      // Cae al valor de localStorage
      expect(result.current.value).toBe('elToque');
    });

    it('excepción en SELECT sin localStorage → usa default', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      const builder = makeBuilder({ data: null, error: null });
      builder.maybeSingle = vi.fn(() => Promise.reject(new Error('NETWORK_DOWN')));
      mockFrom.mockReturnValue(builder);

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.value).toBe('BCC_seg3');
    });
  });

  // ─── Escenario 6: estados de loading ───────────────────────────────────
  describe('estados de loading', () => {
    it('loading es true inicialmente y false después de cargar (con auth)', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 'elToque' }, error: null })
      );

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('loading se resuelve en un tick cuando no hay auth (sin llamada async)', async () => {
      mockAuthState.value = { user: null };

      const { result } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      // Sin auth, el hook no hace fetch a Supabase — el effect solo lee
      // localStorage síncronamente. `renderHook` flushea el effect antes
      // de retornar, así que `loading` ya es false. Lo importante es que
      // no quede colgado en `loading=true` esperando una llamada async
      // que nunca ocurrirá.
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      // Confirmación explícita: NO se llamó a Supabase.
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ─── Escenario 7: tipos de datos (no solo strings) ─────────────────────
  describe('tipos de datos arbitrarios', () => {
    it('soporta valores objeto (JSONB)', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      const obj = { theme: 'dark', fontSize: 14, features: ['a', 'b'] };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: obj }, error: null })
      );

      const { result } = renderHook(() =>
        useUserPreferences<{ theme: string; fontSize: number; features: string[] }>(
          'ui:settings',
          { theme: 'light', fontSize: 12, features: [] }
        )
      );

      await waitFor(() => {
        expect(result.current.value).toEqual(obj);
      });
    });

    it('soporta valores numéricos', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 42 }, error: null })
      );

      const { result } = renderHook(() =>
        useUserPreferences<number>('app:page-size', 10)
      );

      await waitFor(() => {
        expect(result.current.value).toBe(42);
      });
    });
  });

  // ─── Escenario 8: cambio de userId recarga la preferencia ──────────────
  describe('cambio de userId', () => {
    it('recarga la preferencia cuando userId cambia', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 'elToque' }, error: null })
      );

      const { result, rerender } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });

      // Cambiar a user-2 con un valor distinto en Supabase
      mockAuthState.value = { user: { id: 'user-2' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 'BCC_seg1' }, error: null })
      );

      rerender();

      await waitFor(() => {
        expect(result.current.value).toBe('BCC_seg1');
      });
    });

    it('al hacer logout (userId → null), cae a localStorage', async () => {
      mockAuthState.value = { user: { id: 'user-1' } };
      mockFrom.mockReturnValue(
        makeBuilder({ data: { preference_value: 'elToque' }, error: null })
      );

      const { result, rerender } = renderHook(() =>
        useUserPreferences<string>('costeo-dinamico:rate-source', 'BCC_seg3')
      );

      await waitFor(() => {
        expect(result.current.value).toBe('elToque');
      });

      // Logout
      mockAuthState.value = { user: null };
      // Pre-poblar localStorage para que el hook tenga algo que cargar
      window.localStorage.setItem(
        'costpro:costeo-dinamico:rate-source',
        JSON.stringify('BCC_seg2')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.value).toBe('BCC_seg2');
      });
    });
  });
});
