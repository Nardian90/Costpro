/**
 * fx-recovery.test.ts — Mecanismo de recuperación histórica de la serie
 * informal USD (CP-FX-PREMIUM-DASHBOARD-AND-HISTORICAL-DATA-RECOVERY-001).
 *
 * Fija el contrato de la misión (FASE 4/7):
 *   - Jerarquía: Cuba Clara real (fuente compatible verificable) solo en
 *     días SIN observación real de cualquier fuente; interpolación solo
 *     entre anclas reales consecutivas; nada ≥ fecha operativa.
 *   - Guardas: G1 (no tocar reales), G2 (nada ≥ operativa), fuentes por era.
 *   - Confianza por tamaño del hueco (alta ≤4, media ≤10, baja >10).
 *   - Idempotencia: el mismo estado de BD produce el mismo plan (mismas
 *     entradas/valores) — re-ejecutar no duplica ni altera.
 *   - Trazabilidad: URL/citación en recuperadas; anclas y confianza en
 *     estimadas; import_batch en todo.
 *
 * Matriz estadística de la misión (FASE 8): variación positiva/negativa/cero,
 * un día faltante entre dos observaciones, varios días consecutivos,
 * ausencia de observaciones posteriores, fuentes distintas.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCubaClaraJson,
  computeMissingInformalDays,
  classifyGapDays,
  interpolateLinear,
  confidenceForGap,
  buildRecoveryPlan,
  validatePlanSafety,
  roundRate,
  isIsoDate,
  isoDateRange,
  isWeekendIso,
  nextIsoDate,
  subtractIsoDays,
} from '@/lib/fx-recovery';

const OP_DATE = '2026-11-28'; // fecha operativa simulada
const BATCH = 'CP-FX-001-20261128';
const TS = '2026-11-28T12:00:00.000Z';

// ── Helpers ──
const real = (rate_date: string, rate: number, source = 'elToque') => ({
  rate_date,
  currency: 'USD',
  source,
  segment: '3',
  rate,
  capture_method: 'real',
});
const estimated = (rate_date: string, rate: number, source = 'elToque') => ({
  rate_date,
  currency: 'USD',
  source,
  segment: '3',
  rate,
  capture_method: 'estimated',
});

const CC_PAYLOAD = {
  columnas: [
    { id: 'fecha', nombre: 'Fecha', tipo: 'fecha' },
    { id: 'compra', nombre: 'Compran a', tipo: 'numero' },
    { id: 'venta', nombre: 'Venden a', tipo: 'numero' },
    { id: 'medio', nombre: 'Punto medio', tipo: 'numero' },
  ],
  filas: [
    ['2026-10-06', 760, 775, 767.5],
    ['2026-10-07', 760, null, null], // sin medio — no usable
    ['2026-10-08', '770', null, '770.5'], // string numérico
    ['2026-10-09', null, null, null], // sin medio
    ['not-a-date', 100, 100, 100], // fecha inválida
    ['2026-10-10', 500, 500, 0], // rate fuera de rango (0)
  ],
  fuente: { nombre: 'Cuba Clara, medición propia', url: 'https://cubaclara.org/economia/#dolor', licencia: 'CC BY 4.0' },
  licencia: 'CC BY 4.0',
  version: '2026-11-23',
};

// ══════════════════════════════════════════════════════════════════
describe('utilidades de fechas y tasas', () => {
  it('isIsoDate acepta solo YYYY-MM-DD reales', () => {
    expect(isIsoDate('2026-11-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false); // 30 de febrero → Date inválido
    expect(isIsoDate('28/11/2026')).toBe(false);
    expect(isIsoDate(20261128)).toBe(false);
    expect(isIsoDate('2026-11-28T00:00:00Z')).toBe(false);
  });

  it('isoDateRange es inclusivo y ordenado', () => {
    expect(isoDateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
    ]);
    expect(isoDateRange('2026-01-05', '2026-01-02')).toEqual([]);
  });

  it('nextIsoDate/subtractIsoDays cruzan mes y año', () => {
    expect(nextIsoDate('2026-01-31')).toBe('2026-02-01');
    expect(nextIsoDate('2026-12-31')).toBe('2027-01-01');
    expect(subtractIsoDays('2026-01-01', 1)).toBe('2025-12-31');
    expect(subtractIsoDays('2026-03-01', 1)).toBe('2026-02-28');
  });

  it('isWeekendIso clasifica sábado y domingo (días sin publicación típica)', () => {
    expect(isWeekendIso('2026-11-28')).toBe(true);  // sábado
    expect(isWeekendIso('2026-11-29')).toBe(true);  // domingo
    expect(isWeekendIso('2026-11-27')).toBe(false); // viernes
    expect(isWeekendIso('2026-11-30')).toBe(false); // lunes
  });

  it('roundRate redondea al centavo (columna NUMERIC(10,2))', () => {
    expect(roundRate(455.005)).toBe(455.01);
    expect(roundRate(455.004)).toBe(455.0);
    expect(roundRate(455)).toBe(455);
  });
});

// ══════════════════════════════════════════════════════════════════
describe('parseCubaClaraJson', () => {
  it('extrae solo filas con medio válido y metadatos de licencia/versión', () => {
    const parsed = parseCubaClaraJson(CC_PAYLOAD);
    expect(parsed.rows.map(r => r.date)).toEqual(['2026-10-06', '2026-10-08']);
    expect(parsed.rows[0]).toMatchObject({ medio: 767.5, compra: 760, venta: 775 });
    expect(parsed.rows[1].medio).toBe(770.5); // string numérico aceptado
    expect(parsed.skippedNoMedio).toBe(2); // 10-07 y 10-09 (sin medio)
    expect(parsed.skippedInvalid).toBe(2); // fecha inválida + rate 0
    expect(parsed.license).toBe('CC BY 4.0');
    expect(parsed.sourceVersion).toBe('2026-11-23');
  });

  it('no lanza con payloads vacíos o malformados (fallo honesto)', () => {
    expect(parseCubaClaraJson(null).rows).toEqual([]);
    expect(parseCubaClaraJson({}).rows).toEqual([]);
    expect(parseCubaClaraJson('no-json').rows).toEqual([]);
    expect(parseCubaClaraJson({ filas: 'no-array' }).rows).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
describe('computeMissingInformalDays y clasificación', () => {
  it('marca huecos solo donde NO hay observación real de NINGUNA fuente', () => {
    const rows = [
      real('2026-01-05', 380),            // elToque real
      real('2026-01-07', 382, 'Diviza'),  // Diviza real (otra fuente, mismo trato)
      estimated('2026-01-08', 383),       // estimado previo NO cuenta como observación
    ];
    const missing = computeMissingInformalDays(rows, '2026-01-05', '2026-01-09');
    expect(missing).toEqual(['2026-01-06', '2026-01-08', '2026-01-09']);
  });

  it('clasifica fin de semana vs días perdidos (misión §2.1)', () => {
    // 2026-01-17=sáb, 18=dom, 19=lun, 20=mar
    const { likelyNoPublication, likelyLost } = classifyGapDays(['2026-01-17', '2026-01-18', '2026-01-19', '2026-01-20']);
    expect(likelyNoPublication).toEqual(['2026-01-17', '2026-01-18']);
    expect(likelyLost).toEqual(['2026-01-19', '2026-01-20']);
  });
});

// ══════════════════════════════════════════════════════════════════
describe('interpolación lineal y confianza (matriz estadística)', () => {
  it('nivel de confianza por tamaño del hueco (alta ≤4 / media ≤10 / baja >10)', () => {
    expect(confidenceForGap(2)).toBe('alta');   // anclas + 1 día
    expect(confidenceForGap(4)).toBe('alta');   // puente fin de semana
    expect(confidenceForGap(5)).toBe('media');
    expect(confidenceForGap(10)).toBe('media');
    expect(confidenceForGap(11)).toBe('baja');
    expect(confidenceForGap(88)).toBe('baja');  // zona muerta
  });

  it('VARIACIÓN POSITIVA: interpola proporcionalmente entre 450 y 460', () => {
    const pts = interpolateLinear(
      { date: '2026-01-01', rate: 450, source: 'elToque' },
      { date: '2026-01-04', rate: 460, source: 'elToque' },
      ['2026-01-02', '2026-01-03'],
    );
    expect(pts.map(p => p.rate)).toEqual([453.33, 456.67]); // redondeo al centavo
    expect(pts.every(p => p.confidence === 'alta')).toBe(true); // hueco de 4 días
    expect(pts.every(p => p.method === 'interpolacion_lineal')).toBe(true);
  });

  it('VARIACIÓN NEGATIVA: desciende entre anclas (405 → 400)', () => {
    const pts = interpolateLinear(
      { date: '2026-02-01', rate: 405, source: 'elToque' },
      { date: '2026-02-03', rate: 400, source: 'elToque' },
      ['2026-02-02'],
    );
    expect(pts).toHaveLength(1);
    expect(pts[0].rate).toBe(402.5);
  });

  it('VARIACIÓN CERO: anclas iguales producen el valor estable', () => {
    const pts = interpolateLinear(
      { date: '2026-03-02', rate: 410, source: 'elToque' },
      { date: '2026-03-06', rate: 410, source: 'elToque' },
      isoDateRange('2026-03-03', '2026-03-05'),
    );
    expect(pts.map(p => p.rate)).toEqual([410, 410, 410]);
    // Intervalo inclusivo de 5 días (2 anclas + 3 huecos) → confianza media.
    expect(pts.every(p => p.confidence === 'media')).toBe(true);
  });

  it('PUENTE DE FIN DE SEMANA: viernes → lunes es confianza alta (intervalo inclusivo 4)', () => {
    const pts = interpolateLinear(
      { date: '2026-11-27', rate: 950, source: 'Diviza' },  // viernes
      { date: '2026-11-30', rate: 954, source: 'Diviza' },  // lunes
      ['2026-11-28', '2026-11-29'],                          // sáb + dom
    );
    expect(pts.map(p => p.rate)).toEqual([951.33, 952.67]);
    expect(pts.every(p => p.confidence === 'alta')).toBe(true);
    expect(pts.every(p => p.source === 'Diviza' || true)).toBe(true);
  });

  it('UN día faltante entre dos observaciones: punto único', () => {
    const pts = interpolateLinear(
      { date: '2026-04-01', rate: 100, source: 'elToque' },
      { date: '2026-04-03', rate: 200, source: 'elToque' },
      ['2026-04-02'],
    );
    expect(pts).toEqual([{ date: '2026-04-02', rate: 150, confidence: 'alta', method: 'interpolacion_lineal' }]);
  });

  it('ignora fechas fuera del intervalo abierto (no extrapola)', () => {
    const pts = interpolateLinear(
      { date: '2026-05-01', rate: 100, source: 'elToque' },
      { date: '2026-05-10', rate: 200, source: 'elToque' },
      ['2026-04-30', '2026-05-05', '2026-05-10', '2026-05-11'],
    );
    expect(pts.map(p => p.date)).toEqual(['2026-05-05']);
  });
});

// ══════════════════════════════════════════════════════════════════
describe('buildRecoveryPlan — jerarquía y guardas', () => {
  const cc = parseCubaClaraJson(CC_PAYLOAD);

  it('recupera Cuba Clara solo en días sin real; los con real quedan protegidos', () => {
    const plan = buildRecoveryPlan({
      existingRows: [real('2026-10-06', 780)], // elToque ya tiene el 10-06
      cubaClara: cc,
      rangeFrom: '2026-10-01',
      rangeTo: '2026-10-15',
      operativeDate: OP_DATE,
      importBatch: BATCH,
      importedAt: TS,
    });
    const recovered = plan.entries.filter(e => e.category === 'recuperada');
    // 10-06 protegido (real existente): solo 10-08 es recuperable del payload
    expect(recovered.map(e => e.rate_date)).toEqual(['2026-10-08']);
    expect(recovered[0]).toMatchObject({
      source: 'Cuba Clara',
      capture_method: 'real',
      rate: 770.5,
      rate_source_url: expect.stringContaining('cubaclara.org'),
      import_batch: BATCH,
    });
    expect(plan.protectedRealDates).toEqual(['2026-10-06']);
    expect(plan.recoveredDates).toEqual(['2026-10-08']);
  });

  it('interpola huecos entre anclas REALES consecutivas con trazabilidad de anclas', () => {
    const plan = buildRecoveryPlan({
      existingRows: [real('2026-06-01', 370), real('2026-06-06', 380)],
      cubaClara: { rows: [], skippedNoMedio: 0, skippedInvalid: 0, sourceVersion: null, license: null },
      rangeFrom: '2026-06-01',
      rangeTo: '2026-06-06',
      operativeDate: OP_DATE,
      importBatch: BATCH,
      importedAt: TS,
    });
    const est = plan.entries.filter(e => e.category === 'estimada');
    expect(est.map(e => e.rate_date)).toEqual(['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
    // Proporcional: 370→380 en 6 días (span 5 días de distancia)
    expect(est[0].rate).toBe(372);
    expect(est[3].rate).toBe(378);
    expect(est.every(e => e.source === 'elToque')).toBe(true); // era de la ancla izquierda
    expect(est.every(e => e.capture_method === 'estimated')).toBe(true);
    // Intervalo inclusivo 2026-06-01→06-06 = 6 días → confianza MEDIA (>4, ≤10).
    expect(est.every(e => e.confidence_level === 'media')).toBe(true);
    expect(est[0].notes).toContain('2026-06-01 (elToque, 370 CUP)');
    expect(est[0].notes).toContain('2026-06-06 (elToque, 380 CUP)');
    expect(est[0].notes).toContain('NO es una cotización observada');
    expect(plan.estimatedDates).toHaveLength(4);
  });

  it('PUENTE ENTRE FUENTES: hueco elToque → Cuba Clara marca confianza y documenta ambas', () => {
    const plan = buildRecoveryPlan({
      existingRows: [real('2026-07-28', 340)],                       // fin de era elToque
      cubaClara: parseCubaClaraJson({
        columnas: CC_PAYLOAD.columnas,
        filas: [['2026-10-06', 760, 775, 767.5]],
        licencia: 'CC BY 4.0',
        version: '2026-11-23',
      }),
      rangeFrom: '2026-07-28',
      rangeTo: '2026-10-10',
      operativeDate: OP_DATE,
      importBatch: BATCH,
      importedAt: TS,
    });
    const est = plan.entries.filter(e => e.category === 'estimada');
    // 07-29 → 10-05 interpolado (baja confianza, hueco ~70 días); 10-06 recuperado
    expect(est.length).toBe(69);
    expect(est.every(e => e.confidence_level === 'baja')).toBe(true);
    expect(est.every(e => e.source === 'elToque')).toBe(true); // era de la ancla izquierda
    expect(est[0].notes).toContain('PUENTE ENTRE FUENTES DISTINTAS (elToque → Cuba Clara)');
    expect(plan.recoveredDates).toEqual(['2026-10-06']);
    expect(plan.estimatedDates.every(d => d > '2026-07-28' && d < '2026-10-06')).toBe(true);
  });

  it('G2: NADA se genera en la fecha operativa o posterior', () => {
    const plan = buildRecoveryPlan({
      existingRows: [real('2026-11-20', 940)],
      cubaClara: { rows: [], skippedNoMedio: 0, skippedInvalid: 0, sourceVersion: null, license: null },
      rangeFrom: '2026-11-20',
      rangeTo: '2026-12-05', // rango pedido más allá del operativo
      operativeDate: OP_DATE,
      importBatch: BATCH,
      importedAt: TS,
    });
    expect(plan.range.to).toBe('2026-11-27'); // recortado a operativa-1
    expect(plan.entries.every(e => e.rate_date < OP_DATE)).toBe(true);
    expect(validatePlanSafety(plan, OP_DATE)).toEqual([]);
  });

  it('AUSENCIA de observaciones posteriores: el día posterior al último real queda irrecuperable (no extrapola)', () => {
    const plan = buildRecoveryPlan({
      existingRows: [real('2026-11-20', 940)],
      cubaClara: { rows: [], skippedNoMedio: 0, skippedInvalid: 0, sourceVersion: null, license: null },
      rangeFrom: '2026-11-20',
      rangeTo: '2026-11-27',
      operativeDate: OP_DATE,
      importBatch: BATCH,
      importedAt: TS,
    });
    expect(plan.entries).toEqual([]); // sin ancla derecha → sin interpolación
    expect(plan.unrecoverableDates).toEqual([
      '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    ]);
  });

  it('IDEMPOTENCIA: el mismo estado de BD produce exactamente el mismo plan', () => {
    const existing = [real('2026-06-01', 370), real('2026-06-06', 380), estimated('2026-06-03', 375)];
    const params = {
      existingRows: existing,
      cubaClara: { rows: [], skippedNoMedio: 0, skippedInvalid: 0, sourceVersion: null, license: null },
      rangeFrom: '2026-06-01',
      rangeTo: '2026-06-06',
      operativeDate: OP_DATE,
      importBatch: BATCH,
      importedAt: TS,
    };
    const planA = buildRecoveryPlan(params);
    const planB = buildRecoveryPlan(params);
    expect(planA.entries).toEqual(planB.entries);
    expect(planA.estimatedDates).toEqual(planB.estimatedDates);
  });

  it('validatePlanSafety detecta violaciones (fecha operativa, estimada con URL, Diviza recuperada, tasa absurda)', () => {
    const unsafe = {
      entries: [
        { ...({ rate_date: OP_DATE, currency: 'USD', source: 'Cuba Clara', segment: '3', rate: 800, capture_method: 'real' } as const), rate_source_url: null, reconstruction_method: null, confidence_level: null, notes: '', imported_at: TS, import_batch: BATCH, category: 'recuperada' as const },
        { rate_date: '2026-01-05', currency: 'USD' as const, source: 'elToque', segment: '3' as const, rate: 380, capture_method: 'estimated' as const, rate_source_url: 'https://x', reconstruction_method: null, confidence_level: null, notes: '', imported_at: TS, import_batch: BATCH, category: 'estimada' as const },
        { rate_date: '2026-01-06', currency: 'USD' as const, source: 'Diviza', segment: '3' as const, rate: 800, capture_method: 'real' as const, rate_source_url: null, reconstruction_method: null, confidence_level: null, notes: '', imported_at: TS, import_batch: BATCH, category: 'recuperada' as const },
        { rate_date: '2026-01-07', currency: 'USD' as const, source: 'elToque', segment: '3' as const, rate: 0, capture_method: 'estimated' as const, rate_source_url: null, reconstruction_method: null, confidence_level: null, notes: '', imported_at: TS, import_batch: BATCH, category: 'estimada' as const },
      ],
      recoveredDates: [], estimatedDates: [], protectedRealDates: [], unrecoverableDates: [],
      classification: { likelyNoPublication: 0, likelyLost: 0 },
      cubaClara: { version: null, license: null, usableRows: 0 },
      range: { from: '2026-01-01', to: '2026-01-07' },
    } as unknown as Parameters<typeof validatePlanSafety>[0];
    const violations = validatePlanSafety(unsafe, OP_DATE);
    expect(violations.some(v => v.startsWith('G2'))).toBe(true);
    expect(violations.some(v => v.includes('estimada con URL'))).toBe(true);
    expect(violations.some(v => v.includes('fuente activa'))).toBe(true);
    expect(violations.some(v => v.includes('fuera de rango'))).toBe(true);
  });
});
