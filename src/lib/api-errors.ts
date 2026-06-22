/**
 * Centralized API error messages with i18n keys.
 * The frontend can use these keys with useTranslations().
 * The `key` field maps to `apiErrors.*` in the i18n JSON files.
 */
export const API_ERRORS = {
  // Auth
  UNAUTHORIZED: { key: 'apiErrors.unauthorized', status: 401, defaultMessage: 'No autorizado' },
  FORBIDDEN: { key: 'apiErrors.forbidden', status: 403, defaultMessage: 'Prohibido' },

  // Store CRUD
  STORE_NOT_FOUND: { key: 'apiErrors.storeNotFound', status: 404, defaultMessage: 'Tienda no encontrada' },
  STORE_ALREADY_INACTIVE: { key: 'apiErrors.storeAlreadyInactive', status: 400, defaultMessage: 'La tienda ya está desactivada' },
  STORE_LIMIT_REACHED: { key: 'apiErrors.storeLimitReached', status: 403, defaultMessage: 'Límite de tiendas alcanzado' },
  STORE_CREATE_FAILED: { key: 'apiErrors.storeCreateFailed', status: 500, defaultMessage: 'Error al crear tienda' },
  STORE_FETCH_FAILED: { key: 'apiErrors.storeFetchFailed', status: 500, defaultMessage: 'Error al cargar tiendas' },
  STORE_UPDATE_FAILED: { key: 'apiErrors.storeUpdateFailed', status: 500, defaultMessage: 'Error al actualizar tienda' },
  STORE_DELETE_FAILED: { key: 'apiErrors.storeDeleteFailed', status: 500, defaultMessage: 'Error al eliminar tienda' },
  STORE_RESET_FAILED: { key: 'apiErrors.storeResetFailed', status: 500, defaultMessage: 'Error al reiniciar tienda' },
  STORE_PLAN_REQUIRED: { key: 'apiErrors.storePlanRequired', status: 400, defaultMessage: 'User plan is required to manage stores' },
  STORE_MEMBERSHIP_REQUIRED: { key: 'apiErrors.storeMembershipRequired', status: 403, defaultMessage: 'Active membership is required for this store' },
  STORE_MUTATION_FORBIDDEN: { key: 'apiErrors.storeMutationForbidden', status: 403, defaultMessage: 'Insufficient role to modify stores' },
  STORE_RESET_WARNING: { key: 'apiErrors.storeResetWarning', status: 200, defaultMessage: 'Store Reset Scheduled' },
  STORE_RESET_WARNING_MESSAGE: { key: 'apiErrors.storeResetWarningMessage', status: 200, defaultMessage: 'The store is being reset. All sales, inventory, and movement data will be deleted. Please save your work and reload the page.' },

  // Validation
  INVALID_DATA: { key: 'apiErrors.invalidData', status: 400, defaultMessage: 'Datos inválidos' },
  INVALID_STORE_ID: { key: 'apiErrors.invalidStoreId', status: 400, defaultMessage: 'ID de tienda inválido' },
  INVALID_ORIGIN: { key: 'apiErrors.invalidOrigin', status: 403, defaultMessage: 'Origen no permitido' },
  BAD_REQUEST: { key: 'apiErrors.badRequest', status: 400, defaultMessage: 'Solicitud inválida' },
  MISSING_PRODUCT_ID: { key: 'apiErrors.missingProductId', status: 400, defaultMessage: 'productId es requerido' },
  MISSING_STORE_SLUG: { key: 'apiErrors.missingStoreSlug', status: 400, defaultMessage: 'Slug de tienda es requerido' },
  BULK_IMPORT_LIMIT: { key: 'apiErrors.bulkImportLimit', status: 400, defaultMessage: 'Máximo 500 productos por importación' },
  BULK_IMPORT_NO_PRODUCTS: { key: 'apiErrors.bulkImportNoProducts', status: 400, defaultMessage: 'No se proporcionaron productos para importar' },
  BULK_IMPORT_INVALID_PRODUCT: { key: 'apiErrors.bulkImportInvalidProduct', status: 400, defaultMessage: 'Producto inválido: store_id, sku y name son obligatorios' },
  BULK_IMPORT_INVALID_PRICES: { key: 'apiErrors.bulkImportInvalidPrices', status: 400, defaultMessage: 'Costo y precio deben ser numéricos' },
  BULK_IMPORT_RLS_DENIED: { key: 'apiErrors.bulkImportRlsDenied', status: 403, defaultMessage: 'Sin permisos para insertar/actualizar productos' },
  BULK_IMPORT_CONFLICT: { key: 'apiErrors.bulkImportConflict', status: 409, defaultMessage: 'Conflicto de datos: SKU duplicado' },
  BULK_IMPORT_FAILED: { key: 'apiErrors.bulkImportFailed', status: 500, defaultMessage: 'Error al importar productos' },
  STORE_ACCESS_DENIED: { key: 'apiErrors.storeAccessDenied', status: 403, defaultMessage: 'Sin acceso a la tienda especificada' },
  TRANSFER_NOT_FOUND: { key: 'apiErrors.transferNotFound', status: 404, defaultMessage: 'Transferencia no encontrada o sin acceso' },
  INTERNAL_ERROR: { key: 'apiErrors.internalError', status: 500, defaultMessage: 'Error interno del servidor' },

  // FC Automatizada por Tienda
  PRODUCT_NOT_FOUND: { key: 'apiErrors.productNotFound', status: 404, defaultMessage: 'Producto no encontrado' },
  STORE_COST_TEMPLATE_FETCH_FAILED: { key: 'apiErrors.storeCostTemplateFetchFailed', status: 500, defaultMessage: 'Error al cargar plantilla de FC de la tienda' },
  STORE_COST_TEMPLATE_UPSERT_FAILED: { key: 'apiErrors.storeCostTemplateUpsertFailed', status: 500, defaultMessage: 'Error al guardar plantilla de FC de la tienda' },
  PRODUCT_COST_SHEET_SAVE_FAILED: { key: 'apiErrors.productCostSheetSaveFailed', status: 500, defaultMessage: 'Error al guardar ficha de costo del producto' },
  PDF_EXPORT_FAILED: { key: 'apiErrors.pdfExportFailed', status: 500, defaultMessage: 'Error al exportar PDF' },

  // AI / Bot
  AI_UNAVAILABLE: { key: 'apiErrors.aiUnavailable', status: 503, defaultMessage: 'El servicio AI no está disponible' },
  INVALID_JSON: { key: 'apiErrors.invalidJson', status: 400, defaultMessage: 'JSON inválido' },
  EMPTY_MESSAGES: { key: 'apiErrors.emptyMessages', status: 400, defaultMessage: 'Messages vacío' },

  // System
  CONFIG_ERROR: { key: 'apiErrors.configError', status: 500, defaultMessage: 'Error de configuración' },
  RATE_LIMITED: { key: 'apiErrors.rateLimited', status: 429, defaultMessage: 'Demasiadas solicitudes' },
  FC_INVALIDATE_FAILED: { key: "apiErrors.fcInvalidateFailed", status: 500, defaultMessage: "Error al invalidar fichas de costo" },
  AUDIT_QUERY_FAILED: { key: "apiErrors.auditQueryFailed", status: 500, defaultMessage: "Error al consultar logs de auditoría" },
  MEMBERSHIP_BULK_FAILED: { key: "apiErrors.membershipBulkFailed", status: 500, defaultMessage: "Error al procesar asignación masiva" },
  UNKNOWN_ERROR: { key: 'apiErrors.unknownError', status: 500, defaultMessage: 'Error desconocido' },
} as const;

export type ApiErrorKey = keyof typeof API_ERRORS;

/**
 * Create a standardized API error response body.
 * The `error` field keeps backward compatibility with existing clients.
 * The `key` field enables frontend i18n translation.
 */
export function createApiError(
  errorKey: ApiErrorKey,
  details?: unknown
): { error: string; key: string; details?: unknown } {
  const def = API_ERRORS[errorKey];
  return {
    error: def.defaultMessage,
    key: def.key,
    ...(details !== undefined && { details }),
  };
}
