/**
 * MISIÓN CP-WH-EXIT-VOUCHER-PDF-VALUATION-001 — Evidencia de exportación
 * ========================================================================
 * Genera el SC-2-08 «Vale de Entrega o Devolución» de UN MISMO vale en las
 * DOS modalidades (valorizado / sin valorar — solo físico) usando el código
 * real de la aplicación (src/lib/legal/sc208.ts) y un fixture documental
 * representativo: 3 líneas (cantidad decimal, unidad distinta, Nota y OT).
 *
 * Es SOLO LECTURA: no toca Supabase (el cliente se inicializa sin credenciales
 * y fetchSc208SourceData no se usa — los datos vienen del fixture, como llegan
 * del modal cuando el vale ya trae sus ítems).
 *
 * Uso: bun scripts/gen-cp-wh-exit-voucher-example-pdfs.mjs <dir_salida>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.NODE_ENV = 'test'; // supabaseClient: sin warn de credenciales

const OUT_DIR = resolve(process.argv[2] || 'audit-evidence/CP-WH-EXIT-VOUCHER-PDF-VALUATION-001');
mkdirSync(OUT_DIR, { recursive: true });

const { buildSc208ModelData, renderSc208Pdf } = await import('../src/lib/legal/sc208.ts');

// Fixture documental — MISMO vale para ambas modalidades (identidad única).
const vale = {
  id: '7f2b9c1a-4d55-4e88-9a12-8c3d21e64f90',
  slip_number: 'VS-000458-2026',
  status: 'completed',
  notes: 'Consumo interno Taller de mantenimiento — Orden OT-2026-118',
  total_cost: 2147.15,
  created_at: '2026-11-18T14:30:00Z',
  voided_at: null,
  void_reason: null,
  creator: { full_name: 'Marta Rodríguez' },
  production_orders: { order_number: 'OT-2026-118', order_type: 'PRODUCCION' },
  items: [
    {
      quantity: 12.5,
      unit_cost: 85.4064,
      total_cost: 1067.58,
      products: { name: 'Pintura blanca vinílica 1 L', sku: 'PIN-VIN-1L', unit_of_measure: 'litros' },
    },
    {
      quantity: 6,
      unit_cost: 96.595,
      total_cost: 579.57,
      products: { name: 'Lija al agua grano 120', sku: 'LIJ-120', unit_of_measure: 'unidades' },
    },
    {
      quantity: 3,
      unit_cost: 166.6667,
      total_cost: 500,
      products: { name: 'Sello silicona transparente 280 ml', sku: 'SEL-SIL-280', unit_of_measure: 'tubos' },
    },
  ],
};

const entidad = {
  entidadNombre: 'ENERVIDA — VitalCons',
  entidadCodigo: '001',
};

const modeloValorizado = buildSc208ModelData({ ...entidad, vale }, { incluirValores: true });
const modeloFisico = buildSc208ModelData({ ...entidad, vale }, { incluirValores: false });

const docValorizado = await renderSc208Pdf(modeloValorizado);
const docFisico = await renderSc208Pdf(modeloFisico);

const pValorizado = resolve(OUT_DIR, 'SC-2-08_Vale_de_Salida_VS-000458-2026_valorizado.pdf');
const pFisico = resolve(OUT_DIR, 'SC-2-08_Vale_de_Salida_VS-000458-2026_sin_valorar_fisico.pdf');
writeFileSync(pValorizado, Buffer.from(docValorizado.output('arraybuffer')));
writeFileSync(pFisico, Buffer.from(docFisico.output('arraybuffer')));

// Verificación a nivel de bytes (la misma técnica de las pruebas unitarias)
const decode = (buf) => new TextDecoder('latin1').decode(buf);
const tV = decode(docValorizado.output('arraybuffer'));
const tF = decode(docFisico.output('arraybuffer'));
const check = (label, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);

console.log(`\nGenerados:\n  ${pValorizado}\n  ${pFisico}\n`);
check('valorizado: contiene Importe Total', tV.includes('Importe Total del Vale'));
check('valorizado: contiene importe de línea 1,067.58', tV.includes('1,067.58'));
check('valorizado: contiene CUP (moneda)', tV.includes('CUP'));
check('valorizado: contiene SKU PIN-VIN-1L', tV.includes('PIN-VIN-1L'));
check('físico: NO contiene Importe Total', !tF.includes('Importe Total'));
check('físico: NO contiene Importe (columna ni total)', !tF.includes('Importe'));
check('físico: NO contiene importe 1,067.58', !tF.includes('1,067.58'));
check('físico: NO contiene importe 320.18/85.40 (costo unitario)', !tF.includes('85.40'));
check('físico: NO contiene moneda CUP', !tF.includes('CUP'));
check('físico: conserva Nota (concepto)', tF.includes('Consumo interno Taller'));
check('físico: conserva OT (OT-2026-118)', tF.includes('OT-2026-118'));
check('físico: conserva SKU y descripción', tF.includes('PIN-VIN-1L') && tF.includes('Pintura blanca vinílica'));
check('físico: conserva cantidad decimal 12.5', tF.includes('12.5'));
check('físico: conserva unidad (litros/tubos)', tF.includes('litros') && tF.includes('tubos'));
check('físico: conservan firmas (CONTABILIZA)', tF.includes('CONTABILIZA'));
check('físico: nota de modalidad sin valoración', tF.includes('Documento emitido sin valoración económica'));
check('identidad: mismo consecutivo en ambos', tV.includes('VS-000458-2026') && tF.includes('VS-000458-2026'));
