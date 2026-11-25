/**
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 8 (E).
 *
 * Pruebas del filtro defensivo de estado del calculador de Cuentas por Pagar
 * (misión §FASE 7): los documentos incluidos deben ser EXACTAMENTE los
 * pagables según los gates del backend — receipts fuera voided/reversed,
 * services solo active. Así ningún documento anulado figura como obligación
 * (el punto forense: la obligación del F-23112026 anulado NO debe existir).
 */
import { describe, it, expect } from 'vitest';
import { computeAccountsPayable, type PayableReceiptRow, type PayableServiceRow, type PayableTxnRow, type PayableCommissionRow } from '@/lib/accounts-payable/calculator';

const receipt = (over: Partial<PayableReceiptRow> & Pick<PayableReceiptRow, 'id'>): PayableReceiptRow => ({
  supplier: 'Proveedor Test',
  total_cost: 1000,
  paid_amount: 0,
  payment_status: 'unpaid',
  payment_method: null,
  reference_doc: 'F-1',
  due_date: '2026-11-20',
  reception_date: '2026-11-10',
  created_at: '2026-11-10T00:00:00Z',
  ...over,
});

const service = (over: Partial<PayableServiceRow> & Pick<PayableServiceRow, 'id'>): PayableServiceRow => ({
  supplier: 'Proveedor Test',
  total_amount: 1800,
  paid_amount: 0,
  payment_status: 'unpaid',
  payment_method: null,
  reference_doc: 'F-23112026',
  due_date: '2026-12-23',
  service_date: '2026-11-23',
  currency: 'CUP',
  exchange_rate: 1,
  created_at: '2026-11-23T21:34:00Z',
  ...over,
});

const noTxns: PayableTxnRow[] = [];
const noCommissions: PayableCommissionRow[] = [];
const query = { tab: 'all', category: 'all', now: '2026-11-26' } as unknown as Parameters<typeof computeAccountsPayable>[4];

describe('calculador CxP — filtro defensivo de estado (misión §FASE 7/8.E)', () => {
  it('receipts voided y reversed quedan FUERA de las obligaciones', () => {
    const r = computeAccountsPayable(
      [
        receipt({ id: 'r-active', status: 'active' }),
        receipt({ id: 'r-pending', status: 'pending' }),
        receipt({ id: 'r-voided', status: 'voided' }),
        receipt({ id: 'r-reversed', status: 'reversed' }),
      ],
      [],
      noCommissions,
      noTxns,
      query,
    );
    const ids = r.payables.map(p => p.ref_id);
    expect(ids).toContain('r-active');
    expect(ids).toContain('r-pending');
    expect(ids).not.toContain('r-voided');
    expect(ids).not.toContain('r-reversed');
    expect(r.kpis.totalPending).toBe(2000); // solo activos
  });

  it('services: SOLO active es obligación (draft/cancelled/voided fuera)', () => {
    const r = computeAccountsPayable(
      [],
      [
        service({ id: 's-active', status: 'active' }),
        service({ id: 's-draft', status: 'draft' }),
        service({ id: 's-cancelled', status: 'cancelled' }),
        service({ id: 's-voided', status: 'voided' }),
      ],
      noCommissions,
      noTxns,
      query,
    );
    const ids = r.payables.map(p => p.ref_id);
    expect(ids).toEqual(['s-active']);
  });

  it('la obligación de un servicio VOIDED pagado NO existe ni computa en el pagado (caso F-23112026)', () => {
    // El expediente Pixelarte: servicio voided con pago $1,800 vivo y un
    // reemplazo activo por el mismo importe. Tras el filtro correcto, la
    // obligación del documento anulado desaparece y el desembolso real queda
    // representado UNA sola vez por el reemplazo activo.
    const txns: PayableTxnRow[] = [
      { ref_type: 'service', ref_id: 's-voided', amount_cup: 1800, currency: 'CUP', payment_method: 'cash', direction: 'in', payment_date: '2026-11-23T21:34:51Z', reference: null },
      { ref_type: 'service', ref_id: 's-voided', amount_cup: 1800, currency: 'CUP', payment_method: 'cash', direction: 'reversal', payment_date: '2026-11-26T10:00:00Z', reference: null },
      { ref_type: 'service', ref_id: 's-reemplazo', amount_cup: 1800, currency: 'CUP', payment_method: 'cash', direction: 'in', payment_date: '2026-11-23T21:36:10Z', reference: null },
    ];
    const r = computeAccountsPayable(
      [],
      [
        service({ id: 's-voided', status: 'voided', paid_amount: 1800, payment_status: 'paid' }),
        service({ id: 's-reemplazo', status: 'active', paid_amount: 1800, payment_status: 'paid' }),
      ],
      noCommissions,
      txns,
      query,
    );
    const ids = r.payables.map(p => p.ref_id);
    expect(ids).toEqual(['s-reemplazo']);
    expect(r.kpis.totalPaid).toBe(1800); // SOLO el desembolso real
    expect(r.kpis.totalPending).toBe(0);
  });

  it('backward-compat: filas SIN status se conservan (fuentes legadas/tests)', () => {
    const r = computeAccountsPayable(
      [receipt({ id: 'r-nostatus' })],
      [service({ id: 's-nostatus' })],
      noCommissions,
      noTxns,
      query,
    );
    expect(r.payables.map(p => p.ref_id).sort()).toEqual(['r-nostatus', 's-nostatus']);
  });

  it('identidad contable: Total − Pagado = Saldo con el filtro aplicado', () => {
    const txns: PayableTxnRow[] = [
      { ref_type: 'receipt', ref_id: 'r1', amount_cup: 400, currency: 'CUP', payment_method: 'cash', direction: 'in', payment_date: '2026-11-20T10:00:00Z', reference: null },
    ];
    const r = computeAccountsPayable(
      [receipt({ id: 'r1', status: 'active', total_cost: 1000 }), receipt({ id: 'r9', status: 'voided', total_cost: 99999 })],
      [service({ id: 's1', status: 'active', total_amount: 500 }), service({ id: 's8', status: 'cancelled', total_amount: 8888 })],
      noCommissions,
      txns,
      query,
    );
    const totalOriginal = r.summary.receipts.total_cup + r.summary.services.total_cup;
    expect(totalOriginal).toBe(1500);
    expect(r.kpis.totalPaid).toBe(400);
    expect(r.kpis.totalPending).toBe(1100);
    expect(totalOriginal - r.kpis.totalPaid).toBeCloseTo(r.kpis.totalPending, 2);
  });
});
