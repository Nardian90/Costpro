/**
 * Test de regresión — CP-PROVEEDORES-001 (proveedores) — bugfix 2026-11-01.
 *
 * Defecto reportado: al crear un proveedor desde el formulario de recepción,
 * la app mostraba «Error al crear proveedor: desconocido» para
 * admin@demo.com, y este usuario no veía los proveedores existentes de su
 * tienda activa (ENERVIDA-VITALLCONS).
 *
 * Causa raíz (demostrada contra BD viva, expediente del PR):
 *   1. RLS: las policies legadas de suppliers resolvían el nivel
 *      administrativo con profiles.role = 'admin' ESTRICTO — el superadmin
 *      (que no lleva membresías de tienda POR DISEÑO) quedaba fuera:
 *      SELECT filtrado a [] y INSERT rechazado con 42501. Corregido en la
 *      migración 20261101120000 (delegación en has_store_access/is_admin).
 *   2. Mensajería: el objeto PostgrestError NO es instanceof Error, así que
 *      el catch del hook imprimía «desconocido» aunque el error traía
 *      message real. Corregido con describeSupplierError() (traducción
 *      estructurada por código/estado) + logging con contexto.
 *   3. Duplicados: si el usuario reintentaba una creación que SÍ había
 *      persistido (o el listado tardaba en refrescar), se insertaba una
 *      segunda fila con el mismo nombre. Corregido con reutilización del
 *      proveedor activo existente (comparación exacta case-insensitive con
 *      escape de comodines) ANTES de insertar.
 *
 * Este archivo prueba el COMPONENTE DE APP del fix (hook + mensajería +
 * anti-duplicado). La semántica RLS queda probada en el banco aislado
 * (scripts de la misión) y el contrato de la migración en
 * src/__tests__/migrations/suppliers-visibilidad-migration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  useAuthStoreState: { user: null as null | { id: string; activeStoreId: string | null } },
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock, rpc: h.rpcMock },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/store', () => ({
  useAuthStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector({ user: h.useAuthStoreState.user }) : { user: h.useAuthStoreState.user },
}));

import { useCreateSupplier, describeSupplierError, isSupplierDuplicateError } from '@/hooks/api/useSuppliers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

// ── Fixtures ────────────────────────────────────────────────────────────────
const STORE_ENERVIDA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const SUPPLIER_EXISTING = {
  id: 'f0675a3b-03f2-429a-bcac-20491092f38d',
  store_id: STORE_ENERVIDA,
  name: 'Proveedor General',
  is_active: true,
  phone: null, tax_id: null, email: null, address: null, notes: null,
  created_at: '2026-10-27T14:03:23.445Z', updated_at: '2026-10-27T14:03:23.445Z',
};

function renderCreateHook() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useCreateSupplier(), { wrapper });
}

// ── describeSupplierError: mensajería estructurada ─────────────────────────
describe('CP-PROVEEDORES-001 — describeSupplierError (adiós «desconocido»)', () => {
  it('el error RLS 42501 exacto del bug se traduce a mensaje de autorización', () => {
    // Réplica EXACTA del error capturado en la reproducción con JWT real
    const postgrestError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "suppliers"',
      details: null, hint: null,
    };
    expect(describeSupplierError(postgrestError))
      .toBe('No tienes autorización para gestionar proveedores en esta tienda.');
  });

  it('NUNCA devuelve «desconocido»: el objeto plano PostgrestError tiene traducción', () => {
    const err = { message: 'cualquier cosa', code: 'XX000' };
    expect(describeSupplierError(err)).not.toContain('desconocido');
  });

  it('duplicado (23505) → mensaje de proveedor existente', () => {
    expect(describeSupplierError({ code: '23505', message: 'duplicate key' }))
      .toBe('Ya existe un proveedor con ese nombre en esta tienda.');
  });

  it('FK inválida (23503) → tienda no válida', () => {
    expect(describeSupplierError({ code: '23503', message: 'violates foreign key' }))
      .toContain('tienda');
  });

  it('error de red → problema de conexión', () => {
    expect(describeSupplierError({ message: 'Failed to fetch', status: 0 }))
      .toContain('conexión');
  });

  it('5xx → error temporal del servidor', () => {
    expect(describeSupplierError({ message: 'boom', status: 503 }))
      .toContain('Error temporal del servidor');
  });

  it('error sin message conocido → mensaje genérico sin exponer detalles internos', () => {
    expect(describeSupplierError(null)).toContain('No se pudo crear el proveedor');
  });

  it('isSupplierDuplicateError detecta 23505 y unique constraint', () => {
    expect(isSupplierDuplicateError({ code: '23505', message: 'x' })).toBe(true);
    expect(isSupplierDuplicateError({ message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(isSupplierDuplicateError({ code: '42501', message: 'rls' })).toBe(false);
  });
});

// ── useCreateSupplier: vía RPC autoritativa (R-15, CP-BRA-REMEDIATION-001) ──
describe('CP-BRA-REMEDIATION-001 — useCreateSupplier vía create_supplier_local', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.fromMock.mockReset();
    h.rpcMock.mockReset();
  });

  it('sin tienda activa → ERR_NO_ACTIVE_STORE con mensaje controlado (no «desconocido»)', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: null };
    const { result } = renderCreateHook();

    await act(async () => {
      await result.current.mutateAsync({ name: 'Alguien' }).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith(
      'No hay tienda activa. Selecciona una tienda antes de crear proveedores.'
    );
  });

  it('nombre vacío → error de validación explícito (no llega a la BD)', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: STORE_ENERVIDA };
    const { result } = renderCreateHook();

    await act(async () => {
      await result.current.mutateAsync({ name: '   ' }).catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledWith('El nombre del proveedor es obligatorio.');
    expect(h.rpcMock).not.toHaveBeenCalled();
  });

  it('reintento con nombre ya existente → el RPC REUTILIZA (status=reused, sin duplicado)', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: STORE_ENERVIDA };
    h.rpcMock.mockResolvedValueOnce({
      data: { status: 'reused', supplier: SUPPLIER_EXISTING },
      error: null,
    });

    const { result } = renderCreateHook();
    let created: { id?: string } | undefined;
    await act(async () => {
      created = await result.current.mutateAsync({ name: 'Proveedor General' });
    });

    expect(created?.id).toBe(SUPPLIER_EXISTING.id); // queda seleccionable en la recepción
    expect(toast.success).toHaveBeenCalled();
    // El guard server-side recibió la tienda y el nombre normalizados.
    const args = h.rpcMock.mock.calls[0][1];
    expect(h.rpcMock.mock.calls[0][0]).toBe('create_supplier_local');
    expect(args.p_store_id).toBe(STORE_ENERVIDA);
    expect(args.p_name).toBe('Proveedor General');
    expect(args.p_confirm_duplicate).toBe(false);
  });

  it('R-15: sospecha de duplicado → el rechazo del guard server se propaga con los candidatos', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: STORE_ENERVIDA };
    const rejection = {
      code: 'P0001',
      message:
        'ERR_SUPPLIER_DUPLICATE_SUSPECTED: hay 1 proveedor(es) activo(s) coincidente(s) por nombre normalizado/NIT/teléfono en la tienda. Reutilice el existente o confirme la creación deliberada (p_confirm_duplicate=true + p_duplicate_reason). candidatos=[{"id":"x","name":"Tienda Pueblo"}]',
      details: null, hint: null,
    };
    h.rpcMock.mockResolvedValueOnce({ data: null, error: rejection });

    const { result } = renderCreateHook();
    let caught: unknown = null;
    await act(async () => {
      caught = await result.current.mutateAsync({ name: 'TiendaPueblo' }).catch((e: unknown) => e);
    });

    // La mutación rechaza con el error del guard (la UI puede ofrecer la
    // confirmación explícita a partir de los candidatos del mensaje).
    expect((caught as { message?: string })?.message).toContain('ERR_SUPPLIER_DUPLICATE_SUSPECTED');
  });

  it('R-15: confirmación explícita → el RPC crea y audita (p_confirm_duplicate + motivo viajan al guard)', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: STORE_ENERVIDA };
    const created = { ...SUPPLIER_EXISTING, id: 'nuevo-dup', name: 'TiendaPueblo' };
    h.rpcMock.mockResolvedValueOnce({ data: { status: 'created', supplier: created }, error: null });

    const { result } = renderCreateHook();
    let out: { id?: string } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({
        name: 'TiendaPueblo',
        confirmDuplicate: true,
        duplicateReason: 'Confirmado por el usuario tras advertencia de 1 coincidencia',
      });
    });

    expect(out?.id).toBe('nuevo-dup');
    const args = h.rpcMock.mock.calls[0][1];
    expect(args.p_confirm_duplicate).toBe(true);
    expect(args.p_duplicate_reason).toContain('Confirmado por el usuario');
  });

  it('respuesta inesperada del RPC (sin supplier) → error controlado, no «desconocido»', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: STORE_ENERVIDA };
    h.rpcMock.mockResolvedValueOnce({ data: { status: 'weird' }, error: null });

    const { result } = renderCreateHook();
    let caught: unknown = null;
    await act(async () => {
      caught = await result.current.mutateAsync({ name: 'Algo' }).catch((e: unknown) => e);
    });

    expect((caught as Error)?.message).toBe('ERR_SUPPLIER_CREATE_UNEXPECTED_RESULT');
  });

  it('error RLS del RPC → toast con causa real traducida + sin exponer detalles internos', async () => {
    h.useAuthStoreState.user = { id: 'u1', activeStoreId: STORE_ENERVIDA };
    const rlsError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "suppliers"',
      details: null, hint: null,
    };
    h.rpcMock.mockResolvedValueOnce({ data: null, error: rlsError });

    const { result } = renderCreateHook();
    let caught = false;
    await act(async () => {
      await result.current.mutateAsync({ name: 'Nuevo Proveedor' }).catch(() => { caught = true; });
    });

    expect(caught).toBe(true); // la mutación rechaza (el selector mantiene el form abierto)
    expect(toast.error).toHaveBeenCalledWith(
      'No tienes autorización para gestionar proveedores en esta tienda.'
    );
    // el detalle técnico quedó en el log del servidor, no expuesto al usuario
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('desconocido'));
  });
});
