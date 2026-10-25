/**
 * MISIÓN POS DENOMINACIONES MULTIMONEDA (2026-10-26) — Función A.
 *
 * Desglose de efectivo del carrito POS con configuraciones de denominaciones
 * COMPLETAMENTE INDEPENDIENTES por moneda (CUP y USD). Este módulo es la
 * fuente única de la lógica pura (defaults, validación, persistencia local
 * por tienda+moneda y descomposición exacta) para que el componente
 * POSCartCheckoutPanel sea solo presentación.
 *
 * Reglas de la misión:
 *  · CUP y USD no comparten estado: activar/añadir/eliminar en una moneda
 *    JAMÁS toca la lista, opciones activas ni cantidades de la otra.
 *  · Los valores iniciales son una CONFIGURACIÓN, no una lista cerrada: el
 *    usuario añade denominaciones personalizadas (positivas, finitas, ≤2
 *    decimales, sin duplicados) y elimina las personalizadas que no use.
 *  · Persistencia local segura por tienda y moneda (localStorage, sin
 *    migración de BD): una preferencia corrupta o antigua NO impide abrir
 *    el carrito — cae en los defaults de esa moneda con denominaciones
 *    visibles.
 *  · La descomposición «Exacto» usa SOLO las denominaciones activas de la
 *    moneda seleccionada; si el importe no puede representarse exactamente
 *    se informa la diferencia (nunca se redondea hacia arriba ni se fabrica
 *    un vuelto).
 *
 * Ámbito de persistencia: TIENDA + MONEDA (clave por tienda). El
 * aislamiento por dispositivo es inherente a localStorage; las
 * denominaciones físicas son una propiedad de la caja de la tienda, no del
 * usuario (mismo patrón que `costpro:cash-report:summary-concepts:v1:store:<id>`).
 */

export type PosCurrency = "CUP" | "USD";

/** Configuración de una denominación de la moneda activa. */
export interface DenominationConfig {
  /** Valor numérico de la denominación (en la moneda a la que pertenece). */
  value: number;
  /** Etiqueta legible para la UI (p. ej. "5.000" CUP / "$0.50" USD). */
  label: string;
  /** Estado activo/inactivo — solo las activas aparecen al contar. */
  active: boolean;
  /** true = añadida por el usuario (eliminable); false = catálogo inicial. */
  custom: boolean;
}

/** Desglose por denominación: { "5000": 2, "2000": 1 } (claves = valor). */
export type DenominationBreakdown = Record<string, number>;

// ── Catálogos iniciales (§3.2 de la misión — configuración, no lista cerrada) ─

/** Billetes/monedas CUP vigentes (incluye 5.000 y 2.000). */
export const POS_DEFAULT_CUP_DENOMS: readonly number[] = [
  5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1,
];

/** Billetes USD + monedas fraccionarias (0,50 … 0,01). */
export const POS_DEFAULT_USD_DENOMS: readonly number[] = [
  100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01,
];

export function defaultDenominationsFor(currency: PosCurrency): DenominationConfig[] {
  const values = currency === "CUP" ? POS_DEFAULT_CUP_DENOMS : POS_DEFAULT_USD_DENOMS;
  return values.map((value) => ({
    value,
    label: formatDenomLabel(value, currency),
    active: true,
    custom: false,
  }));
}

// ── Formato (§3.3: reconocer la moneda a la que pertenece cada valor) ────────

/** Separador de miles determinista con puntos ("5000" → "5.000") —
 *  independiente del ICU del runtime (Node small-icu no agrupa es-ES). */
function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Etiqueta de una denominación según la convención de su moneda. */
export function formatDenomLabel(value: number, currency: PosCurrency): string {
  if (currency === "CUP") {
    // CUP: enteros con separador de miles ("5.000"). El catálogo inicial CUP
    // no tiene fracciones y una personalizada con decimales se muestra con 2
    // decimales y coma ("0,50").
    if (Number.isInteger(value)) return groupThousands(String(value));
    return value.toFixed(2).replace(".", ",");
  }
  // USD: "$100" para enteros, "$0.50" para fracciones (2 decimales).
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

// ── Persistencia por tienda y moneda (§3.4) ──────────────────────────────────

const LS_PREFIX = "costpro:pos:cash-denominations:v1";

/**
 * Clave de localStorage por tienda y moneda:
 * `costpro:pos:cash-denominations:v1:store:<id>:CUP|USD`
 * (storeId vacío/anómalo → "sin-tienda": nunca mezcla con claves de tienda).
 */
export function denominationsStorageKey(storeId: string | null | undefined, currency: PosCurrency): string {
  const scope = storeId && storeId.trim() ? storeId.trim() : "sin-tienda";
  return `${LS_PREFIX}:store:${scope}:${currency}`;
}

function isValidDenomValue(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
}

/**
 * Carga la configuración guardada de una moneda para una tienda.
 * Valida el contenido ANTES de usarlo: valores inválidos se descartan y una
 * preferencia corrupta/ausente/vacía cae en el catálogo inicial de ESA moneda
 * (la otra moneda no se ve afectada — claves separadas). Los valores
 * compatibles de un guardado anterior se conservan (migración no destructiva).
 */
export function loadDenominations(storeId: string | null | undefined, currency: PosCurrency): DenominationConfig[] {
  const defaults = defaultDenominationsFor(currency);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(denominationsStorageKey(storeId, currency));
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaults;

    const seen = new Set<number>();
    const result: DenominationConfig[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { value, active, custom } = entry as Record<string, unknown>;
      if (!isValidDenomValue(value)) continue;
      const key = Math.round(value * 100); // deduplicar 0.5 vs 0.50
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        value,
        label: formatDenomLabel(value, currency),
        active: active === true, // ausente/false → inactiva (guardado honesto)
        custom: custom === true,
      });
    }
    // Preferencia corrupta o sin denominaciones válidas → defaults visibles.
    return result.length > 0 ? sortDenominationsDesc(result) : defaults;
  } catch {
    return defaults;
  }
}

/** Guarda la configuración de UNA moneda de UNA tienda (mejor esfuerzo). */
export function saveDenominations(storeId: string | null | undefined, currency: PosCurrency, denoms: DenominationConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      denominationsStorageKey(storeId, currency),
      JSON.stringify(denoms.map(({ value, active, custom }) => ({ value, active, custom }))),
    );
  } catch {
    // Cuota llena / localStorage bloqueado: la sesión sigue con el estado en
    // memoria — la misión exige que una preferencia problemática jamás
    // impida operar el carrito.
  }
}

// ── Orden (§3.3: de mayor a menor) ───────────────────────────────────────────

export function sortDenominationsDesc(denoms: DenominationConfig[]): DenominationConfig[] {
  return [...denoms].sort((a, b) => b.value - a.value);
}

// ── Añadir / activar / eliminar / restaurar (§3.3) ───────────────────────────

export type DenominationValidation = { ok: true; value: number } | { ok: false; reason: string };

/**
 * Valida una denominación nueva para una moneda:
 * numérica, finita, positiva, ≤2 decimales (precisión monetaria del sistema),
 * no vacía y sin duplicados (ni contra el catálogo existente de ESA moneda).
 */
export function validateNewDenomination(
  input: unknown,
  currency: PosCurrency,
  existing: DenominationConfig[],
): DenominationValidation {
  const raw = typeof input === "string" ? input.trim().replace(",", ".") : input;
  if (raw === "" || raw === null || raw === undefined) {
    return { ok: false, reason: "Introduce un valor para la denominación." };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, reason: "El valor debe ser numérico y finito." };
  }
  if (n <= 0) {
    return { ok: false, reason: "El valor debe ser mayor que cero." };
  }
  // Precisión monetaria: máximo dos decimales.
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-9) {
    return { ok: false, reason: "Máximo dos decimales (precisión monetaria del sistema)." };
  }
  const cents = Math.round(n * 100);
  const duplicateDefault = existing.some((d) => !d.custom && Math.round(d.value * 100) === cents);
  if (duplicateDefault) {
    return { ok: false, reason: `La denominación ${formatDenomLabel(n, currency)} ya existe en el catálogo de ${currency}.` };
  }
  const duplicateCustom = existing.some((d) => d.custom && Math.round(d.value * 100) === cents);
  if (duplicateCustom) {
    return { ok: false, reason: `La denominación ${formatDenomLabel(n, currency)} ya fue añadida a ${currency}.` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Añade una denominación personalizada validada (activa, orden desc). */
export function addDenomination(denoms: DenominationConfig[], currency: PosCurrency, value: number): DenominationConfig[] {
  return sortDenominationsDesc([
    ...denoms,
    { value, label: formatDenomLabel(value, currency), active: true, custom: true },
  ]);
}

/** Elimina una denominación PERSONALIZADA (las del catálogo inicial no se eliminan). */
export function removeCustomDenomination(denoms: DenominationConfig[], value: number): DenominationConfig[] {
  return denoms.filter((d) => !(d.custom && Math.round(d.value * 100) === Math.round(value * 100)));
}

/** Activa/desactiva una denominación de la lista (por valor, 2 decimales). */
export function toggleDenomination(denoms: DenominationConfig[], value: number): DenominationConfig[] {
  return denoms.map((d) =>
    Math.round(d.value * 100) === Math.round(value * 100) ? { ...d, active: !d.active } : d,
  );
}

/** Restaura el catálogo inicial de ESA moneda (la otra moneda no se toca). */
export function restoreDefaultDenominations(currency: PosCurrency): DenominationConfig[] {
  return defaultDenominationsFor(currency);
}

// ── Conteo y totales (§3.5) ──────────────────────────────────────────────────

/** Denominaciones activas (las únicas que cuentan), orden desc. */
export function activeDenominations(denoms: DenominationConfig[]): DenominationConfig[] {
  return sortDenominationsDesc(denoms.filter((d) => d.active));
}

/**
 * Total contado de un desglose SOBRE las denominaciones activas.
 * Cualquier entrada huérfana (denominación desactivada o eliminada tras contar)
 * no suma: el total refleja lo que el cajero ve y puede contar.
 */
export function breakdownTotal(breakdown: DenominationBreakdown, denoms: DenominationConfig[]): number {
  const active = new Set(activeDenominations(denoms).map((d) => Math.round(d.value * 100)));
  return Object.entries(breakdown).reduce((sum, [key, count]) => {
    const cents = Math.round(Number(key) * 100);
    if (!active.has(cents)) return sum;
    return sum + (cents * Math.floor(count || 0)) / 100;
  }, 0);
}

export interface ExactBreakdownResult {
  /** Desglose greedy (solo denominaciones activas). */
  breakdown: DenominationBreakdown;
  /** Total representado (en la moneda de las denominaciones). */
  total: number;
  /** true si el total coincide exactamente con el importe pedido. */
  exact: boolean;
}

/**
 * Descomposición greedy de un importe sobre las denominaciones ACTIVAS,
 * aritmética en CENTAVOS (a prueba de coma flotante con 0,10/0,05/0,01 USD).
 * Si el importe no puede representarse exactamente, devuelve la aproximación
 * greedy inferior + exact=false — JAMÁS redondea hacia arriba ni fabrica
 * vuelto (§3.5 de la misión).
 */
export function exactBreakdownFor(amount: number, denoms: DenominationConfig[]): ExactBreakdownResult {
  const active = activeDenominations(denoms);
  const targetCents = Math.round((Number(amount) || 0) * 100);
  if (targetCents <= 0 || active.length === 0) return { breakdown: {}, total: 0, exact: targetCents === 0 };

  const breakdown: DenominationBreakdown = {};
  let remaining = targetCents;
  for (const d of active) {
    const denomCents = Math.round(d.value * 100);
    if (denomCents <= 0 || remaining < denomCents) continue;
    const count = Math.floor(remaining / denomCents);
    if (count > 0) {
      breakdown[String(d.value)] = count;
      remaining -= count * denomCents;
    }
  }
  const totalCents = targetCents - remaining;
  return {
    breakdown,
    total: totalCents / 100,
    exact: remaining === 0,
  };
}
