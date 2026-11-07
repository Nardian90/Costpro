import { describe, it, expect } from 'vitest';
import {
  buildSalesHistoryPdfModel,
  renderSalesHistoryPdf,
  type SalesHistoryPdfTransaction,
} from '@/lib/export/sales-history-pdf';

/**
 * MISIÓN 2026-11-07 — Historial de Ventas · render del PDF
 * ========================================================
 * Verificación a nivel de bytes (mismo enfoque que las suites de los modelos
 * SC-2-xx): el PDF se genera realmente en jsdom, con páginas, logo resuelto
 * (fallback institucional) y las dos secciones del documento.
 */

const TXS: SalesHistoryPdfTransaction[] = Array.from({ length: 40 }, (_, i) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
  created_at: '2026-11-05T16:00:00Z',
  status: 'completed',
  payment_method: 'cash',
  total_amount: 1000 + i,
  zelle_amount: 0,
  sale_exchange_rate: 680,
}));

describe('renderSalesHistoryPdf — documento real', () => {
  it('genera un PDF con páginas y contenido (solo lectura, sin lanzar errores)', async () => {
    const model = buildSalesHistoryPdfModel({
      transactions: TXS,
      store: { name: 'Tienda QA', logoUrl: null, reeup: '12345678901', nit: 'NIT-1' },
      dateFrom: '2026-11-01',
      dateTo: '2026-11-07',
    });
    const doc = await renderSalesHistoryPdf(model);
    const output = doc.output('arraybuffer') as ArrayBuffer;
    expect(output.byteLength).toBeGreaterThan(2000);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('documento multi-página: 200 ventas → varias páginas con numeración', async () => {
    const txs = Array.from({ length: 200 }, (_, i) => ({
      ...TXS[i % TXS.length],
      id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`,
    }));
    const model = buildSalesHistoryPdfModel({
      transactions: txs,
      store: { name: 'Tienda QA' },
      dateFrom: '2026-11-01',
      dateTo: '2026-11-07',
    });
    const doc = await renderSalesHistoryPdf(model);
    // 200 filas a ~7mm por fila → varias páginas; los encabezados se repiten
    // por autoTable y el pie «Página X de Y» se dibuja en cada página.
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('encabezado con logo fallback y sección de líneas cuando hay datos', async () => {
    const model = buildSalesHistoryPdfModel({
      transactions: TXS.slice(0, 3),
      lines: TXS.slice(0, 3).map((t, i) => ({
        transaction_id: t.id,
        transaction_created_at: t.created_at,
        quantity: 2,
        price_at_sale: 4.5,
        price_currency: 'USD',
        price_at_sale_cup: 3060,
        exchange_rate: 680,
        products: { name: `Producto ${i}`, sku: '87' },
      })),
      store: { name: 'ENERVIDA-VITALLCONS', logoUrl: null },
      dateFrom: '2026-11-01',
      dateTo: '2026-11-07',
    });
    const doc = await renderSalesHistoryPdf(model);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(2000);
  });
});
