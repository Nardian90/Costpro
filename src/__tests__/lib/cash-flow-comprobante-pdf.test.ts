/**
 * Comprobante PDF del documento Ingreso/Egreso — MISIÓN 2026-10-20 (§10).
 * El comprobante se identifica como Ingreso/Egreso de caja (NO factura de
 * venta) y soporta reimpresión desde el detalle.
 */
import { describe, it, expect } from 'vitest';
import { buildCashFlowComprobantePdf, comprobanteFileName } from '@/lib/cash-flow/comprobante-pdf';
import type { CashFlowDocument } from '@/types';

const DOC: CashFlowDocument = {
  id: '11111111-1111-4111-8111-111111111111',
  store_id: 'store-1',
  document_number: 'IE-000042-2026',
  doc_type: 'ingreso',
  concept: 'reposicion_fondo',
  amount: 1500,
  currency: 'CUP',
  exchange_rate: 1,
  amount_cup: 1500,
  payment_method: 'cash',
  operation_date: '2026-10-20T16:00:00Z',
  status: 'confirmado',
  closure_id: 'c-1',
  responsible_user_id: 'u-2',
  counterparty: 'Encargado',
  justification: 'Reposición del fondo de cambio',
  notes: null,
  related_document_id: null,
  payment_transaction_id: 'pt-1',
  annulment_payment_transaction_id: null,
  idempotency_key: null,
  created_at: '2026-10-20T16:00:00Z',
  created_by: 'u-2',
  confirmed_at: '2026-10-20T16:00:00Z',
  confirmed_by: 'u-2',
  annulled_at: null,
  annulled_by: null,
  annulment_reason: null,
  responsible: { full_name: 'Ana Torres' },
  annulled_by_profile: null,
  related_document: null,
};

describe('buildCashFlowComprobantePdf', () => {
  it('genera un documento A4 de una página con el comprobante (jsPDF lazy)', async () => {
    const pdf = await buildCashFlowComprobantePdf({ doc: DOC, storeName: 'Tienda Central' });
    expect(pdf).toBeTruthy();
    expect(pdf.getNumberOfPages()).toBe(1);
    // A4 portrait en mm
    expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(210);
    expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(297);
  });

  it('nombre de archivo canónico por número documental (reimpresión estable)', () => {
    expect(comprobanteFileName(DOC)).toBe('comprobante_IE-000042-2026.pdf');
  });

  it('documento anulado: genera SIN errores (sección de anulación incluida)', async () => {
    const anulado: CashFlowDocument = {
      ...DOC,
      status: 'anulado',
      doc_type: 'egreso',
      concept: 'devolucion_total_fondo',
      annulled_at: '2026-10-20T20:00:00Z',
      annulled_by: 'u-3',
      annulment_reason: 'Cierre del turno: devolución total del fondo',
      annulled_by_profile: { full_name: 'Luis Vega' },
    };
    const pdf = await buildCashFlowComprobantePdf({ doc: anulado, storeName: 'Tienda Central' });
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
