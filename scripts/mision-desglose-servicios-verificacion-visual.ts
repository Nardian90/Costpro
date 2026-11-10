/**
 * mision-desglose-servicios-verificacion-visual.ts — MISIÓN 2026-11-11.
 *
 * Genera el PDF REAL de la plantilla Diario del Reporte Entrega con:
 *   1. Opción DESMARCADA (default) — formato actual intacto.
 *   2. Opción MARCADA — sub-filas «›» por concepto bajo «Servicios recibidos
 *      pagados en efectivo».
 * Caso del brief: ventas efectivo 94.595,00 · servicios −11.100,00 ·
 * esperado 83.495,00. Salidas en verificacion-desglose-servicios/.
 */
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve(__dirname, '../../verificacion-desglose-servicios');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const DESGLOSE_CUP = [
  { concept: 'Comisión', total: 2900, count: 1 },
  { concept: 'Salario Fijo', total: 5000, count: 2 },
  { concept: 'Otros', total: 3200, count: 1 },
];

function reporteBrief(conDesglose: boolean): never {
  return {
    sales: [{ payment_method: 'cash', currency: 'CUP', transaction_count: 5, total: 94595, total_cup: 94595 }],
    sales_split: { CUP: { cash: 94595, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 94595 } },
    payments: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'service', payment_count: 3, total: 11100, total_cup: 11100 }],
    commissions: [],
    production: [],
    totals: { sales_total_cup: 94595, payments_total_cup: 11100, commissions_total_cup: 0, balance_cup: 83495 },
    start_date: '2026-11-10T04:00:00.000Z',
    end_date: '2026-11-11T03:59:59.999Z',
    cash_balance_cup: 83495,
    cash_breakdown: [],
    ...(conDesglose ? { servicios_recibidos_por_concepto: { CUP: DESGLOSE_CUP } } : {}),
  } as never;
}

async function main() {
  const { buildCashReportPdf, DEFAULT_PDF_OPTIONS } = await import('../src/components/views/terminal/views/cash/cash-report-pdf');
  const baseCtx = {
    template: 'diario' as const,
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    storeInfo: { name: 'EnerVida Centro Habana', logo_url: null, address: 'Calle Demo 123', phone: '+53 50000000', email: null, reeup: null, nit: null },
    deliveredBy: 'Israel Leyva',
    recipientName: 'Belkis Olivera',
    madeBy: 'Ana Torres',
    cupDenoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    usdDenoms: [100, 50, 20, 10, 5, 1],
    cupBreakdown: { 500: 167, 20: 2, 5: 1 },
    usdBreakdown: {},
    orientation: 'vertical' as const,
  };
  // 1) DESMARCADA (default)
  const docOff = await buildCashReportPdf({
    ...baseCtx,
    report: reporteBrief(true),
    options: { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: false },
  } as never);
  fs.writeFileSync(path.join(OUT_DIR, 'reporte-diario-opcion-desmarcada.pdf'), Buffer.from(docOff.output('arraybuffer')));
  // 2) MARCADA
  const docOn = await buildCashReportPdf({
    ...baseCtx,
    report: reporteBrief(true),
    options: { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true },
  } as never);
  fs.writeFileSync(path.join(OUT_DIR, 'reporte-diario-opcion-marcada.pdf'), Buffer.from(docOn.output('arraybuffer')));
  console.log('PDF generados en', OUT_DIR);
  console.log('  - reporte-diario-opcion-desmarcada.pdf (formato actual intacto)');
  console.log('  - reporte-diario-opcion-marcada.pdf   (desglose por concepto)');
}

main().catch(err => { console.error(err); process.exit(1); });
