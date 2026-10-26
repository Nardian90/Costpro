/**
 * MISIÓN INVENTARIO FÍSICO / SUPERADMIN (2026-10-26) — Regresión de
 * useAuthorizedStores (src/hooks/api/useAuthorizedStores.ts).
 *
 * Defecto: el selector de «Nuevo Inventario Físico» construía sus opciones
 * SOLO con user.memberships → el SuperAdmin (sin membresías POR DISEÑO,
 * §6 20260826120000) veía «Sin Tiendas Autorizadas».
 *
 * Contrato del hook:
 *   - Nivel administrativo (admin|superadmin): consulta las tiendas ACTIVAS
 *     sin filtro por membresía (la RLS define el alcance real — superadmin:
 *     todas; admin: su tenant bajo USE_TENANT_RLS).
 *   - Roles operativos: SOLO tiendas con membresía activa (.in de ids).
 *   - Sin membresías → lista vacía legítima (no consulta la tabla).
 *   - Error de consulta → estado error (distinguible de «sin tiendas»).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  userHolder: { current: null as any },
  storesChain: { current: null as any },
}));

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: h.userHolder.current }),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'stores') throw new Error(`tabla inesperada: ${table}`);
      return h.storesChain.current;
    },
  },
}));

import { useAuthorizedStores } from '@/hooks/api/useAuthorizedStores';

const STORES = [
  { id: 'store-enervida', name: 'ENERVIDA-VITALLCONS' },
  { id: 'store-puerto', name: 'Puerto Padre VITALLCONS' },
];

function chain(result: { data?: unknown; error?: unknown } = {}) {
  const resolve = () => Promise.resolve(result as any);
  const c: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (onF: any, onR: any) => resolve().then(onF, onR),
  };
  return c;
}

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useAuthorizedStores(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return result;
}

describe('useAuthorizedStores — fuente única de tiendas autorizadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SUPERADMIN sin membresías recibe TODAS las tiendas activas (regresión «Sin Tiendas Autorizadas»)', async () => {
    h.userHolder.current = { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] };
    const c = chain({ data: STORES, error: null });
    h.storesChain.current = c;
    const res = render();
    await waitFor(() => expect(res.current.data).toHaveLength(2));
    // Rama administrativa: NUNCA filtra por membresías
    expect(c.in).not.toHaveBeenCalled();
    expect(res.current.data?.map((s) => s.name)).toEqual(
      expect.arrayContaining(['ENERVIDA-VITALLCONS', 'Puerto Padre VITALLCONS'])
    );
    expect(res.current.error).toBeNull();
  });

  it('ADMIN (regresión): misma rama administrativa', async () => {
    h.userHolder.current = { id: 'admin-2', role: 'admin', memberships: [] };
    const c = chain({ data: STORES, error: null });
    h.storesChain.current = c;
    const res = render();
    await waitFor(() => expect(res.current.data).toHaveLength(2));
    expect(c.in).not.toHaveBeenCalled();
  });

  it('CLERK recibe SOLO las tiendas de sus membresías activas (.in con ids)', async () => {
    h.userHolder.current = {
      id: 'clerk-1',
      role: 'clerk',
      memberships: [
        { store_id: 'store-enervida', role: 'clerk', status: 'active' },
        { store_id: 'store-inactiva-membresia', role: 'clerk', status: 'revoked' },
      ],
    };
    const c = chain({ data: [STORES[0]], error: null });
    h.storesChain.current = c;
    const res = render();
    await waitFor(() => expect(res.current.data).toHaveLength(1));
    expect(c.in).toHaveBeenCalledWith('id', ['store-enervida']);
  });

  it('CLERK sin membresías activas → lista vacía LEGÍTIMA (sin consulta a stores)', async () => {
    h.userHolder.current = { id: 'clerk-2', role: 'clerk', memberships: [] };
    const c = chain({ data: [], error: null });
    h.storesChain.current = c;
    const res = render();
    await waitFor(() => expect(res.current.data).toEqual([]));
    expect(c.select).not.toHaveBeenCalled();
    expect(res.current.error).toBeNull();
  });

  it('Error de consulta → estado error distinguible (no «sin tiendas»)', async () => {
    h.userHolder.current = { id: 'a1111111-1111-1111-1111-111111111111', role: 'superadmin', memberships: [] };
    h.storesChain.current = chain({ data: null, error: { message: 'permission denied for table stores' } });
    const res = render();
    await waitFor(() => expect(res.current.error).not.toBeNull());
    expect((res.current.error as Error).message).toContain('permission denied');
    // data queda undefined en error — el componente la normaliza a [] y muestra
    // el mensaje de error, jamás «Sin tiendas autorizadas»
    expect(res.current.data ?? []).toEqual([]);
  });

  it('Sin usuario autenticado → query deshabilitada', async () => {
    h.userHolder.current = null;
    const c = chain({ data: STORES, error: null });
    h.storesChain.current = c;
    const res = render();
    // enabled: !!user — la query queda idle (v5: isPending sin fetching)
    expect(res.current.fetchStatus).toBe('idle');
    expect(c.select).not.toHaveBeenCalled();
  });
});
