/**
 * ADNEGOCIO-PDF-REPORT-POLISH-002 · RÉPLICA DE LOS DATOS DE Informe3.pdf
 * ===========================================================================
 * Reconstruye, con la MISMA cadena de producción real de la aplicación
 *   PeriodProductRow[] → buildComparison → buildInformeEjecutivo →
 *   buildInformeEjecutivoPdf → PDF
 * las condiciones documentadas de la misión para el documento de referencia
 * Informe3.pdf (el adjunto no llegó al sandbox; la réplica usa los hechos
 * citados literalmente en la misión):
 *
 *   G · Réplica Informe3 — ALTA Espejo / Mortero / Inicio Z (evidencia citada:
 *       «$30,600.00 CUP … 0.35 unidad/día»), gráfico 3.C MIXTO (agotados
 *       «No calculable (sin existencia)» y «No calculable (sin ventas en el
 *       tramo)» conviven con coberturas cuantificables), volumen ~26 págs.
 *   H · Todo agotado — TODOS los casos de 3.C sin cobertura calculable: no
 *       debe dibujarse escala numérica ni líneas D/2 / D.
 *   I · Modelo extenso (artesanal, capa de PRESENTACIÓN) — bloques de
 *       prioridades con párrafos mayores que una página, tarjetas consecutivas
 *       y contenido que fuerza saltos de página: robustez ante cualquier
 *       longitud de contenido (el PDF consume el modelo tal cual, §10).
 *
 * USO: bun run scripts/pdf-informe3-replica.ts --out <dir> [--tag <prefijo>]
 * RE-EJECUTABLE (protocolo 11d/11e): fixtures en memoria, sin BD.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildComparison, type PeriodProductRow, type ProductCatalogRow } from '@/lib/product-comparison/compare';
import { buildInformeEjecutivo, type InformeEjecutivo, type InformeInput, type InformePrioridad } from '@/lib/product-comparison/informe';
import { buildInformeEjecutivoPdf } from '@/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf';

const row = (o: Partial<PeriodProductRow> & { product_id: string; name: string }): PeriodProductRow => ({
  sku: o.sku ?? o.product_id.toUpperCase().slice(0, 6),
  units_sold: 0,
  units_returned: 0,
  net_cup: 0,
  ...o,
});
const cat = (o: Partial<ProductCatalogRow> & { id: string; name: string }): ProductCatalogRow => ({
  sku: o.sku ?? o.id.toUpperCase().slice(0, 6),
  stock_current: 0,
  unit_of_measure: 'unidades',
  ...o,
});

// Tramos de 20 días → 7 unidades / 20 d = 0.35 unidad/día (evidencia citada).
const META = {
  entidadNombre: 'ENERVIDA-VITALLCONS',
  periodoActual: { desde: '2026-11-01', hasta: '2026-11-20' },
  periodoComparacion: { desde: '2026-10-01', hasta: '2026-10-20' },
  ambito: 'ENERVIDA-VITALLCONS',
} as const;
const GENERADO = '2026-11-26T14:05:00.000Z';

function mkInput(
  topActual: PeriodProductRow[],
  topAnterior: PeriodProductRow[],
  catalogo: ProductCatalogRow[],
): InformeInput {
  const ventas = new Set(topActual.map((r) => r.product_id as string));
  const { rows, resumen } = buildComparison(topActual, topAnterior, catalogo, ventas);
  return { rows, resumen, meta: { ...META }, generadoEl: GENERADO, ventasEnPeriodoActual: ventas };
}

// ── Escenario G · réplica de las condiciones de Informe3.pdf ─────────────────

interface Spec {
  name: string;
  um: string | null;
  act: [number, number];   // [unidadesAct, CUP act]
  ant: [number, number];   // [unidadesAnt, CUP ant]
  stock: number;
}

const SPECS_G: Spec[] = [
  // ALTA citadas en la misión (ventasActuales 0 + antecedente + existencia 0).
  { name: 'Espejo biselado 80 x 120 cm', um: 'unidad', act: [0, 0], ant: [18, 121_300], stock: 0 },
  { name: 'Mortero de cemento (saco)', um: 'saco', act: [0, 0], ant: [24, 84_500], stock: 0 },
  { name: 'Inicio Z cerámico 60 x 60', um: 'unidad', act: [0, 0], ant: [7, 30_600], stock: 0 },
  // Mezcla para el gráfico 3.C: coberturas cuantificables de las tres clases.
  { name: 'Cemento P-350 50 Kg', um: 'bultos', act: [96, 483_800], ant: [210, 1_050_000], stock: 12 },
  { name: 'Pintura Vinil 4L blanco', um: 'latas', act: [34, 96_400], ant: [25, 70_800], stock: 6 },
  { name: 'Clavos 2 pulgadas (libra)', um: 'libras', act: [150, 31_200], ant: [190, 39_500], stock: 65 },
  { name: 'Tubo PVC 110 x 6m', um: 'unidad', act: [18, 88_000], ant: [12, 58_600], stock: 14 },
  { name: 'Cable bipolar 2x1.5 (m)', um: 'm', act: [420, 64_900], ant: [510, 78_700], stock: 130 },
  { name: 'Lámpara LED 9W fría', um: 'unidad', act: [75, 27_300], ant: [40, 14_500], stock: 180 },
  { name: 'Ventilador de pie 16"', um: 'unidad', act: [9, 41_000], ant: [14, 63_800], stock: 3 },
  { name: 'Olla de presión 6L', um: 'unidad', act: [6, 33_500], ant: [5, 29_800], stock: 5 },
  // AGOTADO con demanda activa → «No calculable (sin existencia)».
  { name: 'Bomba de agua 1/2 HP', um: 'unidad', act: [4, 59_800], ant: [11, 102_400], stock: 0 },
  { name: 'Cocina de inducción 2 hornillas', um: 'unidad', act: [3, 74_200], ant: [4, 92_000], stock: 0 },
  // Baja rotación / acumulación (cobertura > D).
  { name: 'Panel solar 450W', um: 'unidad', act: [3, 112_000], ant: [2, 88_000], stock: 6 },
  { name: 'Colchón espuma alta densidad', um: 'unidad', act: [2, 46_700], ant: [3, 58_900], stock: 4 },
  // Dejaron de venderse CON existencia → sin_movimiento (textual).
  { name: 'Regulador de voltaje 500VA', um: 'unidad', act: [0, 0], ant: [11, 38_300], stock: 9 },
  // Nuevo en el ranking (variación sin base).
  { name: 'Batería de litio 100Ah', um: 'unidad', act: [5, 148_000], ant: [0, 0], stock: 2 },
  { name: 'Bloque de hormigón 20', um: 'unidad', act: [240, 214_000], ant: [300, 267_500], stock: 90 },
  { name: 'Varilla corrugada 12mm', um: 'unidad', act: [88, 198_700], ant: [120, 271_000], stock: 0 },
  { name: 'Interruptor sencillo', um: 'unidad', act: [60, 18_600], ant: [72, 24_100], stock: 40 },
  { name: 'Juego de sábanas matrimonial', um: 'juego', act: [7, 22_400], ant: [9, 28_900], stock: 11 },
  { name: 'Controlador de carga 30A', um: 'unidad', act: [4, 36_500], ant: [6, 54_200], stock: 8 },
  { name: 'Cemento Blanco 2 Kg', um: 'unidad', act: [22, 9_800], ant: [28, 12_400], stock: 30 },
  { name: 'Arena lavada (saco)', um: 'saco', act: [35, 24_500], ant: [41, 31_200], stock: 16 },
  { name: 'Cocina de gas 4 hornillas', um: 'unidad', act: [2, 68_400], ant: [3, 99_600], stock: 5 },
  { name: 'Ventana de aluminio 1.2 x 1.5', um: 'unidad', act: [3, 57_900], ant: [2, 44_300], stock: 7 },
  { name: 'Pintura esmalte sintético 1L', um: 'latas', act: [16, 19_700], ant: [21, 26_800], stock: 24 },
  { name: 'Manguera jardín 15 m', um: 'unidad', act: [8, 14_300], ant: [10, 17_900], stock: 13 },
  { name: 'Tornillería surtida (caja)', um: 'caja', act: [12, 9_200], ant: [15, 11_400], stock: 20 },
  { name: 'Foco proyector LED 50W', um: 'unidad', act: [11, 26_100], ant: [8, 19_400], stock: 9 },
];

// Para que Espejo / Mortero / Inicio Z NO ocupen puesto ≤ 5 del tramo anterior
// (variante de evidencia citada: «registró … CUP en el tramo comparativo»),
// el topAnterior debe llevar ≥6 productos con ventas mayores.
function escenariosG(): InformeInput {
  const topActual = SPECS_G.filter((s) => s.act[1] > 0 || s.act[0] > 0).map((s) =>
    row({ product_id: s.name, name: s.name, units_sold: s.act[0], net_cup: s.act[1] }),
  );
  const topAnterior = SPECS_G.filter((s) => s.ant[1] > 0 || s.ant[0] > 0).map((s) =>
    row({ product_id: s.name, name: s.name, units_sold: s.ant[0], net_cup: s.ant[1] }),
  );
  const catalogo = SPECS_G.map((s) => cat({ id: s.name, name: s.name, stock_current: s.stock, unit_of_measure: s.um }));
  return mkInput(topActual, topAnterior, catalogo);
}

// ── Escenario H · TODOS los casos de 3.C sin cobertura calculable ────────────

function escenarioH(): InformeInput {
  const specs: Spec[] = [
    { name: 'Espejo marco dorado', um: 'unidad', act: [0, 0], ant: [9, 64_500], stock: 0 },
    { name: 'Mortero prefabricado 25 Kg', um: 'saco', act: [0, 0], ant: [30, 96_000], stock: 0 },
    { name: 'Grifería cocina cromada', um: 'unidad', act: [6, 47_200], ant: [4, 31_800], stock: 0 },
    { name: 'Llave de paso 1/2"', um: 'unidad', act: [22, 8_900], ant: [18, 7_400], stock: 0 },
    { name: 'Puerta maciza 0.9 x 2.1', um: 'unidad', act: [0, 0], ant: [3, 51_700], stock: 0 },
    { name: 'Azulejo blanco 30 x 30', um: 'caja', act: [40, 58_400], ant: [35, 52_100], stock: 0 },
  ];
  const topActual = specs.filter((s) => s.act[1] > 0).map((s) => row({ product_id: s.name, name: s.name, units_sold: s.act[0], net_cup: s.act[1] }));
  const topAnterior = specs.filter((s) => s.ant[1] > 0).map((s) => row({ product_id: s.name, name: s.name, units_sold: s.ant[0], net_cup: s.ant[1] }));
  const catalogo = specs.map((s) => cat({ id: s.name, name: s.name, stock_current: 0, unit_of_measure: s.um }));
  return mkInput(topActual, topAnterior, catalogo);
}

// ── Escenario I · modelo artesanal (robustez de la capa de presentación) ─────

function textoLargo(prefijo: string, oraciones: number): string {
  const base =
    'La existencia declarada no registra movimientos de entrada en las últimas semanas del tramo y el ritmo histórico de salida se mantiene por encima del cero, lo que sostiene la hipótesis de trabajo de un abastecimiento interrumpido más que de una caída de demanda; ';
  const cola =
    ' la verificación con el operario de almacén y la revisión del mayor de compras son pasos previos a cualquier compromiso de compra.';
  const partes: string[] = [];
  for (let i = 0; i < oraciones; i++) {
    partes.push(`${base}El detalle operativo ${i + 1} confirma que el agregado por producto no informa importe fuera del corte del Top y que la unidad de medida propia se conserva en cada cifra presentada.`);
  }
  return `${prefijo}${partes.join('')}${cola}`;
}

function escenarioI(): InformeEjecutivo {
  const prioridades: InformePrioridad[] = [
    { nivel: 'alta', producto: 'Bloque de hormigón 20', situacion: textoLargo('El producto concentró la mayor caída del conjunto comparado.', 9), decision: textoLargo('La decisión recomendada exige confirmar el estado real del abastecimiento antes de comprometer importes.', 7) },
    { nivel: 'alta', producto: 'Cemento P-350 50 Kg', situacion: 'El producto registró 483,800.00 CUP en el período analizado frente a 1,050,000.00 CUP del tramo comparable, con existencia de 12 bultos y cobertura estimada de 2.5 días.', decision: 'Evaluar reposición inmediata con base en el ritmo de salida verificado y revisar el precio efectivo, que cambió de tramo a tramo.' },
    { nivel: 'media', producto: 'Pintura Vinil 4L blanco', situacion: textoLargo('La variación del producto combina unidades opuestas con un precio efectivo distinto.', 5), decision: 'Seguimiento quincenal y verificación de condiciones comerciales antes del próximo corte.' },
    { nivel: 'preventiva', producto: 'Lámpara LED 9W fría', situacion: 'La existencia (180 unidades) cubre aproximadamente 48 días al ritmo actual, por encima del tramo analizado de 20 días.', decision: 'Ajustar el punto de reposición y revisar la visibilidad comercial antes de ampliar el inventario.' },
  ];
  const filasRanking = Array.from({ length: 24 }, (_, i) => [
    `SKU-${1000 + i}`,
    `Producto de prueba ${i + 1} para el anexo del modelo extenso`,
    String(i + 1),
    String(i + 1),
    (90_000 - i * 2_500).toFixed(2),
    (85_000 - i * 2_400).toFixed(2),
    `-5,000.00`,
    '-5.9%',
    `${30 - i} unidad`,
    `${28 - i} unidad`,
  ]);
  return {
    meta: {
      ...META,
      titulo: 'INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y ABASTECIMIENTO',
      generadoEl: GENERADO,
      diasPeriodo: 20,
      parametros: ['Ámbito: tienda activa (modelo extenso).', 'Fixture de presentación — sin datos reales.'],
    },
    situacionGeneral: [
      textoLargo('Los ingresos del conjunto comparado descendieron respecto del tramo equivalente.', 4),
      'La concentración del líder se mantiene por encima del umbral de revisión y la interrupción de tres productos con antecedente comercial explica parte de la contracción.',
    ],
    conclusionGerencial: textoLargo('La prioridad del período es restablecer la disponibilidad de los productos con interrupción comercial confirmada y revisar las condiciones de los que cambian de precio efectivo,', 3),
    indicadores: [
      { label: 'Ingresos del conjunto comparado', value: '1,486,200.00 CUP' },
      { label: 'Variación vs. tramo comparable', value: '-312,400.00 CUP (-17.4%)' },
      { label: 'Agotados con antecedentes de ventas', value: '3' },
    ],
    grafico: {
      titulo: 'Ingresos por producto: tramo comparable vs. período analizado (CUP)',
      nota: 'Fixture de presentación con cifras sintéticas.',
      series: [
        { name: 'Bloque de hormigón 20', anterior: 267_500, actual: 214_000 },
        { name: 'Cemento P-350 50 Kg', anterior: 1_050_000, actual: 483_800 },
        { name: 'Varilla corrugada 12mm', anterior: 271_000, actual: 198_700 },
        { name: 'Panel solar 450W', anterior: 88_000, actual: 112_000 },
      ],
    },
    variaciones: [
      { name: 'Batería de litio 100Ah', difCup: 148_000, varPct: null, esNuevo: true },
      { name: 'Cemento P-350 50 Kg', difCup: -566_200, varPct: -53.9, esNuevo: false },
      { name: 'Panel solar 450W', difCup: 24_000, varPct: 27.3, esNuevo: false },
      { name: 'Bloque de hormigón 20', difCup: -53_500, varPct: -20.0, esNuevo: false },
    ],
    riesgoCobertura: [
      { name: 'Cemento P-350 50 Kg', estado: 'cobertura_insuficiente', coberturaDias: 2.5, coberturaTexto: 'aprox. 2,5 días' },
      { name: 'Ventilador de pie 16"', estado: 'cobertura_insuficiente', coberturaDias: 6.7, coberturaTexto: 'aprox. 6,7 días' },
      { name: 'Olla de presión 6L', estado: 'cobertura_moderada', coberturaDias: 16.7, coberturaTexto: 'aprox. 16,7 días' },
      { name: 'Tubo PVC 110 x 6m', estado: 'cobertura_moderada', coberturaDias: 15.6, coberturaTexto: 'aprox. 15,6 días' },
      { name: 'Lámpara LED 9W fría', estado: 'baja_rotacion', coberturaDias: 48, coberturaTexto: 'aprox. 48 días' },
      { name: 'Bomba de agua 1/2 HP', estado: 'agotado', coberturaDias: null, coberturaTexto: 'No calculable (sin existencia)' },
      { name: 'Inicio Z cerámico 60 x 60', estado: 'agotado', coberturaDias: null, coberturaTexto: 'No calculable (sin ventas en el tramo)' },
      { name: 'Mortero de cemento (saco)', estado: 'agotado', coberturaDias: null, coberturaTexto: 'No calculable (sin ventas en el tramo)' },
    ],
    resumenGerencial: [
      'El conjunto comparado descendió 17.4% frente al tramo equivalente; la caída se concentra en productos con interrupción de abastecimiento.',
      'Tres productos con antecedente de ventas están agotados con existencia cero: la prioridad es restablecer su disponibilidad.',
      'La baja rotación de dos productos libera efectivo si se ajusta el punto de reposición.',
    ],
    prioridades,
    complementarias: [
      {
        titulo: 'Evolución de los productos principales',
        intro: 'Fixture: cifras sintéticas ya formateadas.',
        columnas: ['Producto', 'Ventas ant. (CUP)', 'Ventas act. (CUP)', 'Variación CUP', 'Lectura operativa'],
        filas: Array.from({ length: 6 }, (_, i) => [
          `Producto de prueba ${i + 1}`,
          (90_000 - i * 2_500).toFixed(2),
          (85_000 - i * 2_400).toFixed(2),
          '-5,000.00',
          i % 2 === 0 ? 'Contracción con demanda verificada: revisar precio efectivo y existencias.' : 'Variación compatible con cambio de composición; verificar antes de decidir.',
        ]),
        nota: 'Fixture de presentación.',
      },
    ],
    anexos: [
      {
        titulo: 'Anexo I. Ranking comparativo completo',
        intro: 'Fixture: 24 filas sintéticas.',
        columnas: ['Código', 'Descripción', 'Pos. ant.', 'Pos. act.', 'Ventas ant. (CUP)', 'Ventas act. (CUP)', 'Variación CUP', 'Variación %', 'Cant. ant.', 'Cant. act.'],
        filas: filasRanking,
      },
      {
        titulo: 'Anexo II. Disponibilidad y cobertura',
        intro: 'Fixture: 8 casos.',
        columnas: ['Descripción', 'Existencia', 'Velocidad', 'Cobertura estimada', 'Clasificación', 'Alerta de disponibilidad'],
        filas: [
          ['Cemento P-350 50 Kg', '12 bultos', '4,8 bultos/día', 'aprox. 2,5 días', 'Alta rotación', 'Cobertura insuficiente: la existencia no alcanza la mitad del tramo al ritmo actual.'],
          ['Bomba de agua 1/2 HP', '0 unidad', '0,2 unidad/día', 'No calculable (sin existencia)', 'Sin base suficiente', 'Existencia agotada con demanda activa en el tramo.'],
          ['Inicio Z cerámico 60 x 60', '0 unidad', 'Sin ventas en el período analizado', 'No calculable (sin ventas en el tramo)', 'Sin base suficiente', '—'],
          ['Lámpara LED 9W fría', '180 unidad', '3,75 unidad/día', 'aprox. 48 días', 'Baja rotación', '—'],
        ],
      },
      { titulo: 'Anexo III. Productos sin ventas', columnas: ['Producto', 'Tramo', 'Ventas', 'Cant.', 'Existencia', 'Lectura'], filas: [] },
    ],
    metodologia: [
      { titulo: 'Fuente de los datos', parrafos: [textoLargo('El fixture consume el modelo tal cual.', 3)] },
      { titulo: 'Períodos y criterios de comparación', parrafos: ['Período analizado: 01/11/2026 a 20/11/2026 (20 días). Tramo comparable: 01/10/2026 a 20/10/2026 (20 días).'] },
    ],
    conciliacion: {
      productosAnalizados: 8,
      ingresosActual: 1_486_200,
      ingresosAnterior: 1_798_600,
      variacion: -312_400,
      alcance: 'unión de los cortes del Top',
      variacionPct: -17.4,
    },
  };
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : '/home/z/my-project/download/pdf-polish';
  const tagIdx = argv.indexOf('--tag');
  const tag = tagIdx >= 0 ? argv[tagIdx + 1] : 'replica';
  mkdirSync(outDir, { recursive: true });

  const casos: Array<{ id: string; informe: InformeEjecutivo }> = [
    { id: 'G-replica-informe3', informe: buildInformeEjecutivo(escenariosG()) },
    { id: 'H-todo-agotado', informe: buildInformeEjecutivo(escenarioH()) },
    { id: 'I-modelo-extenso', informe: escenarioI() },
  ];

  for (const caso of casos) {
    const doc = await buildInformeEjecutivoPdf(caso.informe);
    const paginas = doc.getNumberOfPages();
    const archivo = join(outDir, `${tag}_${caso.id}.pdf`);
    writeFileSync(archivo, Buffer.from(doc.output('arraybuffer') as ArrayBuffer));
    const prioridadesPorNivel = caso.informe.prioridades.reduce<Record<string, number>>((a, p) => {
      a[p.nivel] = (a[p.nivel] ?? 0) + 1;
      return a;
    }, {});
    const estadosCobertura = caso.informe.riesgoCobertura.reduce<Record<string, number>>((a, e) => {
      a[e.estado] = (a[e.estado] ?? 0) + 1;
      return a;
    }, {});
    console.log(
      `${caso.id}: ${paginas} págs · ${(archivo)} · prio=${JSON.stringify(prioridadesPorNivel)} · cobertura=${JSON.stringify(estadosCobertura)} · sinVentas=${caso.informe.conciliacion.productosAnalizados}`,
    );
  }
  console.log(`OK — ${casos.length} casos en ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
