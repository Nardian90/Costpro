/**
 * MISIÓN CP-CASH-OPENING-001 — useOpenCashShift (apertura autoritativa + fallback).
 *
 * Contrato:
 *   1. 200 del RPC → via='rpc'; el INSERT legado NUNCA se ejecuta.
 *   2. 501 {fallback:true} (RPC ausente del esquema) → INSERT legado bajo RLS
 *      con el payload corregido (vouchers 0, diferencias vs libro documentadas)
 *      → via='legacy'. Abrir caja no queda bloqueado por una migración pendiente.
 *   3. 501 sin fallback → error propagado (no degradación silenciosa).
 *   4. 409 de negocio (ERR_SHIFT_ALREADY_OPEN) → Error con mensaje accionable.
 *   5. Fallback sin legacy_insert → INSERT mínimo correcto (store + fondo + pendiente).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createClosureMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/services/audit-service', () => ({
  auditService: { logCashClosureFinalized: vi.fn(), logCashClosureCreated: vi.fn() },
}));
vi.mock('@/services/cash-service', () => ({
  cashService: { createClosure: (...args: unknown[]) => createClosureMock(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useOpenCashShift } from '@/hooks/api/useCashClosures';

const fetchMock = vi.fn();

function jsonRes(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function renderHookOpen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useOpenCashShift(), { wrapper });
}

const PAYLOAD = {
  store_id: '11111111-1111-1111-1111-111111111111',
  counted_cup: 3000,
  counted_usd: 0,
  opening_note: null,
  difference_note: 'Faltan billetes por entrega no registrada',
  idempotency_key: 'open-x',
  legacy_insert: {
    store_id: '11111111-1111-1111-1111-111111111111',
    user_id: 'u-1',
    declared_cash: 3000,
    opening_balance: 3000,
    opening_balance_cup: 3000,
    opening_balance_usd: 0,
    opening_difference_cup: -3000,
    opening_difference_usd: null,
    opening_difference_note: 'Faltan billetes por entrega no registrada',
    declared_cash_usd: 0,
    declared_vouchers: 0,
    declared_total: 3000,
    system_expected_total: 0,
    difference: 0,
    notes: null,
    status: 'pendiente',
  },
} as unknown as Parameters<ReturnType<typeof useOpenCashShift>['mutate']>[0];

beforeEach(() => {
  cleanup();
  createClosureMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CP-CASH-OPENING-001 · useOpenCashShift — vía RPC y fallback legado', () => {
  it('200 del RPC → via=rpc y el INSERT legado NO se ejecuta', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { status: 'success', closure_id: 'c-1' }));
    const { result } = renderHookOpen();
    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ via: 'rpc', data: { status: 'success' } });
    expect(createClosureMock).not.toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      store_id: PAYLOAD.store_id,
      counted_cup: 3000,
      idempotency_key: 'open-x',
    });
    // legacy_insert NUNCA viaja al servidor (solo es para la degradación local)
    expect(JSON.parse(String(init.body)).legacy_insert).toBeUndefined();
  });

  it('501 {fallback:true} → INSERT legado con el payload corregido → via=legacy', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(501, { error: 'RPC no disponible', fallback: true }));
    createClosureMock.mockResolvedValueOnce({ id: 'c-legacy' });
    const { result } = renderHookOpen();
    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ via: 'legacy', data: { id: 'c-legacy' } });
    expect(createClosureMock).toHaveBeenCalledTimes(1);
    expect(createClosureMock.mock.calls[0][0]).toMatchObject({
      declared_vouchers: 0,
      opening_difference_cup: -3000,
      opening_balance_cup: 3000,
      status: 'pendiente',
    });
  });

  it('501 sin fallback → error propagado, sin degradación silenciosa', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(501, { error: 'otro problema del gateway' }));
    const { result } = renderHookOpen();
    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(createClosureMock).not.toHaveBeenCalled();
    expect((result.current.error as Error).message).toContain('otro problema del gateway');
  });

  it('409 ERR_SHIFT_ALREADY_OPEN → Error con el mensaje de negocio', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(409, { error: 'Ya existe un turno pendiente para esta tienda.' }));
    const { result } = renderHookOpen();
    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Ya existe un turno pendiente');
    expect(createClosureMock).not.toHaveBeenCalled();
  });

  it('fallback sin legacy_insert → INSERT mínimo correcto (store + fondo + pendiente)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(501, { fallback: true }));
    createClosureMock.mockResolvedValueOnce({ id: 'c-min' });
    const { result } = renderHookOpen();
    const { legacy_insert: _omit, ...minimal } = PAYLOAD as Record<string, unknown>;
    result.current.mutate(minimal as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ via: 'legacy' });
    expect(createClosureMock.mock.calls[0][0]).toMatchObject({
      store_id: PAYLOAD.store_id,
      declared_cash: 3000,
      opening_balance: 3000,
      status: 'pendiente',
    });
  });
});
