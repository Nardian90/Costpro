/**
 * feature-flags.ts — Conmutadores centrales de funcionalidad de CostPro.
 *
 * MISIÓN 2026-10-23 (§8): desactivación TEMPORAL del «Ajuste extraordinario»
 * del Reporte de Entrega. El propietario decidió que la función aún no está
 * implementada con la coherencia y seguridad suficientes, de modo que queda
 * inactiva para TODOS los usuarios — incluidos los administradores (pueden
 * VER el apartado y su estado, no EJECUTARLO).
 *
 * Punto único de verdad consultado por:
 *   · Frontend: CashReportView (contenedor AjustesExtraordinarios).
 *   · Backend: POST /api/cash-report/adjustments (rechaza con 503 mientras
 *     el flag esté apagado — ni siquiera admin/manager/encargado pueden
 *     registrar ajustes; la manipulación del frontend no sirve de nada).
 *
 * Reglas de la desactivación (§8 del brief):
 *   - NO se borran ni alteran los ajustes históricos (GET y reportes los
 *     siguen mostrando — son datos contables reales).
 *   - NO se tocan los ajustes de INVENTARIO (/api/inventory/adjust,
 *     sync/batch, reverse) ni otros ajustes documentales operativos.
 *   - La reactivación futura es formal: poner el flag en true tras la
 *     revisión, autorización y pruebas correspondientes.
 *
 * NOTA: no existe un sistema de feature flags previo en el proyecto; este
 * módulo es deliberadamente mínimo (constante tipada + helpers) para no
 * introducir un mecanismo paralelo innecesario.
 */

export interface FeatureFlags {
  /**
   * Ajuste extraordinario del Reporte de Entrega (ref_type='adjustment').
   * false = desactivado temporalmente (misión 2026-10-23, §8).
   */
  cashReportExtraordinaryAdjustment: boolean;
}

export const FEATURE_FLAGS: FeatureFlags = {
  cashReportExtraordinaryAdjustment: false,
};

/** Mensaje único (UI y API usan el mismo texto — una sola fuente). */
export const CASH_ADJUSTMENT_DISABLED_MSG =
  'Función temporalmente desactivada. Pendiente de revisión e implementación.';

/** ¿Está activo el ajuste extraordinario del Reporte de Entrega? */
export function isCashReportExtraordinaryAdjustmentEnabled(): boolean {
  return FEATURE_FLAGS.cashReportExtraordinaryAdjustment === true;
}
