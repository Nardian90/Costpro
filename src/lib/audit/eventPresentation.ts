/**
 * eventPresentation — capa de traducción evento técnico → lenguaje de negocio.
 *
 * DASHBOARD V3 (feat/dashboard-v3-audit-ux — FASE 7/8/11):
 *
 * Principio (verbatim del mandato): "La interfaz debe hablar el idioma del
 * negocio; la trazabilidad técnica debe seguir existiendo detrás."
 *
 * Reglas de veracidad (FASE 8 / Criterio C):
 *   - El título traduce la ACCIÓN conocida; jamás inventa el detalle.
 *   - La descripción se construye SOLO con datos reales del registro
 *     (metadata/old_data/new_data). Si no hay datos → sin descripción.
 *   - Un evento desconocido no se disfraza: se humaniza su código literal
 *     y el código original queda disponible en "Detalles técnicos".
 *   - Documento asociado SOLO cuando la relación es inequívoca
 *     (sale_voided → record_id ES el id de la transacción — ver
 *     auditService.logSaleVoided). Otros eventos NO fabrican documentos:
 *     p.ej. invoice_without_price/sale_below_cost guardan un PRODUCT id en
 *     record_id, no una transacción.
 */

import { formatCurrency } from '@/lib/utils';
import type { AuditLogEntry } from '@/hooks/api/useAuditLogs';

// ─────────────────────────────────────────────────────────────────
// Títulos de negocio por acción conocida
// ─────────────────────────────────────────────────────────────────

/** Acciones registradas por src/services/audit-service.ts y triggers de BD. */
export const AUDIT_EVENT_TITLES: Record<string, string> = {
  // audit-service.ts — control y regulatory
  invoice_without_price:    'Venta con producto sin precio',
  sale_below_cost:          'Venta bajo costo',
  transfer_created:         'Transferencia creada',
  transfer_confirmed:       'Transferencia confirmada',
  transfer_cancelled:       'Transferencia cancelada',
  store_reset_initiated:    'Reinicio de tienda iniciado',
  store_reset_completed:    'Reinicio de tienda completado',
  reception_voided:         'Recepción anulada',
  reception_created:        'Recepción de mercancía registrada',
  fc_template_updated:      'Plantilla de ficha de costo actualizada',
  fc_generated:             'Ficha de costo generada',
  fc_auto_generated:        'Ficha de costo generada automáticamente',
  fc_pdf_exported:          'Documento de ficha de costo exportado',
  cash_closure_finalized:   'Cierre de caja finalizado',
  sale_voided:              'Venta anulada',
  stock_adjustment:         'Ajuste de stock registrado',
  price_change:             'Precio de producto actualizado',

  // Acciones de usuario (triggers + UI)
  CREATE_PRODUCT:           'Producto creado',
  UPDATE_PRODUCT:           'Producto actualizado',
  UPDATE_PRICES:            'Precios actualizados',
  DELETE_PRODUCT:           'Producto eliminado',
  ACTIVATE_PRODUCT:         'Producto activado',
  DEACTIVATE_PRODUCT:       'Producto desactivado',
  CREATE_SALE:              'Venta realizada',
  MANUAL_STOCK_ADJUSTMENT:  'Ajuste manual de stock',
  CREATE_TRANSFER:          'Transferencia iniciada',
  CONFIRM_TRANSFER:         'Transferencia confirmada',
  CREATE_USER:              'Usuario creado',
  UPDATE_USER_NAME:         'Nombre de usuario actualizado',
  DELETE_USER:              'Usuario eliminado',
  CHANGE_ROLE:              'Rol de usuario cambiado',
  CHANGE_ACTIVE_STORE:      'Tienda activa cambiada',
  UPDATE_STORE_CONFIG:      'Configuración de tienda actualizada',

  // Acciones genéricas de triggers (INSERT/UPDATE/DELETE por tabla)
  INSERT:                   'Registro creado',
  UPDATE:                   'Registro actualizado',
  DELETE:                   'Registro eliminado',
  VOID:                     'Documento anulado',
  CANCEL:                   'Documento cancelado',
};

/** Entidad de negocio por tabla interna (para frases honestas y genéricas). */
const TABLE_ENTITY: Record<string, string> = {
  products:               'un producto',
  inventory:              'el inventario',
  stock_movements:        'un movimiento de stock',
  receipts:               'una recepción',
  transactions:           'una venta',
  profiles:               'un usuario',
  stores:                 'la tienda',
  cash_closures:          'un cierre de caja',
  user_store_memberships: 'una membresía de tienda',
  transfers:              'una transferencia',
  store_cost_templates:   'una plantilla de ficha de costo',
  product_cost_sheets:    'una ficha de costo',
};

/** Humaniza un código de acción desconocido (traducción literal, no invención). */
function humanizeActionCode(action: string): string {
  const words = action.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ─────────────────────────────────────────────────────────────────
// Documentos asociados (FASE 11 — whitelist estricta)
// ─────────────────────────────────────────────────────────────────

export type AuditDocumentRef =
  | { kind: 'sale'; recordId: string }
  | null;

function getDocumentRef(entry: AuditLogEntry): AuditDocumentRef {
  // ÚNICA relación inequívoca certificada: sale_voided escribe record_id =
  // transactionId (auditService.logSaleVoided) con table_name 'transactions'.
  if (entry.action === 'sale_voided' && entry.table_name === 'transactions' && entry.record_id) {
    return { kind: 'sale', recordId: entry.record_id };
  }
  // Todo lo demás: SIN botón de documento (regla crítica — no fabricar).
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Presentación por evento
// ─────────────────────────────────────────────────────────────────

export type AuditSeverity = 'danger' | 'warning' | 'success' | 'neutral';

export interface AuditEventPresentation {
  title: string;
  description?: string;
  severity: AuditSeverity;
  document: AuditDocumentRef;
}

/** Severidad de negocio (solo acentos; colores semánticos de tokens). */
function getSeverity(entry: AuditLogEntry): AuditSeverity {
  const a = entry.action.toUpperCase();
  if (a.includes('RESET') || a.includes('DELETE')) return 'danger';
  if (a.includes('VOID') || a.includes('CANCEL') || a.includes('WITHOUT_PRICE') || a.includes('BELOW_COST')) return 'warning';
  if (a.includes('CONFIRMED')) return 'success';
  return 'neutral';
}

/** Formatea unidades monetarias cuando el dato existe y es numérico. */
function money(value: unknown): string | null {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return null;
  return formatCurrency(n);
}

/**
 * Construye la descripción de negocio SOLO con datos reales del registro.
 * Si no hay datos suficientes devuelve undefined (el modal muestra una
 * frase genérica honesta derivada del título — nunca un detalle inventado).
 */
function buildDescription(entry: AuditLogEntry): string | undefined {
  const meta = (entry.metadata || {}) as Record<string, any>;
  const parts: string[] = [];

  switch (entry.action) {
    case 'sale_voided': {
      if (meta.reason) parts.push(`Motivo registrado: ${String(meta.reason)}`);
      break;
    }
    case 'reception_created': {
      if (meta.supplier) parts.push(`Proveedor: ${String(meta.supplier)}`);
      if (meta.invoice_number) parts.push(`Factura: ${String(meta.invoice_number)}`);
      if (Number.isFinite(Number(meta.items_count))) parts.push(`${Number(meta.items_count)} artículo(s)`);
      const total = money(meta.total_cost);
      if (total) parts.push(`Total: ${total}`);
      break;
    }
    case 'transfer_created':
    case 'transfer_confirmed': {
      if (Number.isFinite(Number(meta.total_units_moved ?? meta.total_units))) {
        parts.push(`${Number(meta.total_units_moved ?? meta.total_units)} unidad(es) movidas`);
      }
      if (Number.isFinite(Number(meta.items_count))) parts.push(`${Number(meta.items_count)} producto(s)`);
      break;
    }
    case 'transfer_cancelled': {
      if (meta.reason && meta.reason !== 'Cancelled by user') parts.push(`Motivo registrado: ${String(meta.reason)}`);
      break;
    }
    case 'reception_voided': {
      if (meta.reason && meta.reason !== 'Anulada manualmente') parts.push(`Motivo registrado: ${String(meta.reason)}`);
      break;
    }
    case 'stock_adjustment': {
      if (Number.isFinite(Number(meta.old_stock)) && Number.isFinite(Number(meta.new_stock))) {
        parts.push(`De ${Number(meta.old_stock)} a ${Number(meta.new_stock)} unidades`);
      }
      if (meta.reason) parts.push(`Motivo: ${String(meta.reason)}`);
      break;
    }
    case 'price_change': {
      const oldP = money(meta.old_price);
      const newP = money(meta.new_price);
      if (oldP && newP) parts.push(`Precio anterior: ${oldP} · Precio nuevo: ${newP}`);
      break;
    }
    case 'cash_closure_finalized': {
      const diff = money(meta.difference);
      if (diff) parts.push(`Diferencia declarada vs sistema: ${diff}`);
      if (meta.status) parts.push(`Estado: ${String(meta.status)}`);
      break;
    }
    case 'sale_below_cost': {
      const price = money(meta.price);
      const cost = money(meta.cost);
      if (price && cost) parts.push(`Precio de venta: ${price} · Costo: ${cost}`);
      break;
    }
    case 'fc_template_updated': {
      if (meta.modalidad) parts.push(`Modalidad: ${String(meta.modalidad)}`);
      break;
    }
    case 'fc_generated':
    case 'fc_auto_generated': {
      const cost = money(meta.cost_price);
      const sale = money(meta.sale_price);
      if (cost && sale) parts.push(`Costo: ${cost} · Precio de venta: ${sale}`);
      break;
    }
    default:
      // CREATE_SALE / UPDATE_STORE_CONFIG / genéricos: el título basta;
      // el detalle fino vive en old/new_data del apartado técnico.
      // Sin descripción inventada.
      break;
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Frase genérica y honesta cuando no hay descripción de datos. */
export function getGenericSentence(entry: AuditLogEntry): string {
  const a = entry.action.toUpperCase();
  const entity = TABLE_ENTITY[entry.table_name];
  if (entity) {
    if (a === 'UPDATE') return 'Se modificó la información registrada.';
    if (a === 'DELETE') return 'Se eliminó el registro.';
    if (a === 'INSERT') return 'Se registró la actividad en el sistema.';
  }
  return 'El sistema registró esta actividad.';
}

/** Punto de entrada: presentación completa de un evento. */
export function getAuditEventPresentation(entry: AuditLogEntry): AuditEventPresentation {
  const knownTitle = AUDIT_EVENT_TITLES[entry.action];
  let title: string;

  if (knownTitle) {
    title = knownTitle;
    // INSERT/UPDATE/DELETE genéricos se refinan con la tabla si existe.
    const a = entry.action.toUpperCase();
    if (['INSERT', 'UPDATE', 'DELETE'].includes(a) && entry.table_name) {
      const entity = TABLE_ENTITY[entry.table_name];
      if (entity && entry.table_name !== 'products') {
        title = `Registro de ${entity.replace(/^(un|una|el|la) /, '')} ${knownTitle.split(' ').pop()}`;
      }
    }
  } else {
    title = humanizeActionCode(entry.action);
  }

  return {
    title,
    description: buildDescription(entry),
    severity: getSeverity(entry),
    document: getDocumentRef(entry),
  };
}

/** Opciones del filtro de tipo de evento (etiquetas de negocio, orden alfabético). */
export const AUDIT_FILTER_OPTIONS: Array<{ value: string; label: string }> =
  Object.entries(AUDIT_EVENT_TITLES)
    .filter(([value]) => !['INSERT', 'UPDATE', 'DELETE', 'VOID', 'CANCEL'].includes(value))
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

/** Etiqueta de actor legible: nombre → email → 'Sistema' (jamás 'sistema' crudo en UI). */
export function getActorLabel(entry: AuditLogEntry): string {
  return entry.profiles?.full_name || entry.profiles?.email || 'Sistema';
}
