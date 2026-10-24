/**
 * MISIÓN AUDITORÍA CAJA (2026-10-24) — §Fase 2 (tabs) y §Fase 3 (fechas).
 *
 * Contrato verificado:
 *   TABS:
 *   1. La sección «Movimientos que explican el saldo» YA NO es un acordeón:
 *      es una pestaña real (role=tab/tablist/tabpanel, aria-selected,
 *      aria-controls, teclado ←/→/Home/End, foco visible vía tabIndex roving).
 *   2. Solo el contenido de la pestaña activa es visible (el panel inactivo
 *      está oculto con `hidden`, no desmontado).
 *   3. Alternar pestañas NO remonta los paneles: filtros, fechas y paginación
 *      del documento se conservan (mismo DOM, estado intacto).
 *   4. La consulta del libro (limit=2000) se dispara al ACTIVAR la pestaña,
 *      no antes — y no se re-dispara al volver a la pestaña documentos.
 *   FECHAS:
 *   5. Al abrir la vista sin filtros guardados, Desde/Hasta parten de la
 *      FECHA ACTUAL de negocio (todayBusinessDay — America/Havana, la
 *      convención operativa de COSTPRO, NUNCA una conversión UTC cruda).
 *   6. «Limpiar filtros» restaura Desde/Hasta a la fecha actual.
 *   7. El intervalo invertido (Desde > Hasta) se avisa y NO se aplica como
 *      rango contable (aria-invalid + role=alert).
 *   8. Las fechas no cambian al alternar pestañas (estabilidad §Fase 3.5).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IngresosEgresosView from '@/components/views/terminal/views/cash_flow/IngresosEgresosView';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';

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
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

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
];

const TURNO = {
  id: 'c-1', store_id: 'store-1', user_id: 'u-2', status: 'pendiente',
  opening_balance: 5000, created_at: '2026-10-20T14:00:00Z', declared_cash: 5000,
};

const SUMMARY = {
  window_start: '2026-10-20T14:00:00Z',
  has_pending_shift: true,
  opening_balance: 5000,
  total_sales: 0, cash_sales: 0, cash_outflows: 0, cash_production: 0, cash_commissions: 0,
  cash_flow_in: 5000, cash_flow_out: 0, expected_cash: 10000, transfer_sales: 0, zelle_sales: 0,
  expected_total: 10000, fondo_vigente: 10000, fondo_ingresado: 5000, fondo_devuelto: 0,
  period: {
    from: '2026-10-20T00:00:00Z', to: '2026-10-20T23:59:59Z',
    in_cup: 5000, out_cup: 0, in_usd: 0, out_usd: 0,
    ingresos_count: 1, egresos_count: 0, annulled_count: 0,
  },
};

// ── MOCK: supabase client ──
const fromMock = vi.fn();
const rpcMock = vi.fn();
function chain(result: { data: unknown; error: unknown | null }) {
  const c: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  for (const m of ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'gt', 'or', 'order', 'limit']) {
    (c as any)[m] = vi.fn(() => c);
  }
  for (const m of ['range', 'single', 'maybeSingle']) {
    (c as any)[m] = vi.fn(() => terminal());
  }
  (c as any).then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return c;
}
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args), rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const mockSetCurrentView = vi.fn();
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1', role: 'admin', roles: ['admin'], fullName: 'Ana Torres', activeStoreId: 'store-1',
    memberships: [{ store_id: 'store-1', role: 'admin', status: 'active', store: { name: 'Tienda Central' } }],
  },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) => sel ? sel({ setCurrentView: mockSetCurrentView }) : { setCurrentView: mockSetCurrentView },
}));

// ── MOCK: apiFetch — cuenta las llamadas al ledger (limit=2000) ──
const apiFetchMock = vi.fn().mockResolvedValue({
  currency_summary_now: { net: { CUP: 10000, USD: 0 }, terms: {}, window: {} },
  rows: [], opening: { cup: 0, usd: 0 }, balance_now: { cup: 10000, usd: 0, reconciled: true },
  totals: { entry_cup: 10000, exit_cup: 0, entry_usd: 0, exit_usd: 0 },
  count: 0, truncated: false, balance_at_cutoff: null,
});
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock('@/components/views/terminal/views/cash_flow/CashFlowCreateModal', () => ({
  CashFlowCreateModal: () => <div data-testid="stub-create-modal" />,
}));
vi.mock('@/components/views/terminal/views/cash_flow/CashFlowDetailModal', () => ({
  CashFlowDetailModal: () => <div data-testid="stub-detail-modal" />,
}));
vi.mock('@/components/views/terminal/views/cash_flow/CashFlowReverseModal', () => ({
  CashFlowReverseModal: () => <div data-testid="stub-reverse-modal" />,
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
  apiFetchMock.mockClear();
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'cash_closures') return chain({ data: TURNO, error: null });
    return chain({ data: DOCS, error: null });
  });
  rpcMock.mockReset().mockResolvedValue({ data: SUMMARY, error: null });
});

describe('MISIÓN AUDITORÍA CAJA §Fase 2 — tabs «Movimientos que explican el saldo»', () => {
  it('1 · tablist con dos pestañas reales (aria) — el acordeón desapareció', async () => {
    renderView();
    const tablist = screen.getByRole('tablist', { name: /Secciones de Ingresos\/Egresos/i });
    expect(tablist).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    const tabDoc = screen.getByRole('tab', { name: /Ingresos \/ Egresos/i });
    const tabLibro = screen.getByRole('tab', { name: /Movimientos que explican el saldo/i });
    expect(tabDoc.getAttribute('aria-controls')).toBe('ie-panel-documentos');
    expect(tabLibro.getAttribute('aria-controls')).toBe('ie-panel-libro');
    // El botón de acordeón (aria-expanded) ya NO existe — las pestañas no son
    // expandibles: ningún elemento con role=tab lleva aria-expanded.
    for (const t of tabs) expect(t.getAttribute('aria-expanded')).toBeNull();
  });

  it('2 · solo el panel de la pestaña activa es visible (el otro queda oculto, no desmontado)', async () => {
    renderView();
    const panelDoc = document.getElementById('ie-panel-documentos') as HTMLElement;
    const panelLibro = document.getElementById('ie-panel-libro') as HTMLElement;
    // Inicial: documentos visible, libro oculto (pero PRESENTE en el DOM)
    expect(panelDoc.hidden).toBe(false);
    expect(panelLibro.hidden).toBe(true);
    expect(panelLibro).toBeTruthy(); // montado (estado conservado)
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());

    // Activar la pestaña del libro
    await userEvent.click(screen.getByRole('tab', { name: /Movimientos que explican el saldo/i }));
    expect(panelDoc.hidden).toBe(true);
    expect(panelLibro.hidden).toBe(false);
    // El panel del libro muestra su encabezado (antes cabecera del acordeón)
    expect(screen.getAllByText('Movimientos que explican el saldo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Libro físico por moneda/i)).toBeTruthy();
  });

  it('3 · la consulta del libro (limit=2000) se dispara al activar la pestaña — no antes, no al salir', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    // El hook de resumen de moneda usa limit=50 (KPIs) — la consulta del PANEL
    // (limit=2000) solo existe tras activar la pestaña.
    const ledgerPanelCalls = () => apiFetchMock.mock.calls.filter(c => String(c[0]).includes('limit=2000'));
    expect(ledgerPanelCalls()).toHaveLength(0);

    await userEvent.click(screen.getByRole('tab', { name: /Movimientos que explican el saldo/i }));
    await waitFor(() => expect(ledgerPanelCalls().length).toBeGreaterThanOrEqual(1));

    // Volver a documentos NO re-dispara ni duplica la suscripción del libro
    await userEvent.click(screen.getByRole('tab', { name: /^Ingresos \/ Egresos$/i }));
    const countAfterBack = ledgerPanelCalls().length;
    await userEvent.click(screen.getByRole('tab', { name: /Movimientos que explican el saldo/i }));
    // react-query reutiliza la caché (staleTime 30s) — sin refetch inmediato
    expect(ledgerPanelCalls().length).toBe(countAfterBack);
  });

  it('4 · alternar pestañas NO pierde filtros ni fechas del panel documentos', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const desde = screen.getByLabelText('Fecha operativa desde') as HTMLInputElement;
    const hasta = screen.getByLabelText('Fecha operativa hasta') as HTMLInputElement;
    fireEvent.change(desde, { target: { value: '2026-10-01' } });
    fireEvent.change(hasta, { target: { value: '2026-10-15' } });

    // Ciclo completo de pestañas
    await userEvent.click(screen.getByRole('tab', { name: /Movimientos que explican el saldo/i }));
    await userEvent.click(screen.getByRole('tab', { name: /^Ingresos \/ Egresos$/i }));

    // Las fechas del usuario SIGUEN intactas (mismo DOM, estado conservado)
    expect(desde.value).toBe('2026-10-01');
    expect(hasta.value).toBe('2026-10-15');
    // El documento sigue visible sin recarga destructiva
    expect(screen.getByText('IE-000001-2026')).toBeTruthy();
  });

  it('5 · teclado: ←/→ navegan entre pestañas con foco (patrón WAI-ARIA)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const tabDoc = screen.getByRole('tab', { name: /Ingresos \/ Egresos/i });
    const tabLibro = screen.getByRole('tab', { name: /Movimientos que explican el saldo/i });
    // Roving tabindex: solo la pestaña seleccionada está en el orden de tabulación
    expect(tabDoc.tabIndex).toBe(0);
    expect(tabLibro.tabIndex).toBe(-1);
    expect(tabDoc.getAttribute('aria-selected')).toBe('true');

    // → desde la pestaña activa (documentos) selecciona y enfoca el libro
    tabDoc.focus();
    fireEvent.keyDown(tabDoc, { key: 'ArrowRight' });
    expect(tabLibro.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabLibro);

    // ← desde el libro regresa a documentos
    fireEvent.keyDown(tabLibro, { key: 'ArrowLeft' });
    expect(tabDoc.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabDoc);

    // End → última pestaña · Home → primera
    fireEvent.keyDown(tabDoc, { key: 'End' });
    expect(tabLibro.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabLibro, { key: 'Home' });
    expect(tabDoc.getAttribute('aria-selected')).toBe('true');
  });
});

describe('MISIÓN AUDITORÍA CAJA §Fase 3 — fechas por defecto y reglas cronológicas', () => {
  it('6 · apertura sin filtros guardados: Desde y Hasta parten de la FECHA ACTUAL de negocio (Havana)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const hoy = todayBusinessDay(); // convención COSTPRO (America/Havana)
    const desde = screen.getByLabelText('Fecha operativa desde') as HTMLInputElement;
    const hasta = screen.getByLabelText('Fecha operativa hasta') as HTMLInputElement;
    expect(desde.value).toBe(hoy);
    expect(hasta.value).toBe(hoy);
    // La convención no es una fecha UTC cruda: hoy Habana puede diferir del
    // día UTC — el contrato usa SIEMPRE el día de negocio local.
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('7 · «Limpiar filtros» restaura Desde/Hasta a la fecha actual (no a vacío)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const desde = screen.getByLabelText('Fecha operativa desde') as HTMLInputElement;
    const hasta = screen.getByLabelText('Fecha operativa hasta') as HTMLInputElement;
    fireEvent.change(desde, { target: { value: '2026-01-01' } });
    fireEvent.change(hasta, { target: { value: '2026-01-31' } });

    await userEvent.click(screen.getByRole('button', { name: /Limpiar filtros/i }));
    const hoy = todayBusinessDay();
    expect(desde.value).toBe(hoy);
    expect(hasta.value).toBe(hoy);
  });

  it('8 · intervalo invertido (Desde > Hasta): alerta visible y rango NO aplicado', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const desde = screen.getByLabelText('Fecha operativa desde') as HTMLInputElement;
    const hasta = screen.getByLabelText('Fecha operativa hasta') as HTMLInputElement;
    // Desde posterior a Hasta → aria-invalid + role=alert con mensaje
    fireEvent.change(desde, { target: { value: '2026-10-20' } });
    fireEvent.change(hasta, { target: { value: '2026-10-10' } });
    expect(screen.getByRole('alert').textContent).toContain('El intervalo es inválido');
    expect(desde.getAttribute('aria-invalid')).toBe('true');
    expect(hasta.getAttribute('aria-invalid')).toBe('true');
    // El rango contable NO se construye: la consulta de documentos NO lleva
    // gte/lte de fechas cuando el intervalo es inválido.
    const idx = fromMock.mock.calls.findLastIndex(c => c[0] === 'cash_flow_documents');
    const c = fromMock.mock.results[idx]?.value as any;
    expect(c.gte).not.toHaveBeenCalled();
    expect(c.lte).not.toHaveBeenCalled();
  });

  it('9 · las fechas NO cambian al alternar pestañas (estabilidad §Fase 3.5)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('IE-000001-2026')).toBeTruthy());
    const hoy = todayBusinessDay();
    await userEvent.click(screen.getByRole('tab', { name: /Movimientos que explican el saldo/i }));
    await userEvent.click(screen.getByRole('tab', { name: /^Ingresos \/ Egresos$/i }));
    const desde = screen.getByLabelText('Fecha operativa desde') as HTMLInputElement;
    const hasta = screen.getByLabelText('Fecha operativa hasta') as HTMLInputElement;
    expect(desde.value).toBe(hoy);
    expect(hasta.value).toBe(hoy);
  });

  it('10 · el selector de corte del libro no acepta fechas futuras (max = hoy de negocio)', async () => {
    renderView();
    await userEvent.click(screen.getByRole('tab', { name: /Movimientos que explican el saldo/i }));
    const corte = await screen.findByLabelText('Fecha de corte del saldo histórico');
    expect((corte as HTMLInputElement).max).toBe(todayBusinessDay());
  });
});
