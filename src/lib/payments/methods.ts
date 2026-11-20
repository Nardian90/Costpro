/**
 * CP-FIN-004 (anexo vinculante POS-backend, 2026-11-20) — Utilidades del
 * contrato de medios de pago.
 *
 * El POS presenta exactamente TRES medios: Efectivo, Transferencia y
 * Transferencia Exterior (canal Zelle en ENERVIDA). El identificador
 * CANÓNICO del tercero es `external_transfer`; el valor histórico `zelle`
 * es una HERENCIA de solo-lectura (los registros vivos fueron normalizados
 * por la migración 20261120210000 y el backend nunca persiste 'zelle'
 * — create_sale_v2 lo normaliza en el punto único de ingreso).
 *
 * Regla del anexo (Prueba D): NINGÚN proceso puede deducir el medio por la
 * moneda (USD ≠ Zelle/Transf. Exterior). El medio y la moneda son ejes
 * independientes del cobro.
 *
 * Las estructuras internas de reportes que bucketan por medio conservan la
 * CLAVE histórica `zelle` (invisible para el usuario; renombrarla rompería
 * decenas de consumidores y pruebas) — este módulo centraliza el
 * reconocimiento DUAL de valores para que ambos identifiquen el mismo
 * bucket «Transf. Exterior».
 */

export const PAYMENT_METHOD_VALUES = ['cash', 'transfer', 'external_transfer'] as const;

/** Valores que representan una transferencia del exterior (canónico + heredado). */
export const EXTERIOR_METHOD_VALUES = ['external_transfer', 'zelle'] as const;

/** ¿El valor representa una transferencia del exterior (incluye heredado)? */
export function isExteriorMethod(
  method: string | null | undefined,
): boolean {
  return method === 'external_transfer' || method === 'zelle';
}

/**
 * Normaliza un medio heredado al canónico (para ENVÍOS al backend; el RPC
 * también normaliza — doble defensa). 'zelle' → 'external_transfer'.
 */
export function normalizePaymentMethod<T extends string>(method: T): T {
  return (method === 'zelle' ? 'external_transfer' : method) as unknown as T;
}

/** Etiqueta visible del medio (presentación del POS sin cambios). */
export function exteriorMethodLabel(): string {
  return 'Transf. Exterior';
}
