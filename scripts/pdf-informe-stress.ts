/**
 * CP-PDF-EXECUTIVE-REPORT-001 · Generador de PRUEBAS DE ESTRÉS DOCUMENTAL
 * para el PDF del Informe Ejecutivo de «Comparar Productos».
 * ===========================================================================
 * RE-EJECUTABLE (protocolo de resiliencia 11d/11e): construye 6 escenarios
 * sintéticos (A-F) con la MISMA cadena de producción real de la aplicación
 *   PeriodProductRow[] → buildComparison → buildInformeEjecutivo →
 *   buildInformeEjecutivoPdf → PDF
 * y escribe los PDF en el directorio que se indique. NO toca datos reales ni
 * la BD: fixtures en memoria. NO modifica el contenido del análisis (§9): el
 * generador consume el modelo tal cual.
 *
 * USO:
 *   bun run scripts/pdf-informe-stress.ts --out /ruta/salida [--tag prefijo]
 *
 * Escenarios:
 *   A · Comparación pequeña (4 productos).
 *   B · Comparación mediana, múltiples tablas y conclusiones (14 productos).
 *   C · Comparación extensa (40 productos, descripciones medias).
 *   D · Conclusiones/matrícula extensa: muchas prioridades ALTA/MEDIA y
 *       complementarias llenas (28 productos).
 *   E · Anexos extensos: 110 productos (Anexo I multipágina, II y III largos).
 *   F · Nombres excepcionalmente largos y magnitudes heterogéneas (30).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildComparison, type PeriodProductRow, type ProductCatalogRow } from '@/lib/product-comparison/compare';
import { buildInformeEjecutivo, type InformeInput } from '@/lib/product-comparison/informe';
import {
  buildInformeEjecutivoPdf,
  informeEjecutivoFileName,
} from '@/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf';

// ── helpers de fixtures (mismo patrón que src/__tests__/lib/…informe.test.ts) ─

const row = (o: Partial<PeriodProductRow> & { product_id: string; name: string }): PeriodProductRow => ({
  sku: o.sku ?? o.product_id.toUpperCase().slice(0, 6),
  units_sold: 0,
  units_returned: 0,
  net_cup: 0,
  ...o,
});

const cat = (
  o: Partial<ProductCatalogRow> & { id: string; name: string },
): ProductCatalogRow => ({
  sku: o.sku ?? o.id.toUpperCase().slice(0, 6),
  stock_current: 0,
  unit_of_measure: 'unidades',
  ...o,
});

const META = {
  entidadNombre: 'ENERVIDA-VITALLCONS',
  periodoActual: { desde: '2026-11-01', hasta: '2026-11-24' },
  periodoComparacion: { desde: '2026-10-01', hasta: '2026-10-24' },
  ambito: 'ENERVIDA-VITALLCONS',
} as const;

const GENERADO = '2026-11-24T10:21:00.000Z';

function mkInput(
  topActual: PeriodProductRow[],
  topAnterior: PeriodProductRow[],
  catalogo: ProductCatalogRow[],
  ventas?: Set<string>,
): InformeInput {
  const { rows, resumen } = buildComparison(topActual, topAnterior, catalogo, ventas ?? null);
  return { rows, resumen, meta: { ...META }, generadoEl: GENERADO, ventasEnPeriodoActual: ventas ?? null };
}

// ── Generadores de productos sintéticos ──────────────────────────────────────

const UMS = ['unidades', 'm', 'Kg', 'L', 'cajas', null];

/** Nombres realistas de ferretería/construcción para descripciones medias. */
const BASE_NAMES = [
  'Cemento P-350 50 Kg', 'Bloque de hormigón 20', 'Varilla corrugada 12mm', 'Arena lavada (saco)',
  'Pintura Vinil 4L blanco', 'Clavos 2 pulgadas (libra)', 'Tubo PVC 110 x 6m', 'Cable bipolar 2x1.5 (m)',
  'Interruptor sencillo', 'Lámpara LED 9W fría', 'Ventilador de pie 16"', 'Colchón espuma alta densidad',
  'Cocina de inducción 2 hornillas', 'Olla de presión 6L', 'Juego de sábanas matrimonial', 'Bomba de agua 1/2 HP',
  'Regulador de voltaje 500VA', 'Batería de litio 100Ah', 'Panel solar 450W', 'Controlador de carga 30A',
];

function makeProducts(n: number, opts: { longNames?: boolean; wideMagnitudes?: boolean; seed?: number } = {}): {
  topActual: PeriodProductRow[]; topAnterior: PeriodProductRow[]; catalogo: ProductCatalogRow[];
} {
  const seed = opts.seed ?? 7;
  let s = seed;
  const rnd = (): number => {
    // LCG determinista: re-ejecuciones idénticas (idempotencia).
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const nombre = (i: number): string => {
    const base = BASE_NAMES[i % BASE_NAMES.length];
    if (!opts.longNames) return `${base} ${String(Math.floor(rnd() * 90) + 10)}`;
    const sufijos = [
      'importado con certificado de calidad del fabricante y garantía extendida de doce meses',
      'de uso industrial pesado para redes de distribución eléctrica exterior según normativa NC',
      'presentación económica especial para el fondo de escala con empaque reforzado',
      'modelo nuevo del catálogo nacional con accesorios, manual en español y bolsa de transporte',
    ];
    return `${base} ${sufijos[i % sufijos.length]} ref. ${1000 + i}${i % 3 === 0 ? ' SERIE ESPECIAL EXTENDIDA' : ''}`;
  };

  const topActual: PeriodProductRow[] = [];
  const topAnterior: PeriodProductRow[] = [];
  const catalogo: ProductCatalogRow[] = [];

  for (let i = 0; i < n; i++) {
    const id = `prod${String(i + 1).padStart(3, '0')}`;
    const um = UMS[i % UMS.length];
    // Magnitudes: mezcla de pequeños, medios y grandes.
    const mult = opts.wideMagnitudes ? [3, 45, 400, 5200, 38000][i % 5] : [1, 4, 22, 90][i % 4];
    const unidadesAct = Math.max(1, Math.round(rnd() * 40 * (opts.wideMagnitudes ? 1 : 1)) * (i % 7 === 3 ? 0 : 1) || (i % 9 === 5 ? 0 : Math.round(rnd() * 30)));
    const ventasAct = Math.round((1200 + rnd() * 900_000) * mult / 100) * 100;
    const unidadesAnt = Math.max(1, Math.round(rnd() * 35) + (i % 11 === 4 ? 0 : 2));
    const ventasAnt = Math.round((900 + rnd() * 950_000) * mult / 100) * 100;

    const stock = i % 8 === 2 ? 0 : i % 5 === 0 ? Math.round(rnd() * 500) : Math.round(rnd() * 40);
    catalogo.push(cat({ id, name: nombre(i), sku: `SKU-${1000 + i}`, stock_current: stock, unit_of_measure: um }));

    const enTopActual = i % 13 !== 6; // algunos solo en el top anterior
    const enTopAnterior = i % 9 !== 7; // algunos solo en el top actual (nuevos)
    if (enTopActual) {
      topActual.push(row({ product_id: id, name: nombre(i), sku: `SKU-${1000 + i}`, units_sold: unidadesAct, net_cup: ventasAct, units_returned: i % 6 === 1 ? 1 : 0 }));
    }
    if (enTopAnterior) {
      topAnterior.push(row({ product_id: id, name: nombre(i), sku: `SKU-${1000 + i}`, units_sold: unidadesAnt, net_cup: i % 17 === 9 ? 0 : ventasAnt }));
    }
  }
  return { topActual, topAnterior, catalogo };
}

// ── Escenarios ───────────────────────────────────────────────────────────────

function escenarioA(): InformeInput {
  const topActual = [
    row({ product_id: 'inversor', name: 'Inversor', sku: 'INV-1', units_sold: 1, net_cup: 382000 }),
    row({ product_id: 'royal', name: 'Royal Cole', sku: 'ROY-1', units_sold: 59, net_cup: 147500 }),
    row({ product_id: 'cable', name: 'Cable Solar Negro 4mm', sku: 'CSL-4', units_sold: 22, net_cup: 91125 }),
    row({ product_id: 'blanco', name: 'Cemento Blanco 2 Kg', sku: 'CB-2', units_sold: 4, net_cup: 8000 }),
  ];
  const topAnterior = [
    row({ product_id: 'tbv', name: 'Cemento TBV 50 Kg', sku: 'TBV-50', units_sold: 78, net_cup: 1532640 }),
    row({ product_id: 'blanco', name: 'Cemento Blanco 2 Kg', sku: 'CB-2', units_sold: 22, net_cup: 50000 }),
    row({ product_id: 'royal', name: 'Royal Cole', sku: 'ROY-1', units_sold: 19, net_cup: 48750 }),
    row({ product_id: 'cable', name: 'Cable Solar Negro 4mm', sku: 'CSL-4', units_sold: 24, net_cup: 74722.5 }),
  ];
  const catalogo = [
    cat({ id: 'inversor', name: 'Inversor', sku: 'INV-1', stock_current: 0, unit_of_measure: 'unidades' }),
    cat({ id: 'royal', name: 'Royal Cole', sku: 'ROY-1', stock_current: 8, unit_of_measure: 'unidades' }),
    cat({ id: 'cable', name: 'Cable Solar Negro 4mm', sku: 'CSL-4', stock_current: 45, unit_of_measure: 'm' }),
    cat({ id: 'blanco', name: 'Cemento Blanco 2 Kg', sku: 'CB-2', stock_current: 30, unit_of_measure: 'Kg' }),
    cat({ id: 'tbv', name: 'Cemento TBV 50 Kg', sku: 'TBV-50', stock_current: 0, unit_of_measure: 'bultos' }),
  ];
  const ventas = new Set(['inversor', 'royal', 'cable', 'blanco']);
  return mkInput(topActual, topAnterior, catalogo, ventas);
}

const B_ACTUAL = [
  row({ product_id: 'cemento', name: 'Cemento P-350 50 Kg', units_sold: 96, net_cup: 483_800 }),
  row({ product_id: 'bloque', name: 'Bloque de hormigón 20', units_sold: 240, net_cup: 214_000 }),
  row({ product_id: 'varilla', name: 'Varilla corrugada 12mm', units_sold: 88, net_cup: 198_700 }),
  row({ product_id: 'pintura', name: 'Pintura Vinil 4L blanco', units_sold: 34, net_cup: 96_400 }),
  row({ product_id: 'clavos', name: 'Clavos 2 pulgadas (libra)', units_sold: 150, net_cup: 31_200 }),
  row({ product_id: 'tubo', name: 'Tubo PVC 110 x 6m', units_sold: 18, net_cup: 88_000 }),
  row({ product_id: 'cable', name: 'Cable bipolar 2x1.5 (m)', units_sold: 420, net_cup: 64_900 }),
  row({ product_id: 'led', name: 'Lámpara LED 9W fría', units_sold: 75, net_cup: 27_300 }),
  row({ product_id: 'ventilador', name: 'Ventilador de pie 16"', units_sold: 9, net_cup: 41_000 }),
  row({ product_id: 'olla', name: 'Olla de presión 6L', units_sold: 6, net_cup: 33_500 }),
  row({ product_id: 'bomba', name: 'Bomba de agua 1/2 HP', units_sold: 4, net_cup: 59_800 }),
  row({ product_id: 'panel', name: 'Panel solar 450W', units_sold: 3, net_cup: 112_000 }),
  row({ product_id: 'colchon', name: 'Colchón espuma alta densidad', units_sold: 2, net_cup: 46_700 }),
  row({ product_id: 'cocina', name: 'Cocina de inducción 2 hornillas', units_sold: 3, net_cup: 74_200 }),
];
const B_ANTERIOR = [
  row({ product_id: 'cemento', name: 'Cemento P-350 50 Kg', units_sold: 210, net_cup: 1_050_000 }),
  row({ product_id: 'bloque', name: 'Bloque de hormigón 20', units_sold: 300, net_cup: 267_500 }),
  row({ product_id: 'varilla', name: 'Varilla corrugada 12mm', units_sold: 120, net_cup: 271_000 }),
  row({ product_id: 'pintura', name: 'Pintura Vinil 4L blanco', units_sold: 25, net_cup: 70_800 }),
  row({ product_id: 'clavos', name: 'Clavos 2 pulgadas (libra)', units_sold: 190, net_cup: 39_500 }),
  row({ product_id: 'tubo', name: 'Tubo PVC 110 x 6m', units_sold: 12, net_cup: 58_600 }),
  row({ product_id: 'cable', name: 'Cable bipolar 2x1.5 (m)', units_sold: 510, net_cup: 78_700 }),
  row({ product_id: 'led', name: 'Lámpara LED 9W fría', units_sold: 40, net_cup: 14_500 }),
  row({ product_id: 'ventilador', name: 'Ventilador de pie 16"', units_sold: 14, net_cup: 63_800 }),
  row({ product_id: 'regulador', name: 'Regulador de voltaje 500VA', units_sold: 11, net_cup: 38_300 }),
  row({ product_id: 'bateria', name: 'Batería de litio 100Ah', units_sold: 5, net_cup: 148_000 }),
];
const B_CATALOGO = [
  cat({ id: 'cemento', name: 'Cemento P-350 50 Kg', stock_current: 12, unit_of_measure: 'bultos' }),
  cat({ id: 'bloque', name: 'Bloque de hormigón 20', stock_current: 90 }),
  cat({ id: 'varilla', name: 'Varilla corrugada 12mm', stock_current: 0 }),
  cat({ id: 'pintura', name: 'Pintura Vinil 4L blanco', stock_current: 22, unit_of_measure: 'latas' }),
  cat({ id: 'clavos', name: 'Clavos 2 pulgadas (libra)', stock_current: 65, unit_of_measure: 'libras' }),
  cat({ id: 'tubo', name: 'Tubo PVC 110 x 6m', stock_current: 7 }),
  cat({ id: 'cable', name: 'Cable bipolar 2x1.5 (m)', stock_current: 130, unit_of_measure: 'm' }),
  cat({ id: 'led', name: 'Lámpara LED 9W fría', stock_current: 180 }),
  cat({ id: 'ventilador', name: 'Ventilador de pie 16"', stock_current: 3 }),
  cat({ id: 'olla', name: 'Olla de presión 6L', stock_current: 5 }),
  cat({ id: 'bomba', name: 'Bomba de agua 1/2 HP', stock_current: 0 }),
  cat({ id: 'panel', name: 'Panel solar 450W', stock_current: 6 }),
  cat({ id: 'colchon', name: 'Colchón espuma alta densidad', stock_current: 4 }),
  cat({ id: 'cocina', name: 'Cocina de inducción 2 hornillas', stock_current: 0 }),
  cat({ id: 'regulador', name: 'Regulador de voltaje 500VA', stock_current: 9 }),
  cat({ id: 'bateria', name: 'Batería de litio 100Ah', stock_current: 2 }),
];
const B_VENTAS = new Set(B_ACTUAL.map((r) => r.product_id as string));

function escenarioD(): InformeInput {
  // 28 productos: muchos líderes caen a cero / contracciones fuertes → matriz
  // de prioridades larga + todas las complementarias con casos.
  const { topActual, topAnterior, catalogo } = makeProducts(28, { seed: 21 });
  // Forzar patrón de caídas fuertes: el anterior > 3× el actual en la mayoría.
  for (const r of topAnterior) {
    const cur = topActual.find((c) => c.product_id === r.product_id);
    if (cur && cur.net_cup > 0 && r.net_cup > 0) {
      r.net_cup = Math.round(cur.net_cup * (3.5 + (r.units_sold % 5)));
      r.units_sold = Math.max(1, Math.round((cur.units_sold || 10) * 4));
    }
  }
  const ventas = new Set(topActual.slice(0, 24).map((r) => r.product_id as string));
  return mkInput(topActual, topAnterior, catalogo, ventas);
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : '/home/z/my-project/scripts/pdfqa/out';
  const tagIdx = argv.indexOf('--tag');
  const tag = tagIdx >= 0 ? argv[tagIdx + 1] : 'esc';
  mkdirSync(outDir, { recursive: true });

  const escenarios: Array<{ id: string; input: InformeInput }> = [
    { id: 'A-pequena', input: escenarioA() },
    { id: 'B-mediana', input: mkInput(B_ACTUAL, B_ANTERIOR, B_CATALOGO, B_VENTAS) },
    { id: 'C-extensa-40', input: (() => { const p = makeProducts(40, { seed: 42 }); return mkInput(p.topActual, p.topAnterior, p.catalogo, new Set(p.topActual.slice(0, 35).map((r) => r.product_id as string))); })() },
    { id: 'D-conclusiones-28', input: escenarioD() },
    { id: 'E-anexos-110', input: (() => { const p = makeProducts(110, { seed: 99 }); return mkInput(p.topActual, p.topAnterior, p.catalogo, new Set(p.topActual.slice(0, 95).map((r) => r.product_id as string))); })() },
    { id: 'F-nombres-largos-30', input: (() => { const p = makeProducts(30, { longNames: true, wideMagnitudes: true, seed: 777 }); return mkInput(p.topActual, p.topAnterior, p.catalogo, new Set(p.topActual.slice(0, 25).map((r) => r.product_id as string))); })() },
  ];

  const informe = (id: string, input: InformeInput) => buildInformeEjecutivo(input);
  const resultados: string[] = [];

  for (const esc of escenarios) {
    const inf = informe(esc.id, esc.input);
    const doc = await buildInformeEjecutivoPdf(inf);
    const paginas = doc.getNumberOfPages();
    const bytes = doc.output('arraybuffer') as ArrayBuffer;
    const archivo = join(outDir, `${tag}_${esc.id}.pdf`);
    writeFileSync(archivo, Buffer.from(bytes));
    const nombreOficial = informeEjecutivoFileName(inf);
    const resumen = inf.conciliacion;
    const linea = `${esc.id}: ${paginas} págs · ${(bytes.byteLength / 1024).toFixed(0)} KB · productos=${resumen.productosAnalizados} ingresos=${resumen.ingresosActual} anexos=[${inf.anexos.map((a) => `${a.titulo.split('.')[0]}:${a.filas.length}f`).join(', ')}] met=${inf.metodologia.length} comp=${inf.complementarias.length} prio=${inf.prioridades.length} → ${archivo} (oficial: ${nombreOficial})`;
    resultados.push(linea);
    console.log(linea);
  }
  writeFileSync(join(outDir, `${tag}_resumen.txt`), resultados.join('\n') + '\n');
  console.log(`\nOK — ${escenarios.length} escenarios escritos en ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
