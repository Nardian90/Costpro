/**
 * Mapeo canónico de errores RPC del módulo Nóminas SC-4-06 → HTTP / user
 * message. Fuente única de verdad compartida por todas las rutas
 * /api/payrolls (create / update / confirm / account / pay / void) y
 * /api/workers/[id]/salary-rate (patrón src/lib/vale-salida/errors.ts).
 *
 * Cualquier error no listado cae a 500.
 */

export function mapPayrollRpcErrorToHttpStatus(msg: string): number {
  // 401
  if (msg.includes('ERR_UNAUTHENTICATED')) return 401;
  // 403
  if (msg.includes('ERR_UNAUTHORIZED')) return 403;
  // 400 — validación de entrada
  if (msg.includes('ERR_EMPTY_ITEMS')) return 400;
  if (msg.includes('ERR_INVALID_TIPO_NOMINA')) return 400;
  if (msg.includes('ERR_INVALID_PAYMENT_METHOD')) return 400;
  if (msg.includes('ERR_INVALID_TIME')) return 400;
  if (msg.includes('ERR_OVERTIME_WITHOUT_HOURS')) return 400;
  if (msg.includes('ERR_INVALID_ITEM')) return 400;
  if (msg.includes('ERR_INVALID_RATE_TYPE')) return 400;
  if (msg.includes('ERR_INVALID_RATE_AMOUNT')) return 400;
  if (msg.includes('ERR_INVALID_CURRENCY')) return 400;
  if (msg.includes('ERR_NEGATIVE_VALUE')) return 400;
  if (msg.includes('ERR_INVALID_CONCEPT_KIND')) return 400;
  if (msg.includes('ERR_INVALID_CONCEPT_SIGLA')) return 400;
  if (msg.includes('ERR_INVALID_CONCEPT_AMOUNT')) return 400;
  if (msg.includes('ERR_DUPLICATE_WORKER')) return 409;
  // 404
  if (msg.includes('ERR_PAYROLL_NOT_FOUND')) return 404;
  if (msg.includes('ERR_STORE_NOT_FOUND')) return 404;
  if (msg.includes('ERR_WORKER_NOT_FOUND')) return 404;
  // 409 / 422 — estado del documento
  if (msg.includes('ERR_NOT_DRAFT')) return 422;
  if (msg.includes('ERR_NOT_CONFIRMED')) return 422;
  if (msg.includes('ERR_NOT_VOIDABLE')) return 422;
  if (msg.includes('ERR_ALREADY_ACCOUNTED')) return 409;
  if (msg.includes('ERR_INCONSISTENT_TOTALS')) return 409;
  if (msg.includes('ERR_RATE_OVERLAP')) return 409;
  // 422 — reglas de negocio del servidor
  if (msg.includes('ERR_WORKER_NOT_ELIGIBLE')) return 422;
  if (msg.includes('ERR_WORKER_WITHOUT_RATE')) return 422;
  if (msg.includes('ERR_CURRENCY_MISMATCH')) return 422;
  if (msg.includes('ERR_NEGATIVE_NET')) return 422;
  if (msg.includes('ERR_INVALID_PERIOD')) return 422;
  if (msg.includes('ERR_FUTURE_DATED_DOCUMENT')) return 422;
  if (msg.includes('ERR_BACKDATED_DOCUMENT')) return 422;
  if (msg.includes('ERR_REASON_REQUIRED')) return 422;
  if (msg.includes('ERR_REASON_TOO_LONG')) return 422;
  // 500 fallback
  return 500;
}

export function mapPayrollRpcErrorToUserMessage(msg: string): string {
  if (msg.includes('ERR_UNAUTHENTICATED')) return 'No autenticado';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'Sin acceso a la tienda de la nómina';
  if (msg.includes('ERR_EMPTY_ITEMS')) return 'La nómina necesita al menos un trabajador con líneas';
  if (msg.includes('ERR_INVALID_TIPO_NOMINA')) return 'Tipo de nómina inválido';
  if (msg.includes('ERR_INVALID_PAYMENT_METHOD')) return 'Modalidad de pago inválida (efectivo o tarjeta)';
  if (msg.includes('ERR_INVALID_TIME')) return 'Tiempo incoherente con la tarifa: la tarifa horaria se paga por horas y la diaria por días';
  if (msg.includes('ERR_OVERTIME_WITHOUT_HOURS')) return 'El importe de horas extras requiere horas extras declaradas';
  if (msg.includes('ERR_INVALID_ITEM')) return 'Línea de nómina inválida (worker_id requerido)';
  if (msg.includes('ERR_INVALID_RATE_TYPE')) return 'Tipo de tarifa inválido (horaria o diaria)';
  if (msg.includes('ERR_INVALID_RATE_AMOUNT')) return 'Importe de tarifa inválido (mayor que cero)';
  if (msg.includes('ERR_INVALID_CURRENCY')) return 'Moneda inválida (CUP, USD, EUR o MLC)';
  if (msg.includes('ERR_NEGATIVE_VALUE')) return 'Horas, días e importes no pueden ser negativos';
  if (msg.includes('ERR_INVALID_CONCEPT_KIND')) return 'Clase de concepto inválida (complemento, otro_haber, obligacion_social o deduccion)';
  if (msg.includes('ERR_INVALID_CONCEPT_SIGLA')) return 'Sigla de concepto inválida (máx. 12 caracteres)';
  if (msg.includes('ERR_INVALID_CONCEPT_AMOUNT')) return 'Importe de concepto inválido (no negativo)';
  if (msg.includes('ERR_DUPLICATE_WORKER')) return 'Un trabajador solo puede aparecer una vez en la nómina';
  if (msg.includes('ERR_PAYROLL_NOT_FOUND')) return 'Nómina no encontrada';
  if (msg.includes('ERR_STORE_NOT_FOUND')) return 'Tienda no encontrada';
  if (msg.includes('ERR_WORKER_NOT_FOUND')) return 'Trabajador no encontrado';
  if (msg.includes('ERR_NOT_DRAFT')) return 'Solo se pueden editar nóminas en borrador';
  if (msg.includes('ERR_NOT_CONFIRMED')) return 'Operación válida solo para nóminas confirmadas';
  if (msg.includes('ERR_NOT_VOIDABLE')) return 'Solo se pueden anular nóminas en borrador o confirmadas';
  if (msg.includes('ERR_ALREADY_ACCOUNTED')) return 'La nómina ya fue contabilizada';
  if (msg.includes('ERR_INCONSISTENT_TOTALS')) return 'Totales incoherentes con las líneas: no se confirma el documento';
  if (msg.includes('ERR_RATE_OVERLAP')) return 'La nueva tarifa debe ser posterior a la vigente (sin solapes)';
  if (msg.includes('ERR_WORKER_NOT_ELIGIBLE')) return 'El trabajador no pertenece a la tienda o no está activo';
  if (msg.includes('ERR_WORKER_WITHOUT_RATE')) return 'El trabajador no tiene tarifa salarial vigente en el período';
  if (msg.includes('ERR_CURRENCY_MISMATCH')) return 'Las tarifas de los trabajadores tienen monedas distintas';
  if (msg.includes('ERR_NEGATIVE_NET')) return 'Las deducciones superan lo devengado (neto a cobrar negativo)';
  if (msg.includes('ERR_INVALID_PERIOD')) return 'Período inválido: la fecha inicial no puede ser posterior a la final';
  if (msg.includes('ERR_FUTURE_DATED_DOCUMENT')) return 'El período no puede ser futuro';
  if (msg.includes('ERR_BACKDATED_DOCUMENT')) return 'El período no puede ser anterior a 6 meses';
  if (msg.includes('ERR_REASON_REQUIRED')) return 'El motivo de anulación es obligatorio (3-500 caracteres)';
  if (msg.includes('ERR_REASON_TOO_LONG')) return 'El motivo de anulación supera los 500 caracteres';
  return msg;
}
