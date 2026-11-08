/**
 * CP-POS-002 (D3) — Clasificación canónica de errores de sincronización.
 * ============================================================================
 * Módulo ISOMORFO (servidor y cliente, sin dependencias de DOM) que traduce
 * los códigos de error REALES de la cadena de sincronización a categorías
 * canónicas con semántica de reintento.
 *
 * Fuente de verdad de los códigos (auditoría CP-POS-002, 2026-11-08):
 *   · create_sale_v2 (vigente: migración 20261105140000) — ~40 códigos ERR_*.
 *   · register_reception (vigente: 20261107120000) — 13 códigos.
 *   · create_transfer (20261020000001) — 7 códigos.
 *   · perform_inventory_adjustment (20261004120002) — 2 códigos.
 *   · validate_operation_date (20261018000000) — ERR_FUTURE_DATED_DOCUMENT /
 *     ERR_BACKDATED_DOCUMENT (la ruta los pre-checkea como
 *     ERR_FUTURE_OPERATION_DATE a nivel TS).
 *   · Nivel ruta TS: ERR_FUTURE_OPERATION_DATE (checkNotFutureOperationDate)
 *     y ERR_F21_TASA_INVALIDA (validateReceiptItemsTasa).
 *
 * Ningún código está inventado: todos provienen del grep de las migraciones
 * vigentes (evidencia en audit-evidence/CP-POS-002/).
 *
 * Reglas de la misión (§6 D3):
 *   · A (ÉXITO IDEMPOTENTE) NO se clasifica aquí: lo emite el servidor cuando
 *     la RPC devuelve {status:'idempotent'} (registry param_hash coincidente)
 *     o cuando el prefetch de sync_log encuentra una ejecución previa 'ok'.
 *     Un 23505 crudo NO se asume éxito idempotente (sin evidencia de
 *     correspondencia llave↔contenido se trata como conflicto de integridad).
 *   · B (CONFLICTO DE INTEGRIDAD): ERR_IDEMPOTENCY_KEY_REUSE — misma llave
 *     con contenido distinto. No se reintenta, no se sobrescribe.
 *   · C (CONFLICTO DE NEGOCIO): errores deterministas. No se reintentan.
 *   · D (TRANSITORIOS): red/timeout/5xx/408/425/429. Backoff + jitter.
 *   · E (SESIÓN EXPIRADA — 401): no es conflicto; pausa y conserva.
 *   · F (DESCONOCIDO): 4xx no reconocido → conservar SIN reintento automático;
 *     sin respuesta de red → transitorio; estructura desconocida → conservar.
 */

/** Categorías canónicas (contrato compartido servidor↔cliente). */
export type SyncErrorCategory =
  | 'conflict_integrity'
  | 'conflict_business'
  | 'transient'
  | 'auth_required'
  | 'unknown';

/** Tipos de conflicto para la vista "Ventas por resolver" (D4). */
export type SyncConflictType = 'integrity' | 'business' | 'unknown_error';

export interface SyncErrorClassification {
  category: SyncErrorCategory;
  /** ¿El motor debe reintentar automáticamente (backoff) esta operación? */
  retryable: boolean;
  /** Presente cuando category es un conflicto (para UI y persistencia). */
  conflictType?: SyncConflictType;
  /** Código REAL extraído (ERR_*, 23505, HTTP_502…). Nunca inventado. */
  errorCode?: string;
  /** Mensaje operativo en español, SIN detalles internos (seguro en prod). */
  message: string;
}

/** Clasificación de una operación individual en la respuesta del batch. */
export interface SyncResultClassification {
  category: SyncErrorCategory;
  conflictType?: SyncConflictType;
  errorCode?: string;
  retryable: boolean;
}

// ── Códigos ERR_* reales por categoría (evidencia: auditoría CP-POS-002) ────

/** B — integridad: la llave se reutilizó con contenido distinto. */
const INTEGRITY_CODES = new Set([
  'ERR_IDEMPOTENCY_KEY_REUSE',
]);

/**
 * C — negocio: errores deterministas de las RPC de la cadena sync
 * (create_sale_v2 + register_reception + create_transfer +
 * perform_inventory_adjustment + validate_operation_date + fn_recalc_wac)
 * y de las validaciones de ruta (F-21, fecha futura).
 */
const BUSINESS_CODES = new Set([
  // create_sale_v2 — acceso/identidad
  'ERR_UNAUTHORIZED',
  'ERR_SELLER_REQUIRED',
  'ERR_SELLER_MISMATCH',
  'ERR_SUPERVISOR_REQUIRED',
  'ERR_SUPERVISOR_UNAUTHORIZED',
  'ERR_SUPERVISOR_TOKEN_REQUIRED',
  'ERR_SUPERVISOR_TOKEN_REUSED',
  'ERR_SUPERVISOR_SCOPE_VIOLATION',
  // create_sale_v2 — catálogo/stock
  'ERR_STORE_MISMATCH',
  'ERR_PRODUCT_NOT_FOUND',
  'ERR_PRODUCT_COST_UNAVAILABLE',
  'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED',
  'ERR_INSUFFICIENT_STOCK',
  'ERR_INVALID_PRICE',
  'ERR_INVALID_DISCOUNT',
  'ERR_DISCOUNT_REASON_INVALID',
  'ERR_DISCOUNT_REASON_REQUIRED',
  'ERR_APPLIED_TAX_INVALID',
  // create_sale_v2 — dinero/moneda
  'ERR_EXCHANGE_RATE_UNAVAILABLE',
  'ERR_RATE_STALE',
  'ERR_RATE_REQUIRED_FOR_INCIDENT',
  'ERR_NEGATIVE_SALE',
  'ERR_TOTAL_MISMATCH',
  'ERR_PAYMENT_MISMATCH',
  'ERR_PAYMENT_COMPONENTS_INVALID',
  'ERR_CASH_SETTLEMENT_INVALID',
  'ERR_CASH_SETTLEMENT_NOT_APPLICABLE',
  'ERR_CASH_SETTLEMENT_MISMATCH',
  'ERR_OVERPAYMENT_UNREGISTERED_CHANGE',
  'ERR_ZELLE_REQUIRES_RATE',
  'ERR_INVALID_CURRENCY',
  'ERR_PAYMENT_INVARIANT_VIOLATED',
  // política temporal (ruta + validate_operation_date)
  'ERR_FUTURE_OPERATION_DATE',
  'ERR_FUTURE_DATED_DOCUMENT',
  'ERR_BACKDATED_DOCUMENT',
  // F-21 / recepciones
  'ERR_F21_TASA_INVALIDA',
  'ERR_INVALID_EXCHANGE_RATE',
  'ERR_SUPPLIER_REQUIRED',
  'ERR_EMPTY_ITEMS',
  'ERR_INVOICE_DUPLICATE',
  'ERR_INVALID_UNIT_COST',
  'ERR_AMBIGUOUS_ITEM',
  'ERR_NEW_PRODUCT_INVALID',
  'ERR_SKU_DUPLICATE_PAYLOAD',
  'ERR_SKU_EXISTS',
  'ERR_STORE_NOT_FOUND',
  'ERR_PRODUCT_NOT_IN_STORE',
  // transferencias
  'ERR_SAME_STORE',
  'ERR_ORIGIN_STORE_INACTIVE',
  'ERR_DEST_STORE_INACTIVE',
  'ERR_SERVICE_NOT_TRANSFERABLE',
  // WAC (auxiliares)
  'ERR_WAC_RECALC_ARGS',
  'ERR_WAC_REVERSE_NEGATIVE_STOCK',
]);

/**
 * Restricciones UNIQUE reales cuyo 23505 tiene semántica de NEGOCIO conocida
 * (documento/entidad duplicada) — se mapean al código ERR_* equivalente que
 * la propia BD usa en el camino online. Evidencia: migraciones
 * 20260807000014 (receipts) y products_sku_store_unique (usada por
 * useReceptions para sintetizar ERR_SKU_EXISTS).
 */
const CONSTRAINT_TO_BUSINESS_CODE: Record<string, string> = {
  idx_receipts_store_reference_doc: 'ERR_INVOICE_DUPLICATE',
  products_sku_store_unique: 'ERR_SKU_EXISTS',
};

/**
 * Restricciones UNIQUE de idempotencia: un 23505 aquí NO es evidencia de
 * éxito (no demuestra correspondencia llave↔contenido) → conflicto de
 * integridad para revisión humana. El éxito idempotente SOLO lo certifica
 * la RPC ({status:'idempotent'} tras param_hash) o sync_log 'ok' previo.
 */
const INTEGRITY_CONSTRAINTS = new Set([
  'transactions_idempotency_key_store_idx',
  'uq_idempotency_key_operation',
]);

/** Mensajes operativos en español por código (sin internos). */
const CODE_MESSAGES: Record<string, string> = {
  ERR_IDEMPOTENCY_KEY_REUSE:
    'El servidor ya registró otra venta con esta llave de idempotencia y contenido distinto. Requiere revisión manual.',
  ERR_INSUFFICIENT_STOCK:
    'Stock insuficiente en el servidor para uno o más productos (otro dispositivo pudo vender antes). Ajusta el inventario y reintenta.',
  ERR_PRODUCT_NOT_FOUND:
    'Un producto de la venta ya no existe en el servidor. Verifica el catálogo.',
  ERR_PRODUCT_NOT_IN_STORE:
    'Un producto de la operación no pertenece a la tienda. Verifica el catálogo.',
  ERR_STORE_MISMATCH:
    'Un producto de la venta pertenece a otra tienda. Verifica el catálogo.',
  ERR_PRODUCT_COST_UNAVAILABLE:
    'Un producto no tiene costo disponible para el costeo. Completa su ficha.',
  ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED:
    'Un producto tiene costo promedio cero sin documentar. Requiere corrección.',
  ERR_INVALID_PRICE:
    'El precio de una línea fue rechazado por desviarse del catálogo. Requiere autorización o corrección.',
  ERR_INVALID_DISCOUNT:
    'El descuento de la venta es inválido.',
  ERR_DISCOUNT_REASON_INVALID:
    'El motivo del descuento excede la longitud permitida.',
  ERR_DISCOUNT_REASON_REQUIRED:
    'El descuento autorizado exige motivo. Completa el motivo.',
  ERR_APPLIED_TAX_INVALID:
    'Los impuestos aplicados son inválidos o están duplicados.',
  ERR_EXCHANGE_RATE_UNAVAILABLE:
    'No hay tasa de cambio disponible para la moneda de la venta.',
  ERR_RATE_STALE:
    'La tasa de cambio usada está vencida. Sincroniza las tasas y reintenta.',
  ERR_RATE_REQUIRED_FOR_INCIDENT:
    'La incidencia de pago exige una tasa de tienda configurada.',
  ERR_NEGATIVE_SALE:
    'La venta tiene total negativo y no puede aprobarse.',
  ERR_TOTAL_MISMATCH:
    'El total calculado por el servidor no coincide con el enviado. Revisa cantidades y precios.',
  ERR_PAYMENT_MISMATCH:
    'El desglose de pago no cuadra con el total de la venta.',
  ERR_PAYMENT_COMPONENTS_INVALID:
    'El desglose de pago por moneda es inválido o está duplicado.',
  ERR_CASH_SETTLEMENT_INVALID:
    'La liquidación de efectivo contiene importes negativos o moneda no admitida.',
  ERR_CASH_SETTLEMENT_NOT_APPLICABLE:
    'La venta no tiene componente en efectivo para liquidar vuelto.',
  ERR_CASH_SETTLEMENT_MISMATCH:
    'La liquidación de efectivo no cuadra con lo cobrado.',
  ERR_OVERPAYMENT_UNREGISTERED_CHANGE:
    'Se recibió más de lo debido sin registrar el vuelto.',
  ERR_ZELLE_REQUIRES_RATE:
    'El pago por transf. exterior exige moneda distinta de CUP y tasa mayor que 1.',
  ERR_INVALID_CURRENCY:
    'La moneda de la venta es inválida.',
  ERR_PAYMENT_INVARIANT_VIOLATED:
    'La suma por moneda no cuadra con el total de la venta.',
  ERR_SUPERVISOR_REQUIRED:
    'El descuento exige autorización de supervisor.',
  ERR_SUPERVISOR_UNAUTHORIZED:
    'El supervisor no tiene acceso a esta tienda.',
  ERR_SUPERVISOR_TOKEN_REQUIRED:
    'Falta el token de autorización del supervisor.',
  ERR_SUPERVISOR_TOKEN_REUSED:
    'La autorización del supervisor ya fue usada en otra venta.',
  ERR_SUPERVISOR_SCOPE_VIOLATION:
    'La autorización del supervisor no cubre esta línea o producto.',
  ERR_SELLER_REQUIRED:
    'La venta exige vendedor válido.',
  ERR_SELLER_MISMATCH:
    'El vendedor de la venta no coincide con el usuario autenticado.',
  ERR_UNAUTHORIZED:
    'El usuario no tiene acceso a la tienda de la operación.',
  ERR_FUTURE_OPERATION_DATE:
    'La fecha de operación es futura. Corrige la fecha y reintenta.',
  ERR_FUTURE_DATED_DOCUMENT:
    'La fecha del documento es futura. Corrige la fecha y reintenta.',
  ERR_BACKDATED_DOCUMENT:
    'La fecha es anterior al límite operativo permitido. Corrige la fecha.',
  ERR_F21_TASA_INVALIDA:
    'Tasa de cambio de la recepción inválida (moneda ≠ CUP exige tasa > 1.5).',
  ERR_INVALID_EXCHANGE_RATE:
    'Tasa de cambio de la recepción fuera del rango permitido.',
  ERR_SUPPLIER_REQUIRED:
    'La recepción exige proveedor.',
  ERR_EMPTY_ITEMS:
    'La recepción no tiene líneas.',
  ERR_INVOICE_DUPLICATE:
    'El número de factura ya existe en esta tienda. Usa un número distinto.',
  ERR_INVALID_UNIT_COST:
    'El costo unitario de una línea debe ser mayor que cero.',
  ERR_AMBIGUOUS_ITEM:
    'Una línea trae producto existente y producto nuevo a la vez.',
  ERR_NEW_PRODUCT_INVALID:
    'El producto nuevo requiere SKU y nombre.',
  ERR_SKU_DUPLICATE_PAYLOAD:
    'SKU repetido entre los productos nuevos de la recepción.',
  ERR_SKU_EXISTS:
    'El SKU ya existe en el catálogo de esta tienda. Selecciona el producto existente.',
  ERR_STORE_NOT_FOUND:
    'No se pudo resolver la tienda de la recepción.',
  ERR_SAME_STORE:
    'La transferencia exige tiendas de origen y destino distintas.',
  ERR_ORIGIN_STORE_INACTIVE:
    'La tienda de origen está inactiva.',
  ERR_DEST_STORE_INACTIVE:
    'La tienda de destino está inactiva.',
  ERR_SERVICE_NOT_TRANSFERABLE:
    'Los servicios no se pueden transferir (no tienen existencias).',
  ERR_WAC_RECALC_ARGS:
    'Argumentos inválidos para el recálculo de costo.',
  ERR_WAC_REVERSE_NEGATIVE_STOCK:
    'La reversión dejaría el stock negativo.',
};

/** Extrae el primer código ERR_* real del texto del error. */
export function extractErrorCode(message: string): string | undefined {
  const m = message?.match(/\bERR_[A-Z0-9_]+\b/);
  return m?.[0];
}

/** Extrae el nombre de la restricción de un mensaje de unique violation. */
function extractConstraint(message: string): string | undefined {
  const m = message?.match(/unique constraint "([^"]+)"/i);
  return m?.[1];
}

const GENERIC_BUSINESS_MSG =
  'El servidor rechazó la operación de forma definitiva. Requiere revisión manual.';
const GENERIC_TRANSIENT_MSG =
  'Error temporal del servidor o de la red. Se reintentará automáticamente.';
const GENERIC_UNKNOWN_MSG =
  'Error no clasificado. La operación se conserva para revisión manual.';
const AUTH_MSG =
  'La sesión expiró. Inicia sesión de nuevo — la cola se conserva y se reanudará sola.';

/**
 * Clasifica un error de la cadena sync. Entrada: lo que realmente produjo
 * la operación (mensaje del error, código PG/PostgREST y/o status HTTP).
 * Determinista y pura: apta para servidor (route.ts) y cliente (engine).
 */
export function classifySyncError(input: {
  message?: string | null;
  code?: string | null;
  httpStatus?: number | null;
}): SyncErrorClassification {
  const message = input.message ?? '';
  const code = input.code ?? undefined;
  const httpStatus = input.httpStatus ?? undefined;

  // E — sesión expirada (401). No es conflicto; no consume reintentos.
  if (httpStatus === 401) {
    return { category: 'auth_required', retryable: false, message: AUTH_MSG };
  }

  // Códigos ERR_* reales extraídos del mensaje (el camino principal: la RPC
  // lanza RAISE EXCEPTION con el código embebido en el texto).
  const errCode = extractErrorCode(message) ?? (code?.startsWith('ERR_') ? code : undefined);
  if (errCode) {
    if (INTEGRITY_CODES.has(errCode)) {
      return {
        category: 'conflict_integrity',
        retryable: false,
        conflictType: 'integrity',
        errorCode: errCode,
        message: CODE_MESSAGES[errCode] ?? GENERIC_BUSINESS_MSG,
      };
    }
    if (BUSINESS_CODES.has(errCode)) {
      return {
        category: 'conflict_business',
        retryable: false,
        conflictType: 'business',
        errorCode: errCode,
        message: CODE_MESSAGES[errCode] ?? GENERIC_BUSINESS_MSG,
      };
    }
    // ERR_* desconocido (futuro): determinista por convención de la BD —
    // conservar SIN reintento automático (F: no adivinar transitoriedad).
    return {
      category: 'unknown',
      retryable: false,
      conflictType: 'unknown_error',
      errorCode: errCode,
      message: GENERIC_UNKNOWN_MSG,
    };
  }

  // 23505 / unique violation: semántica según la RESTRICCIÓN real.
  const isUniqueViolation =
    code === '23505' || /duplicate key value|unique constraint|Duplicate entry/i.test(message);
  if (isUniqueViolation) {
    const constraint = extractConstraint(message);
    if (constraint && CONSTRAINT_TO_BUSINESS_CODE[constraint]) {
      const mapped = CONSTRAINT_TO_BUSINESS_CODE[constraint]!;
      return {
        category: 'conflict_business',
        retryable: false,
        conflictType: 'business',
        errorCode: mapped,
        message: CODE_MESSAGES[mapped] ?? GENERIC_BUSINESS_MSG,
      };
    }
    // Índice de idempotencia u otra restricción sin evidencia de
    // correspondencia llave↔contenido → integridad (revisión humana).
    return {
      category: 'conflict_integrity',
      retryable: false,
      conflictType: 'integrity',
      errorCode: constraint ?? '23505',
      message:
        'El servidor detectó un duplicado (restricción única). Se conserva la operación para revisión manual.',
    };
  }

  // Errores de acceso a tienda (texto sin prefijo ERR_, de
  // register_stock_movement / register_reception): deterministas.
  if (/^Unauthorized store access/.test(message)) {
    return {
      category: 'conflict_business',
      retryable: false,
      conflictType: 'business',
      errorCode: 'ERR_UNAUTHORIZED',
      message: CODE_MESSAGES.ERR_UNAUTHORIZED!,
    };
  }

  // D — transitorios por status HTTP (5xx, 408, 425, 429).
  if (httpStatus !== undefined) {
    if (httpStatus >= 500 || httpStatus === 408 || httpStatus === 425 || httpStatus === 429) {
      return {
        category: 'transient',
        retryable: true,
        errorCode: `HTTP_${httpStatus}`,
        message: GENERIC_TRANSIENT_MSG,
      };
    }
    if (httpStatus >= 400) {
      // F — 4xx desconocido: conservar para revisión, sin reintento.
      return {
        category: 'unknown',
        retryable: false,
        conflictType: 'unknown_error',
        errorCode: `HTTP_${httpStatus}`,
        message: GENERIC_UNKNOWN_MSG,
      };
    }
  }

  // D — fallos de red (fetch rechazado: TypeError, abort, network).
  if (
    /network|fetch failed|Failed to fetch|ECONNRESET|ETIMEDOUT|socket|aborted|AbortError/i.test(
      message,
    )
  ) {
    return {
      category: 'transient',
      retryable: true,
      errorCode: 'NETWORK',
      message: GENERIC_TRANSIENT_MSG,
    };
  }

  // F — estructura desconocida: conservar y documentar, sin descartar.
  return {
    category: 'unknown',
    retryable: false,
    conflictType: 'unknown_error',
    message: GENERIC_UNKNOWN_MSG,
  };
}

/**
 * Mapea la clasificación canónica al status del contrato EXISTENTE de
 * /api/sync/batch (ok | conflict | error) sin romper al frontend desplegado:
 *   · conflict_integrity / conflict_business → conflict
 *   · transient → error (el motor reintenta con backoff)
 *   · auth_required → error (el engine lo detecta por 401 HTTP y pausa)
 *   · unknown → error (status LEGADO conservado: un error sin clasificar
 *     nunca fue 'conflict' antes; el cliente distingue por retryable:false
 *     y no lo reintenta automáticamente).
 */
export function classificationToBatchStatus(
  c: SyncErrorClassification,
): 'conflict' | 'error' {
  if (
    c.category === 'conflict_integrity' ||
    c.category === 'conflict_business'
  ) {
    return 'conflict';
  }
  return 'error';
}
