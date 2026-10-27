/**
 * Test de regresión — MISIÓN RECEPCIONES (2026-10-27): alta transaccional,
 * verificación de catálogo en alta manual, clasificación de errores y
 * eliminación de borrador.
 *
 * Historia: RLS-FIX (tenant_id en alta manual client-side) — esa
 * responsabilidad pasó al SERVIDOR (register_reception resuelve el tenant
 * fail-closed dentro de su transacción, migración 20261027180000). El
 * cliente YA NO inserta productos: cada item nuevo viaja con su objeto
 * new_product embebido en p_items y la RPC crea producto + recepción +
 * líneas + stock atómicamente (sin huérfanos).
 *
 * Escenarios:
 *  1. executeSubmit NO inserta products client-side y envía new_product
 *     embebido (transaccional server-side).
 *  2. ERR_INVOICE_DUPLICATE (factura duplicada) → mensaje de FACTURA
 *     (defecto D-B: antes todo 23505 se reportaba como "SKU ya existe").
 *  3. ERR_SKU_EXISTS (SKU ya en catálogo) → mensaje con el SKU y guía a
 *     seleccionar el existente (defecto D-A).
 *  4. Error RLS (42501) clasificado sin exponer detalles del motor.
 *  5. 23505 residual sobre idx_receipts_store_reference_doc → mensaje de
 *     factura (carrera real: la RPC ya valida antes del INSERT).
 *  6. Fallo de register_reception → sin rollback client-side (la transacción
 *     del servidor revirtió todo) y el item permanece para reintento.
 *  7. Guard anti re-entrada: doble invocación → 1 sola llamada RPC.
 *  8. Éxito: limpia borrador localStorage y muestra comprobante.
 *  9. Alta manual con SKU existente en catálogo → BLOQUEA y guía a
 *     seleccionar el existente (no agrega item nuevo).
 * 10. Alta manual con SKU inexistente → agrega item is_new (normal).
 * 11. handleDiscardDraft: elimina el borrador localStorage + reset completo.
 * 12. hasDraftContent refleja la presencia de datos del borrador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Mocks hoisted (compartidos con las factories de vi.mock) ──────────────
const h = vi.hoisted(() => ({
  fromMock: vi.fn(),
  registerMock: vi.fn(),
  savePendingMock: vi.fn(),
  confirmPendingMock: vi.fn(),
  logReceptionMock: vi.fn(),
  userHolder: { current: null as any },
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: h.fromMock },
}));

vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: h.userHolder.current }),
  useUIStore: () => ({ setCurrentView: vi.fn() }),
}));

vi.mock('@/hooks/api/useInventory', () => ({
  useInventory: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
  useRegisterReception: () => ({ mutateAsync: h.registerMock, isPending: false }),
}));

vi.mock('@/hooks/api/useReceptions', () => ({
  useSavePendingReception: () => ({ mutateAsync: h.savePendingMock, isPending: false }),
  useConfirmPendingReception: () => ({ mutateAsync: h.confirmPendingMock, isPending: false }),
}));

vi.mock('@/hooks/api/useGlobalOperationDate', () => ({
  useGlobalOperationDate: () => ({ data: null }),
  validateOperationDate: () => ({ valid: true }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/services/audit-service', () => ({
  auditService: { logReceptionCreated: h.logReceptionMock },
}));

import { toast } from 'sonner';
import { useReceptionState } from '@/components/views/terminal/views/inventory/useReceptionState';
import { UserFactory } from '@/contracts/user';

// ── Fixtures ────────────────────────────────────────────────────────────────
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const STORE_A = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (staging)
const USER_A = '22222222-2222-2222-2222-222222222222';

function setupUser() {
  h.userHolder.current = UserFactory.create({
    id: USER_A,
    email: 'admin@costpro.com',
    fullName: 'Operador Test',
    role: 'admin',
    roles: ['admin'],
    storeId: STORE_A,
    activeStoreId: STORE_A,
  });
}

/** Resultado de la consulta de SKU contra el catálogo (alta manual). */
let catalogSkuRows: any[];

function installSupabaseMocks() {
  h.fromMock.mockImplementation((table: string) => {
    if (table === 'stores') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { tenant_id: TENANT_A }, error: null }),
          }),
        }),
      };
    }
    if (table === 'products') {
      return {
        // MISIÓN RECEPCIONES: consulta de verificación de SKU del alta manual
        select: () => ({
          eq: () => ({
            ilike: () => ({
              limit: () => Promise.resolve({ data: catalogSkuRows, error: null }),
            }),
          }),
        }),
        // FIX-04: actualización de precio post-registro
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    throw new Error(`tabla no mockeada en test: ${table}`);
  });
}

function renderReception() {
  return renderHook(() => useReceptionState({}), {
    wrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  });
}

/** Agrega un item manual esperando la verificación de catálogo (async). */
async function addManualItemViaHook(result: any, sku: string, name: string) {
  act(() => { result.current.handleOpenForm(); });
  act(() => { result.current.setManualName(name); });
  act(() => { result.current.setManualSku(sku); });
  await act(async () => { await result.current.handleAddManualProduct(); });
}

/** Configura el formulario con los datos obligatorios y un item manual. */
async function prepareSubmittableReception(result: any, sku = 'SKU-OK-1', name = 'Producto OK') {
  await addManualItemViaHook(result, sku, name);
  act(() => { result.current.setSupplier('Proveedor Test'); });
  act(() => { result.current.setInvoiceNumber('FAC-TEST-1'); });
}

describe('useReceptionState — MISIÓN RECEPCIONES: alta transaccional + borradores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogSkuRows = [];
    setupUser();
    installSupabaseMocks();
    h.registerMock.mockReset();
    h.registerMock.mockResolvedValue('REC-TEST-1');
    h.logReceptionMock.mockReset();
    h.logReceptionMock.mockResolvedValue(undefined);
    localStorage.clear();
  });

  it('1 · executeSubmit envía new_product embebido y NO inserta products client-side', async () => {
    const { result } = renderReception();
    await prepareSubmittableReception(result);

    await act(async () => { await result.current.executeSubmit(); });

    // La llamada RPC es lo único que toca el servidor: transaccional.
    expect(h.registerMock).toHaveBeenCalledTimes(1);
    const rpcArgs = h.registerMock.mock.calls[0][0];
    expect(rpcArgs.p_store_id).toBe(STORE_A);
    expect(rpcArgs.p_supplier).toBe('Proveedor Test');
    expect(rpcArgs.p_invoice_number).toBe('FAC-TEST-1');
    // Item nuevo SIN product_id, CON su declaración de producto nuevo.
    expect(rpcArgs.p_items).toHaveLength(1);
    expect(rpcArgs.p_items[0].product_id).toBeNull();
    expect(rpcArgs.p_items[0].new_product).toMatchObject({
      sku: 'SKU-OK-1',
      name: 'Producto OK',
      is_complete: false,
    });
    // Estado final: comprobante visible y form limpio.
    expect(result.current.successData.open).toBe(true);
    expect(result.current.successData.receiptId).toBe('REC-TEST-1');
    expect(result.current.successData.newProductsCount).toBe(1);
    expect(result.current.items).toHaveLength(0);
  });

  it('2 · ERR_INVOICE_DUPLICATE (factura duplicada) → mensaje de FACTURA, no de SKU', async () => {
    h.registerMock.mockRejectedValueOnce(
      new Error('ERR_INVOICE_DUPLICATE: el número de factura "FAC-TEST-1" ya existe en esta tienda. Usa un número distinto.')
    );
    const { result } = renderReception();
    await prepareSubmittableReception(result);

    await act(async () => { await result.current.executeSubmit(); });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('número de factura "FAC-TEST-1" ya existe'),
      expect.anything()
    );
    const shown = (toast.error as any).mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(shown).not.toContain('Uno de los SKU ya existe');
  });

  it('3 · ERR_SKU_EXISTS → mensaje con el SKU y guía a seleccionar el existente', async () => {
    h.registerMock.mockRejectedValueOnce(
      new Error('ERR_SKU_EXISTS: el SKU "186" ya existe en el catálogo de esta tienda. Selecciona el producto existente en lugar de crearlo de nuevo.')
    );
    const { result } = renderReception();
    await prepareSubmittableReception(result, '186', 'Panel Ronma');

    await act(async () => { await result.current.executeSubmit(); });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('El SKU "186" ya existe en el catálogo'),
      expect.anything()
    );
    const shown = (toast.error as any).mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(shown).toContain('selecciónalo desde el buscador');
  });

  it('4 · clasifica error RLS (42501) sin exponer detalles internos de PostgreSQL', async () => {
    const err: any = new Error('new row violates row-level security policy for table "receipts"');
    err.code = '42501';
    h.registerMock.mockRejectedValueOnce(err);
    const { result } = renderReception();
    await prepareSubmittableReception(result);

    await act(async () => { await result.current.executeSubmit(); });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Permisos insuficientes'),
      expect.anything()
    );
    const shown = (toast.error as any).mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(shown).not.toContain('violates row-level');
    expect(shown).not.toContain('42501');
  });

  it('5 · 23505 residual sobre reference_doc → mensaje de factura (carrera real)', async () => {
    const err: any = new Error('duplicate key value violates unique constraint "idx_receipts_store_reference_doc"');
    err.code = '23505';
    h.registerMock.mockRejectedValueOnce(err);
    const { result } = renderReception();
    await prepareSubmittableReception(result);

    await act(async () => { await result.current.executeSubmit(); });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('número de factura "FAC-TEST-1" ya existe'),
      expect.anything()
    );
  });

  it('6 · fallo de register_reception → sin rollback client-side; item permanece para reintento', async () => {
    h.registerMock.mockRejectedValueOnce(new Error('ERR_BACKDATED_DOCUMENT'));
    const { result } = renderReception();
    await prepareSubmittableReception(result, 'SKU-RB-1', 'Producto rollback');

    await act(async () => { await result.current.executeSubmit(); });

    // La transacción del servidor revirtió TODO (producto incluido): no hay
    // limpieza client-side que hacer — el contrato new_product es atómico.
    expect(h.registerMock).toHaveBeenCalledTimes(1);
    // El item permanece en el formulario para que el usuario corrija y reintente.
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].sku).toBe('SKU-RB-1');
    expect(result.current.items[0].is_new).toBe(true);
    // El borrador local se conserva (no se perdió el trabajo).
    expect(localStorage.getItem(`reception-draft-${STORE_A}`)).not.toBeNull();
  });

  it('7 · guard anti re-entrada: doble invocación concurrente de executeSubmit → 1 sola llamada RPC', async () => {
    let resolveRpc!: (v: any) => void;
    h.registerMock.mockImplementationOnce(() => new Promise(resolve => { resolveRpc = resolve; }));
    const { result } = renderReception();
    await prepareSubmittableReception(result, 'SKU-DOUBLE', 'Producto doble');

    let first!: Promise<void>;
    act(() => { first = result.current.executeSubmit().then(() => {}); });
    // Segunda invocación mientras la primera está en curso → ignorada por el guard.
    act(() => { result.current.executeSubmit(); });

    await act(async () => {
      resolveRpc('REC-DOUBLE');
      await first;
    });

    expect(h.registerMock).toHaveBeenCalledTimes(1); // una sola recepción
  });

  it('8 · éxito: limpia el borrador (items vacíos) y muestra comprobante', async () => {
    const { result } = renderReception();
    await prepareSubmittableReception(result, 'SKU-CLEAN', 'Producto limpio');

    await act(async () => { await result.current.executeSubmit(); });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.supplier).toBe('');
    expect(result.current.invoiceNumber).toBe('');
    expect(result.current.successData.open).toBe(true);
    expect(result.current.successData.receiptId).toBe('REC-TEST-1');
    expect(result.current.successData.newProductsCount).toBe(1);
    // Borrador persistente eliminado tras el registro.
    expect(localStorage.getItem(`reception-draft-${STORE_A}`)).toBeNull();
  });

  it('9 · alta manual con SKU EXISTENTE en catálogo → bloquea y guía al existente (defecto D-A)', async () => {
    catalogSkuRows = [
      { id: 'prod-existing-186', sku: '186', name: 'Panel Ronma', cost_price: 1, price: 190, unit_of_measure: 'unidad' },
    ];
    const { result } = renderReception();
    await addManualItemViaHook(result, '186', 'Panel Ronma');

    // NO se agregó como nuevo: el catálogo ya lo tiene.
    expect(result.current.items).toHaveLength(0);
    // Se guió al usuario con el toast informativo y la selección del existente.
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('El SKU "186" ya existe en el catálogo'),
      expect.anything()
    );
    expect(result.current.selectedProductId).toBe('prod-existing-186');
    // La búsqueda quedó apuntando al SKU para que el panel de confirmación
    // cargue los datos reales del producto existente.
    expect(result.current.addItemSearch).toBe('186');
  });

  it('10 · alta manual con SKU NO existente → agrega item is_new normalmente', async () => {
    catalogSkuRows = [];
    const { result } = renderReception();
    await addManualItemViaHook(result, 'SKU-LIBRE-7', 'Producto realmente nuevo');

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      sku: 'SKU-LIBRE-7',
      name: 'Producto realmente nuevo',
      is_new: true,
      product_id: null,
    });
  });

  it('11 · handleDiscardDraft: elimina el borrador localStorage y resetea el formulario', async () => {
    const { result } = renderReception();
    await prepareSubmittableReception(result, 'SKU-DISCARD', 'Producto a descartar');
    expect(result.current.hasDraftContent).toBe(true);
    expect(localStorage.getItem(`reception-draft-${STORE_A}`)).not.toBeNull();

    act(() => { result.current.handleDiscardDraft(); });

    expect(localStorage.getItem(`reception-draft-${STORE_A}`)).toBeNull();
    expect(result.current.items).toHaveLength(0);
    expect(result.current.supplier).toBe('');
    expect(result.current.invoiceNumber).toBe('');
    expect(result.current.notes).toBe('');
    expect(result.current.hasDraftContent).toBe(false);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('Borrador eliminado')
    );
  });

  it('12 · hasDraftContent: false con formulario vacío, true con cualquier dato', async () => {
    const { result } = renderReception();
    expect(result.current.hasDraftContent).toBe(false);

    act(() => { result.current.setSupplier('Alguien'); });
    expect(result.current.hasDraftContent).toBe(true);

    act(() => { result.current.handleDiscardDraft(); });
    expect(result.current.hasDraftContent).toBe(false);
  });
});
