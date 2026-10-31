/**
 * Tipos compartidos del módulo «Solicitud de Materiales» — espejo del esquema
 * real material_requests / material_request_items (migración
 * 20261031120000_res11_sc207_solicitud_materiales.sql).
 *
 * Modelo normativo: SC-2-07 «Solicitud de Entrega» (Res. 11/2007 MFP, Gaceta
 * Oficial No. 015 de 12/02/2007, Anexo Único) — 9 datos de uso obligatorio.
 */

export type MaterialRequestStatus = 'draft' | 'in_review' | 'confirmed' | 'voided';
export type MaterialRequestStatusFilter = 'all' | MaterialRequestStatus;

export interface MaterialRequestItem {
  id: string;
  request_id: string;
  product_id: string;
  /** Dato 5: código del producto (snapshot servidor desde products.sku). */
  sku: string;
  /** Dato 5: descripción (snapshot servidor desde products.name). */
  descripcion: string;
  /** Dato 5: unidad de medida (snapshot servidor desde products.unit_of_measure). */
  unit_of_measure: string;
  /** Dato 5: cantidad solicitada (> 0). */
  quantity: number;
  created_at: string;
}

export interface MaterialRequestDoc {
  id: string;
  store_id: string;
  /** Dato 9: número consecutivo del modelo (SM-NNNNNN-YYYY). */
  request_number: string;
  status: MaterialRequestStatus;
  /** Dato 1 / fecha de la Solicitud (dato 6). */
  fecha_emision: string;
  /** Dato 2: código de la entidad (nombre = tienda activa, automático). */
  entidad_codigo: string | null;
  /** Dato 3: almacén al que se efectúa la Solicitud. */
  warehouse_id: string | null;
  almacen_nombre: string;
  almacen_codigo: string | null;
  /** Dato 4: área solicitante / centro de costo / OP-OT. */
  area_nombre: string;
  area_codigo: string | null;
  centro_costo: string | null;
  production_order_id: string | null;
  /** Notas de negocio (dato adicional de COSTPRO, no exigido por el modelo). */
  notes: string;
  /** Dato 6: fecha en que se envió a revisión. */
  submitted_at: string | null;
  /** Dato 7: funcionario que autoriza + fecha (registrados al confirmar). */
  authorized_by: string | null;
  authorized_at: string | null;
  /** Dato 8: empleado del almacén que recibe + fecha (registrados al confirmar). */
  received_by: string | null;
  received_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  reopen_count: number;
  last_reopen_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Embeds (FK hints por constraint — ver VALE_SELECT del módulo Vales)
  items?: MaterialRequestItem[];
  creator?: { full_name: string } | null;
  authorizer?: { full_name: string } | null;
  receiver?: { full_name: string } | null;
  voider?: { full_name: string } | null;
  production_orders?: { order_number: string; order_type: string } | null;
  warehouses?: { name: string; code: string | null } | null;
}

/** Etiquetas del filtro de estado (mismo vocabulario del badge). */
export const MATERIAL_REQUEST_STATUS_FILTER_LABELS: Record<MaterialRequestStatusFilter, string> = {
  all: 'Todos',
  draft: 'Borradores',
  in_review: 'En Revisión',
  confirmed: 'Confirmadas',
  voided: 'Anuladas',
};

/** Línea editable del formulario (antes de persistir). */
export interface MaterialRequestFormLine {
  key: string;
  product_id: string;
  name: string;
  sku: string | null;
  unidad: string;
  quantity: number;
}

/** Payload de líneas que el cliente envía a las RPC (solo ids y cantidades). */
export interface MaterialRequestItemPayload {
  product_id: string;
  quantity: number;
}
