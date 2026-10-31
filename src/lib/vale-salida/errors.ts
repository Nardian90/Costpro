/**
 * Mapeo canónico de errores RPC del módulo Vale de Salida → HTTP/user message.
 *
 * Fuente única de verdad compartida por:
 *   - POST /api/vale-salida        (flujo directo «crear y confirmar»)
 *   - POST /api/vale-salida/pending (flujo «guardar en revisión» — misión
 *     Res. 11, 2026-10-31)
 *
 * Cualquier error no listado cae a 500.
 */

export function mapValeRpcErrorToHttpStatus(msg: string): number {
  // 401 Unauthorized
  if (msg.includes('ERR_UNAUTHENTICATED')) return 401;
  // 403 Forbidden
  if (msg.includes('ERR_UNAUTHORIZED')) return 403;
  // 400 Bad Request
  if (msg.includes('ERR_EMPTY_ITEMS')) return 400;
  if (msg.includes('ERR_NOTES_REQUIRED')) return 400;
  if (msg.includes('ERR_IDEMPOTENCY_KEY_REQUIRED')) return 400;
  if (msg.includes('ERR_INVALID_QUANTITY')) return 400;
  if (msg.includes('ERR_PO_ITEM_REQUIRED')) return 400;
  if (msg.includes('ERR_PO_ITEM_WITHOUT_ORDER')) return 400;
  if (msg.includes('ERR_PRODUCT_MISMATCH')) return 400;
  if (msg.includes('ERR_VARIANT_MISMATCH')) return 400;
  if (msg.includes('ERR_VARIANT_NOT_BELONG_TO_PRODUCT')) return 400;
  if (msg.includes('ERR_OVERCONSUMPTION')) return 400;
  if (msg.includes('ERR_ORDER_NOT_EDITABLE')) return 400;
  if (msg.includes('ERR_INSUFFICIENT_STOCK') || msg.includes('Stock negativo')) return 400;
  if (msg.includes('ERR_DUPLICATE_PRODUCT')) return 400;
  // 404 Not Found
  if (msg.includes('ERR_PRODUCT_NOT_FOUND')) return 404;
  if (msg.includes('ERR_PO_ITEM_NOT_FOUND')) return 404;
  if (msg.includes('ERR_ORDER_NOT_FOUND')) return 404;
  if (msg.includes('ERR_ITEM_NOT_FOUND')) return 404;
  if (msg.includes('ERR_SLIP_NOT_FOUND')) return 404;
  // 409 Conflict
  if (msg.includes('ERR_IDEMPOTENCY') || msg.includes('duplicate key value')) return 409;
  if (msg.includes('ERR_DUPLICATE_PO_ITEM')) return 409;
  if (msg.includes('ERR_SLIP_HAS_MOVEMENTS')) return 409;
  // 422 Unprocessable Entity (cost unavailable / estado — server-side state)
  if (msg.includes('ERR_PRODUCT_COST_UNAVAILABLE')) return 422;
  if (msg.includes('ERR_BACKDATED_DOCUMENT')) return 422;
  if (msg.includes('ERR_FUTURE_DATED_DOCUMENT')) return 422;
  if (msg.includes('ERR_NOT_PENDING')) return 422;
  // 500 fallback
  return 500;
}

export function mapValeRpcErrorToUserMessage(msg: string): string {
  if (msg.includes('ERR_UNAUTHENTICATED')) return 'No autenticado';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'Sin acceso a la tienda';
  if (msg.includes('ERR_EMPTY_ITEMS')) return 'Items vacíos';
  if (msg.includes('ERR_NOTES_REQUIRED')) return 'Las notas son obligatorias';
  if (msg.includes('ERR_IDEMPOTENCY_KEY_REQUIRED')) return 'Idempotency key requerido';
  if (msg.includes('ERR_INVALID_QUANTITY')) return 'Cantidad inválida';
  if (msg.includes('ERR_PO_ITEM_REQUIRED')) return 'Cada item debe asociarse a una línea de OT';
  if (msg.includes('ERR_PO_ITEM_WITHOUT_ORDER')) return 'Item de OT sin orden de producción activa';
  if (msg.includes('ERR_PRODUCT_MISMATCH')) return 'Producto no coincide con la línea de OT';
  if (msg.includes('ERR_VARIANT_MISMATCH')) return 'Variante no coincide con la línea de OT';
  if (msg.includes('ERR_VARIANT_NOT_BELONG_TO_PRODUCT')) return 'Variante no pertenece al producto';
  if (msg.includes('ERR_OVERCONSUMPTION')) return 'Sobreconsumo de OT no permitido';
  if (msg.includes('ERR_ORDER_NOT_EDITABLE')) return 'La OT no está en estado editable';
  if (msg.includes('ERR_INSUFFICIENT_STOCK') || msg.includes('Stock negativo')) return 'Stock insuficiente';
  if (msg.includes('ERR_PRODUCT_NOT_FOUND')) return 'Producto no encontrado';
  if (msg.includes('ERR_PO_ITEM_NOT_FOUND')) return 'Línea de OT no encontrada';
  if (msg.includes('ERR_ORDER_NOT_FOUND')) return 'Orden de producción no encontrada';
  if (msg.includes('ERR_ITEM_NOT_FOUND')) return 'Item no encontrado';
  if (msg.includes('ERR_SLIP_NOT_FOUND')) return 'Vale no encontrado';
  if (msg.includes('ERR_IDEMPOTENCY') || msg.includes('duplicate key value')) return 'Idempotency conflict — request ya procesado';
  if (msg.includes('ERR_DUPLICATE_PO_ITEM')) return 'Línea de OT duplicada en el vale';
  if (msg.includes('ERR_DUPLICATE_PRODUCT')) return 'Producto duplicado en el vale';
  if (msg.includes('ERR_PRODUCT_COST_UNAVAILABLE')) return 'Costo del producto no disponible';
  if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
    return 'Fecha de operación fuera de rango: no puede ser anterior al límite histórico (6 meses) ni a la secuencia operativa de la tienda. Ajusta la fecha del vale e intenta de nuevo.';
  }
  if (msg.includes('ERR_FUTURE_DATED_DOCUMENT')) {
    return 'La fecha de operación no puede ser futura. Ajusta la fecha del vale e intenta de nuevo.';
  }
  // Etapa de revisión (pending): confirmación/anulación
  if (msg.includes('ERR_NOT_PENDING')) {
    return 'El vale ya no está en revisión: fue confirmado, anulado o devuelto previamente. Refresca el listado.';
  }
  if (msg.includes('ERR_SLIP_HAS_MOVEMENTS')) {
    return 'El vale tiene movimientos de inventario asociados; usa Devolver (reversión).';
  }
  return msg;
}
