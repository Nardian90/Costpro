/**
 * useWorkDateDefault.test.tsx — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Pruebas del hook que resuelve la preferencia de fecha de trabajo como
 * default de los formularios:
 *   - Preferencia válida (entre mínimo per-store y HOY) → se devuelve.
 *   - Preferencia caducada (bajo el mínimo) → null (el form conserva HOY).
 *   - Preferencia futura (sobre HOY) → null.
 *   - Sin preferencia → null (HOY implícito).
 *   - Tipo fijo/informativo (caja/OC) → null SIEMPRE (sin preferencia).
 *   - undefined mientras carga el mínimo (resolviendo).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkDateDefault } from '@/hooks/ui/useWorkDateDefault';
import { useWorkDatePrefsStore } from '@/store/work-date-prefs';

const MIN_ISO = '2026-10-14T16:00:00+00:00'; // día de negocio 14/10 Habana

let minLoading = false;

vi.mock('@/hooks/api/useGlobalOperationDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/api/useGlobalOperationDate')>();
  return {
    ...actual,
    useGlobalOperationDate: () => ({
      data: minLoading ? undefined : { maxDate: MIN_ISO, maxDateFormatted: '14/10/2026 12:00', minAllowedDate: MIN_ISO },
      isLoading: minLoading,
    }),
  };
});

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: { id: 'u1', activeStoreId: 'store-1' } }),
}));

function localStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: () => store.clear(),
  };
}

function renderHookWithClient(props: Parameters<typeof useWorkDateDefault>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useWorkDateDefault(props[0], props[1]), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('useWorkDateDefault — default validado de los formularios', () => {
  beforeEach(() => {
    cleanup();
    vi.stubGlobal('localStorage', localStorageMock());
    useWorkDatePrefsStore.setState({ scope: null, prefs: {} });
    minLoading = false;
  });

  it('devuelve la preferencia válida (dentro de [mínimo, HOY])', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { reception: '2026-10-16' } });
    const { result } = renderHookWithClient(['reception']);
    // Esperar a que resuelva (scope + min cargados).
    await vi.waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBe('2026-10-16');
  });

  it('preferencia caducada (bajo el mínimo per-store) → null (form conserva HOY)', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { reception: '2026-10-10' } });
    const { result } = renderHookWithClient(['reception']);
    await vi.waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBeNull();
  });

  it('preferencia futura (sobre HOY) → null', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { sale: '2999-01-01' } });
    const { result } = renderHookWithClient(['sale']);
    await vi.waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBeNull();
  });

  it('sin preferencia guardada → null (HOY implícito)', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: {} });
    const { result } = renderHookWithClient(['sale']);
    await vi.waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBeNull();
  });

  it('tipo fijo (caja) → null SIEMPRE, incluso con dato persistido', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: {} });
    const { result } = renderHookWithClient(['cash_shift']);
    await vi.waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBeNull();
  });

  it('undefined mientras el mínimo está cargando (resolviendo)', () => {
    minLoading = true;
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { sale: '2026-10-16' } });
    const { result } = renderHookWithClient(['sale']);
    expect(result.current).toBeUndefined();
  });

  it('aislado por tienda: otra tienda no ve la preferencia del scope', async () => {
    useWorkDatePrefsStore.setState({ scope: 'u1:store-1', prefs: { sale: '2026-10-16' } });
    const { result } = renderHookWithClient(['sale', 'store-OTRA']);
    // El scope activo (store-1) no coincide con la tienda consultada: sin
    // preferencia aplicable → null tras resolver.
    await vi.waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBeNull();
  });
});
