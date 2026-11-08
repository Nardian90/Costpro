/**
 * CP-SALES-PRICE-LIST-001 · Evidencias PDF reales (misión §11-§12D).
 *
 * Genera PDFs de PRUEBA con el MISMO generador de producción
 * (buildPriceListModel + renderPriceListPdf) sobre fixtures que cubren los
 * casos exigidos:
 *   1. sin-rango.pdf     — numéricos por valor + alfanuméricos al final,
 *                          monedas CUP/USD mezcladas SIN conversión,
 *                          descripción extensa con ajuste de línea.
 *   2. rango-1-50.pdf    — el mismo dataset con rango 1–50 (solo numéricos).
 *   3. una-columna.pdf   — un único producto (menos de una columna).
 *   4. multipagina.pdf   — 100 productos → 2 páginas con doble columna llena.
 *
 * Los fixtures NO tocan datos reales (tienda ficticia; el script no conecta
 * a ninguna base de datos).
 */

import { mkdirSync, writeFileSync } from 'fs';
import { buildPriceListModel, type PriceListSourceItem } from '../src/lib/price-list/model';
import { renderPriceListPdf, priceListFileName } from '../src/lib/price-list/pdf';

/** Rango ya validado para los fixtures. */
function okRange(desde: string, hasta: string): { from: bigint | null; to: bigint | null } {
  if (desde === '' && hasta === '') return { from: null, to: null };
  const from = desde === '' ? null : BigInt(desde);
  const to = hasta === '' ? null : BigInt(hasta);
  if (from !== null && to !== null && from > to) throw new Error('rango invertido');
  return { from, to };
}

const OUT_DIR = '/home/z/my-project/download/evidencias_price_list';

const store = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Constructora del Este',
  logoUrl: null,
  reeup: 'REEUP 1234-5678',
  nit: null,
};

const fixedDate = new Date(2026, 10, 9, 10, 30);

/** Dataset de la misión: 1..25 numéricos + alfanuméricos (Cod1, A15, SKU-20, REP01). */
function dataset(): PriceListSourceItem[] {
  const names: Record<string, string> = {
    '1': 'Cemento P-350 saco 50 kg',
    '2': 'Varilla corrugada acero 12 mm × 6 m — descripción comercial extensa para verificar el ajuste de línea de la columna Descripción del producto',
    '3': 'Arena de río lavada (m³)',
    '4': 'Bloque de hormigón 20×20×40',
    '5': 'Pintura vinil blanca 4 L',
    '7': 'Clavo de 2½ pulgadas (libra)',
    '10': 'Tubería PVC 4 pulgadas × 6 m',
    '11': 'Codo PVC 4 pulgadas 90°',
    '20': 'Cal hidratada 50 kg',
    '50': 'Teja francesa de barro',
    '100': 'Ventana de aluminio 1.20×1.00 m',
  };
  const items: PriceListSourceItem[] = [];
  for (let i = 1; i <= 25; i += 1) {
    const sku = String(i);
    items.push({
      id: `p${i}`,
      sku,
      name: names[sku] ?? `Producto de demostración ${i}`,
      description: null,
      price: i % 3 === 0 ? 22.5 * i : 15300 + i * 137,
      price_currency: i % 3 === 0 ? 'USD' : 'CUP',
      stock_current: 3 + i,
      is_active: true,
      is_service: false,
    });
  }
  items.push(
    { id: 'a1', sku: 'Cod1', name: 'Codificador industrial serie C', description: null, price: 410, price_currency: 'CUP', stock_current: 2, is_active: true, is_service: false },
    { id: 'a2', sku: 'A15', name: 'Repuesto hidráulico A15', description: null, price: 35.9, price_currency: 'USD', stock_current: 8, is_active: true, is_service: false },
    { id: 'a3', sku: 'SKU-20', name: 'Kit de sellos SKU-20', description: null, price: 129.99, price_currency: 'USD', stock_current: 5, is_active: true, is_service: false },
    { id: 'a4', sku: 'REP01', name: 'Repuesto mayor REP01', description: null, price: 8750, price_currency: 'CUP', stock_current: 1, is_active: true, is_service: false },
  );
  return items;
}

/** 100 productos de descripción corta para paginar 2 páginas llenas. */
function dataset100(): PriceListSourceItem[] {
  return Array.from({ length: 100 }, (_, i) => ({
    id: `m${i}`,
    sku: String(i + 1),
    name: `Artículo de catálogo ${i + 1}`,
    description: null,
    price: 100 + i * 25,
    price_currency: i % 5 === 0 ? 'USD' : 'CUP',
    stock_current: 1 + (i % 9),
    is_active: true,
    is_service: false,
  }));
}

async function render(name: string, items: PriceListSourceItem[], range: { from: bigint | null; to: bigint | null } | null): Promise<void> {
  const model = buildPriceListModel({ items, store, range, generatedAt: fixedDate });
  const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${name}`;
  writeFileSync(path, Buffer.from(doc.output('arraybuffer') as ArrayBuffer));
  console.log(`✓ ${name} → ${priceListFileName(store.name, model.dateLabel)} | páginas: ${doc.getNumberOfPages()} | filas: ${model.meta.totalProducts}`);
}

async function main() {
  // 1. Sin rango: numéricos + alfanuméricos al final.
  await render('sin-rango.pdf', dataset(), null);
  // 2. Rango 1–50: solo numéricos del rango (alfanuméricos excluidos por regla).
  await render('rango-1-50.pdf', dataset(), okRange('1', '50'));
  // 3. Un único producto.
  await render('una-columna.pdf', [dataset()[0]], null);
  // 4. Más de una página: doble columna completa.
  await render('multipagina.pdf', dataset100(), null);
  // 5. Rango sin coincidencias → NO genera PDF (regla de la misión).
  const empty = buildPriceListModel({ items: dataset(), store, range: okRange('900', '999'), generatedAt: fixedDate });
  console.log(`✓ rango 900–999 → ${empty.meta.totalProducts} productos; renderPriceListPdf rechazaría un PDF vacío (probar unitaria).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
