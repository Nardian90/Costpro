/**
 * fx-recovery.ts — Mecanismo de recuperación y reconstrucción de la serie
 * informal USD (CP-FX-PREMIUM-DASHBOARD-AND-HISTORICAL-DATA-RECOVERY-001).
 *
 * MISIÓN CP-FX-001 (2026-11-28) FASE 3/4: la serie informal de Inteligencia
 * Cambiaria tiene 138 días sin dato (auditoría sobre exchange_rates):
 *   - Zona muerta 2026-07-29 → 2026-10-24 (88 días): solucionescuba.com
 *     caído y Diviza aún sin capturar.
 *   - ~50 días sueltos en la era elToque (2025-12-25 → 2026-07-28).
 *
 * JERARQUÍA DE RECUPERACIÓN (misión §4.1 — orden obligatorio):
 *   1. Cotización histórica ORIGINAL de la fuente primaria (misma serie).
 *   2. Cotización histórica VERIFICABLE de una fuente compatible
 *      (Cuba Clara «Dólar en la calle», mediana propia, CC BY 4.0).
 *   3. ESTIMACIÓN estadística identificada expresamente
 *      (interpolación lineal entre dos observaciones verificadas).
 *   4. Arrastre del último valor conocido — YA implementado por la capa de
 *      consulta (filas virtuales capture_method='carry_forward' de fuentes
 *      activas en /api/exchange-rates); este módulo NO crea arrastres.
 *
 * GARANTÍAS (misión §4/§7):
 *   - NUNCA sobrescribe una observación real existente (capture_method='real'
 *     de CUALQUIER fuente): los días con observación real se saltan.
 *   - NUNCA genera estimaciones para la fecha operativa o posteriores: la
 *     vigencia queda reservada a capturas reales de la fuente activa.
 *   - Cada fila recuperada/estimada lleva trazabilidad completa: fuente,
 *     URL de referencia, método, nivel de confianza, notas con anclas,
 *     lote de importación (idempotencia + reversión quirúrgica por lote).
 *   - Las estimaciones atribuyen source a la era de la ancla izquierda y
 *     usan capture_method='estimated' — la app las excluye de la vigencia.
 *   - Idempotente: re-ejecutar el mismo plan produce el mismo resultado
 *     sin duplicar (clave natural rate_date+currency+source+segment).
 *
 * Módulo PURO: sin I/O, sin dependencias de Supabase — consumido por la
 * ruta /api/exchange-rates/recover (dry-run/apply) y por el canal gobernado
 * scripts/fx-apply-recovery.mjs (respaldo + apply + verificación).
 */

/** Nivel de confianza de una estimación, según el tamaño del hueco. */
export type ConfidenceLevel = 'alta' | 'media' | 'baja';

/** Método de reconstrucción soportado. */
export type ReconstructionMethod = 'interpolacion_lineal';

/** Categoría funcional de cada entrada del plan (misión §4.4). */
export type RecoveryCategory = 'recuperada' | 'estimada';

/** Rango de validez de una tasa informal CUP (mismo criterio del scraper Diviza). */
const MIN_RATE = 1;
const MAX_RATE = 100_000;

/** Suelo de sanidad para estimaciones (una interpolación entre reales válidas). */
const MIN_ESTIMATED_SANITY = 1;

/** URL pública de la serie de Cuba Clara (referencia y auditoría). */
export const CUBA_CLARA_SERIES_URL =
  'https://cubaclara.org/datos/dolar-cuba-clara.csv';

/** Citación exigida por la licencia CC BY 4.0 de Cuba Clara. */
export const CUBA_CLARA_CITATION =
  'Cuba Clara (2026), «Dólar en la calle (Cuba Clara)», https://cubaclara.org/datos/, CC BY 4.0. ' +
  'Metodología: mediana de ofertas de compra y venta de particulares; columna «medio» (punto medio oficial Cuba Clara).';

/** Umbral de hueco (días) por nivel de confianza. */
export const CONFIDENCE_THRESHOLD_HIGH_DAYS = 4;
export const CONFIDENCE_THRESHOLD_MEDIUM_DAYS = 10;

/** Redondeo canónico al centavo (la columna rate es NUMERIC(10,2)). */
export function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tasa válida: numérica, finita y dentro del rango plausible del mercado informal. */
export function isValidInformalRate(raw: unknown): raw is number {
  return (
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    raw >= MIN_RATE &&
    raw <= MAX_RATE
  );
}

/** Fecha ISO YYYY-MM-DD válida (formato estricto, sin horas). */
export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Día siguiente a una fecha ISO (calendario, sin zonas horarias). */
export function nextIsoDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Restar N días a una fecha ISO (calendario). */
export function subtractIsoDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Lista de fechas ISO del intervalo [from, to] INCLUSIVO (calendario). */
export function isoDateRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return out;
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = nextIsoDate(cur);
  }
  return out;
}

/** ¿Es fin de semana (sábado o domingo) en fecha ISO? Contexto: días sin publicación. */
export function isWeekendIso(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

// ════════════════════════════════════════════════════════════════════
// 1) PARSER de la serie «Dólar en la calle (Cuba Clara)»
// ════════════════════════════════════════════════════════════════════

/** Fila usable de Cuba Clara: fecha + punto medio oficial de la fuente. */
export interface CubaClaraRow {
  date: string;
  /** Punto medio oficial Cuba Clara (compra-venta) en CUP. */
  medio: number;
  /** Metadatos opcionales para auditoría. */
  compra: number | null;
  venta: number | null;
}

export interface ParsedCubaClara {
  rows: CubaClaraRow[];
  /** Días con fila pero sin «medio» (solo compra o venta): NO se fabrican. */
  skippedNoMedio: number;
  /** Días descartados por fecha/rate inválido. */
  skippedInvalid: number;
  /** Metadatos declarados por el JSON de Cuba Clara (auditoría). */
  sourceVersion: string | null;
  license: string | null;
}

/**
 * Parsea el JSON público de Cuba Clara (https://cubaclara.org/datos/dolar-cuba-clara.json).
 * Estructura verificada: { columnas:[...], filas:[[fecha, compra, venta, medio], ...],
 * fuente:{nombre,url,licencia}, licencia, version, ... }.
 *
 * Reglas (misión: no fabricar datos):
 *   - Solo filas con `medio` numérico válido: es la cifra que da Cuba Clara.
 *     Días con solo compra/venta (sin medio) se CUENTAN como skippedNoMedio —
 *     no se usa un lado de la mediana como si fuera la serie completa.
 *   - Fechas no ISO o tasas fuera de rango → skippedInvalid (sin lanzar).
 */
export function parseCubaClaraJson(raw: unknown): ParsedCubaClara {
  const rows: CubaClaraRow[] = [];
  let skippedNoMedio = 0;
  let skippedInvalid = 0;

  if (raw == null || typeof raw !== 'object') {
    return { rows, skippedNoMedio, skippedInvalid, sourceVersion: null, license: null };
  }
  const data = raw as Record<string, unknown>;
  const filas = Array.isArray(data.filas) ? (data.filas as unknown[]) : [];
  // La tabla /datos/ declara: fecha, compra, venta, medio (columnas 0-3).
  const colIndex = (() => {
    const cols = Array.isArray(data.columnas) ? (data.columnas as Array<Record<string, unknown>>) : [];
    const find = (id: string) => cols.findIndex(c => c?.id === id);
    return { fecha: find('fecha'), compra: find('compra'), venta: find('venta'), medio: find('medio') };
  })();

  for (const fila of filas) {
    if (!Array.isArray(fila)) { skippedInvalid++; continue; }
    const fIdx = colIndex.fecha >= 0 ? colIndex.fecha : 0;
    const mIdx = colIndex.medio >= 0 ? colIndex.medio : 3;
    const cIdx = colIndex.compra >= 0 ? colIndex.compra : 1;
    const vIdx = colIndex.venta >= 0 ? colIndex.venta : 2;
    const date = fila[fIdx];
    if (!isIsoDate(date)) { skippedInvalid++; continue; }
    const medioRaw = fila[mIdx];
    const compraRaw = fila[cIdx];
    const ventaRaw = fila[vIdx];
    if (medioRaw == null || medioRaw === '') { skippedNoMedio++; continue; }
    const medio = typeof medioRaw === 'string' ? Number(medioRaw.replace(',', '.')) : medioRaw;
    if (!isValidInformalRate(medio)) { skippedInvalid++; continue; }
    const num = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
      return isValidInformalRate(n) ? n : null;
    };
    rows.push({ date, medio: roundRate(medio), compra: num(compraRaw), venta: num(ventaRaw) });
  }

  const fuente = (data.fuente ?? null) as Record<string, unknown> | null;
  return {
    rows,
    skippedNoMedio,
    skippedInvalid,
    sourceVersion: typeof data.version === 'string' ? data.version : null,
    license: (typeof data.licencia === 'string' ? data.licencia : null) ?? (typeof fuente?.licencia === 'string' ? (fuente.licencia as string) : null),
  };
}

// ════════════════════════════════════════════════════════════════════
// 2) HUECOS de la serie unificada
// ════════════════════════════════════════════════════════════════════

/** Fila mínima de exchange_rates que el plan necesita (respuesta de la API). */
export interface ExistingRateRowLike {
  rate_date: string;
  currency: string;
  source: string;
  segment?: string | null;
  rate: number;
  capture_method?: string | null;
}

/**
 * Fechas del intervalo [from, to] SIN ninguna observación REAL informal
 * (capture_method='real', cualquier fuente informal). Los días con
 * estimados previos u otros registros NO reales se consideran faltantes:
 * el plan los reconstruye sobre la serie de observaciones verificadas.
 */
export function computeMissingInformalDays(
  existingRows: ExistingRateRowLike[],
  from: string,
  to: string,
  currency = 'USD',
): string[] {
  const realDates = new Set(
    existingRows
      .filter(
        r =>
          r.currency === currency &&
          r.source !== 'BCC' &&
          (r.capture_method ?? '') === 'real' &&
          r.rate_date >= from &&
          r.rate_date <= to,
      )
      .map(r => r.rate_date),
  );
  return isoDateRange(from, to).filter(d => !realDates.has(d));
}

/** Clasificación de los días sin dato (misión §2.1: sin publicación vs perdidos). */
export function classifyGapDays(missing: string[]): {
  likelyNoPublication: string[];
  likelyLost: string[];
} {
  const likelyNoPublication = missing.filter(isWeekendIso);
  const likelyLost = missing.filter(d => !isWeekendIso(d));
  return { likelyNoPublication, likelyLost };
}

// ════════════════════════════════════════════════════════════════════
// 3) INTERPOLACIÓN lineal con nivel de confianza
// ════════════════════════════════════════════════════════════════════

/** Ancla verificada para interpolación. */
export interface InterpolationAnchor {
  date: string;
  rate: number;
  source: string;
}

export interface InterpolatedPoint {
  date: string;
  rate: number;
  confidence: ConfidenceLevel;
  method: ReconstructionMethod;
}

/**
 * Confianza por tamaño del hueco (días totales entre anclas, incluidas):
 *   ≤ 4  → 'alta'  (puente típico fin de semana / festivo aislado)
 *   ≤ 10 → 'media' (semestre de capturas perdidas cortas)
 *   > 10 → 'baja'  (zona muerta larga: la tendencia real pudo desviarse)
 */
export function confidenceForGap(gapDaysInclusive: number): ConfidenceLevel {
  if (gapDaysInclusive <= CONFIDENCE_THRESHOLD_HIGH_DAYS) return 'alta';
  if (gapDaysInclusive <= CONFIDENCE_THRESHOLD_MEDIUM_DAYS) return 'media';
  return 'baja';
}

/**
 * Interpola linealmente entre dos anclas verificadas para las fechas
 * intermedias (exclusivas entre anclas; las fechas deben ser posteriores a
 * `from.date` y anteriores a `to.date`). Redondeo al centavo.
 */
export function interpolateLinear(
  from: InterpolationAnchor,
  to: InterpolationAnchor,
  dates: string[],
): InterpolatedPoint[] {
  const gapDays = Math.round(
    (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  const confidence = confidenceForGap(gapDays);
  const span = Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`);
  return dates
    .filter(d => d > from.date && d < to.date)
    .sort((a, b) => a.localeCompare(b))
    .map(date => {
      const t = span > 0 ? (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / span : 0;
      const rate = from.rate + (to.rate - from.rate) * t;
      return { date, rate: roundRate(rate), confidence, method: 'interpolacion_lineal' as const };
    });
}

// ════════════════════════════════════════════════════════════════════
// 4) PLAN de recuperación (jerarquía §4.1 + guardas §7)
// ════════════════════════════════════════════════════════════════════

/** Entrada lista para upsert en exchange_rates (clave natural implícita). */
export interface RecoveryPlanEntry {
  rate_date: string;
  currency: 'USD';
  source: string;
  segment: '3';
  rate: number;
  capture_method: 'real' | 'estimated';
  /** Trazabilidad (columnas CP-FX-001). */
  rate_source_url: string | null;
  reconstruction_method: ReconstructionMethod | null;
  confidence_level: ConfidenceLevel | null;
  notes: string;
  imported_at: string;
  import_batch: string;
  /** Categoría funcional (informe/UI). */
  category: RecoveryCategory;
}

export interface RecoveryPlan {
  /** Filas a escribir (recuperadas primero, luego estimadas; orden por fecha). */
  entries: RecoveryPlanEntry[];
  /** Días recuperados con cotización verificable de fuente compatible. */
  recoveredDates: string[];
  /** Días reconstruidos por interpolación (estimados). */
  estimatedDates: string[];
  /** Días con observación real existente — intocables (guarda). */
  protectedRealDates: string[];
  /** Días sin dato dentro del rango que NO se reconstruyen (sin anclas). */
  unrecoverableDates: string[];
  /** Clasificación días sin publicación (fin de semana) vs perdidos. */
  classification: { likelyNoPublication: number; likelyLost: number };
  /** Metadatos de la fuente recuperada. */
  cubaClara: { version: string | null; license: string | null; usableRows: number };
  /** Intervalo procesado. */
  range: { from: string; to: string };
}

export interface BuildRecoveryPlanParams {
  /** Filas informales existentes en BD (cualquier fuente, capture_method real/estimated). */
  existingRows: ExistingRateRowLike[];
  /** Serie Cuba Clara ya parseada (parseCubaClaraJson). */
  cubaClara: ParsedCubaClara;
  /** Intervalo INCLUSIVO a procesar (normalmente primer dato real → día anterior al operativo). */
  rangeFrom: string;
  rangeTo: string;
  /** Fecha operativa (civil de Cuba) — límite duro: NADA se crea >= este día. */
  operativeDate: string;
  /** Identificador del lote de importación (idempotencia/reversión). */
  importBatch: string;
  /** Marca temporal ISO de la importación. */
  importedAt: string;
  currency?: 'USD';
}

/**
 * Construye el plan de recuperación con las guardas de la misión:
 *   G1. NUNCA toca fechas con observación real de cualquier fuente informal.
 *   G2. NUNCA genera filas con rate_date >= operativeDate.
 *   G3. Solo recupera filas Cuba Clara con `medio` válido y dentro del rango.
 *   G4. Solo interpola entre anclas REALES consecutivas de la serie unificada
 *       (incluidas las recuperadas de Cuba Clara en este mismo plan).
 *   G5. Si un hueco carece de anclas (extremos del rango), queda documentado
 *       como irrecuperable — no se extrapola fuera de las observaciones.
 */
export function buildRecoveryPlan(params: BuildRecoveryPlanParams): RecoveryPlan {
  const {
    existingRows,
    cubaClara,
    rangeFrom,
    rangeTo,
    operativeDate,
    importBatch,
    importedAt,
    currency = 'USD',
  } = params;

  // G2: el rango efectivo nunca alcanza la fecha operativa.
  const effectiveTo = rangeTo < operativeDate ? rangeTo : subtractIsoDays(operativeDate, 1);
  const range: { from: string; to: string } = { from: rangeFrom, to: effectiveTo };

  // Observaciones REALES existentes (unificadas) dentro del rango — intocables (G1).
  const existingRealByDate = new Map<string, ExistingRateRowLike>();
  const existingRealCubaClaraKeys = new Set<string>();
  const protectedRealDates = new Set<string>();
  for (const r of existingRows) {
    if (r.currency !== currency || r.source === 'BCC') continue;
    if ((r.capture_method ?? '') !== 'real') continue;
    if (r.rate_date < range.from || r.rate_date > range.to) continue;
    protectedRealDates.add(r.rate_date);
    if (!existingRealByDate.has(r.rate_date)) existingRealByDate.set(r.rate_date, r);
    if (r.source === 'Cuba Clara') existingRealCubaClaraKeys.add(r.rate_date);
  }

  const entries: RecoveryPlanEntry[] = [];
  const recoveredDates: string[] = [];

  // ── JERARQUÍA 2: cotizaciones verificables de Cuba Clara (fuente compatible) ──
  const recoveredByDate = new Map<string, CubaClaraRow>();
  for (const row of cubaClara.rows) {
    if (row.date < range.from || row.date > range.to) continue;
    if (protectedRealDates.has(row.date)) continue; // G1: ya hay observación real
    if (existingRealCubaClaraKeys.has(row.date)) continue; // idempotencia
    recoveredByDate.set(row.date, row);
    recoveredDates.push(row.date);
    const metaBits = [
      `compra=${row.compra ?? '—'}`,
      `venta=${row.venta ?? '—'}`,
      cubaClara.sourceVersion ? `versión=${cubaClara.sourceVersion}` : null,
    ].filter(Boolean).join(' · ');
    entries.push({
      rate_date: row.date,
      currency,
      source: 'Cuba Clara',
      segment: '3',
      rate: row.medio,
      capture_method: 'real',
      rate_source_url: CUBA_CLARA_SERIES_URL,
      reconstruction_method: null,
      confidence_level: null,
      notes: `${CUBA_CLARA_CITATION}${metaBits ? ` (${metaBits})` : ''}`,
      imported_at: importedAt,
      import_batch: importBatch,
      category: 'recuperada',
    });
  }

  // ── JERARQUÍA 3: interpolación entre observaciones verificadas consecutivas ──
  // Serie unificada de anclas REALES: las existentes en BD + las recuperadas aquí.
  const anchorDates = [...protectedRealDates, ...recoveredDates].sort((a, b) => a.localeCompare(b));
  const anchorByDate = new Map<string, InterpolationAnchor>();
  for (const d of anchorDates) {
    const recovered = recoveredByDate.get(d);
    if (recovered) {
      anchorByDate.set(d, { date: d, rate: recovered.medio, source: 'Cuba Clara' });
    } else {
      const existing = existingRealByDate.get(d);
      if (existing) {
        anchorByDate.set(d, { date: d, rate: existing.rate, source: existing.source });
      }
    }
  }
  const anchors = [...anchorByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const missingDays = computeMissingInformalDays(existingRows, range.from, range.to, currency);
  const estimatedDates: string[] = [];
  const interpolatedPoints = new Map<string, InterpolatedPoint>();

  for (let i = 1; i < anchors.length; i++) {
    const left = anchors[i - 1];
    const right = anchors[i];
    const inGap = missingDays.filter(d => d > left.date && d < right.date);
    if (inGap.length === 0) continue;
    const points = interpolateLinear(left, right, inGap);
    for (const p of points) {
      interpolatedPoints.set(p.date, p);
      estimatedDates.push(p.date);
    }
  }

  // Atribución de fuente por era: la ancla IZQUIERDA determina la serie a la
  // que pertenece el tramo interpolado; el `notes` documenta AMBAS anclas
  // (misión §3: no mezclar metodologías sin declararlo).
  const anchorOf = (date: string): { left: InterpolationAnchor; right: InterpolationAnchor } | null => {
    for (let i = 1; i < anchors.length; i++) {
      if (date > anchors[i - 1].date && date < anchors[i].date) {
        return { left: anchors[i - 1], right: anchors[i] };
      }
    }
    return null;
  };

  for (const date of estimatedDates) {
    const point = interpolatedPoints.get(date);
    if (!point) continue;
    const anchorsOfGap = anchorOf(date);
    const left = anchorsOfGap?.left;
    const right = anchorsOfGap?.right;
    const eraSource = left?.source ?? 'elToque';
    const crossSource = left && right && left.source !== right.source;
    const anchorNotes =
      left && right
        ? `Interpolación lineal entre ${left.date} (${left.source}, ${left.rate} CUP) y ${right.date} (${right.source}, ${right.rate} CUP).` +
          (crossSource ? ` PUENTE ENTRE FUENTES DISTINTAS (${left.source} → ${right.source}): confianza baja por diseño.` : '')
        : 'Interpolación lineal.';
    entries.push({
      rate_date: date,
      currency,
      source: eraSource,
      segment: '3',
      rate: point.rate,
      capture_method: 'estimated',
      rate_source_url: null,
      reconstruction_method: point.method,
      confidence_level: point.confidence,
      notes: `${anchorNotes} Nivel de confianza: ${point.confidence}. NO es una cotización observada del mercado.`,
      imported_at: importedAt,
      import_batch: importBatch,
      category: 'estimada',
    });
    // Si ya existía una fila estimated previa de un plan anterior, el upsert
    // merge la refresca (idempotente: mismo plan → mismo valor, nunca duplica).
  }

  // Huecos sin reconstrucción: sin anclas a uno o ambos lados (extremos del rango).
  const reconstructedSet = new Set([...recoveredDates, ...estimatedDates]);
  const unrecoverableDates = missingDays.filter(d => !reconstructedSet.has(d));

  const classification = classifyGapDays(missingDays);

  entries.sort((a, b) =>
    a.category === b.category
      ? a.rate_date.localeCompare(b.rate_date)
      : a.category === 'recuperada'
        ? -1
        : 1,
  );

  return {
    entries,
    recoveredDates: recoveredDates.sort((a, b) => a.localeCompare(b)),
    estimatedDates: estimatedDates.sort((a, b) => a.localeCompare(b)),
    protectedRealDates: [...protectedRealDates].sort((a, b) => a.localeCompare(b)),
    unrecoverableDates,
    classification: {
      likelyNoPublication: classification.likelyNoPublication.length,
      likelyLost: classification.likelyLost.length,
    },
    cubaClara: {
      version: cubaClara.sourceVersion,
      license: cubaClara.license,
      usableRows: cubaClara.rows.length,
    },
    range,
  };
}

/**
 * Guarda defensiva para consumo externo (route/script): verifica que ninguna
 * entrada del plan viole las reglas de la misión ANTES de escribir en BD.
 * Devuelve la lista de violaciones (vacía = plan seguro).
 */
export function validatePlanSafety(
  plan: RecoveryPlan,
  operativeDate: string,
): string[] {
  const violations: string[] = [];
  for (const e of plan.entries) {
    if (e.rate_date >= operativeDate) {
      violations.push(`G2: entrada ${e.rate_date} ≥ fecha operativa ${operativeDate}`);
    }
    if (e.capture_method === 'estimated' && e.rate_source_url) {
      // una estimación nunca se presenta como observación de la fuente
      violations.push(`estimada con URL de fuente ${e.rate_date}`);
    }
    if (e.capture_method === 'real' && e.source === 'Diviza') {
      // La recuperación JAMÁS registra observaciones de la fuente ACTIVA:
      // Diviza solo publica la tasa vigente (cron/refresh), sin serie histórica.
      violations.push(`recuperada atribuida a la fuente activa ${e.rate_date}`);
    }
    if (e.capture_method === 'estimated' && e.rate < MIN_ESTIMATED_SANITY) {
      // (defensa extra) una estimación nunca debe colapsar a valores absurdos
      violations.push(`estimada fuera de sanidad ${e.rate_date} (${e.rate})`);
    }
    if (!isValidInformalRate(e.rate)) {
      violations.push(`tasa fuera de rango ${e.rate_date} (${e.rate})`);
    }
  }
  return violations;
}
