/**
 * CP-BRA-REMEDIATION-001 (R-02) — Tasa canónica de conversión CUP para CxC.
 *
 * Regla FIN-009 (CRÍTICA): «Monedas distintas nunca se suman entre sí» y la
 * conversión a CUP usa la jerarquía canónica de tasas — NUNCA una constante
 * ad-hoc. Antes de este módulo, `accounts-receivable/route.ts:123` convertía
 * el saldo con una tasa fija 450 hardcodeada, ignorando la tasa real de la
 * tienda (`store_exchange_rates`): importes distintos para la misma realidad
 * contable (el motivo fundacional de la misión CP-BRA).
 *
 * Jerarquía canónica (misma fuente que `register_supplier_payment` cuando el
 * pago no trae tasa): la tasa VIGENTE de la tienda para la divisa
 * (`store_exchange_rates`, la última por moneda). Si la tienda no tiene tasa
 * configurada para esa divisa, NO se inventa conversión (fail-closed): el
 * saldo se expone en la moneda del documento y se marca como «sin tasa» —
 * nunca entra en totales CUP.
 *
 * Librería PURA (sin React, sin Supabase): testeable en aislamiento.
 */

export interface StoreRateRow {
  currency: string;
  rate: number | string;
}

/** Tasa canónica de la tienda para una divisa (CUP → 1 siempre).
 * Devuelve null cuando no hay tasa vigente > 1 (fail-closed, sin fallback). */
export function resolveCanonicalRate(
  rates: StoreRateRow[],
  currency: string | null | undefined,
): number | null {
  const raw = (currency ?? '').trim();
  const cur = (raw === '' ? 'CUP' : raw).toUpperCase(); // vacío/null → CUP (default de BD)
  if (cur === 'CUP') return 1;
  const row = rates.find((r) => (r.currency ?? '').trim().toUpperCase() === cur);
  const rate = Number(row?.rate);
  return Number.isFinite(rate) && rate > 1 ? rate : null;
}

/** Conversión canónica de un saldo a CUP. Devuelve null si no hay tasa
 * (el llamador debe exponer el saldo en moneda original, nunca sumarlo en CUP). */
export function convertBalanceToCup(
  balance: number,
  currency: string | null | undefined,
  rate: number | null,
): number | null {
  if (rate === null) return null;
  const raw = (currency ?? '').trim();
  const cur = (raw === '' ? 'CUP' : raw).toUpperCase();
  if (cur === 'CUP') return round2(balance);
  return round2(balance * rate);
}

/** Redondeo monetario canónico a 2 decimales (misma semántica que ROUND(numeric,2)). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
