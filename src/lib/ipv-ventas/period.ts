/**
 * IPV — Ingresos por Ventas: SELECCIÓN DEL PERÍODO (ADNEGOCIO-REPORTING, §5).
 *
 * Incidente real (ENERVIDA-VITALLCONS, 2026-11-21): el usuario solicitó el
 * informe del 21/11 y el encabezado mostró «2026-11-21 → 2026-11-23». Causa
 * técnica: la fecha final nace por defecto en HOY y solo se modifica si el
 * usuario la toca — al cambiar únicamente la fecha inicial, el período efectivo
 * se extendía en silencio hasta la fecha de generación y el día solicitado
 * quedaba contaminado por las ventas posteriores (el 23 no debe contaminar al
 * 21).
 *
 * Regla del negocio (§5 del encargo):
 *   · Selección de UN día → inicio y fin son el mismo día: al cambiar la fecha
 *     inicial, la final la sigue MIENTRAS el usuario no haya elegido una final
 *     explícita (flag `endTouched` de la vista).
 *   · Selección de un intervalo → se respetan EXACTAMENTE ambas fechas
 *     elegidas: una vez tocada la fecha final, jamás se re-sincroniza.
 *   · Nunca se sustituye silenciosamente la fecha final por la fecha actual:
 *     el encabezado imprime exactamente lo aplicado (applied.cfg).
 *
 * Función PURA (unit-testeable): decide la fecha final efectiva tras un cambio
 * de la fecha inicial.
 */
export function ipvEndDateOnStartChange(startDate: string, currentEndDate: string, endDateTouched: boolean): string {
  if (!startDate) return currentEndDate;
  if (endDateTouched) {
    // Intervalo explícito: se respeta. Si el cambio de inicio la dejó invertida
    // (fin < inicio), se sujeta al inicio — el validador de la vista ya impide
    // elegir una final anterior al mínimo del input, esto solo cubre el caso
    // programático sin inventar una fecha distinta a la elegida.
    return currentEndDate && currentEndDate >= startDate ? currentEndDate : startDate;
  }
  // Selección de un solo día: la final sigue a la inicial.
  return startDate;
}
