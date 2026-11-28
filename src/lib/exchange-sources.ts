/**
 * exchange-sources.ts — Registro ÚNICO de fuentes de tasas (IC-DIVIZA-003).
 *
 * MISIÓN IC-DIVIZA-003 (2026-10-26): CostPro usa Diviza (cubadivisas.com) como
 * ÚNICA fuente informal ACTIVA. elToque dejó de publicar (su proveedor real,
 * solucionescuba.com, cayó; serie congelada 2025-12-25 → 2026-07-28) y NO debe
 * participar en NINGUNA decisión que calcule la tasa vigente:
 *
 *   - Selección de la tasa informal vigente (API informal_latest + vista).
 *   - Resolución del proveedor más reciente.
 *   - Mecanismos de fallback y carry-forward (la API jamás crea virtuales de
 *     una fuente histórica).
 *   - Cálculo de la tasa actual, brecha cambiaria, indicadores y simuladores.
 *   - Conteo de arrastres y notificaciones relacionadas con la vigente.
 *   - Captura automática ni endpoints de actualización.
 *
 * elToque se conserva como ARCHIVO HISTÓRICO verificable (§3 de la misión):
 * sus filas no se borran, no se re-atribuyen a Diviza y siguen siendo
 * consultables de forma explícita (source=elToque) con su procedencia y fecha
 * final comprobadas. Lo que NO pueden es alimentar la tasa actual.
 *
 * Este módulo es puro (sin dependencias ni efectos) y es la fuente única de
 * verdad para la API (/api/exchange-rates), la lib de captura
 * (exchange-capture.ts) y la vista (ExchangeIntelligenceView.tsx) — la misma
 * clasificación en servidor y cliente, sin divergencia.
 */

/**
 * Fuentes informales ACTIVAS — las únicas que participan en la selección de
 * la tasa informal vigente, el carry-forward y `informal_latest`.
 * Orden de prioridad (primera = preferida).
 */
export const INFORMAL_ACTIVE_SOURCES = ['Diviza'] as const;

/**
 * Fuentes informales HISTÓRICAS — archivo verificable, JAMÁS vigentes.
 * - No se capturan (no hay proveedor operativo detrás).
 * - No generan filas virtuales carry-forward.
 * - No entran en informal_latest ni en la tarjeta de la tasa vigente.
 * - Solo se devuelven cuando se piden EXPLÍCITAMENTE (source=elToque).
 */
export const INFORMAL_HISTORICAL_SOURCES = ['elToque'] as const;

/**
 * Fuentes informales RECUPERADAS (CP-FX-001, 2026-11-28) — cotizaciones
 * históricas verificables importadas para completar huecos de la serie.
 * - Cuba Clara «Dólar en la calle» (cubaclara.org): mediana propia diaria,
 *   licencia CC BY 4.0 con atribución. Cubre 2026-10-06 → 2026-11-23
 *   (19 días de la zona muerta 2026-07-29 → 2026-10-24).
 * Trato idéntico al archivo histórico: JAMÁS participan en la vigencia,
 * el carry-forward o la respuesta por defecto; solo bajo demanda explícita
 * o en la serie unificada del Histórico (source=all / informal-all).
 */
export const INFORMAL_RECOVERED_SOURCES = ['Cuba Clara'] as const;

/**
 * Fuentes informales NO ACTIVAS (históricas + recuperadas): comparten la
 * misma regla — verificables, consultables, jamás vigentes.
 */
export const INFORMAL_NON_ACTIVE_SOURCES = [
  ...INFORMAL_HISTORICAL_SOURCES,
  ...INFORMAL_RECOVERED_SOURCES,
] as const;

/** Todas las informales conocidas (activas + históricas + recuperadas). */
export const ALL_INFORMAL_SOURCES = [
  ...INFORMAL_ACTIVE_SOURCES,
  ...INFORMAL_HISTORICAL_SOURCES,
  ...INFORMAL_RECOVERED_SOURCES,
] as const;

/** ¿Es una fuente informal ACTIVA (participa en la vigente)? */
export const isActiveInformalSource = (s: string): boolean =>
  (INFORMAL_ACTIVE_SOURCES as readonly string[]).includes(s);

/** ¿Es una fuente informal NO ACTIVA (histórica o recuperada; jamás vigente)? */
export const isHistoricalInformalSource = (s: string): boolean =>
  (INFORMAL_NON_ACTIVE_SOURCES as readonly string[]).includes(s);

/** ¿Es una fuente informal conocida (activa o histórica)? */
export const isKnownInformalSource = (s: string): boolean =>
  (ALL_INFORMAL_SOURCES as readonly string[]).includes(s);

/**
 * Normaliza una fuente de tasa del módulo de costeo dinámico al esquema
 * activo (IC-DIVIZA-003): el valor LEGADO 'elToque' (persistido en
 * user_preferences/localStorage por versiones anteriores) se resuelve con la
 * fuente informal ACTIVA 'Diviza'. ElToque es archivo histórico y jamás
 * alimenta el cálculo de la tasa actual. Las fuentes RECUPERADAS (Cuba
 * Clara, CP-FX-001) tampoco participan en el cálculo vigente del costeo:
 * se resuelven a la fuente activa con la misma regla.
 *
 * El resto de valores se devuelve sin cambios (BCC_seg1/2/3, Diviza, Manual);
 * la validación de valores válidos vive en el consumidor.
 */
export function normalizeCosteoRateSource(s: string): string {
  return s === 'elToque' || isHistoricalInformalSource(s) ? 'Diviza' : s;
}
