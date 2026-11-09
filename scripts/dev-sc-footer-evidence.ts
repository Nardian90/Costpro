/**
 * PIE DE FIRMA UNIFICADO — Generador de evidencias visuales de los modelos SC
 * (referencia de diseño del propietario 2026-11-09).
 * ============================================================================
 * Produce PDFs REALES con el generador de producción (sin mocks) para revisar
 * el nuevo pie de firma de TODA la familia:
 *
 *   SC-2-01 Solicitud de Compra            (nombre dinámico encima de la línea)
 *   SC-2-04 Informe de Recepción           (3 firmas + TRANSPORTADOR con datos
 *                                           dinámicos / vacío / multipágina)
 *   SC-2-08 Vale de Entrega o Devolución   (nombre dinámico)
 *   SC-2-09 Transferencia entre Almacenes  (2 nombres + «No. Consecutivo»)
 *   SC-2-12 Factura                        (leyendas genéricas)
 *   SC-2-13 Submayor de Inventario         (única firma a lo ancho)
 *   SC-2-16 Ajuste de Inventario           (nombre dinámico)
 *   SC-3-01 Comprobante de Ingreso         (2 firmas del talonario)
 *
 * Uso (desde la raíz del repo):
 *   bun scripts/dev-sc-footer-evidence.ts <prefijo> [destino]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { jsPDF } from 'jspdf';
import { renderSc204Pdf } from '../src/lib/legal/sc204';
import { renderSc201Pdf, buildSc201ModelData } from '../src/lib/legal/sc201';
import { renderSc208Pdf, buildSc208ModelData } from '../src/lib/legal/sc208';
import { renderSc209Pdf, buildSc209ModelData } from '../src/lib/legal/sc209';
import { renderSc212Pdf, buildSc212ModelData } from '../src/lib/legal/sc212';
import { renderSc213Pdf, buildSc213ModelData } from '../src/lib/legal/sc213';
import { renderSc216Pdf, buildSc216ModelData } from '../src/lib/legal/sc216';
import { generateLegalPdf } from '../src/components/views/terminal/views/legal/LegalPdfExporter';

const PREFIX = process.argv[2] || 'footer-unificado';
const DEST = process.argv[3] || '/home/z/my-project/download/evidencias_sc_footer';
mkdirSync(DEST, { recursive: true });

// Logo real de la app (512×512) como dataURL — misma fuente que usa el navegador.
const logoBytes = readFileSync(resolve(process.cwd(), 'public/logo.png'));
const LOGO_DATAURL = `data:image/png;base64,${logoBytes.toString('base64')}`;

async function save(name: string, bytes: ArrayBuffer) {
  const file = join(DEST, `${name}.pdf`);
  writeFileSync(file, Buffer.from(bytes));
  console.log(`✓ ${file} (${Math.round(bytes.byteLength / 1024)} KB)`);
}

async function main() {
  // ── SC-2-04 · Informe de Recepción — transportador CON datos dinámicos ──
  const sc204ConDatos = await renderSc204Pdf({
    logoUrl: LOGO_DATAURL,
    entidadNombre: 'Constructora del Este',
    entidadCodigo: '77214',
    almacenNombre: 'Almacén Principal de Obra',
    almacenCodigo: '77215',
    fechaEmision: '09/11/2026',
    proveedorNombre: 'Empresa de Materiales de la Construcción',
    proveedorCodigo: 'J-31015873-2',
    documentoNombre: 'Entrada',
    documentoNumero: 'ENT-000214-2026',
    fechaRecepcion: '07/11/2026',
    transportadorNombre: 'Juan Pérez Cruz',
    transportadorCarne: '91080512345',
    transportadorChapa: 'P 123 456',
    transportadorCasilla: '',
    transportadorGuiaAerea: 'GA-2026-771',
    lineas: Array.from({ length: 6 }, (_, i) => ({
      codigo: `MAT-${1000 + i}`,
      descripcion: `Cemento P-350 saco 50 kg — lote ${i + 1} (material de construcción para obra civil)`,
      unidadMedida: 'saco',
      cantidad: String(10 + i),
      precioUnitario: `${(38.5 + i * 0.25).toFixed(2)} CUP`,
      importe: `${((10 + i) * (38.5 + i * 0.25)).toFixed(2)} CUP`,
      saldoExistencia: String(120 + i * 7),
    })),
    importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '3 012.75 CUP' }],
    numeroConsecutivo: '000148',
    identificadorRecepcion: 'a1b2c3d4',
  });
  await save(`${PREFIX}_SC-2-04_transportador-con-datos`, sc204ConDatos.output('arraybuffer') as ArrayBuffer);

  // ── SC-2-04 · transportador VACÍO (todo a línea de cumplimentación) ──
  const sc204Vacio = await renderSc204Pdf({
    logoUrl: LOGO_DATAURL,
    entidadNombre: 'Comercializadora Holguín',
    entidadCodigo: '',
    almacenNombre: '',
    almacenCodigo: '',
    fechaEmision: '09/11/2026',
    proveedorNombre: 'Empresa de Materiales de la Construcción',
    proveedorCodigo: '',
    documentoNombre: 'Entrada',
    documentoNumero: 'ENT-000215-2026',
    fechaRecepcion: '08/11/2026',
    transportadorNombre: '',
    transportadorCarne: '',
    transportadorChapa: '',
    transportadorCasilla: '',
    transportadorGuiaAerea: '',
    lineas: Array.from({ length: 4 }, (_, i) => ({
      codigo: `MAT-${2000 + i}`,
      descripcion: `Varilla de acero corrugada 12 mm — paquete ${i + 1}`,
      unidadMedida: 'm',
      cantidad: String(25 + i * 5),
      precioUnitario: `${(12.75 + i).toFixed(2)} CUP`,
      importe: `${((25 + i * 5) * (12.75 + i)).toFixed(2)} CUP`,
      saldoExistencia: String(310 + i * 12),
    })),
    importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '2 213.75 CUP' }],
    numeroConsecutivo: '',
    identificadorRecepcion: 'b2c3d4e5',
  });
  await save(`${PREFIX}_SC-2-04_transportador-vacio`, sc204Vacio.output('arraybuffer') as ArrayBuffer);

  // ── SC-2-04 · multipágina: el pie completo viaja JUNTO a la última página ──
  const sc204Multi = await renderSc204Pdf({
    logoUrl: LOGO_DATAURL,
    entidadNombre: 'Constructora del Este',
    entidadCodigo: '77214',
    almacenNombre: 'Almacén Principal de Obra',
    almacenCodigo: '77215',
    fechaEmision: '09/11/2026',
    proveedorNombre: 'Empresa de Materiales de la Construcción',
    proveedorCodigo: 'J-31015873-2',
    documentoNombre: 'Entrada',
    documentoNumero: 'ENT-000216-2026',
    fechaRecepcion: '08/11/2026',
    transportadorNombre: 'Juan Pérez Cruz',
    transportadorCarne: '',
    transportadorChapa: '',
    transportadorCasilla: '',
    transportadorGuiaAerea: '',
    lineas: Array.from({ length: 42 }, (_, i) => ({
      codigo: `MAT-${String(1000 + i)}`,
      descripcion: `Cemento P-350 saco 50 kg — lote ${i + 1} (material de construcción para obra civil)`,
      unidadMedida: 'saco',
      cantidad: String(10 + i),
      precioUnitario: `${(38.5 + i * 0.25).toFixed(2)} CUP`,
      importe: `${((10 + i) * (38.5 + i * 0.25)).toFixed(2)} CUP`,
      saldoExistencia: String(120 + i * 7),
    })),
    importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '41 233.60 CUP' }],
    numeroConsecutivo: '',
    identificadorRecepcion: 'c3d4e5f6',
  });
  await save(`${PREFIX}_SC-2-04_multipagina`, sc204Multi.output('arraybuffer') as ArrayBuffer);

  // ── SC-2-01 · Solicitud de Compra (nombre del emisor encima de la línea) ──
  const sc201 = buildSc201ModelData({
    order: {
      id: 's1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      supplier_name: 'Suministros Técnicos Industriales S.A.',
      status: 'completed',
      total_amount: 3137.5,
      notes: 'Materiales para la obra del policlínico (fase II).',
      expected_date: '2026-11-15',
      created_by: 'u-demo',
      created_at: '2026-11-08T09:00:00Z',
    },
    items: [
      { sku: 'MAT-1001', product_name: 'Cemento P-350 (saco 50 kg)', unit_of_measure: 'saco', quantity_ordered: 40, unit_cost: 38.5 },
      { sku: 'MAT-1002', product_name: 'Varilla de acero corrugada 12 mm', unit_of_measure: 'm', quantity_ordered: 120, unit_cost: 12.75 },
      { sku: 'MAT-1003', product_name: 'Arena de río', unit_of_measure: 'm³', quantity_ordered: 8, unit_cost: 45.0 },
    ],
    entidadNombre: 'Constructora del Este',
    creadorNombre: 'José Díaz Fuentes',
    logoUrl: LOGO_DATAURL,
  } as never);
  await save(`${PREFIX}_SC-2-01_solicitud-compra`, (await renderSc201Pdf(sc201 as never)).output('arraybuffer') as ArrayBuffer);

  // ── SC-2-08 · Vale de Entrega o Devolución ──
  const sc208 = buildSc208ModelData({
    entidadNombre: 'Tienda QA',
    vale: {
      id: 'bbbbbbbb-2222-4222-8222-222222222222',
      slip_number: 'VS-000123-2026',
      status: 'completed',
      notes: 'Consumo cafetería',
      total_cost: 4210.9,
      created_at: '2026-10-22T10:15:00Z',
      voided_at: null,
      void_reason: null,
      creator: { full_name: 'Marta Rodríguez' },
      items: [
        {
          quantity: 5,
          unit_cost: 320.18,
          total_cost: 1600.9,
          products: { name: 'Azúcar 1 kg', sku: 'AZU-1K', unit_of_measure: 'unidades' },
        },
      ],
    },
  } as never);
  await save(`${PREFIX}_SC-2-08_vale-entrega`, (await renderSc208Pdf(sc208 as never)).output('arraybuffer') as ArrayBuffer);

  // ── SC-2-09 · Transferencia entre Almacenes (CONFIRMADA) ──
  const sc209 = buildSc209ModelData({
    transfer: {
      id: 'dddddddd-4444-4444-8444-444444444444',
      status: 'CONFIRMADA',
      notes: null,
      created_at: '2026-10-25T08:00:00Z',
      confirmed_at: '2026-10-26T14:20:00Z',
      origin_store: { name: 'Tienda Origen' },
      destination_store: { name: 'Tienda Destino' },
      creator: { full_name: 'Marta Rodríguez' },
      items: [
        { quantity: 30, unit_cost: 45.75, products: { name: 'Cerveza Bucanero 350 ml', sku: 'BUC-350', unit_of_measure: 'unidades' } },
        { quantity: 8.5, unit_cost: 120.4, products: { name: 'Detergente 1 L', sku: 'DET-1L', unit_of_measure: 'unidades' } },
      ],
    },
  } as never);
  await save(`${PREFIX}_SC-2-09_transferencia`, (await renderSc209Pdf(sc209 as never)).output('arraybuffer') as ArrayBuffer);

  // ── SC-2-12 · Factura (leyendas genéricas + datos de tienda) ──
  const sc212 = buildSc212ModelData({
    transaction: {
      id: 'eeeeeeee-5555-4555-8555-555555555555',
      status: 'completed',
      total_amount: 5487.3,
      subtotal: 5680,
      discount_value: 192.7,
      sale_currency: 'CUP',
      customer_name: 'Combinado Deportivo',
      invoice_number: 'FV-2026-003412',
      completed_at: '2026-10-27T11:45:00Z',
      created_at: '2026-10-27T11:45:00Z',
      seller_id: 'seller-1',
      store_id: 'store-enervida',
    },
    items: [
      {
        quantity: 12,
        price_at_sale: 210,
        price_currency: 'CUP',
        products: { name: 'Aceite 1 L', sku: 'ACE-1L', unit_of_measure: 'unidades' },
      },
    ],
    entidadNombre: 'ENERVIDA-VITALLCONS',
    vendedorNombre: 'David',
    storeConfig: {
      address: 'Calle Menocal SN, Esquina a Francisco',
      phone: '56561619',
      email: 'vitallcons@gmail.com',
      reeup: '50004179942',
      nit: '50004179942',
      bank_account: '0664 4340 0002 6710',
      bank_branch: 'BPA Las Tunas — Sucursal Centro',
      logo_url: LOGO_DATAURL,
    },
  } as never);
  await save(`${PREFIX}_SC-2-12_factura`, (await renderSc212Pdf(sc212 as never)).output('arraybuffer') as ArrayBuffer);

  // ── SC-2-13 · Submayor de Inventario (única firma a lo ancho) ──
  const sc213 = buildSc213ModelData({
    producto: {
      id: 'prod-1',
      name: 'Cerveza Bucanero 350 ml',
      sku: 'BUC-350',
      unit_of_measure: 'unidades',
      cost_average: 45.75,
    },
    entidadNombre: 'Tienda QA',
    movimientos: [
      { id: 'm1', created_at: '2026-09-01T12:00:00Z', movement_type: 'purchase', quantity_change: 30, balance_after: 30, reference_doc: 'OC-1' },
      { id: 'm2', created_at: '2026-09-02T12:00:00Z', movement_type: 'sale', quantity_change: -8.5, balance_after: 21.5, reference_doc: 'VTA-1' },
      { id: 'm3', created_at: '2026-09-03T12:00:00Z', movement_type: 'issue_slip_out', quantity_change: -5, balance_after: 16.5, reference_doc: 'VS-1' },
    ],
  } as never);
  await save(`${PREFIX}_SC-2-13_submayor`, (await renderSc213Pdf(sc213 as never)).output('arraybuffer') as ArrayBuffer);

  // ── SC-2-16 · Ajuste de Inventario (nombre del conteo encima de la línea) ──
  const sc216 = buildSc216ModelData({
    adjustment: {
      id: 'ffffffff-6666-4666-8666-666666666666',
      status: 'confirmed',
      reason: 'STOCKTAKE_SHRINKAGE',
      notes: 'Faltantes del conteo de octubre',
      created_at: '2026-10-23T17:00:00Z',
      reversed_at: null,
      reversal_reason: null,
      source_physical_inventory: { pi_number: 'IF-2026-021', cutoff_date: '2026-10-23T00:00:00Z' },
      items: [
        {
          expected_quantity: 48,
          counted_quantity: 45,
          products: { name: 'Jabón 110 g', sku: 'JAB-110', unit_of_measure: 'unidades' },
        },
      ],
      creator: { full_name: 'Marta Rodríguez' },
    },
    entidadNombre: 'Tienda QA',
  } as never);
  await save(`${PREFIX}_SC-2-16_ajuste`, (await renderSc216Pdf(sc216 as never)).output('arraybuffer') as ArrayBuffer);

  // ── SC-3-01 · Comprobante de Ingreso (talonario de 2 firmas) ──
  const proto = jsPDF.API as unknown as Record<string, unknown>;
  const originalSave = proto.save;
  let capturado: ArrayBuffer | null = null;
  proto.save = function (this: jsPDF) {
    capturado = this.output('arraybuffer') as ArrayBuffer;
    return this;
  };
  try {
    await generateLegalPdf(
      { code: 'SC-3-01', name: 'COMPROBANTE DE INGRESO' },
      {
        paper_size: 'LETTER',
        entidad_nombre: 'ENERVIDA-VITALLCONS',
        entidad_codigo: '50004179942',
        logo_url: LOGO_DATAURL,
        fecha_emision: '09/11/2026',
        numero_consecutivo: 'CI-000458',
        persona_entrega: 'Osmany Ramírez',
        conceptos_tabla: [
          { concepto: 'Cobro factura FV-2026-003412', importe: 5487.3 },
          { concepto: 'Cobro factura FV-2026-003415', importe: 1200 },
        ],
        total: 6687.3,
        cantidad_letras: 'Seis mil seiscientos ochenta y siete pesos con 30 centavos',
      },
      { skipCopy: true },
    );
    if (capturado) await save(`${PREFIX}_SC-3-01_comprobante-ingreso`, capturado);
  } finally {
    proto.save = originalSave;
  }

  console.log('\nEvidencias del pie unificado generadas.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
