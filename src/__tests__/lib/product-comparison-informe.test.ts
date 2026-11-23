/**
 * MISIÓN COMPARAR PRODUCTOS 2026-11-23 · Informe Ejecutivo (módulo puro).
 * Reglas verificadas: clasificaciones por comportamiento, hallazgos
 * condicionados a la evidencia (nunca inventados), sin porcentajes sobre
 * bases inexistentes, unidades por producto, concentración solo con
 * participación oficial, y conclusión honesta.
 */
import { describe, it, expect } from 'vitest';
import { buildComparison, type PeriodProductRow, type ProductCatalogRow } from '@/lib/product-comparison/compare';
import { buildInformeEjecutivo, variacionTexto, type InformeInput } from '@/lib/product-comparison/informe';

// ── Fixtures (números redondos, verificables a mano) ────────────────────────

const row = (o: Partial<PeriodProductRow> & { product_id: string; name: string }): PeriodProductRow => ({
  sku: o.product_id.toUpperCase().slice(0, 6),
  units_sold: 0,
  units_returned: 0,
  net_cup: 0,
  ...o,
});

const catalogo = (o: Partial<ProductCatalogRow> & { id: string }): ProductCatalogRow => ({
  name: o.id,
  stock_current: 0,
  unit_of_measure: 'unidades',
  ...o,
});

const topActualBasico: PeriodProductRow[] = [
  row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 30, net_cup: 3000, participation_pct: 30 }),
  row({ product_id: 'p2', name: 'Arroz 1kg', units_sold: 20, net_cup: 2000, participation_pct: 20 }),
  row({ product_id: 'p3', name: 'Café 250g', units_sold: 10, net_cup: 1000, participation_pct: 10 }),
];

const topAnteriorBasico: PeriodProductRow[] = [
  row({ product_id: 'p2', name: 'Arroz 1kg', units_sold: 10, net_cup: 1000 }),
  row({ product_id: 'p3', name: 'Café 250g', units_sold: 20, net_cup: 2000 }),
  row({ product_id: 'p9', name: 'Producto retirado', units_sold: 15, net_cup: 1500 }),
];

const META_BASE = {
  entidadNombre: 'ENERVIDA-VITALLCONS',
  periodoActual: { desde: '2026-11-01', hasta: '2026-11-23' },
  periodoComparacion: { desde: '2026-10-01', hasta: '2026-10-23' },
  ambito: 'ENERVIDA-VITALLCONS',
} as const;

const mkInput = (
  topActual: PeriodProductRow[],
  topAnterior: PeriodProductRow[],
  cat: ProductCatalogRow[] = [],
  ventasEnPeriodoActual?: Set<string>,
): InformeInput => {
  const { rows, resumen } = buildComparison(topActual, topAnterior, cat, ventasEnPeriodoActual ?? null);
  return {
    rows,
    resumen,
    meta: { ...META_BASE },
    generadoEl: '2026-11-23T10:30:00.000Z',
  };
};

describe('Informe Ejecutivo — estructura y encabezado', () => {
  it('incluye título, períodos explícitos, generación, ámbito y parámetros', () => {
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico));
    expect(inf.meta.titulo).toBe('INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS');
    expect(inf.meta.entidadNombre).toBe('ENERVIDA-VITALLCONS');
    expect(inf.meta.periodoActual.desde).toBe('2026-11-01');
    expect(inf.meta.periodoComparacion.desde).toBe('2026-10-01');
    expect(inf.meta.generadoEl).toBe('2026-11-23T10:30:00.000Z');
    expect(inf.meta.parametros.some((p) => p.includes('Top 20'))).toBe(true);
    expect(inf.meta.parametros.some((p) => p.includes('CUP contable'))).toBe(true);
  });

  it('las secciones A-E cubren las 5 categorías de comportamiento', () => {
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico));
    for (const t of ['A. Productos en crecimiento', 'B. Productos en descenso', 'C. Productos nuevos en el ranking', 'D. Productos que dejaron de venderse', 'E. Productos que salen del Top (siguen vendiéndose)']) {
      const found = Object.values(inf.secciones).some((s) => s.titulo === t);
      expect(found, t).toBe(true);
    }
  });
});

describe('Informe Ejecutivo — clasificación de productos', () => {
  it('p1 crece (3º→1º y +2000), p3 desciende en unidades/ventas, p9 sale del Top (conservador)', () => {
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico));
    const crec = inf.secciones.crecimiento.productos.map((r) => r.productId);
    expect(crec).toContain('p1');
    const desc = inf.secciones.descenso.productos.map((r) => r.productId);
    expect(desc).toContain('p3');
    // Conservador: sin evidencia de kardex, el ausente del Top actual queda
    // «sale_del_top» (no se inventa el cero).
    expect(inf.secciones.salieronDelTop.productos.map((r) => r.productId)).toContain('p9');
    expect(inf.secciones.dejaronDeVenderse.productos).toHaveLength(0);
  });

  it('«dejó de venderse» SOLO con evidencia real de ausencia de salidas por venta', () => {
    // Sin evidencia: conservador (sale del Top). Con evidencia de que NO hay
    // salidas (Set vacío de productos vendidos): «dejó de venderse».
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico, [], new Set(['p1', 'p2', 'p3'])));
    expect(inf.secciones.dejaronDeVenderse.productos.map((r) => r.productId)).toContain('p9');
  });

  it('nuevo en el ranking vs recién incorporado al catálogo: el informe NO inventa la fecha de alta', () => {
    const top = [...topActualBasico, row({ product_id: 'p7', name: 'Producto nuevo', units_sold: 5, net_cup: 700 })];
    const cat = [catalogo({ id: 'p7', name: 'Producto nuevo', stock_current: 10, unit_of_measure: 'bultos' })];
    const inf = buildInformeEjecutivo(mkInput(top, topAnteriorBasico, cat));
    expect(inf.secciones.nuevos.productos.map((r) => r.productId)).toContain('p7');
    // honesto: distingue ranking de alta en catálogo
    expect(inf.secciones.nuevos.intro).toContain('no la fecha de alta');
    // la cantidad conserva SU unidad de medida
    const p7 = inf.secciones.nuevos.productos.find((r) => r.productId === 'p7');
    expect(p7?.unidadMedida).toBe('bultos');
  });
});

describe('Informe Ejecutivo — cifras y variaciones', () => {
  it('sin base: anterior = 0 → variación «sin base» y jamás porcentaje inventado', () => {
    const top = [row({ product_id: 'p5', name: 'Solo hoy', units_sold: 4, net_cup: 400 })];
    const inf = buildInformeEjecutivo(mkInput(top, []));
    const r = inf.secciones.nuevos.productos[0];
    expect(variacionTexto(r)).toBe('sin base');
    expect(r.varPct).toBeNull();
  });

  it('los importes de la sección de crecimiento coinciden con los de la tabla (una sola fuente)', () => {
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico));
    const p1 = inf.secciones.crecimiento.productos.find((r) => r.productId === 'p1');
    expect(p1?.ventasActuales).toBe(3000);
    expect(p1?.ventasAnteriores).toBe(0);
    expect(p1?.difCup).toBe(3000);
    // Δ del conjunto: (3000+2000+1000) − (1000+2000+1500) = 1500
    expect(inf.resumenEjecutivo.cifras.find((c) => c.label.includes('Variación de ingresos'))?.value).toContain('1,500.00');
  });

  it('el resumen ejecutivo cuenta las categorías con números reales', () => {
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico));
    const porLabel = Object.fromEntries(inf.resumenEjecutivo.cifras.map((c) => [c.label, c.value]));
    expect(porLabel['Productos analizados']).toBe('4');
    expect(porLabel['En crecimiento (o líderes)']).toBe('2'); // p1 crece + p2 lidera-ventas-iguales
    expect(porLabel['En descenso']).toBe('1');
    expect(porLabel['Salen del Top (siguen vendiendo)']).toBe('1');
  });
});

describe('Informe Ejecutivo — hallazgos condicionados a la evidencia', () => {
  it('genera hallazgo de crecimiento con más unidades (oportunidad de abastecimiento)', () => {
    const top = [
      row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 60, net_cup: 5000, participation_pct: 55 }),
      row({ product_id: 'p2', name: 'Arroz 1kg', units_sold: 5, net_cup: 500 }),
    ];
    const ant = [row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 30, net_cup: 2000 })];
    const cat = [catalogo({ id: 'p1', name: 'Aceite 1L', stock_current: 40, unit_of_measure: 'unidades' })];
    const inf = buildInformeEjecutivo(mkInput(top, ant, cat));
    const h = inf.hallazgos.find((x) => x.titulo.includes('Crecimiento sostenido'));
    expect(h).toBeDefined();
    expect(h?.evidencia).toContain('unidades');
    expect(h?.hallazgo).not.toContain('demuestra'); // implicación marcada como hipótesis
    expect(h?.implicacion).toContain('podría');
    expect(h?.accion).toContain('Evaluar');
  });

  it('ingresos al alza con menos unidades → hallazgo de posible cambio de precios (hipótesis)', () => {
    const top = [row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 5, net_cup: 3000 })];
    const ant = [row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 30, net_cup: 2000 })];
    const inf = buildInformeEjecutivo(mkInput(top, ant));
    const h = inf.hallazgos.find((x) => x.titulo.includes('menos unidades'));
    expect(h).toBeDefined();
    expect(h?.implicacion).toContain('no está demostrado');
  });

  it('caída fuerte (≥50%) con stock → hallazgo de rotación; sin stock NO lo afirma', () => {
    const top = [row({ product_id: 'p1', name: 'Producto caída', units_sold: 2, net_cup: 400 })];
    const ant = [row({ product_id: 'p1', name: 'Producto caída', units_sold: 20, net_cup: 1000 })];
    const cat = [catalogo({ id: 'p1', name: 'Producto caída', stock_current: 15 })];
    const inf = buildInformeEjecutivo(mkInput(top, ant, cat));
    expect(inf.hallazgos.some((x) => x.titulo.includes('Caída fuerte con existencia disponible'))).toBe(true);

    const inf2 = buildInformeEjecutivo(mkInput(top, ant, [catalogo({ id: 'p1', name: 'Producto caída', stock_current: 0 })]));
    expect(inf2.hallazgos.some((x) => x.titulo.includes('Caída fuerte con existencia disponible'))).toBe(false);
  });

  it('principal anterior sin ventas: distingue con stock disponible vs sin stock (investigación, no conclusión)', () => {
    const top = topActualBasico;
    const ant = [
      row({ product_id: 'p9', name: 'Retirado del Top', units_sold: 50, net_cup: 9000 }), // pos 1 anterior
      ...topAnteriorBasico,
    ];
    const catConStock = [catalogo({ id: 'p9', name: 'Retirado del Top', stock_current: 30 })];
    const inf = buildInformeEjecutivo(mkInput(top, ant, catConStock, new Set(['p1', 'p2', 'p3'])));
    const h = inf.hallazgos.find((x) => x.titulo.includes('Producto principal sin ventas'));
    expect(h).toBeDefined();
    expect(h?.implicacion).toContain('REQUIERE INVESTIGACIÓN');
    expect(h?.evidencia).toContain('existencia actual');

    const catSinStock = [catalogo({ id: 'p9', name: 'Retirado del Top', stock_current: 0 })];
    const inf2 = buildInformeEjecutivo(mkInput(top, ant, catSinStock, new Set(['p1', 'p2', 'p3'])));
    expect(inf2.hallazgos.find((x) => x.titulo.includes('Producto principal sin ventas'))?.implicacion).toContain('quiebre de stock');
  });

  it('concentración > 50 % SOLO con participación oficial (nunca estimada)', () => {
    // participación informada por el RPC: 55% → hallazgo
    const top = [
      row({ product_id: 'p1', name: 'Líder', units_sold: 30, net_cup: 6000, participation_pct: 55 }),
    ];
    const inf = buildInformeEjecutivo(mkInput(top, []));
    expect(inf.hallazgos.some((x) => x.titulo.includes('Concentración de ingresos'))).toBe(true);

    // sin participación oficial → NO se estima concentración
    const topSinPart = [row({ product_id: 'p1', name: 'Líder', units_sold: 30, net_cup: 6000 })];
    const inf2 = buildInformeEjecutivo(mkInput(topSinPart, []));
    expect(inf2.hallazgos.some((x) => x.titulo.includes('Concentración de ingresos'))).toBe(false);
    // pero el indicador de participación tampoco se inventa
    expect(inf2.indicadores.some((i) => i.label.includes('Participación'))).toBe(false);
  });

  it('sin desviaciones → hallazgo honesto «Sin desviaciones» (no se fuerza conclusión)', () => {
    const top = [row({ product_id: 'p1', name: 'Estable', units_sold: 10, net_cup: 1000, participation_pct: 10 })];
    const ant = [row({ product_id: 'p1', name: 'Estable', units_sold: 10, net_cup: 1000 })];
    const inf = buildInformeEjecutivo(mkInput(top, ant));
    expect(inf.hallazgos).toHaveLength(1);
    expect(inf.hallazgos[0].titulo).toContain('Sin desviaciones');
  });
});

describe('Informe Ejecutivo — conclusión', () => {
  it('síntesis + prioridades condicionadas + nota de método', () => {
    const inf = buildInformeEjecutivo(mkInput(topActualBasico, topAnteriorBasico));
    const todo = inf.conclusion.join(' ');
    expect(todo).toContain('Predominan');
    expect(todo).toContain('fuentes oficiales de COSTPRO');
    expect(todo).toContain('hipótesis de trabajo');
  });

  it('prioridad de abastecimiento SOLO si hay crecimiento con más unidades', () => {
    const topCreciente = [
      row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 60, net_cup: 5000 }),
      row({ product_id: 'p2', name: 'Arroz 1kg', units_sold: 5, net_cup: 500 }),
    ];
    const ant = [row({ product_id: 'p1', name: 'Aceite 1L', units_sold: 30, net_cup: 2000 })];
    const inf = buildInformeEjecutivo(mkInput(topCreciente, ant));
    expect(inf.conclusion.join(' ')).toContain('abastecimiento');
  });
});
