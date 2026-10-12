'use client';

/**
 * cash-report-core.ts — Fuente única de lógica pura y persistencia del
 * Reporte de Caja — Entrega (CAMBIO 2026-10: vista dedicada CashReportView).
 *
 * Extrae del antiguo CashReportModal (eliminado) las piezas reutilizables y
 * añade las capacidades nuevas con paridad CUP/USD:
 *   - Catálogos de denominaciones (CUP incluye 2000 y 5000).
 *   - Denominaciones personalizadas por moneda con validación.
 *   - Persistencia versionada de la plantilla PDF y de denominaciones.
 *   - Helpers contables PUROS (subtotal, total contado, esperado por moneda)
 *     que NO alteran reglas: el esperado CUP sigue viniendo de la API
 *     (cash_balance_cup) y el esperado USD replica client-side la misma
 *     fórmula (ventas cash + producción cash − pagos cash − comisiones cash),
 *     sin conversión cambiaria ni reglas nuevas.
 *
 * Nada de React aquí: todo es testeable sin montar componentes.
 */

import type { CashReport } from '@/types';

// ── Plantillas PDF ──────────────────────────────────────────────────────────
export type PdfTemplate = 'estandar' | 'simple' | 'diario';

export const TEMPLATES: { id: PdfTemplate; label: string; desc: string }[] = [
  { id: 'estandar', label: 'Estándar', desc: 'Cuadre CUP+USD con desglose de billetes' },
  { id: 'simple', label: 'Simple', desc: 'Resumen básico sin desglose' },
  { id: 'diario', label: 'Diario (Empresa)', desc: 'Plantilla estilo reporte diario: 3 páginas (CUP/USD/Órdenes) con tabla por producto + desglose billetes + firmas Hecho/Entregado/Recibido por' },
];

export const DEFAULT_PDF_TEMPLATE: PdfTemplate = 'estandar';

/** Valida un valor almacenado contra los ids canónicos; si no es válido devuelve el default sin lanzar error. */
export function validatePdfTemplate(raw: unknown): PdfTemplate {
  return typeof raw === 'string' && TEMPLATES.some(t => t.id === raw)
    ? (raw as PdfTemplate)
    : DEFAULT_PDF_TEMPLATE;
}

// ── Denominaciones ──────────────────────────────────────────────────────────
/** CUP: billetes/monedas vigentes del catálogo por defecto (incluye 2000 y 5000, CAMBIO 2026-10 §5.2). */
export const CUP_DEFAULT_DENOMS = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1];
/** USD: denominaciones por defecto. */
export const USD_DEFAULT_DENOMS = [100, 50, 20, 10, 5, 1];

export type Currency = 'CUP' | 'USD';

/** Claves legacy del modal (se conservan para no perder datos del usuario). */
export const LS_KEYS = {
  deliveredBy: 'costpro_cash_delivered_by',
  recipient: 'costpro_cash_recipient',
  cupDenoms: 'costpro_cash_denoms_cup',
  history: 'costpro_cash_breakdown_history',
  /** Nueva: plantilla PDF (CAMBIO 2026-10 §3). Alcance GLOBAL: la plantilla es
   *  una preferencia de formato del documento, no depende de la tienda activa
   *  (los datos del reporte sí se piden por tienda). Coherente con
   *  deliveredBy/recipient, que ya eran globales en el modal. */
  pdfTemplate: 'costpro:cash-report:template',
  /** Nueva v1: denominaciones personalizadas por moneda. */
  customDenoms: 'costpro:cash-report:custom-denoms:v1',
  /** Nueva v1: denominaciones activadas de USD (paridad con la clave legacy CUP). */
  usdDenoms: 'costpro_cash_denoms_usd',
} as const;

export type Breakdown = Record<number, string>;

export function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ── Persistencia de plantilla (§3) ──────────────────────────────────────────
export function loadPdfTemplate(): PdfTemplate {
  if (typeof window === 'undefined') return DEFAULT_PDF_TEMPLATE;
  try {
    return validatePdfTemplate(window.localStorage.getItem(LS_KEYS.pdfTemplate));
  } catch {
    return DEFAULT_PDF_TEMPLATE;
  }
}

export function savePdfTemplate(t: PdfTemplate): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_KEYS.pdfTemplate, t); } catch {}
}

// ── Persistencia de denominaciones activas (defaults toggled) ───────────────
/** Restaura la lista activada para una moneda; ignora valores no numéricos y respeta el catálogo default. */
export function loadEnabledDenoms(currency: Currency): number[] {
  const defaults = currency === 'CUP' ? CUP_DEFAULT_DENOMS : USD_DEFAULT_DENOMS;
  if (typeof window === 'undefined') return defaults;
  const key = currency === 'CUP' ? LS_KEYS.cupDenoms : LS_KEYS.usdDenoms;
  const parsed = safeParse<number[]>(readLS(key), defaults);
  const valid = Array.isArray(parsed) ? parsed.filter(d => defaults.includes(Number(d))) : [];
  // Si el guardado quedó vacío o corrupto, usar el catálogo completo (comportamiento legítimo del default).
  return valid.length > 0 ? [...new Set(valid.map(Number))].sort((a, b) => b - a) : defaults;
}

export function saveEnabledDenoms(currency: Currency, denoms: number[]): void {
  const key = currency === 'CUP' ? LS_KEYS.cupDenoms : LS_KEYS.usdDenoms;
  writeLS(key, JSON.stringify(denoms));
}

// ── Denominaciones personalizadas (§5.3) ────────────────────────────────────
export interface CustomDenoms { CUP: number[]; USD: number[] }

export function loadCustomDenoms(): CustomDenoms {
  const empty: CustomDenoms = { CUP: [], USD: [] };
  if (typeof window === 'undefined') return empty;
  const parsed = safeParse<Partial<CustomDenoms>>(readLS(LS_KEYS.customDenoms), empty);
  const clean = (arr: unknown): number[] =>
    Array.isArray(arr)
      ? [...new Set(arr.map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => b - a)
      : [];
  return { CUP: clean(parsed?.CUP), USD: clean(parsed?.USD) };
}

export function saveCustomDenoms(denoms: CustomDenoms): void {
  writeLS(LS_KEYS.customDenoms, JSON.stringify(denoms));
}

/**
 * Valida un valor de denominación personalizada para una moneda.
 * Reglas (§5.3): numérico finito > 0; no duplicado dentro de la MISMA moneda
 * (ni contra el catálogo por defecto de esa moneda). Cada moneda mantiene su
 * espacio: una denominación de CUP nunca se usa en USD y viceversa.
 */
export function validateCustomDenom(value: unknown, currency: Currency, existing: CustomDenoms): { ok: true; value: number } | { ok: false; reason: string } {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false, reason: 'Introduce un valor numérico válido.' };
  if (n <= 0) return { ok: false, reason: 'El valor debe ser mayor que cero.' };
  const defaults = currency === 'CUP' ? CUP_DEFAULT_DENOMS : USD_DEFAULT_DENOMS;
  if (defaults.includes(n)) return { ok: false, reason: `La denominación ${formatDenomValue(n, currency)} ya existe en el catálogo.` };
  if (existing[currency].includes(n)) return { ok: false, reason: `La denominación ${formatDenomValue(n, currency)} ya fue añadida.` };
  return { ok: true, value: n };
}

/** Añade una denominación personalizada validada (asume validateCustomDenom ok). */
export function addCustomDenom(custom: CustomDenoms, currency: Currency, value: number): CustomDenoms {
  return { ...custom, [currency]: [...custom[currency], value].sort((a, b) => b - a) };
}

/** Elimina una denominación personalizada sin afectar a las demás (ni a las defaults). */
export function removeCustomDenom(custom: CustomDenoms, currency: Currency, value: number): CustomDenoms {
  return { ...custom, [currency]: custom[currency].filter(d => d !== value) };
}

// ── Conteo y validación de entradas (§5.1) ──────────────────────────────────
/** Sanitiza la cantidad introducida: vacío → '' (para poder borrar), negativos → 0, decimales → entero no negativo. */
export function sanitizeCount(raw: string): string {
  if (raw === '' || raw === '-') return '';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return String(Math.floor(n));
}

/** Subtotal = denominación × cantidad (regla contable existente). */
export function denomSubtotal(denom: number, count: string): number {
  return denom * (Number(count) || 0);
}

/** Total contado de un desglose. Cada denominación entra UNA vez. */
export function breakdownTotal(breakdown: Breakdown): number {
  return Object.entries(breakdown).reduce((s, [d, c]) => s + denomSubtotal(Number(d), String(c)), 0);
}

/**
 * Desglose sugerido greedy (mismo algoritmo del modal) sobre las denominaciones
 * activas de la moneda. Con esperado ≤ 0 devuelve {} (no hay efectivo).
 */
export function suggestBreakdown(expected: number, denoms: number[]): Breakdown {
  if (!(expected > 0)) return {};
  const s: Breakdown = {};
  let r = Math.max(0, expected);
  for (const d of denoms) {
    const c = Math.floor(r / d);
    if (c > 0) { s[d] = String(c); r -= c * d; }
  }
  return s;
}

// ── Esperado por moneda (misma regla contable que la API, sin tocarla) ──────
/**
 * Esperado de efectivo por moneda calculado del MISMO reporte con la fórmula
 * de /api/cash-report (route.ts: ventas cash + producción cash − pagos cash −
 * comisiones cash). Para CUP el valor canónico sigue siendo cash_balance_cup
 * (backend); esta función se usa para USD (que la API no expone) y como
 * referencia. Sin conversión cambiaria: cada moneda permanece separada (§5.4).
 */
export function computeExpectedCash(report: CashReport | null, currency: Currency): number {
  if (!report) return 0;
  const sum = (rows: Array<{ payment_method: string; currency: string; total: number }> | undefined) =>
    (rows || []).filter(r => r.currency === currency).reduce((s, r) => s + Number(r.total || 0), 0);
  const isCash = (r: { payment_method: string }) => r.payment_method === 'cash';
  const sales = (report.sales || []).filter(isCash);
  const production = ((report as unknown as { production?: Array<{ payment_method: string; currency: string; total: number }> }).production || []).filter(isCash);
  const payments = (report.payments || []).filter(isCash);
  const commissions = (report.commissions || []).filter(isCash);
  return sum(sales) + sum(production) - sum(payments) - sum(commissions);
}

// ── Configuración vs cálculo (§2) ───────────────────────────────────────────
export interface ReportConfig { startDate: string; endDate: string }

/** ¿El intervalo es inválido? (inicio posterior al fin, o fecha vacía). */
export function isDateRangeInvalid(cfg: ReportConfig): boolean {
  if (!cfg.startDate || !cfg.endDate) return true;
  return cfg.startDate > cfg.endDate;
}

/** ¿Los resultados aplicados corresponden a otra configuración (fechas)? La plantilla es presentación: NO invalida datos. */
export function isReportStale(applied: ReportConfig | null, draft: ReportConfig): boolean {
  if (!applied) return false;
  return applied.startDate !== draft.startDate || applied.endDate !== draft.endDate;
}

// ── Historial de desgloses (ahora por ambas monedas, compatible con el legacy) ──
export interface SavedBreakdown {
  id: string;
  label: string;
  date: string;
  breakdown: Breakdown;           // CUP (campo legacy)
  deliveredBy: string;
  recipientName: string;
  total: number;                  // CUP (campo legacy)
  /** CAMBIO 2026-10 (paridad USD): opcional para compatibilidad con entradas antiguas. */
  usdBreakdown?: Breakdown;
  usdTotal?: number;
}

export function loadHistory(): SavedBreakdown[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeParse<SavedBreakdown[]>(readLS(LS_KEYS.history), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveHistory(entries: SavedBreakdown[]): void {
  writeLS(LS_KEYS.history, JSON.stringify(entries.slice(0, 10)));
}

// ── Formato ─────────────────────────────────────────────────────────────────
/** Valor de una denominación según convención de cada moneda ("5.000" CUP / "50.00" USD). */
export function formatDenomValue(d: number, currency: Currency): string {
  return currency === 'CUP' ? d.toLocaleString('es-ES') : d.toFixed(2);
}

/** Importe USD en la UI (convención existente del modal: $X.XX). */
export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ── util storage privado ────────────────────────────────────────────────────
function readLS(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch {}
}
