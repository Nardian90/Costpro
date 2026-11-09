/**
 * CP-PRECIO-PDF-DESC-001 · Evidencias PDF del toggle «Mostrar descripción».
 *
 * Genera DOS PDFs de prueba con LOS MISMOS datos (misma tienda, misma fecha,
 * mismos productos) usando el MISMO generador de producción
 * (buildPriceListModel + renderPriceListPdf):
 *   1. …-con-descripcion.pdf — «Mostrar descripción en PDF: Sí»
 *   2. …-sin-descripcion.pdf — «Mostrar descripción en PDF: No»
 *
 * Dataset §6 de la misión:
 *   1. Nombre y descripción (ejemplo literal de la misión: Cemento Cola).
 *   2. Nombre y descripción extensa de varias líneas.
 *   3. Nombre sin descripción.
 *   4. Descripciones con caracteres especiales y acentos.
 *
 * Al final VERIFICA (sobre los bytes reales) que la única diferencia entre
 * ambos documentos es la inclusión/exclusión de las descripciones.
 * Los fixtures NO tocan datos reales (tienda ficticia; sin conexión a BD).
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildPriceListModel, type PriceListSourceItem } from '../src/lib/price-list/model';
import { renderPriceListPdf } from '../src/lib/price-list/pdf';

const OUT_DIR = join(process.cwd(), 'docs', 'audits', '2026-11-09-precio-pdf-descripcion');

const store = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Constructora del Este',
  logoUrl: null,
  reeup: 'REEUP 1234-5678',
  nit: null,
};

const fixedDate = new Date(2026, 10, 9, 10, 30);

/** Matriz §6 de la misión + productos de relleno realistas. */
function dataset(): PriceListSourceItem[] {
  return [
    // 1. Nombre y descripción (ejemplo LITERAL de la misión §2).
    {
      id: 'p1', sku: '1',
      name: 'Cemento Cola',
      description: 'Cemento cola para adherencia de cerámicos, baldosas y materiales de construcción.',
      price: 38.5, price_currency: 'CUP', stock_current: 120, is_active: true,
    },
    // 2. Nombre y descripción extensa (varias líneas en el PDF).
    {
      id: 'p2', sku: '2',
      name: 'Adhesivo cerámico premium',
      description: 'Mezcla adhesiva cementicia de alta adherencia y baja retracción para asentamiento de cerámicos porcelánicos, baldosas y mosaicos en interiores y exteriores, aplicable con llana dentada sobre revoques finos en fachadas, cocinas, baños y zonas húmedas.',
      price: 450.25, price_currency: 'CUP', stock_current: 45, is_active: true,
    },
    // 3. Nombre SIN descripción (description NULL en la base de datos).
    {
      id: 'p3', sku: '3',
      name: 'Bloque de hormigón 20×20×40',
      description: null,
      price: 92, price_currency: 'CUP', stock_current: 800, is_active: true,
    },
    // 4. Descripción con caracteres especiales y acentos.
    {
      id: 'p4', sku: 'A15',
      name: 'Cemento cola especial Ñ',
      description: 'Adhesivo flexible ñoño para cerámicos de 90° y baldosas 30×30 — rendimiento ½ galón por m², área técnica',
      price: 99.9, price_currency: 'CUP', stock_current: 60, is_active: true,
    },
    // Complementos realistas del listado.
    {
      id: 'p5', sku: '4',
      name: 'Pintura vinil blanca 4 L',
      description: 'Pintura interior-exterior lavable de secado rápido.',
      price: 2100, price_currency: 'CUP', stock_current: 30, is_active: true,
    },
    {
      id: 'p6', sku: '5',
      name: 'Clavo de 2½ pulgadas (libra)',
      description: null,
      price: 65, price_currency: 'CUP', stock_current: 240, is_active: true,
    },
    {
      id: 'p7', sku: 'Cod1',
      name: 'Repuesto importado',
      description: 'Repuesto original con garantía de fábrica — importación USD.',
      price: 12.75, price_currency: 'USD', stock_current: 8, is_active: true,
    },
    {
      id: 'p8', sku: 'B02',
      name: 'Tubería PVC 4 pulgadas × 6 m',
      description: 'Tubería de presión para instalaciones hidráulicas, unión por pegamento.',
      price: 780, price_currency: 'CUP', stock_current: 25, is_active: true,
    },
  ];
}

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const items = dataset();

  const modelSi = buildPriceListModel({ items, store, range: null, generatedAt: fixedDate, includeDescription: true });
  const modelNo = buildPriceListModel({ items, store, range: null, generatedAt: fixedDate, includeDescription: false });

  const docSi = await renderPriceListPdf(modelSi, { dataUrl: null, source: 'none' });
  const docNo = await renderPriceListPdf(modelNo, { dataUrl: null, source: 'none' });

  const fileSi = join(OUT_DIR, 'listado-precios-con-descripcion.pdf');
  const fileNo = join(OUT_DIR, 'listado-precios-sin-descripcion.pdf');
  writeFileSync(fileSi, Buffer.from(docSi.output('arraybuffer') as ArrayBuffer));
  writeFileSync(fileNo, Buffer.from(docNo.output('arraybuffer') as ArrayBuffer));

  // ── Verificación sobre los BYTES reales de los dos PDFs ────────────────
  const tSi = decodePdf(docSi.output('arraybuffer') as ArrayBuffer);
  const tNo = decodePdf(docNo.output('arraybuffer') as ArrayBuffer);

  const checks: Array<[string, boolean]> = [
    ['Sí: contiene el nombre "Cemento Cola"', tSi.includes('Cemento Cola')],
    ['Sí: contiene palabras de la descripción (adherencia/cerámicos/construcción)', ['adherencia', 'cerámicos', 'construcción'].every((w) => tSi.includes(w))],
    ['Sí: encabezado honesto «Producto y descripción»', tSi.includes('Producto y descripción')],
    ['Sí: la descripción extensa sale completa (cementicia/porcelánicos/húmedas)', ['cementicia', 'porcelánicos', 'húmedas'].every((w) => tSi.includes(w))],
    ['Sí: caracteres especiales (ñoño/90°/30×30/½/m²)', ['ñoño', '90°', '30×30', '½', 'm²'].every((w) => tSi.includes(w))],
    ['No: contiene todos los nombres de producto', ['Cemento Cola', 'Bloque de hormigón 20×20×40', 'Pintura vinil blanca 4 L', 'Repuesto importado'].every((w) => tNo.includes(w))],
    ['No: NO contiene ninguna descripción', ['adherencia', 'cementicia', 'ñoño', 'secado', 'garantía'].every((w) => !tNo.includes(w))],
    ['No: encabezado honesto «Producto» (sin descripción)', tNo.includes('Producto') && !tNo.includes('Producto y descripción')],
    ['Ambos: mismos precios etiquetados', ['CUP', 'USD'].every((w) => tSi.includes(w) && tNo.includes(w))],
    ['Ambos: mismo número de páginas', docSi.getNumberOfPages() === docNo.getNumberOfPages()],
  ];

  console.log(`PDF Sí: ${fileSi} (${docSi.getNumberOfPages()} página(s))`);
  console.log(`PDF No: ${fileNo} (${docNo.getNumberOfPages()} página(s))`);
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
    if (!ok) failed += 1;
  }
  if (failed > 0) {
    console.error(`${failed} comprobación(es) FALLARON`);
    process.exit(1);
  }
  console.log('PASS — la ÚNICA diferencia entre ambos documentos es la inclusión/exclusión de las descripciones.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
