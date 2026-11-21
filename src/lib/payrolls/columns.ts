/**
 * Configuración de columnas del PDF de Nóminas SC-4-06 — capa de PRESENTACIÓN.
 *
 * REGLA CONTABLE FUNDAMENTAL (misión 2026-11-21): ocultar una columna es una
 * decisión de presentación. Este módulo NO recalcula importes ni aplica
 * fórmulas: solo (a) describe el orden/etiquetas de las columnas del
 * documento, (b) detecta qué columnas no aportan información para los
 * trabajadores evaluados (valores numéricos reales: 0, 0.00, null, vacío) y
 * (c) agrega totales del PIE sumando valores YA calculados por el SERVIDOR
 * por línea (sin fórmulas nuevas — cuando se imprime un subconjunto, el pie
 * refleja exclusivamente esas líneas).
 */

import type { PayrollItem } from './types';

/** Identificadores de columna del documento (orden del modelo SC-4-06). */
export type PayrollColumnId =
  | 'expediente'
  | 'nombres'
  | 'categoria'
  | 'salario_basico'
  | 'tiempo'
  | 'h_extras'
  | 'importe_extras'
  | 'compl_salario'
  | 'otros_haberes'
  | 'oblig_social'
  | 'total_devengado'
  | 'deducciones'
  | 'neto'
  | 'vacac_dias'
  | 'vacac_importe'
  | 'recibi_conforme';

/** Etiquetas para la UI de configuración (una por columna lógica). */
export const PAYROLL_COLUMN_LABELS: Record<PayrollColumnId, string> = {
  expediente: 'Exp. Lab.',
  nombres: 'Nombres y Apellidos',
  categoria: 'Categoría Ocupacional',
  salario_basico: 'Salario Básico (hora/día)',
  tiempo: 'Horas Regulares / Días Devengados',
  h_extras: 'H. Extras (h)',
  importe_extras: 'Importe Extras',
  compl_salario: 'Compl. Salario',
  otros_haberes: 'Otros Hab. (sigla)',
  oblig_social: 'Oblig. Social',
  total_devengado: 'Total Devengado',
  deducciones: 'Deducciones',
  neto: 'Neto a Cobrar',
  vacac_dias: 'Vacac. (días)',
  vacac_importe: 'Vacac. Importe',
  recibi_conforme: 'RECIBÍ CONFORME',
};

/**
 * Columnas SIEMPRE visibles (decisión de auditoría, misión REQ1.4/REQ3):
 * identidad de la fila, resultado del documento y firma por trabajador.
 * El checkbox correspondiente aparece bloqueado en la UI.
 */
export const PAYROLL_COLUMN_LOCKED: readonly PayrollColumnId[] = [
  'nombres',
  'neto',
  'recibi_conforme',
];

/** Configuración predeterminada: TODAS las columnas (compatibilidad con el documento actual). */
export const PAYROLL_COLUMNS_DEFAULT: readonly PayrollColumnId[] = [
  'expediente',
  'nombres',
  'categoria',
  'salario_basico',
  'tiempo',
  'h_extras',
  'importe_extras',
  'compl_salario',
  'otros_haberes',
  'oblig_social',
  'total_devengado',
  'deducciones',
  'neto',
  'vacac_dias',
  'vacac_importe',
  'recibi_conforme',
];

/**
 * Candidatas a «ocultar columnas sin datos»: cuando TODAS valen 0/vacío no
 * aportan información. NO incluye identidad ni resultados del cálculo
 * (salario básico, tiempo, total devengado, neto) — misión REQ1: «no ocultar
 * automáticamente información necesaria para identificar al trabajador o
 * comprender el resultado del documento».
 */
export const PAYROLL_AUTO_HIDE_CANDIDATES: readonly PayrollColumnId[] = [
  'expediente',
  'categoria',
  'h_extras',
  'importe_extras',
  'compl_salario',
  'otros_haberes',
  'oblig_social',
  'deducciones',
  'vacac_dias',
  'vacac_importe',
];

/** Firma de la columna «RECIBÍ CONFORME»: siempre última (requisito REQ3). */
export const PAYROLL_SIGNATURE_COLUMN: PayrollColumnId = 'recibi_conforme';

// ─────────────────────────────────────────────────────────────────────────────
// Hechos por línea (adapters) — SOLO para detección/orden; nada de esto se
// muestra ni se guarda: los importes contables siguen siendo del servidor.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayrollColumnFacts {
  expediente?: string | null;
  categoria?: string | null;
  regular_hours?: number | null;
  accrued_days?: number | null;
  overtime_hours?: number | null;
  overtime_amount?: number | null;
  vacation_days?: number | null;
  vacation_amount?: number | null;
  total_complementos?: number | null;
  total_other_earnings?: number | null;
  /** Siglas de conceptos «otro_haber» (texto con contenido ⇒ columna con info). */
  other_siglas?: string[];
  total_social_security?: number | null;
  total_deductions?: number | null;
}

/** Adapter desde la línea PERSISTIDA (servidor). */
export function factsFromItem(it: PayrollItem): PayrollColumnFacts {
  const siglas = (it.concepts ?? [])
    .filter((c) => c.kind === 'otro_haber' && (c.sigla ?? '').trim() !== '')
    .map((c) => c.sigla);
  return {
    expediente: it.expediente_laboral,
    categoria: it.categoria_ocupacional,
    regular_hours: it.regular_hours,
    accrued_days: it.accrued_days,
    overtime_hours: it.overtime_hours,
    overtime_amount: it.overtime_amount,
    vacation_days: it.vacation_days,
    vacation_amount: it.vacation_amount,
    total_complementos: it.total_complementos,
    total_other_earnings: it.total_other_earnings,
    other_siglas: siglas,
    total_social_security: it.total_social_security,
    total_deductions: it.total_deductions,
  };
}

/** Entrada genérica de concepto (editor cliente — solo clases/cantidades). */
export interface ConceptLike {
  kind: string;
  sigla?: string;
  amount?: number;
}

/**
 * Adapter desde la LÍNEA DEL EDITOR (confección). Los agregados por clase se
 * suman SOLO para decidir si la columna tiene contenido — no se presentan ni
 * sustituyen a los totales del servidor. Los campos numéricos aceptan null y
 * texto numérico (inputs/patchs del editor pueden enviarlos — toNumber normaliza
 * «0.00», null y vacío a cero: requisito «evaluar valores numéricos reales»).
 */
export function factsFromEditorLine(
  line: {
    regular_hours?: number | string | null;
    accrued_days?: number | string | null;
    overtime_hours?: number | string | null;
    overtime_amount?: number | string | null;
    vacation_days?: number | string | null;
    vacation_amount?: number | string | null;
    expediente_laboral?: string | null;
    categoria_ocupacional?: string | null;
    concepts?: ConceptLike[];
  },
): PayrollColumnFacts {
  let compl = 0;
  let otros = 0;
  let social = 0;
  let deduc = 0;
  const siglas: string[] = [];
  for (const c of line.concepts ?? []) {
    const a = toNumber(c.amount);
    if (c.kind === 'complemento') compl += a;
    else if (c.kind === 'otro_haber') {
      otros += a;
      if ((c.sigla ?? '').trim() !== '') siglas.push(c.sigla!.trim());
    } else if (c.kind === 'obligacion_social') social += a;
    else if (c.kind === 'deduccion') deduc += a;
  }
  return {
    expediente: line.expediente_laboral,
    categoria: line.categoria_ocupacional,
    // Normaliza texto numérico/null/vacío a número (solo detección).
    regular_hours: toNumber(line.regular_hours),
    accrued_days: toNumber(line.accrued_days),
    overtime_hours: toNumber(line.overtime_hours),
    overtime_amount: toNumber(line.overtime_amount),
    vacation_days: toNumber(line.vacation_days),
    vacation_amount: toNumber(line.vacation_amount),
    total_complementos: compl,
    total_other_earnings: otros,
    other_siglas: siglas,
    total_social_security: social,
    total_deductions: deduc,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección de columnas sin información (valores numéricos REALES)
// ─────────────────────────────────────────────────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function isEmptyText(v: string | null | undefined): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

/** ¿La columna no aporta información para estos trabajadores? (REQ1, misión §3) */
export function columnHasNoData(col: PayrollColumnId, facts: PayrollColumnFacts[]): boolean {
  if (facts.length === 0) return false; // sin trabajadores no se oculta nada
  const everyZero = (pick: (f: PayrollColumnFacts) => number | null | undefined) =>
    facts.every((f) => toNumber(pick(f)) === 0);
  switch (col) {
    case 'expediente':
      return facts.every((f) => isEmptyText(f.expediente));
    case 'categoria':
      return facts.every((f) => isEmptyText(f.categoria));
    case 'h_extras':
      return everyZero((f) => f.overtime_hours);
    case 'importe_extras':
      return everyZero((f) => f.overtime_amount);
    case 'compl_salario':
      return everyZero((f) => f.total_complementos);
    case 'otros_haberes':
      return (
        everyZero((f) => f.total_other_earnings) &&
        facts.every((f) => (f.other_siglas ?? []).length === 0)
      );
    case 'oblig_social':
      return everyZero((f) => f.total_social_security);
    case 'deducciones':
      return everyZero((f) => f.total_deductions);
    case 'vacac_dias':
      return everyZero((f) => f.vacation_days);
    case 'vacac_importe':
      return everyZero((f) => f.vacation_amount);
    // Identidad / comprensión del resultado / firma: JAMÁS candidatas.
    case 'nombres':
    case 'salario_basico':
    case 'tiempo':
    case 'total_devengado':
    case 'neto':
    case 'recibi_conforme':
      return false;
    default:
      return false;
  }
}

/**
 * «Ocultar columnas sin datos»: candidatas visibles sin contenido para el
 * conjunto de trabajadores evaluados (los INCLUIDOS en el PDF).
 */
export function detectEmptyColumns(facts: PayrollColumnFacts[]): PayrollColumnId[] {
  return PAYROLL_AUTO_HIDE_CANDIDATES.filter((c) => columnHasNoData(c, facts));
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuración validada + persistencia local (preferencia de presentación)
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'costpro:payroll-pdf-columns:v1';

/**
 * Normaliza un arreglo arbitrario a una configuración válida: solo ids
 * conocidos, sin duplicados, SIEMPRE incluye las bloqueadas y la firma al
 * final. Orden canónico del modelo SC-4-06.
 */
export function normalizeColumnConfig(input: unknown): PayrollColumnId[] {
  const raw = Array.isArray(input) ? (input as unknown[]) : [];
  const valid = new Set(PAYROLL_COLUMNS_DEFAULT);
  const seen = new Set<PayrollColumnId>();
  for (const v of raw) {
    if (typeof v === 'string' && valid.has(v as PayrollColumnId) && !seen.has(v as PayrollColumnId)) {
      seen.add(v as PayrollColumnId);
    }
  }
  for (const locked of PAYROLL_COLUMN_LOCKED) seen.add(locked);
  return PAYROLL_COLUMNS_DEFAULT.filter((c) => seen.has(c));
}

/** Lee la preferencia persistida (tolerante a JSON corrupto o versiones viejas). */
export function loadColumnConfig(storage: Pick<Storage, 'getItem'> | null | undefined): PayrollColumnId[] {
  try {
    const raw = storage?.getItem(LS_KEY) ?? null;
    if (!raw) return [...PAYROLL_COLUMNS_DEFAULT];
    return normalizeColumnConfig(JSON.parse(raw));
  } catch {
    return [...PAYROLL_COLUMNS_DEFAULT];
  }
}

/** Guarda la preferencia (best-effort; modo privado → silencioso). */
export function saveColumnConfig(storage: Pick<Storage, 'setItem'> | null | undefined, config: PayrollColumnId[]): void {
  try {
    storage?.setItem(LS_KEY, JSON.stringify(normalizeColumnConfig(config)));
  } catch {
    // preferencia no persistida: la sesión funciona igual
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregación de totales para el PIE — SOLO cuando se imprime un subconjunto.
// Suma valores YA calculados por el SERVIDOR por línea (acumulación en centavos
// para evitar deriva de punto flotante); SIN fórmulas nuevas.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayrollSubsetTotals {
  total_workers: number;
  total_regular_hours: number;
  total_accrued_days: number;
  total_overtime_hours: number;
  total_overtime: number;
  total_complementos: number;
  total_other_earnings: number;
  total_social_security: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_vacation_days: number;
  total_vacation_amount: number;
}

const roundCents = (cents: number): number => Math.round(cents) / 100;

export function aggregateSubsetTotals(items: PayrollItem[]): PayrollSubsetTotals {
  const cents = {
    hours: 0, days: 0, otHours: 0, otAmount: 0, compl: 0, otros: 0, social: 0,
    gross: 0, deduc: 0, net: 0, vacDays: 0, vacAmount: 0,
  };
  const q = (v: number | null | undefined) => Math.round(toNumber(v) * 100);
  for (const it of items) {
    cents.hours += q(it.regular_hours);
    cents.days += q(it.accrued_days);
    cents.otHours += q(it.overtime_hours);
    cents.otAmount += q(it.overtime_amount);
    cents.compl += q(it.total_complementos);
    cents.otros += q(it.total_other_earnings);
    cents.social += q(it.total_social_security);
    cents.gross += q(it.total_gross);
    cents.deduc += q(it.total_deductions);
    cents.net += q(it.total_net);
    cents.vacDays += q(it.vacation_days);
    cents.vacAmount += q(it.vacation_amount);
  }
  return {
    total_workers: items.length,
    total_regular_hours: roundCents(cents.hours),
    total_accrued_days: roundCents(cents.days),
    total_overtime_hours: roundCents(cents.otHours),
    total_overtime: roundCents(cents.otAmount),
    total_complementos: roundCents(cents.compl),
    total_other_earnings: roundCents(cents.otros),
    total_social_security: roundCents(cents.social),
    total_gross: roundCents(cents.gross),
    total_deductions: roundCents(cents.deduc),
    total_net: roundCents(cents.net),
    total_vacation_days: roundCents(cents.vacDays),
    total_vacation_amount: roundCents(cents.vacAmount),
  };
}
