/**
 * CP-POS-002 (D3) — Tests de la clasificación canónica de errores.
 * Cada caso usa CÓDIGOS REALES extraídos de las migraciones vigentes
 * (evidencia: audit-evidence/CP-POS-002/). Ningún código inventado.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySyncError,
  classificationToBatchStatus,
  extractErrorCode,
} from '@/lib/sync/error-classification';

describe('CP-POS-002 · D3 clasificación canónica — códigos reales', () => {
  // ── C — conflictos de negocio (create_sale_v2) ──
  it('ERR_INSUFFICIENT_STOCK → conflicto de negocio, no reintentable', () => {
    const c = classifySyncError({ message: 'ERR_INSUFFICIENT_STOCK: product X, stock 2, requested 5' });
    expect(c.category).toBe('conflict_business');
    expect(c.retryable).toBe(false);
    expect(c.conflictType).toBe('business');
    expect(c.errorCode).toBe('ERR_INSUFFICIENT_STOCK');
    expect(c.message).toContain('Stock insuficiente');
  });

  it('ERR_PRODUCT_NOT_FOUND / ERR_PRODUCT_NOT_IN_STORE → negocio', () => {
    expect(classifySyncError({ message: 'ERR_PRODUCT_NOT_FOUND' }).errorCode).toBe('ERR_PRODUCT_NOT_FOUND');
    expect(classifySyncError({ message: 'ERR_PRODUCT_NOT_IN_STORE' }).category).toBe('conflict_business');
  });

  it('ERR_INVALID_PRICE y descuentos → negocio (precio/descuento rechazado)', () => {
    expect(classifySyncError({ message: 'ERR_INVALID_PRICE: price_at_sale=10 product=P' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_INVALID_DISCOUNT' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_DISCOUNT_REASON_REQUIRED' }).category).toBe('conflict_business');
  });

  it('fecha futura (ruta TS y RPC) → negocio determinista', () => {
    expect(classifySyncError({ message: 'ERR_FUTURE_OPERATION_DATE' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_FUTURE_DATED_DOCUMENT' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_BACKDATED_DOCUMENT' }).category).toBe('conflict_business');
  });

  it('tasa inválida (F-21 ruta y RPC recepción) → negocio', () => {
    expect(classifySyncError({ message: 'ERR_F21_TASA_INVALIDA' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_INVALID_EXCHANGE_RATE: tasa 0.01 out of range' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_EXCHANGE_RATE_UNAVAILABLE' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_RATE_STALE' }).category).toBe('conflict_business');
  });

  it('vendedor (ERR_SELLER_*) → negocio', () => {
    expect(classifySyncError({ message: 'ERR_SELLER_MISMATCH: p_seller_id=A no coincide' }).errorCode).toBe('ERR_SELLER_MISMATCH');
    expect(classifySyncError({ message: 'ERR_SELLER_REQUIRED' }).category).toBe('conflict_business');
  });

  it('permisos y supervisor → negocio', () => {
    expect(classifySyncError({ message: 'ERR_UNAUTHORIZED' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_SUPERVISOR_REQUIRED' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_SUPERVISOR_TOKEN_REUSED' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_SUPERVISOR_SCOPE_VIOLATION' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'Unauthorized store access' }).errorCode).toBe('ERR_UNAUTHORIZED');
  });

  it('dinero/moneda (create_sale_v2 §pagos) → negocio', () => {
    for (const code of [
      'ERR_TOTAL_MISMATCH', 'ERR_PAYMENT_MISMATCH', 'ERR_NEGATIVE_SALE',
      'ERR_PAYMENT_COMPONENTS_INVALID', 'ERR_CASH_SETTLEMENT_MISMATCH',
      'ERR_OVERPAYMENT_UNREGISTERED_CHANGE', 'ERR_ZELLE_REQUIRES_RATE',
      'ERR_INVALID_CURRENCY', 'ERR_PAYMENT_INVARIANT_VIOLATED',
    ]) {
      expect(classifySyncError({ message: `${code}: detalle` }).category, code).toBe('conflict_business');
    }
  });

  it('recepciones (register_reception) → negocio, incluidos duplicados que antes caían a reintentable', () => {
    // DEFECTO corregido: 'Duplicate' case-sensitive no matcheaba ERR_INVOICE_DUPLICATE
    expect(classifySyncError({ message: 'ERR_INVOICE_DUPLICATE: el número de factura "F1" ya existe' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_INVOICE_DUPLICATE: el número de factura "F1" ya existe' }).errorCode).toBe('ERR_INVOICE_DUPLICATE');
    expect(classifySyncError({ message: 'ERR_SKU_EXISTS: el SKU "S1" ya existe' }).errorCode).toBe('ERR_SKU_EXISTS');
    expect(classifySyncError({ message: 'ERR_SUPPLIER_REQUIRED' }).category).toBe('conflict_business');
    expect(classifySyncError({ message: 'ERR_AMBIGUOUS_ITEM' }).category).toBe('conflict_business');
  });

  it('transferencias (create_transfer) → negocio', () => {
    for (const code of ['ERR_SAME_STORE', 'ERR_ORIGIN_STORE_INACTIVE', 'ERR_SERVICE_NOT_TRANSFERABLE']) {
      expect(classifySyncError({ message: code }).category, code).toBe('conflict_business');
    }
  });

  // ── B — conflicto de integridad (llave reutilizada con contenido distinto) ──
  it('ERR_IDEMPOTENCY_KEY_REUSE → integridad, sin reintento ni sobrescritura', () => {
    const c = classifySyncError({ message: 'ERR_IDEMPOTENCY_KEY_REUSE: la clave está ligada a otra identidad' });
    expect(c.category).toBe('conflict_integrity');
    expect(c.conflictType).toBe('integrity');
    expect(c.retryable).toBe(false);
  });

  it('23505 del índice de idempotencia → INTEGRIDAD (nunca éxito asumido)', () => {
    const c = classifySyncError({
      message: 'duplicate key value violates unique constraint "transactions_idempotency_key_store_idx"',
      code: '23505',
    });
    expect(c.category).toBe('conflict_integrity');
    expect(c.conflictType).toBe('integrity');
    // Un 23505 crudo NO es evidencia de éxito idempotente (D3-A).
  });

  it('23505 con restricción de negocio conocida → código equivalente', () => {
    const c = classifySyncError({
      message: 'duplicate key value violates unique constraint "idx_receipts_store_reference_doc"',
      code: '23505',
    });
    expect(c.category).toBe('conflict_business');
    expect(c.errorCode).toBe('ERR_INVOICE_DUPLICATE');
  });

  // ── E — sesión expirada ──
  it('HTTP 401 → auth_required, no conflicto, no reintento', () => {
    const c = classifySyncError({ message: 'HTTP 401: No autorizado', httpStatus: 401 });
    expect(c.category).toBe('auth_required');
    expect(c.retryable).toBe(false);
    expect(c.conflictType).toBeUndefined();
    expect(c.message).toContain('sesión expiró');
  });

  // ── D — transitorios ──
  it('HTTP 5xx/408/429 → transitorio reintentable', () => {
    for (const s of [500, 502, 503, 504, 408, 429]) {
      const c = classifySyncError({ message: `HTTP ${s}: boom`, httpStatus: s });
      expect(c.category, `status ${s}`).toBe('transient');
      expect(c.retryable, `status ${s}`).toBe(true);
    }
  });

  it('errores de red (fetch rechazado) → transitorios', () => {
    for (const msg of ['fetch failed', 'TypeError: NetworkError when attempting to fetch resource', 'ECONNRESET', 'AbortError: The operation was aborted']) {
      expect(classifySyncError({ message: msg }).category, msg).toBe('transient');
    }
  });

  // ── F — desconocidos ──
  it('4xx desconocido → conservar SIN reintento automático (status legado error)', () => {
    const c = classifySyncError({ message: 'HTTP 418: teapot', httpStatus: 418 });
    expect(c.category).toBe('unknown');
    expect(c.retryable).toBe(false);
    expect(classificationToBatchStatus(c)).toBe('error');
  });

  it('estructura desconocida → conservar, nunca descartar', () => {
    const c = classifySyncError({ message: 'cualquier cosa sin código' });
    expect(c.category).toBe('unknown');
    expect(c.retryable).toBe(false);
  });

  it('ERR_ futuro no catalogado → determinista por convención (sin reintento)', () => {
    const c = classifySyncError({ message: 'ERR_FUTURE_CODE_XYZ' });
    expect(c.category).toBe('unknown');
    expect(c.retryable).toBe(false);
  });

  // ── contrato del batch (compatibilidad) ──
  it('mapeo a status del contrato: negocio/integridad → conflict; resto → error', () => {
    expect(classificationToBatchStatus(classifySyncError({ message: 'ERR_INSUFFICIENT_STOCK' }))).toBe('conflict');
    expect(classificationToBatchStatus(classifySyncError({ message: 'ERR_IDEMPOTENCY_KEY_REUSE' }))).toBe('conflict');
    expect(classificationToBatchStatus(classifySyncError({ message: 'HTTP 503: down', httpStatus: 503 }))).toBe('error');
    expect(classificationToBatchStatus(classifySyncError({ message: 'x', httpStatus: 401 }))).toBe('error');
    expect(classificationToBatchStatus(classifySyncError({ message: 'mensaje genérico' }))).toBe('error');
  });

  it('extractErrorCode: primer ERR_* del texto', () => {
    expect(extractErrorCode('Error: ERR_RATE_STALE: currency=USD store=S')).toBe('ERR_RATE_STALE');
    expect(extractErrorCode('sin código')).toBeUndefined();
  });
});
