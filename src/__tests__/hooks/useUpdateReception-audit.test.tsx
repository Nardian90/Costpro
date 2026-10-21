/**
 * Test de regresión — CP-SEC-004 (Misión Continua 2026-10-21).
 *
 * Defecto residual: useUpdateReception (src/hooks/api/useReceptions.ts)
 * edita la cabecera de una recepción (proveedor / nro. factura / notas)
 * con UPDATE directo y NO dejaba rastro en audit_logs — el último hueco
 * del hallazgo audit_v3 §7 (voids ya auditan vía RPC PR-3; la creación,
 * vía logReceptionCreated; transfers, vía RPC create_transfer auditable).
 *
 * Fix: auditService.logReceptionUpdated (action 'reception_updated') en
 * onSuccess con actor + campos cambiados + valores nuevos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  userState: { value: null as null | { id: string } },
  updateResult: { value: null as null | { data: unknown; error: unknown } },
  auditInserts: [] as any[],
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock, rpc: vi.fn() },
}));

vi.mock('@/hooks/api/base', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/hooks/api/base')>();
  return { ...orig, withTableLogging: (_op: any, _table: any, fn: any) => fn() };
});

vi.mock('@/store', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => (sel ? sel({ user: h.userState.value }) : { user: h.userState.value }),
    { getState: () => ({ user: h.userState.value }) },
  ),
}));

// DETERMINISMO MULTI-ENTORNO (fallo de CI 2026-10-22): auditService usa
// `getAdminClientSync() ?? supabase`. En CI existen env vars de Supabase
// → getSupabaseAdminSafe devuelve un cliente → los inserts de auditoría
// iban al cliente admin (no capturados) y los tests 1-2 fallaban con
// `expected [] to have a length of 1`. Forzando null, el fallback al mock
// `supabase` es idéntico en local y en CI.
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => null,
}));

import { useUpdateReception } from '@/hooks/api/useReceptions';

const RECEIPT = {
  id: '33333333-3333-4333-8333-333333333333',
  store_id: '44444444-4444-4444-8444-444444444444',
  status: 'active',
  supplier: 'Proveedor Viejo SA',
  reference_doc: 'FAC-001',
  notes: 'Nota original',
};

function installSupabaseMocks() {
  h.fromMock.mockImplementation((table: string) => {
    if (table === 'receipts') {
      const chain: any = {};
      chain.update = () => chain;
      chain.eq = () => chain;
      chain.neq = () => chain;
      chain.select = () => chain;
      chain.single = () => Promise.resolve(
        h.updateResult.value ?? { data: { ...RECEIPT }, error: null },
      );
      return chain;
    }
    if (table === 'audit_logs') {
      return {
        insert: (row: any) => {
          h.auditInserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.fromMock.mockReset();
  h.auditInserts.length = 0;
  h.updateResult.value = null;
  h.userState.value = { id: '55555555-5555-4555-8555-555555555555' };
  installSupabaseMocks();
});

describe('useUpdateReception — auditoría de edición de cabecera (CP-SEC-004)', () => {
  it('1 · editar proveedor y notas inserta audit_logs con actor, campos y valores nuevos', async () => {
    const { result } = renderHook(() => useUpdateReception(), { wrapper });

    await act(async () => {
      result.current.mutate({
        receiptId: RECEIPT.id,
        supplier: 'Proveedor Nuevo SA',
        notes: 'Nota corregida por el encargado',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.auditInserts).toHaveLength(1);
    const audit = h.auditInserts[0];
    expect(audit.action).toBe('reception_updated');
    expect(audit.table_name).toBe('receipts');
    expect(audit.record_id).toBe(RECEIPT.id);
    expect(audit.store_id).toBe(RECEIPT.store_id);
    expect(audit.user_id).toBe('55555555-5555-4555-8555-555555555555');
    expect(audit.metadata.fields_updated).toEqual(['supplier', 'notes']);
    expect(audit.metadata.changes.supplier).toBe('Proveedor Nuevo SA');
    expect(audit.metadata.changes.notes).toBe('Nota corregida por el encargado');
  });

  it('2 · editar solo reference_doc registra exactamente ese campo', async () => {
    const { result } = renderHook(() => useUpdateReception(), { wrapper });

    await act(async () => {
      result.current.mutate({ receiptId: RECEIPT.id, referenceDoc: 'FAC-999' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.auditInserts).toHaveLength(1);
    expect(h.auditInserts[0].metadata.fields_updated).toEqual(['reference_doc']);
    expect(h.auditInserts[0].metadata.changes.reference_doc).toBe('FAC-999');
  });

  it('3 · sin usuario autenticado NO se escribe auditoría (no inventa actor)', async () => {
    h.userState.value = null;
    const { result } = renderHook(() => useUpdateReception(), { wrapper });

    await act(async () => {
      result.current.mutate({ receiptId: RECEIPT.id, notes: 'x' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.auditInserts).toHaveLength(0);
  });

  it('4 · UPDATE sin store_id legible (fila rara) → sin auditoría inventada', async () => {
    h.updateResult.value = { data: { ...RECEIPT, store_id: null }, error: null };
    const { result } = renderHook(() => useUpdateReception(), { wrapper });

    await act(async () => {
      result.current.mutate({ receiptId: RECEIPT.id, notes: 'y' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.auditInserts).toHaveLength(0);
  });

  it('5 · fallo del INSERT de auditoría NO rompe la mutación (resiliencia)', async () => {
    h.fromMock.mockImplementation((table: string) => {
      if (table === 'receipts') {
        const chain: any = {};
        chain.update = () => chain;
        chain.eq = () => chain;
        chain.neq = () => chain;
        chain.select = () => chain;
        chain.single = () => Promise.resolve({ data: { ...RECEIPT }, error: null });
        return chain;
      }
      if (table === 'audit_logs') {
        return {
          insert: () => Promise.resolve({ error: { message: 'audit table down' } }),
        };
      }
      throw new Error(`tabla inesperada: ${table}`);
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useUpdateReception(), { wrapper });
    await act(async () => {
      result.current.mutate({ receiptId: RECEIPT.id, notes: 'z' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
