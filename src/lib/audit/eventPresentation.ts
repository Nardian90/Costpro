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
 *   - Documento asociado SOLO cuando la relación es inequívoca, demostrada
 *     en el código que ESCRIBE el evento (no en la etiqueta):
 *       · sale_voided (V1, auditService.logSaleVoided) → record_id =
 *         transactionId, table_name 'transactions'.
 *       · REVERSE_TRANSACTION_V2 (V2, RPC reverse_transaction_v2 — migración
 *         20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql línea
 *         "VALUES ('REVERSE_TRANSACTION_V2', 'transactions', p_transaction_id,…")
 *         → record_id = id de la transacción anulada.
 *       · CREATE_SALE (V1, RPC create_sale — 20260215_comprehensive_audit_logging)
 *         y CREATE_SALE_V2 (V2, RPC create_sale_v2 — 20260807000003/
 *         20260812000002/20260915000001) → record_id = v_tx_id, table_name
 *         'transactions'. Verificado además contra datos reales: el evento y
 *         la transacción comparten store_id, total_amount y created_at.
 *     El discriminador es la TERNA (action, table_name, record_id) — jamás la
 *     etiqueta de negocio: recepciones (reception_created/receipts), órdenes
 *     de producción/trabajo/servicio u otros eventos con aspecto de "venta"
 *     NO cumplen la terna y NO obtienen botón. invoice_without_price/
 *     sale_below_cost guardan un PRODUCT id en record_id — excluidos.
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
  // REMEDIACIÓN (fix/audit-sale-document-link): la anulación V2 (RPC
  // reverse_transaction_v2) escribe REVERSE_TRANSACTION_V2 — mismo hecho de
  // negocio que sale_voided. Sin este mapeo el evento se humanizaría como
  // código crudo ("Reverse transaction v2"), violando el idioma de negocio.
  REVERSE_TRANSACTION_V2:   'Venta anulada',
  // REMEDIACIÓN (fix/audit-sale-document-link): el checkout V2 (RPC
  // create_sale_v2) escribe CREATE_SALE_V2 — mismo hecho de negocio que
  // CREATE_SALE ('Venta realizada'). Ambas acciones comparten terna
  // documental: (action, 'transactions', transaction id).
  CREATE_SALE_V2:           'Venta realizada',
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
  | {
      kind: 'sale';
      recordId: string;
      /**
       * 'sale'        → el evento REGISTRA la venta (CREATE_SALE / CREATE_SALE_V2):
       *                 el botón abre el registro operacional → "Ver venta".
       * 'voided-sale' → el evento ANULA la venta (sale_voided /
       *                 REVERSE_TRANSACTION_V2): botón "Ver documento" (comportamiento
       *                 certificado en feat/dashboard-v3-audit-ux).
       */
      intent: 'sale' | 'voided-sale';
    }
  | null;

/**
 * REMEDIACIÓN (fix/audit-sale-document-link): whitelist documental ampliada a
 * las ventas REALMENTE registradas. La relación evento → venta está
 * demostrada en el productor del evento (RPC/función de BD) y verificada
 * contra datos reales (record_id resuelve a transactions.id con mismo
 * store_id/total/created_at). El discriminador es la terna exacta
 * (action, table_name='transactions', record_id) — la etiqueta de negocio NO
 * participa, por lo que recepciones, órdenes de producción/trabajo/servicio,
 * cambios de estado (UPDATE_STATUS) y alertas de control (record_id = product
 * id) nunca obtienen botón documental.
 */
const SALE_CREATED_ACTIONS: ReadonlySet<string> = new Set(['CREATE_SALE', 'CREATE_SALE_V2']);
const SALE_VOIDED_ACTIONS: ReadonlySet<string> = new Set(['sale_voided', 'REVERSE_TRANSACTION_V2']);

function getDocumentRef(entry: AuditLogEntry): AuditDocumentRef {
  if (entry.table_name === 'transactions' && entry.record_id) {
    if (SALE_CREATED_ACTIONS.has(entry.action)) {
      return { kind: 'sale', recordId: entry.record_id, intent: 'sale' };
    }
    if (SALE_VOIDED_ACTIONS.has(entry.action)) {
      return { kind: 'sale', recordId: entry.record_id, intent: 'voided-sale' };
    }
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
  /**
   * REMEDIACIÓN: resumen de la venta construido SOLO con datos reales del
   * registro (metadata del V2 / new_data del V1). Si falta un dato, se omite
   * — jamás se inventa. Presente solo para eventos con documento de venta.
   */
  saleSummary?: string;
  /** Referencia corta de la venta (convención del visor: "Ref: XXXXXXXX"). */
  saleRef?: string;
}

/**
 * Traducción honesta de métodos de pago — enum CERRADO del checkout V2
 * (zod: ['cash','transfer','zelle','mixed']). Un valor fuera del enum se
 * omite (no se traduce a ciegas).
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  zelle: 'Zelle',
  mixed: 'Mixto',
};

/**
 * Construye "Información de la venta" SOLO con datos reales del evento.
 * Fuentes demostradas: CREATE_SALE_V2.metadata (total_amount, item_count,
 * payment_method) y CREATE_SALE.new_data (total_amount, items_count,
 * payment_method).
 */
function buildSaleSummary(entry: AuditLogEntry): string | undefined {
  const meta = (entry.metadata || {}) as Record<string, any>;
  const newData = (entry.new_data || {}) as Record<string, any>;
  const parts: string[] = [];

  const items = Number(meta.item_count ?? newData.items_count);
  if (Number.isFinite(items) && items > 0) parts.push(`${items} artículo(s)`);

  const methodRaw = meta.payment_method ?? newData.payment_method;
  const method = typeof methodRaw === 'string' ? PAYMENT_METHOD_LABELS[methodRaw] : undefined;
  if (method) parts.push(method);

  const total = money(meta.total_amount ?? newData.total_amount);
  if (total) parts.push(`Total: ${total}`);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Severidad de negocio (solo acentos; colores semánticos de tokens). */
function getSeverity(entry: AuditLogEntry): AuditSeverity {
  const a = entry.action.toUpperCase();
  if (a.includes('RESET') || a.includes('DELETE')) return 'danger';
  // REVERSE_TRANSACTION_V2 = misma anulación de venta que sale_voided →
  // misma severidad (no contiene el literal VOID).
  if (a.includes('VOID') || a === 'REVERSE_TRANSACTION_V2' || a.includes('CANCEL') || a.includes('WITHOUT_PRICE') || a.includes('BELOW_COST')) return 'warning';
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
    case 'sale_voided':
    case 'REVERSE_TRANSACTION_V2': {
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

  const document = getDocumentRef(entry);

  return {
    title,
    description: buildDescription(entry),
    severity: getSeverity(entry),
    document,
    saleSummary: document?.kind === 'sale' ? buildSaleSummary(entry) : undefined,
    saleRef:
      document?.kind === 'sale' && document.recordId
        ? `Ref: ${String(document.recordId).split('-')[0]}`
        : undefined,
  };
}

/** Opciones del filtro de tipo de evento (etiquetas de negocio, orden alfabético).
 *
 * REMEDIACIÓN (fix/audit-sale-document-link): los hechos de negocio que
 * existen en dos eras técnicas (venta creada: CREATE_SALE V1 + CREATE_SALE_V2;
 * venta anulada: sale_voided + REVERSE_TRANSACTION_V2) se agrupan en UNA
 * opción con `actions` — el filtro busca con `.in()` y los códigos internos
 * jamás se muestran. Sin agrupación aparecerían dos opciones idénticas
 * "Venta realizada" (defecto) o el filtro solo vería una era (engañoso).
 */
export interface AuditFilterOption {
  /** Clave única para el <select> (nunca se muestra al usuario). */
  value: string;
  label: string;
  /** Acciones internas cubiertas por esta etiqueta. Ausente = [value]. */
  actions?: string[];
}

export const AUDIT_FILTER_OPTIONS: AuditFilterOption[] =
  Object.entries(AUDIT_EVENT_TITLES)
    .filter(([value]) => {
      // Genéricos de trigger no filtrables...
      if (['INSERT', 'UPDATE', 'DELETE', 'VOID', 'CANCEL'].includes(value)) return false;
      // ...y códigos hermanos agrupados bajo su opción canónica (hechos con
      // dos eras técnicas — misma etiqueta de negocio, mismos datos).
      if (value === 'CREATE_SALE') return false;         // agrupado en CREATE_SALE_V2
      if (value === 'sale_voided') return false;         // agrupado en REVERSE_TRANSACTION_V2
      if (value === 'CONFIRM_TRANSFER') return false;    // agrupado en transfer_confirmed (duplicado preexistente del mismo patrón)
      return true;
    })
    .map(([value, label]) => {
      if (value === 'CREATE_SALE_V2') {
        return { value, label, actions: ['CREATE_SALE_V2', 'CREATE_SALE'] };
      }
      if (value === 'REVERSE_TRANSACTION_V2') {
        return { value, label, actions: ['REVERSE_TRANSACTION_V2', 'sale_voided'] };
      }
      if (value === 'transfer_confirmed') {
        return { value, label, actions: ['transfer_confirmed', 'CONFIRM_TRANSFER'] };
      }
      return { value, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

/** Resuelve las acciones internas de una opción de filtro ([keys] si no agrupa). */
export function resolveAuditFilterActions(option: AuditFilterOption): string[] {
  return option.actions ?? [option.value];
}

/** Etiqueta de actor legible: nombre → email → 'Sistema' (jamás 'sistema' crudo en UI). */
export function getActorLabel(entry: AuditLogEntry): string {
  return entry.profiles?.full_name || entry.profiles?.email || 'Sistema';
}
