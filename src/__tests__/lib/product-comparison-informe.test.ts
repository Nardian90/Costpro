/**
 * MISIÓN INFORME GERENCIAL 2026-11-24 · Informe Ejecutivo de Desempeño
 * Comercial y Abastecimiento (motor analítico puro).
 *
 * Los CASOS A-E del enunciado son las pruebas de calidad del nuevo análisis:
 *  · A. Cemento TBV 50 Kg — agotado con antecedente relevante → reposición
 *    prioritaria SIN declarar «ventas perdidas» ni demanda no atendida.
 *  · B. Cemento Blanco 2 Kg — contracción fuerte con existencia → revisar
 *    antes de comprar; NO recomienda aumentar inventario.
 *  · C. Inversor — liderazgo por una sola operación → verificar repetibilidad;
 *    existencia cero = alerta de disponibilidad, no reposición masiva.
 *  · D. Royal Cole — crecimiento con cobertura insuficiente → velocidad,
 *    cobertura y reposición anticipada (números verificados a mano).
 *  · E. Cable Solar Negro 4mm — ingresos al alza con unidades a la baja →
 *    precio efectivo / composición; NO atribuir a demanda automáticamente.
 *
 * Además: clasificación de rotación documentada, cobertura ficticia prohibida,
 * sin-ventas solo con evidencia del mayor (sin contradicciones tipo
 * «Conectores MC4»), conciliación del conjunto y anexos completos.
 */
import { describe, it, expect } from 'vitest';
import { buildComparison, type PeriodProductRow, type ProductCatalogRow } from '@/lib/product-comparison/compare';
import {
  buildInformeEjecutivo,
  evaluarRotacion,
  diasDelPeriodo,
  UMBRAL_COBERTURA_ALTA,
  UMBRAL_COBERTURA_BAJA,
  type InformeInput,
} from '@/lib/product-comparison/informe';

// ── Fixtures (números del enunciado; D = 23 días, verificado a mano) ─────────

const row = (o: Partial<PeriodProductRow> & { product_id: string; name: string }): PeriodProductRow => ({
  sku: o.product_id.toUpperCase().slice(0, 6),
  units_sold: 0,
  units_returned: 0,
  net_cup: 0,
  ...o,
});

const catalogo = (
  { stock_current = 0, unit_of_measure = 'unidades', ...o }: Partial<ProductCatalogRow> & { id: string; name: string },
): ProductCatalogRow => ({
  ...o,
  stock_current,
  unit_of_measure,
});

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
    ventasEnPeriodoActual: ventasEnPeriodoActual ?? null,
  };
};

/**
 * Casos del enunciado (§4) reproducidos como fixture del conjunto comparado.
 * Existencias según el enunciado; D = 23 días (01/11 → 23/11).
 */
const CASOS_TOP_ACTUAL: PeriodProductRow[] = [
  // Caso C: Inversor — líder por una sola operación.
  row({ product_id: 'inversor', name: 'Inversor', sku: 'INV-1', units_sold: 1, net_cup: 382000 }),
  // Caso D: Royal Cole — crecimiento con cobertura ajustada (59 u en 23 días).
  row({ product_id: 'royal', name: 'Royal Cole', sku: 'ROY-1', units_sold: 59, net_cup: 147500 }),
  // Caso E: Cable Solar — ingresos al alza, unidades a la baja (22 m).
  row({ product_id: 'cable', name: 'Cable Solar Negro 4mm', sku: 'CSL-4', units_sold: 22, net_cup: 91125 }),
  // Caso B: Cemento Blanco — contracción fuerte (4 u).
  row({ product_id: 'blanco', name: 'Cemento Blanco 2 Kg', sku: 'CB-2', units_sold: 4, net_cup: 8000 }),
];

const CASOS_TOP_ANTERIOR: PeriodProductRow[] = [
  // Caso A: Cemento TBV — líder anterior hoy en cero.
  row({ product_id: 'tbv', name: 'Cemento TBV 50 Kg', sku: 'TBV-50', units_sold: 78, net_cup: 1532640 }),
  // Caso B: Cemento Blanco — 22 u / $50,000 antes.
  row({ product_id: 'blanco', name: 'Cemento Blanco 2 Kg', sku: 'CB-2', units_sold: 22, net_cup: 50000 }),
  // Caso D: Royal Cole — 19 u / $48,750 antes.
  row({ product_id: 'royal', name: 'Royal Cole', sku: 'ROY-1', units_sold: 19, net_cup: 48750 }),
  // Caso E: Cable Solar — 24 m / $74,722.50 antes.
  row({ product_id: 'cable', name: 'Cable Solar Negro 4mm', sku: 'CSL-4', units_sold: 24, net_cup: 74722.5 }),
];

const CASOS_CATALOGO: ProductCatalogRow[] = [
  catalogo({ id: 'inversor', name: 'Inversor', stock_current: 0, unit_of_measure: 'unidades' }),
  catalogo({ id: 'royal', name: 'Royal Cole', stock_current: 6, unit_of_measure: 'unidades' }),
  catalogo({ id: 'cable', name: 'Cable Solar Negro 4mm', stock_current: 340, unit_of_measure: 'metros' }),
  catalogo({ id: 'blanco', name: 'Cemento Blanco 2 Kg', stock_current: 4, unit_of_measure: 'unidades' }),
  catalogo({ id: 'tbv', name: 'Cemento TBV 50 Kg', stock_current: 0, unit_of_measure: 'unidades' }),
];

const casosInput = (ventasEnPeriodoActual?: Set<string>): InformeInput =>
  mkInput(CASOS_TOP_ACTUAL, CASOS_TOP_ANTERIOR, CASOS_CATALOGO, ventasEnPeriodoActual);

const prioridadDe = (inf: ReturnType<typeof buildInformeEjecutivo>, producto: string) =>
  inf.prioridades.find((p) => p.producto === producto) ?? null;

// ── Estructura del documento ─────────────────────────────────────────────────

describe('Informe Gerencial — estructura documental', () => {
  it('encabezado institucional: entidad, título, períodos, días y elaboración', () => {
    const inf = buildInformeEjecutivo(casosInput());
    expect(inf.meta.titulo).toBe('INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y ABASTECIMIENTO');
    expect(inf.meta.entidadNombre).toBe('ENERVIDA-VITALLCONS');
    expect(inf.meta.diasPeriodo).toBe(23);
    expect(inf.meta.generadoEl).toBe('2026-11-23T10:30:00.000Z');
    expect(inf.meta.parametros.some((p) => p.includes('CUP contable'))).toBe(true);
  });

  it('diagnóstico + indicadores + gráfico + matriz + complementarias + anexos I-IV', () => {
    const inf = buildInformeEjecutivo(casosInput());
    expect(inf.situacionGeneral.length).toBeGreaterThanOrEqual(3);
    expect(inf.conclusionGerencial.length).toBeGreaterThan(0);
    expect(inf.indicadores.length).toBeGreaterThanOrEqual(5);
    expect(inf.grafico).not.toBeNull();
    expect(inf.grafico!.series.length).toBeGreaterThanOrEqual(2);
    expect(inf.prioridades.length).toBeGreaterThanOrEqual(4);
    expect(inf.anexos).toHaveLength(3);
    expect(inf.anexos[0].titulo).toContain('Anexo I');
    expect(inf.anexos[1].titulo).toContain('Anexo II');
    expect(inf.anexos[2].titulo).toContain('Anexo III');
    expect(inf.metodologia.length).toBe(4);
    expect(inf.metodologia[3].titulo).toBe('Limitaciones');
  });

  it('conciliación explícita: la variación del conjunto es Σ(actual) − Σ(anterior) de la unión', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const { conciliacion } = inf;
    expect(conciliacion.productosAnalizados).toBe(5);
    // Verificado a mano: actual 382000+147500+91125+8000 = 628,625;
    // anterior 1532640+50000+48750+74722.5 = 1,706,112.50; Δ = −1,077,487.50
    expect(conciliacion.ingresosActual).toBeCloseTo(628625, 2);
    expect(conciliacion.ingresosAnterior).toBeCloseTo(1706112.5, 2);
    expect(conciliacion.variacion).toBeCloseTo(-1077487.5, 2);
    expect(conciliacion.variacionPct).not.toBeNull();
    expect(conciliacion.variacionPct!).toBeCloseTo(
      Math.round((-1077487.5 / 1706112.5) * 1000) / 10,
      5,
    );
    expect(conciliacion.alcance).toContain('unión del Top');
    // La situación general declara la metodología del conjunto.
    expect(inf.situacionGeneral[0]).toContain('calculada exclusivamente sobre los productos incluidos');
  });
});

// ── Rotación y cobertura (indicadores nuevos) ────────────────────────────────

describe('Informe Gerencial — rotación y cobertura', () => {
  it('velocidad y cobertura del Caso D (Royal Cole): 59/23 u-día y 6/velocidad ≈ 2,3 días', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const royal = inf.anexos[1].filas.find((f) => f[0] === 'Royal Cole');
    expect(royal).toBeDefined();
    const ev = evaluarRotacion(
      // fila reconstruida a mano para aislar el cálculo
      buildComparison(
        [CASOS_TOP_ACTUAL.find((r) => r.product_id === 'royal')!],
        [CASOS_TOP_ANTERIOR.find((r) => r.product_id === 'royal')!],
        [CASOS_CATALOGO.find((c) => c.id === 'royal')!],
      ).rows[0],
      23,
    );
    expect(ev.velocidad).toBeCloseTo(59 / 23, 2);
    expect(ev.coberturaDias).toBeCloseTo(Math.round((6 / (59 / 23)) * 10) / 10, 5);
    // 6 ÷ 2.5652 ≈ 2.34 días < 23 × 0.5 → rotación ALTA + alerta de cobertura
    expect(ev.coberturaDias!).toBeLessThan(23 * UMBRAL_COBERTURA_ALTA);
    expect(ev.clasificacion).toBe('alta');
    expect(ev.alerta).toContain('Cobertura insuficiente');
    expect(royal![4]).toBe('Alta rotación');
  });

  it('sin ventas no genera cobertura ficticia: velocidad y cobertura nulas', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const tbv = inf.anexos[1].filas.find((f) => f[0] === 'Cemento TBV 50 Kg');
    expect(tbv).toBeDefined();
    expect(tbv![2]).toBe('Sin ventas en el período analizado'); // velocidad
    expect(tbv![3]).toBe('No calculable (sin ventas en el tramo)'); // cobertura
    // Con existencia 0: sin base suficiente (nada evaluable).
    expect(tbv![4]).toBe('Sin base suficiente');
  });

  it('baja rotación documentada: cobertura > D clasifica baja; sin salidas con stock = sin movimiento', () => {
    const inf = buildInformeEjecutivo(casosInput());
    // Cable Solar: 340 m / (22/23 ≈ 0.9565) ≈ 355 días > 23 → baja rotación
    const cable = inf.anexos[1].filas.find((f) => f[0] === 'Cable Solar Negro 4mm');
    expect(cable![4]).toBe('Baja rotación');
    const umbral = 23 * UMBRAL_COBERTURA_BAJA;
    expect(Math.round((340 / (22 / 23)) * 10) / 10).toBeGreaterThan(umbral);
    // El informe lo arrastra a la sección de baja rotación con lectura operativa.
    const baja = inf.complementarias.find((c) => c.titulo === 'Productos de baja rotación');
    expect(baja).toBeDefined();
    expect(baja!.filas.some((f) => f[0] === 'Cable Solar Negro 4mm')).toBe(true);
  });

  it('la clasificación usa la U.M. propia de cada producto y nunca las agrega', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const anexoII = inf.anexos[1];
    const cable = anexoII.filas.find((f) => f[0] === 'Cable Solar Negro 4mm');
    expect(cable![1]).toContain('metros');
    const royal = anexoII.filas.find((f) => f[0] === 'Royal Cole');
    expect(royal![2]).toContain('/día');
  });
});

// ── Casos de calidad A-E (enunciado §4) ──────────────────────────────────────

describe('Informe Gerencial — casos de calidad A-E', () => {
  it('CASO A · Cemento TBV 50 Kg: reposición prioritaria, sin declarar pérdidas', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const p = prioridadDe(inf, 'Cemento TBV 50 Kg');
    expect(p).not.toBeNull();
    expect(p!.nivel).toBe('alta');
    // Lectura gerencial exigida: interrupción comercial + falta de disponibilidad.
    expect(p!.situacion).toContain('no registra operaciones en el período analizado');
    expect(p!.situacion).toContain('existencia actual es cero');
    expect(p!.situacion).toContain('compatible con agotamiento sin reposición');
    // Referencia histórica útil para dimensionar la reposición (78 u / 23 días).
    expect(p!.situacion).toContain('3.39');
    // Decisión: reposición prioritaria con referencia histórica...
    expect(p!.decision).toContain('reposición');
    expect(p!.decision).toContain('ritmo histórico de salida');
    // ...y NUNCA «pérdida comprobada» ni demanda no atendida cuantificada.
    expect(p!.decision).toContain('no constituye una pérdida comprobada');
    expect(p!.decision).not.toMatch(/se perdieron/i);
    // El documento jamás presenta 1,532,640 como venta perdida.
    const todo = JSON.stringify(inf);
    expect(todo).not.toMatch(/pérdidas de \$?1\.532\.640/i);
  });

  it('CASO B · Cemento Blanco 2 Kg: contracción con existencia — no aumentar inventario', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const p = prioridadDe(inf, 'Cemento Blanco 2 Kg');
    expect(p).not.toBeNull();
    expect(p!.nivel).toBe('media');
    expect(p!.situacion).toContain('-84%');
    expect(p!.situacion).toContain('existencia de 4 unidades');
    expect(p!.decision).toContain('antes de autorizar nuevas compras');
    expect(p!.decision).toContain('no procede aumentar inventario');
    // La lectura prohibida (comprar más ante demanda en contracción) NO aparece.
    expect(p!.decision).not.toMatch(/aumentar el inventario para/i);
  });

  it('CASO C · Inversor: liderazgo de una sola operación — verificar, no política de compra', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const p = prioridadDe(inf, 'Inversor');
    expect(p).not.toBeNull();
    expect(p!.nivel).toBe('preventiva');
    expect(p!.situacion).toContain('una sola operación');
    expect(p!.situacion).toContain('No existe base comparable');
    // Alerta de disponibilidad por existencia cero — sin reposición masiva.
    expect(p!.situacion).toContain('alerta de disponibilidad');
    expect(p!.decision).toContain('repetición de la demanda');
    expect(p!.decision).toContain('no equivale a rotación alta');
    expect(p!.decision).toContain('no una reposición masiva');
    // La conclusión gerencial reconoce el liderazgo de pocas operaciones.
    expect(inf.situacionGeneral.some((s) => s.includes('número reducido de operaciones'))).toBe(true);
  });

  it('CASO D · Royal Cole: cobertura insuficiente con demanda activa → reposición anticipada', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const p = prioridadDe(inf, 'Royal Cole');
    expect(p).not.toBeNull();
    expect(p!.nivel).toBe('alta');
    expect(p!.situacion).toContain('2.57 unidades/día');
    expect(p!.situacion).toContain('2.3 días');
    expect(p!.situacion).toContain('menos de la mitad del tramo analizado');
    expect(p!.decision).toContain('reposición anticipada');
    // No concluye agotamiento por el % de crecimiento: la alerta nace de la cobertura.
    expect(p!.situacion).not.toMatch(/riesgo de agotamiento en/);
  });

  it('CASO E · Cable Solar: ingresos al alza con unidades a la baja → precio efectivo', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const p = prioridadDe(inf, 'Cable Solar Negro 4mm');
    expect(p).not.toBeNull();
    expect(p!.nivel).toBe('media');
    expect(p!.situacion).toContain('22 metros');
    expect(p!.situacion).toContain('24 metros');
    // Precio efectivo verificado: 74722.50/24 = 3,113.44 → 91125/22 = 4,142.05
    expect(p!.situacion).toContain('3,113.44');
    expect(p!.situacion).toContain('4,142.05');
    expect(p!.decision).toContain('precio promedio efectivo');
    expect(p!.decision).toContain('composición de las operaciones');
    expect(p!.decision).toContain('antes de atribuir el resultado a mayor demanda');
  });
});

// ── Integridad: clasificaciones sin contradicciones ──────────────────────────

describe('Informe Gerencial — integridad y sin contradicciones', () => {
  it('producto fuera del Top sin evidencia de kardex NO entra en «sin ventas» (caso MC4)', () => {
    // MC4: estaba en el Top anterior y hoy está fuera del Top. Sin datos del
    // mayor (Set null → clasificación conservadora de compare.ts): el informe
    // NO afirma venta ni su ausencia, y jamás lo mezcla con «sin ventas».
    const topAnterior = [...CASOS_TOP_ANTERIOR, row({ product_id: 'mc4', name: 'Conectores MC4', units_sold: 5, net_cup: 20000 })];
    const catalogoMC4 = [...CASOS_CATALOGO, catalogo({ id: 'mc4', name: 'Conectores MC4', stock_current: 12 })];
    const inf = buildInformeEjecutivo(mkInput(CASOS_TOP_ACTUAL, topAnterior, catalogoMC4));
    // Anexo III (sin ventas): SOLO con evidencia del mayor — MC4 no debe estar.
    const anexoIII = inf.anexos[2];
    expect(anexoIII.filas.some((f) => f[0] === 'Conectores MC4')).toBe(false);
    // Fuera del Top: estado «verificar», sin afirmar venta ni su ausencia.
    const fuera = inf.complementarias.find((c) => c.titulo === 'Productos fuera del Top analizado');
    expect(fuera).toBeDefined();
    const filaMC4 = fuera!.filas.find((f) => f[0] === 'Conectores MC4');
    expect(filaMC4).toBeDefined();
    expect(filaMC4![2]).toContain('Sin evidencia de ventas');
    expect(filaMC4![4]).toContain('no se afirma venta ni su ausencia');
    // Los indicadores tampoco lo cuentan como «sin ventas» (0 con evidencia).
    const indSinVentas = inf.indicadores.find((i) => i.label.includes('sin ventas'));
    expect(indSinVentas!.value).toBe('0');
  });

  it('con evidencia del mayor, el producto fuera del Top se describe con precisión (no «sin ventas»)', () => {
    // El caso real MC4: el mayor registra salidas por venta, pero su importe
    // no figura en el Top 20 → «ventas actuales 0» en la tabla NO contradice
    // «tiene ventas»: el documento lo explica con precisión (misión §8).
    const evidencia = new Set(['mc4']);
    const topAnterior = [...CASOS_TOP_ANTERIOR, row({ product_id: 'mc4', name: 'Conectores MC4', units_sold: 5, net_cup: 20000 })];
    const catalogoMC4 = [...CASOS_CATALOGO, catalogo({ id: 'mc4', name: 'Conectores MC4', stock_current: 12 })];
    const inf = buildInformeEjecutivo(mkInput(CASOS_TOP_ACTUAL, topAnterior, catalogoMC4, evidencia));
    const fuera = inf.complementarias.find((c) => c.titulo === 'Productos fuera del Top analizado')!;
    const filaMC4 = fuera.filas.find((f) => f[0] === 'Conectores MC4');
    expect(filaMC4![2]).toContain('El mayor de inventario registra salidas por venta');
    expect(filaMC4![2]).toContain('no figura en el Top 20');
    // MC4 NO se cuenta en «sin ventas»: su evidencia dice lo contrario.
    const anexoIII = inf.anexos[2];
    expect(anexoIII.filas.some((f) => f[0] === 'Conectores MC4')).toBe(false);
    const indSinVentas = inf.indicadores.find((i) => i.label.includes('sin ventas'));
    expect(indSinVentas!.value).toBe('1'); // solo el TBV (sin evidencia de salidas)
    // Y el Anexo III sí contiene al TBV con su interpretación operativa.
    const filaTBV = anexoIII.filas.find((f) => f[0] === 'Cemento TBV 50 Kg');
    expect(filaTBV).toBeDefined();
    expect(filaTBV![5]).toContain('agotamiento sin reposición');
  });

  it('Anexo I: ranking completo con posiciones, variaciones, cantidades y U.M. por producto', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const anexoI = inf.anexos[0];
    expect(anexoI.filas).toHaveLength(5);
    const tbv = anexoI.filas.find((f) => f[1] === 'Cemento TBV 50 Kg');
    expect(tbv![2]).toBe('1'); // pos. anterior
    expect(tbv![3]).toBe('—'); // pos. actual
    expect(tbv![5]).toContain('0.00'); // ventas actuales
    expect(tbv![7]).toBe('-100%');
    expect(tbv![8]).toContain('78 unidades');
    expect(tbv![9]).toContain('0 unidades');
  });

  it('la matriz prioriza ALTA → MEDIA → PREVENTIVA y limita su tamaño sin perder el resto', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const niveles = inf.prioridades.map((p) => p.nivel);
    const idxAlta = niveles.lastIndexOf('alta');
    const idxMedia = niveles.findIndex((n) => n === 'media');
    const idxPrev = niveles.findIndex((n) => n === 'preventiva');
    expect(idxAlta).toBeLessThan(idxMedia);
    expect(idxMedia).toBeLessThan(idxPrev);
    expect(inf.prioridades.length).toBeLessThanOrEqual(12);
  });

  it('sin casos que superen umbrales: conclusión honesta y sin hallazgos inventados', () => {
    const inf = buildInformeEjecutivo(mkInput(
      [row({ product_id: 'p1', name: 'Producto A', units_sold: 10, net_cup: 1000 })],
      [row({ product_id: 'p1', name: 'Producto A', units_sold: 10, net_cup: 1000 })],
      // Existencia que da cobertura ≈ un tramo completo (23 días) → moderada.
      [catalogo({ id: 'p1', name: 'Producto A', stock_current: 10 })],
    ));
    expect(inf.prioridades).toHaveLength(0);
    expect(inf.conclusionGerencial).toContain('no exige decisiones');
  });

  it('diasDelPeriodo: tramo inclusivo y validación de entradas', () => {
    expect(diasDelPeriodo('2026-11-01', '2026-11-23')).toBe(23);
    expect(diasDelPeriodo('2026-10-01', '2026-10-31')).toBe(31);
    expect(diasDelPeriodo('2026-11-23', '2026-11-01')).toBe(0);
    expect(diasDelPeriodo('basura', '2026-11-01')).toBe(0);
  });
});

// ── Metodología y limitaciones declaradas ────────────────────────────────────

describe('Informe Gerencial — metodología', () => {
  it('declara las limitaciones honestas del sistema de fuentes', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const limitaciones = inf.metodologia.find((m) => m.titulo === 'Limitaciones')!;
    const texto = limitaciones.parrafos.join(' ');
    expect(texto).toContain('existencia promedio');
    expect(texto).toContain('no se calcula');
    expect(texto).toContain('existencias comprometidas');
    expect(texto).toContain('plazos de abastecimiento');
    expect(texto).toContain('sin fechas de agotamiento');
    expect(texto).toContain('hipótesis de trabajo');
  });

  it('documenta los umbrales de rotación con su fundamento y base D', () => {
    const inf = buildInformeEjecutivo(casosInput());
    const definiciones = inf.metodologia.find((m) => m.titulo === 'Definición de indicadores')!;
    const texto = definiciones.parrafos.join(' ');
    expect(texto).toContain('D = 23');
    expect(texto).toContain('rotación alta, cobertura < D/2');
    expect(texto).toContain('baja rotación, cobertura > D');
    expect(texto).toContain('no se generan coberturas ficticias');
    expect(texto).toContain('la velocidad de venta (unidades/día) no equivale a la cobertura');
  });
});
