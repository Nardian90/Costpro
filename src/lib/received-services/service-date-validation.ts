/**
 * service-date-validation.ts — FIX ENCARGADO-SERVICIOS (2026-10-17)
 * ============================================================================
 * Regla del negocio para la FECHA DE CREACIÓN de un servicio recibido
 * (OPERACIÓN → Almacén → Servicios Recibidos → Nuevo Servicio):
 *
 *   1. El usuario ESCOGE la fecha del servicio (input date); el sistema NO la
 *      infiere: el formulario la propone (hoy, Habana) pero es editable.
 *   2. La fecha NO puede ser anterior a la ÚLTIMA FECHA registrada de un
 *      servicio de la tienda (cronología creciente; el igual sí se permite).
 *      Se excluyen los servicios ANULADOS: un documento anulado no condiciona
 *      operaciones nuevas (decisión documentada en el informe de la misión).
 *   3. La fecha NO puede ser posterior al DÍA ACTUAL (día de negocio Habana).
 *
 * Función PURA compartida por el cliente (feedback inmediato en el modal) y
 * el servidor (POST /api/received-services — la UI nunca es la última
 * barrera). El RPC create_received_service_v2 mantiene su ventana histórica
 * de 6 meses (validate_operation_date) como defensa en profundidad: estas
 * reglas son MÁS ESTRICTAS y específicas del módulo.
 *
 * Formato canónico: YYYY-MM-DD (date de Postgres; comparable
 * lexicográficamente de forma segura).
 */

export const SERVICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ServiceDateRuleResult {
  ok: boolean;
  /** Mensaje de error listo para el usuario cuando ok=false. */
  message?: string;
}

/**
 * Valida la fecha de creación de un servicio contra las reglas del negocio.
 *
 * @param serviceDate     Fecha elegida (YYYY-MM-DD). null/undefined → ok: el
 *                        RPC usará el día actual (compatibilidad con clientes
 *                        previos y con el flujo programático).
 * @param lastServiceDate Fecha del último servicio NO anulado de la tienda
 *                        (YYYY-MM-DD) o null si la tienda no tiene servicios.
 * @param today           Día de negocio actual (YYYY-MM-DD, America/Havana).
 */
export function validateServiceCreationDate(
  serviceDate: string | null | undefined,
  lastServiceDate: string | null | undefined,
  today: string,
): ServiceDateRuleResult {
  if (serviceDate === null || serviceDate === undefined || serviceDate === '') {
    return { ok: true };
  }
  const d = serviceDate.trim();
  if (!SERVICE_DATE_RE.test(d)) {
    return { ok: false, message: 'La fecha del servicio tiene un formato inválido (se espera AAAA-MM-DD)' };
  }
  if (!SERVICE_DATE_RE.test(today)) {
    // El emisor del «hoy» es interno (todayBusinessDay); un fallo aquí es un
    // bug de código, no de usuario — se protege el invariante de comparación.
    return { ok: false, message: 'Error interno validando la fecha del servicio' };
  }
  if (d > today) {
    return { ok: false, message: `La fecha del servicio no puede ser posterior al día actual (${today})` };
  }
  const last = lastServiceDate?.trim();
  if (last && SERVICE_DATE_RE.test(last) && d < last) {
    return {
      ok: false,
      message: `La fecha del servicio no puede ser anterior a la última fecha registrada (${last})`,
    };
  }
  return { ok: true };
}

/**
 * Día de negocio actual en America/Havana con formato YYYY-MM-DD.
 * Determinista (no depende de la TZ del servidor/navegador: fija la zona).
 * `en-CA` produce ISO YYYY-MM-DD de forma estable en V8/JSDOM/Node.
 *
 * Cliente y servidor usan ESTA función para que el «hoy» del formulario y el
 * «hoy» de la validación API siempre coincidan.
 */
export function todayHavanaISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Havana' });
}
