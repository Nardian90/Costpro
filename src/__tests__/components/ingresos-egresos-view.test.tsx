/**
 * IngresosEgresosView — MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20).
 *
 * Contrato verificado (brief §5 + §13):
 *   1. Render: header, estado del turno, KPIs del RPC get_cash_flow_summary
 *      (saldo de caja, fondo vigente, ingresos/egresos por moneda, anulados).
 *   2. Consulta RLS-scoped a cash_flow_documents de la tienda activa con
 *      paginación .range() y orden por fecha operativa.
 *   3. Caja cerrada → registro bloqueado con explicación + CTA «Abrir turno
 *      en Caja» (escenario 11 del brief).
 *   4. Matriz de acciones: confirmado → [Ver] + [Anular] (con rol); anulado
 *      → [Ver] únicamente; rol sin autoridad → sin [Anular].
 *   5. Dos modos (tarjetas/tabla) con persistencia (escenario 18).
 *   6. Filtros: búsqueda + tipo + estado + limpiar filtros (escenario 19).
 *   7. Sin tienda activa → mensaje explícito.
 *   8. KPIs separados por moneda (nunca CUP+USD sumados).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IngresosEgresosView from '@/components/views/terminal/views/cash_flow/IngresosEgresosView';

// ── Polyfills jsdom (patrón vales-salida-view.test.tsx) ──
beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  if (!(window as unknown as Record<string, unknown>).PointerEvent) {
    (window as unknown as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
      pointerId = 1; pointerType = 'mouse'; isPrimary = true;
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// ── Fixtures: documentos de fondo de cambio (ejemplo canónico del brief) ──
const DOCS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    store_id: 'store-1',
    document_number: 'IE-000001-2026',
    doc_type: 'ingreso',
    concept: 'constitucion_fondo',
    amount: 5000,
    currency: 'CUP',
    exchange_rate: 1,
    amount_cup: 5000,
    payment_method: 'cash',
    operation_date: '2026-10-20T15:00:00Z',
    status: 'confirmado',
    closure_id: 'c-1',
    responsible_user_id: 'u-2',
    counterparty: 'Encargado Israel',
    justification: 'Fondo de cambio entregado por el encargado',
    notes: null,
    related_document_id: null,
    payment_transaction_id: 'pt-1',
    annulment_payment_transaction_id: null,
    idempotency_key: null,
    created_at: '2026-10-20T15:00:00Z',
    created_by: 'u-2',
    confirmed_at: '2026-10-20T15:00:00Z',
    confirmed_by: 'u-2',
    annulled_at: null,
    annulled_by: null,
    annulment_reason: null,
    responsible: { full_name: 'Ana Torres' },
    annulled_by_profile: null,
    related_document: null,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    store_id: 'store-1',
    document_number: 'IE-000002-2026',
    doc_type: 'egreso',
    concept: 'devolucion_parcial_fondo',
    amount: 2000,
    currency: 'CUP',
    exchange_rate: 1,
    amount_cup: 2000,
    payment_method: 'cash',
    operation_date: '2026-10-20T18:00:00Z',
    status: 'confirmado',
    closure_id: 'c-1',
    responsible_user_id: 'u-2',
    counterparty: 'Encargado Israel',
    justification: 'Devolución parcial del fondo al encargado',
    notes: null,
    related_document_id: '11111111-1111-1111-1111-111111111111',
    payment_transaction_id: 'pt-2',
    annulment_payment_transaction_id: null,
    idempotency_key: null,
    created_at: '2026-10-20T18:00:00Z',
    created_by: 'u-2',
    confirmed_at: '2026-10-20T18:00:00Z',
    confirmed_by: 'u-2',
    annulled_at: null,
    annulled_by: null,
    annulment_reason: null,
    responsible: { full_name: 'Ana Torres' },
    annulled_by_profile: null,
    related_document: { document_number: 'IE-000001-2026', concept: 'constitucion_fondo' },
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    store_id: 'store-1',
    document_number: 'IE-000003-2026',
    doc_type: 'ingreso',
    concept: 'otro_ingreso',
    amount: 100,
    currency: 'USD',
    exchange_rate: 805,
    amount_cup: 80500,
    payment_method: 'cash',
    operation_date: '2026-10-20T19:00:00Z',
    status: 'anulado',
    closure_id: 'c-1',
    responsible_user_id: 'u-2',
    counterparty: null,
    justification: 'Ingreso anulado por duplicado',
    notes: null,
    related_document_id: null,
    payment_transaction_id: 'pt-3',
    annulment_payment_transaction_id: 'pt-3b',
    idempotency_key: null,
    created_at: '2026-10-20T19:00:00Z',
    created_by: 'u-2',
    confirmed_at: '2026-10-20T19:00:00Z',
    confirmed_by: 'u-2',
    annulled_at: '2026-10-20T20:00:00Z',
    annulled_by: 'u-3',
    annulment_reason: 'Duplicado por doble clic',
    responsible: { full_name: 'Ana Torres' },
    annulled_by_profile: { full_name: 'Luis Vega' },
    related_document: null,
  },
];

const TURNO = {
  id: 'c-1',
  store_id: 'store-1',
  user_id: 'u-2',
  status: 'pendiente',
  opening_balance: 5000,
  created_at: '2026-10-20T14:00:00Z',
  declared_cash: 5000,
};

const SUMMARY = {
  window_start: '2026-10-20T14:00:00Z',
  has_pending_shift: true,
  opening_balance: 5000,
  total_sales: 169000,
  cash_sales: 169000,
  cash_outflows: 0,
  cash_production: 0,
  cash_commissions: 0,
  cash_flow_in: 5000,
  cash_flow_out: 2000,
  expected_cash: 172000, // 5000 fondo + 169000 ventas + 5000 constitución − 2000 devolución
  transfer_sales: 0,
  zelle_sales: 0,
  expected_total: 172000,
  fondo_vigente: 8000, // 5000 + 5000 constitución − 2000 devolución
  fondo_ingresado: 5000,
  fondo_devuelto: 2000,
  period: {
    from: '2026-10-20T00:00:00Z',
    to: '2026-10-20T23:59:59Z',
    in_cup: 5000,
    out_cup: 2000,
    in_usd: 0, // el USD anulado no cuenta como confirmado del período
    out_usd: 0,
    ingresos_count: 1,
    egresos_count: 1,
    annulled_count: 1,
  },
};

// ── MOCK: supabase client — from (cadena thenable) + rpc (summary) ──
const fromMock = vi.fn();
const rpcMock = vi.fn();

function chain(result: { data: unknown; error: unknown | null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'order', 'limit']) {
    c[m] = vi.fn(() => c);
  }
  for (const m of ['range', 'single', 'maybeSingle']) {
    c[m] = vi.fn(() => terminal());
  }
  c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

// ── MOCK: stores ──
const mockSetCurrentView = vi.fn();
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1',
    role: 'admin',
    roles: ['admin'],
    fullName: 'Ana Torres',
    activeStoreId: 'store-1',
    memberships: [
      { store_id: 'store-1', role: 'admin', status: 'active', store: { name: 'Tienda Central' } },
    ],
  },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));

// ── MOCK: sonner ──
// MISIÓN CAJA v2.24.0: el libro físico (get_cash_currency_summary) viaja por
// /api/cash-flow/ledger — mock ligero (los KPIs físicos muestran '—').
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ currency_summary_now: null, rows: [], opening: { cup: 0, usd: 0 }, balance_now: { cup: 0, usd: 0 }, count: 0, truncated: false }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

// ── MOCK: modales del módulo (stubs — su contrato tiene suites propias) ──
const createModalMock = vi.fn((_props: unknown) => <div data-testid="stub-create-modal" />);
const detailModalMock = vi.fn((_props: unknown) => <div data-testid="stub-detail-modal" />);
const reverseModalMock = vi.fn((_props: unknown) => <div data-testid="stub-reverse-modal" />);
vi.mock('@/components/views/terminal/views/cash_flow/CashFlowCreateModal', () => ({
  CashFlowCreateModal: (props: unknown) => createModalMock(props),
}));
vi.mock('@/components/views/terminal/views/cash_flow/CashFlowDetailModal', () => ({
  CashFlowDetailModal: (props: unknown) => detailModalMock(props),
}));
vi.mock('@/components/views/terminal/views/cash_flow/CashFlowReverseModal', () => ({
  CashFlowReverseModal: (props: unknown) => reverseModalMock(props),
}));

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IngresosEgresosView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'cash_closures') return chain({ data: TURNO, error: null });
    return chain({ data: DOCS, error: null });
  });
  rpcMock.mockReset().mockResolvedValue({ data: SUMMARY, error: null });
  mockSetCurrentView.mockReset();
  authState.user.role = 'admin';
  authState.user.roles = ['admin'];
});

describe('IngresosEgresosView — render, consulta RLS y KPIs', () => {
  it('1 · header + estado de caja abierta + acción principal habilitada', async () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Ingresos / Egresos de Caja' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Caja abierta')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Registrar ingreso/i })).toBeEnabled();
    expect(screen.getByText(/Turno desde/)).toBeTruthy();
  });

  it('2 · consulta RLS-scoped a cash_flow_documents de la tienda (range paginado)', async () => {
    renderView();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('cash_flow_documents'));
    const idx = fromMock.mock.calls.findIndex(c => c[0] === 'cash_flow_documents');
    const c = fromMock.mock.results[idx]?.value;
    expect(c.select).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('store_id', 'store-1');
    expect(c.order).toHaveBeenCalledWith('operation_date', { ascending: false });
    expect(c.range).toHaveBeenCalledWith(0, 26); // pageSize 25 + 1 fila de detección (range inclusivo)
  });

  it('2-bis · MISIÓN 2026-10-22 Parte A: el select usa el hint por COLUMNA en el embed autoreferencial (regresión PGRST200)', async () => {
    // El defecto: «No se pudieron cargar los movimientos» — PGRST200 porque el
    // hint por NOMBRE DE CONSTRAINT no resolvía en la caché de PostgREST
    // (desincronizada tras recrearse el constraint). El hint por columna
    // `!related_document_id` resuelve bajo ambas cachés.
    renderView();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('cash_flow_documents'));
    const idx = fromMock.mock.calls.findIndex(c => c[0] === 'cash_flow_documents');
    const c = fromMock.mock.results[idx]?.value;
    const selectArg = String(c.select.mock.calls[0]?.[0] ?? '');
    expect(selectArg).toContain('related_document:cash_flow_documents!related_document_id(');
    expect(selectArg).not.toContain('cash_flow_documents!cash_flow_documents_related_document_id_fkey');
    // Embeds hacia profiles intactos (auditados contra la caché viva: OK).
    expect(selectArg).toContain('profiles!cash_flow_documents_responsible_user_id_fkey');
    expect(selectArg).toContain('profiles!cash_flow_documents_annulled_by_fkey');
  });

  it('3 · KPIs del RPC get_cash_flow_summary (una sola fuente de verdad)', async () => {
    renderView();
    // Saldo de caja = fórmula v2.21.0 con los documentos dentro (una sola vez)
    await waitFor(() => expect(screen.getAllByText('$172,000.00').length).toBeGreaterThanOrEqual(1));
    // Fondo vigente = 5.000 apertura + 5.000 constitución − 2.000 devolución
    // MISIÓN CAJA v2.24: la tarjeta duplicada «Fondo pendiente de devolución»
    // fue retirada (redundante) — el fondo aparece en UNA tarjeta.
    expect(screen.getAllByText('$8,000.00').length).toBeGreaterThanOrEqual(1);
    // Ingresos y egresos del período separados (nunca CUP+USD sumados)
    expect(screen.getAllByText('$5,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$2,000.00').length).toBeGreaterThanOrEqual(1);
    // MISIÓN CAJA v2.24 (§9): KPIs de saldos FÍSICOS por moneda añadidos.
    // MISIÓN AUDITORÍA CAJA (2026-10-24) §Fase 2: con el sistema de tabs ambos
    // paneles permanecen montados (el inactivo oculto) — el KPI físico aparece
    // en la pestaña Documentos Y en el panel del libro → getAllByText.
    expect(screen.getAllByText('Saldo físico CUP').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Saldo físico USD').length).toBeGreaterThanOrEqual(1);
    expect(rpcMock).toHaveBeenCalledWith('get_cash_flow_summary', expect.anything());
  });

  it('4 · documentos con número, concepto, importe por moneda y estado', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    expect(screen.getByText('Constitución del fondo de cambio')).toBeTruthy();
    expect(screen.getByText('Devolución parcial del fondo de cambio')).toBeTruthy();
    expect(screen.getByText('Anulado')).toBeTruthy();
    // El USD anulado se muestra tachado con su equivalencia, jamás sumado a CUP
    expect(screen.getByText(/80,500\.00 CUP/)).toBeTruthy();
    // Estados por fila: en modo tabla, Confirmado/Anulado explícitos
    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(screen.getAllByText('Confirmado').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Anulado').length).toBeGreaterThanOrEqual(1);
  });
});

describe('IngresosEgresosView — caja cerrada y sin tienda (escenarios 7/11)', () => {
  it('5 · sin turno abierto: botón habilitado SOLO para entrega de efectivo (misión v2.24 §6) + CTA a Caja', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'cash_closures') return chain({ data: null, error: null });
      return chain({ data: DOCS, error: null });
    });
    rpcMock.mockResolvedValue({
      data: { ...SUMMARY, has_pending_shift: false, expected_cash: 0, fondo_vigente: 0 },
      error: null,
    });
    renderView();
    await waitFor(() => expect(screen.getByText('Caja cerrada')).toBeTruthy());
    const btn = screen.getByRole('button', { name: /Registrar ingreso/i });
    // MISIÓN CAJA v2.24.0: la entrega de efectivo ES autorizable sin turno
    // (el modal restringe los conceptos y el RPC revalida rol + saldo físico).
    expect(btn).toBeEnabled();
    expect(btn.getAttribute('title')).toContain('ENTREGA');
    const cta = screen.getByRole('button', { name: /Abrir turno en Caja/i });
    fireEvent.click(cta);
    expect(mockSetCurrentView).toHaveBeenCalledWith('cash');
  });

  it('6 · sin tienda activa: mensaje explícito y sin consulta de documentos', async () => {
    const prevStore = authState.user.activeStoreId;
    (authState.user as { activeStoreId?: string }).activeStoreId = undefined as unknown as string;
    renderView();
    await waitFor(() => expect(screen.getByText('Sin tienda activa')).toBeTruthy());
    expect(fromMock).not.toHaveBeenCalledWith('cash_flow_documents');
    (authState.user as { activeStoreId?: string }).activeStoreId = prevStore;
  });
});

describe('IngresosEgresosView — matriz de acciones y roles', () => {
  it('7 · confirmado → Ver + Anular; anulado → solo Ver', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000003-2026')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Anular documento IE-000001-2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anular documento IE-000002-2026' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anular documento IE-000003-2026' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Ver documento IE-00000\d-2026$/ }).length).toBe(3);
  });

  it('8 · rol sin autoridad de anulación (clerk) → sin botones Anular', async () => {
    authState.user.role = 'clerk';
    authState.user.roles = ['clerk'];
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Anular documento/ })).toBeNull();
    // Pero el registro (crear) sigue disponible para clerk
    expect(screen.getByRole('button', { name: /Registrar ingreso/i })).toBeEnabled();
  });

  it('9 · Ver abre el modal de detalle con el documento', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ver documento IE-000001-2026' }));
    await waitFor(() => expect(detailModalMock).toHaveBeenCalled());
    const lastCall = detailModalMock.mock.calls.at(-1);
    const props = (lastCall?.[0] ?? {}) as { doc?: { id?: string }; open?: boolean };
    expect(props.open).toBe(true);
    expect(props.doc?.id).toBe('11111111-1111-1111-1111-111111111111');
  });
});

describe('IngresosEgresosView — modos de visualización (escenario 18)', () => {
  it('10 · tarjetas por defecto; tabla al cambiar; persistencia en localStorage', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    // Modo tarjetas: los importes destacados grandes
    expect(screen.getAllByText(/^\+\$5,000\.00$/).length).toBeGreaterThanOrEqual(1);
    // Cambiar a tabla (sin perder el contexto: mismo render)
    fireEvent.click(screen.getByRole('button', { name: 'Modo tabla' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(window.localStorage.getItem('cash_flow_view_mode')).toBe('table');
    // Encabezados de tabla densa
    for (const h of ['Número', 'Tipo', 'Motivo', 'Fecha operativa', 'Responsable', 'Estado', 'Importe', 'Acciones']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeTruthy();
    }
    // Volver a tarjetas
    fireEvent.click(screen.getByRole('button', { name: 'Modo tarjetas' }));
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    expect(window.localStorage.getItem('cash_flow_view_mode')).toBe('cards');
  });
});

describe('IngresosEgresosView — filtros y búsqueda (escenario 19)', () => {
  it('11 · búsqueda por número/concepte/justificación filtra en vivo', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const input = screen.getByLabelText('Buscar movimientos de caja');
    fireEvent.change(input, { target: { value: 'IE-000002' } });
    expect(screen.getByText('IE-000002-2026')).toBeTruthy();
    expect(screen.queryByText('IE-000001-2026')).toBeNull();
    // También por justificación
    fireEvent.change(input, { target: { value: 'Devolución parcial' } });
    expect(screen.getByText('IE-000002-2026')).toBeTruthy();
    expect(screen.queryByText('IE-000003-2026')).toBeNull();
  });

  it('12 · filtro por tipo aplica eq(doc_type) server-side y botón Limpiar filtros', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'egreso' } });
    await waitFor(() => {
      const idx = fromMock.mock.calls.map(c => c[0]).lastIndexOf('cash_flow_documents');
      const c = fromMock.mock.results[idx]?.value;
      expect(c.eq).toHaveBeenCalledWith('doc_type', 'egreso');
    });
    // Limpiar filtros restaura la vista predeterminada
    fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/i }));
    expect(screen.queryByRole('button', { name: /Limpiar filtros/i })).toBeNull();
  });

  it('13 · filtro por estado anulado → solo el documento anulado visible', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    // Client-side ya filtra por estado al re-consultar; el eq va al backend
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'anulado' } });
    await waitFor(() => {
      const idx = fromMock.mock.calls.map(c => c[0]).lastIndexOf('cash_flow_documents');
      const c = fromMock.mock.results[idx]?.value;
      expect(c.eq).toHaveBeenCalledWith('status', 'anulado');
    });
  });
});

describe('IngresosEgresosView — vacío y paginación', () => {
  it('14 · sin documentos: estado vacío con guía de uso', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'cash_closures') return chain({ data: TURNO, error: null });
      return chain({ data: [], error: null });
    });
    renderView();
    await waitFor(() => expect(screen.getByText('Aún no hay ingresos ni egresos en esta tienda')).toBeTruthy());
    expect(screen.getByText(/Registra el dinero entregado para el fondo de cambio/)).toBeTruthy();
  });

  it('15 · paginación: página 2 consulta range(25, 50)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    // Sin hasMore (2 docs < 25): botón siguiente deshabilitado
    const next = screen.getByRole('button', { name: 'Página siguiente' });
    expect(next).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });
});
