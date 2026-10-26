/**
 * mision-word-verificacion-visual.ts — MISIÓN WORD (2026-10-27), §8 del brief:
 * VERIFICACIÓN VISUAL COMPARATIVA PDF vs DOCX.
 *
 * Genera el MISMO Reporte Entrega (fixture EnerVida 17/10, mismo del suite de
 * tests del Excel/Word) por las DOS vías reales de producción:
 *   1. PDF  — buildCashReportPdf (jsPDF, la plantilla que previsualiza la app)
 *   2. DOCX — buildCashReportWordDocument (nueva exportación Word)
 *
 * Con los mismos summaries + comisiones INYECTADOS (cero red). Después:
 *   · Convierte el DOCX a PDF con LibreOffice (herramienta compatible con
 *     Word disponible en el entorno) — valida que el archivo ABRE en un
 *     procesador real de documentos.
 *   · Extrae el texto de ambos PDFs (pdftotext) y compara: registros,
 *     totales, encabezados, secciones, monedas y firmas.
 *   · Mide páginas y tamaño de página de ambos (pdfinfo).
 *   · Renderiza la primera página de cada uno a PNG (pdftoppm) para
 *     inspección visual humana/multimodal.
 *
 * Uso: npx tsx scripts/mision-word-verificacion-visual.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { buildCashReportPdf, type CashReportPdfContext, type CashReportSummaries } from '../src/components/views/terminal/views/cash/cash-report-pdf';
import { buildCashReportWordDocument } from '../src/components/views/terminal/views/cash/cash-report-docx';
import { Packer } from 'docx';

// ── Fixture 17/10/2026 (EnerVida) — MISMO del suite de tests ──
const ITEMS_1710 = [
  { product_id: 'pid-141', product_name: 'Cemento TBV 50 Kg', sku: '141', total_quantity: 7, qty_cup: 7, qty_usd: 0, total_cup: 140000, cash_cup: 140000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-146', product_name: 'Tunder Grande', sku: '146', total_quantity: 1, qty_cup: 0, qty_usd: 1, total_cup: 120750, cash_cup: 0, transfer_cup: 0, zelle_cup: 0, cash_usd: 150, transfer_usd: 0, zelle_usd: 0, usd_total: 150, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-46', product_name: 'Masilla interior blanca', sku: '46', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 22000, cash_cup: 22000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-28', product_name: 'Espejo', sku: '28', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 5000, cash_cup: 5000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-142', product_name: 'Cemento Blanco 2 Kg', sku: '142', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 2000, cash_cup: 2000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
];

const SUMMARIES: Required<CashReportSummaries> = {
  itemsSummary: { items: ITEMS_1710, total_cup: 169000, total_cash: 169000, total_transfer: 0, total_zelle: 0 },
  paymentTotals: {
    totals: {
      CUP: { cash: 169000, transfer: 0, zelle: 0, total: 169000 },
      USD: { cash: 150, transfer: 0, zelle: 0, total: 150 },
    },
  },
  commissionsSummary: { workers: [], total_cup: 0 },
  productionOrders: [
    { order_number: 'OT-0001', description: 'Instalación eléctrica', advance_currency: 'CUP', advance_amount: 5000 },
  ],
};

const COMMISSIONS = new Map<string, number>([['pid-141', 1400]]);

function buildContext(template: 'diario' | 'estandar'): CashReportPdfContext {
  return {
    report: {
      sales: [
        { payment_method: 'cash', currency: 'CUP', total: 169000, transaction_count: 1 },
        { payment_method: 'cash', currency: 'USD', total: 150, transaction_count: 1 },
      ],
      commissions: [], payments: [], production: [], adjustments: [], cash_flows: [], refund_rows: [],
      totals: {}, start_date: '2026-10-17', end_date: '2026-10-17',
    } as unknown as CashReportPdfContext['report'],
    template,
    startDate: '2026-10-17',
    endDate: '2026-10-17',
    storeInfo: {
      name: 'ENERVIDA-VITALLCONS', logo_url: null, address: 'Calle 23', phone: '530000',
      email: null, reeup: '91-010-1234', nit: '11041412345',
    },
    deliveredBy: 'Israel Leyva',
    recipientName: 'Belkis Olivera',
    madeBy: 'Ana Torres',
    cupDenoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    usdDenoms: [100, 50, 20, 10, 5, 1],
    cupBreakdown: { 1000: '169' },
    usdBreakdown: { 100: '1', 50: '1' },
    options: {
      detailPayments: false, detailProduction: false, includeBreakdown: true,
      includeUsd: true, includeSignature: true, includeOtReport: true,
      includeCommissionColumn: true, usdSeparatePage: true, includeCashBreakdown: true,
    },
    orientation: 'vertical',
  };
}

const OUT_DIR = path.resolve(__dirname, '../../verificacion-word-visual');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function pdfInfo(file: string): { pages: number; size: string } {
  const out = sh(`pdfinfo "${file}"`);
  const pages = Number(/Pages:\s+(\d+)/.exec(out)?.[1] ?? 0);
  const size = /Page size:\s+([^\n]+)/.exec(out)?.[1]?.trim() ?? '?';
  return { pages, size };
}

function pdfText(file: string): string {
  return sh(`pdftotext -layout "${file}" -`);
}

/** Palabras clave compartidas que DEBEN estar en ambos documentos. */
const SHARED_KEYS = [
  'ENERVIDA-VITALLCONS',
  'Reporte de Venta CUP',
  'Período: 2026-10-17',
  'Resumen del Día',
  'Ventas en efectivo',
  'Efectivo esperado a entregar',
  'Desglose de efectivo CUP',
  'Efectivo contado / entregado',
  'Cuadre (cuadrado)',
  'Cemento TBV 50 Kg',
  'Tunder Grande',
  'TOTALES',
  'Anexo de Auditoría',
  'Reporte de Órdenes de Trabajo',
  'OT-0001',
  'Hecho por:',
  'Entregado por:',
  'Recibido por:',
  'Israel Leyva',
  'Belkis Olivera',
  'Ana Torres',
];

async function main(): Promise<void> {
  console.log('═══ MISIÓN WORD §8 — VERIFICACIÓN VISUAL COMPARATIVA PDF vs DOCX ═══\n');

  // ── 1. PDF por la vía real de producción ──
  console.log('1. Generando PDF (buildCashReportPdf — jsPDF)…');
  const pdfDoc = await buildCashReportPdf(buildContext('diario'), SUMMARIES);
  // jsPDF en Node: salida como ArrayBuffer.
  const pdfBytes = pdfDoc.output('arraybuffer') as ArrayBuffer;
  const pdfPath = path.join(OUT_DIR, 'reporte_diario_enervida.pdf');
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
  console.log(`   → ${pdfPath} (${(pdfBytes.byteLength / 1024).toFixed(1)} KB)`);

  // ── 2. DOCX por la vía real de producción ──
  console.log('2. Generando DOCX (buildCashReportWordDocument — docx)…');
  const { doc, filename } = await buildCashReportWordDocument(buildContext('diario'), SUMMARIES, COMMISSIONS);
  const docxBuffer = Buffer.from(new Uint8Array(await Packer.toBuffer(doc)));
  const docxPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(docxPath, docxBuffer);
  console.log(`   → ${docxPath} (${(docxBuffer.byteLength / 1024).toFixed(1)} KB)`);

  // ── 3. DOCX → PDF con LibreOffice (apertura REAL en un procesador de documentos) ──
  console.log('3. Convirtiendo DOCX → PDF con LibreOffice…');
  sh(`soffice --headless --convert-to pdf --outdir "${OUT_DIR}" "${docxPath}"`);
  const docxPdfPath = docxPath.replace(/\.docx$/, '.pdf');
  if (!fs.existsSync(docxPdfPath)) throw new Error('LibreOffice no produjo el PDF del DOCX');
  console.log(`   → ${docxPdfPath}`);

  // ── 4. Comparación estructural ──
  console.log('\n4. COMPARACIÓN ESTRUCTURAL');
  const infoPdf = pdfInfo(pdfPath);
  const infoDocx = pdfInfo(docxPdfPath);
  console.log(`   PDF  original : ${infoPdf.pages} páginas · ${infoPdf.size}`);
  console.log(`   DOCX→PDF      : ${infoDocx.pages} páginas · ${infoDocx.size}`);

  const textPdf = pdfText(pdfPath);
  const textDocx = pdfText(docxPdfPath);
  console.log('\n   Claves compartidas (deben estar en AMBOS):');
  let missing = 0;
  for (const key of SHARED_KEYS) {
    const inPdf = textPdf.includes(key);
    const inDocx = textDocx.includes(key);
    const ok = inPdf && inDocx;
    if (!ok) missing += 1;
    console.log(`   ${ok ? '✓' : '✗'} ${key}${inPdf ? '' : ' [FALTA EN PDF]'}${inDocx ? '' : ' [FALTA EN DOCX]'}`);
  }

  // Importes críticos (los mismos datos → las mismas cifras).
  console.log('\n   Importes críticos (misma fuente de datos):');
  const AMOUNTS = ['169.000,00', '140.000,00', '1.400,00', '150.00', '100.00', '50.00', '7.00', '5.000,00'];
  for (const amt of AMOUNTS) {
    const inPdf = textPdf.includes(amt);
    const inDocx = textDocx.includes(amt);
    const ok = inPdf && inDocx;
    if (!ok) missing += 1;
    console.log(`   ${ok ? '✓' : '✗'} ${amt}${inPdf ? '' : ' [FALTA EN PDF]'}${inDocx ? '' : ' [FALTA EN DOCX]'}`);
  }

  // ── 5. Render de la primera página de cada uno (inspección visual) ──
  console.log('\n5. Render PNG (primera página de cada documento)…');
  sh(`pdftoppm -png -r 90 -f 1 -l 1 "${pdfPath}" "${path.join(OUT_DIR, 'pdf_original')}"`);
  sh(`pdftoppm -png -r 90 -f 1 -l 1 "${docxPdfPath}" "${path.join(OUT_DIR, 'docx_via_libreoffice')}"`);
  const pngs = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  for (const p of pngs) console.log(`   → ${path.join(OUT_DIR, p)}`);

  // ── 6. Veredicto ──
  console.log(`\n═══ RESULTADO: ${missing === 0 ? 'COHERENCIA TOTAL' : `${missing} DIFERENCIAS DETECTADAS`} ═══`);
  console.log('   (las diferencias de PAGINACIÓN entre jsPDF y Word son esperables;');
  console.log('    lo crítico es el CONTENIDO: registros, importes, secciones, firmas.)');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
