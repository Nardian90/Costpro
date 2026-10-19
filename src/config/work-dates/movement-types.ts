/**
 * MOVEMENT TYPES REGISTRY — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Registro canónico de los tipos de movimiento operativo que generan
 * documentos con impacto en inventario, logística, servicios, ventas o caja,
 * junto con su política temporal real (derivada de la auditoría de la
 * MISIÓN POLÍTICA TEMPORAL — docs/audits/POLITICA_TEMPORAL_COSTPRO_2026-10-18.md
 * y el PR #1422, que el usuario confirmó fusionado).
 *
 * FUENTE ÚNICA para:
 *   - La vista «Fechas de trabajo» (matriz de movimientos).
 *   - El store de preferencias de fecha de trabajo (alcance por tipo).
 *   - Tests de completitud (los 5 flujos prioritarios + flujos descubiertos).
 *
 * Semántica de cada estado:
 *   - 'configurable'  → la política permite elegir la fecha de trabajo y el
 *                       formulario correspondiente expone el selector visible
 *                       (OperationDatePicker / POSOperationDateSection).
 *   - 'fija'          → el flujo estampa la fecha del reloj del servidor
 *                       (NOW()) por diseño documentado (caja, express,
 *                       ajuste por conteo, reversos). No se puede ni debe
 *                       elegir fecha: la ventana temporal ES la regla.
 *   - 'informativa'   → la fecha del documento es de planificación/vigencia
 *                       (OC esperada, cotización) y NO genera movimiento de
 *                       inventario ni contable al crearse. Fuera del gate.
 *
 * La columna «fecha que se aplicará» de cada tipo configurable vive en las
 * tablas reales indicadas en `dateFields`; NUNCA en una tabla paralela.
 */

import type { ViewType } from '@/store';

/** Estado de la política temporal del tipo de movimiento. */
export type WorkDateStatus = 'configurable' | 'fija' | 'informativa';

/** Área operativa real del menú de COSTPRO. */
export type WorkDateArea = 'Ventas' | 'Logística' | 'Almacén' | 'Caja' | 'Costo';

export interface MovementTypeInfo {
  /** ID estable del tipo (usado como clave de la preferencia per usuario/tienda). */
  id: string;
  /** Etiqueta visible en la matriz. */
  label: string;
  /** Área operativa del menú donde vive el flujo. */
  area: WorkDateArea;
  /** Descripción corta de qué documento genera. */
  description: string;
  /** Vista de COSTPRO donde se crea el documento (navegación desde la matriz). */
  targetView: ViewType;
  /** Dónde vive el selector visible dentro del flujo (para 'configurable'). */
  selectorLocation: string;
  /** Estado de la política temporal. */
  status: WorkDateStatus;
  /** Campos de fecha REALES del documento: operativa vs técnica (auditoría §2.1). */
  dateFields: {
    /** Columna(s) que reciben la fecha efectiva elegida. */
    effective: string;
    /** Columna(s) de fecha técnica (reloj de pared, trazabilidad). */
    technical: string;
    /** Fecha contable/financiera cuando difiere de la efectiva. */
    financial?: string;
  };
  /** Tabla y RPC que escriben el documento (referencia para la auditoría). */
  writesTo: string;
  /**
   * true si el tipo acepta preferencia de fecha de trabajo persistida
   * (por usuario + tienda) como default del próximo documento.
   * Solo 'configurable' puede tenerlo; los fijos muestran su regla.
   */
  preferenceEnabled: boolean;
  /** Nota de política explicando límites o excepciones (se muestra en la UI). */
  policyNote: string;
}

/**
 * Registro de tipos de movimiento. Orden = orden visual de la matriz
 * (flujos prioritarios de la misión primero, luego descubiertos, luego
 * reglas fijas).
 */
export const MOVEMENT_TYPES: MovementTypeInfo[] = [
  // ── Flujos prioritarios de la misión (§4.1–§4.4) ──
  {
    id: 'sale',
    label: 'Venta (POS / carrito / express)',
    area: 'Ventas',
    description: 'Venta cobrada en Vender: carrito, express o catálogo. Descuenta stock y registra cobros.',
    targetView: 'pos',
    selectorLocation: 'Vender → panel Pago / modal Express (sección «Fecha de venta»)',
    status: 'configurable',
    dateFields: {
      effective: 'transactions.created_at = completed_at',
      technical: 'audit_logs.created_at',
      financial: 'payment_transactions.payment_date',
    },
    writesTo: 'transactions / create_sale_v2 (/api/pos/checkout)',
    preferenceEnabled: true,
    policyNote:
      'Máximo HOY (Habana) · mínimo = última fecha operativa de la tienda (inclusivo por día). Hoy → el servidor estampa NOW(); otra fecha → mediodía local.',
  },
  {
    id: 'reception',
    label: 'Recepción de mercancía',
    area: 'Logística',
    description: 'Entrada de mercancía del proveedor. Aumenta stock y recalcula costo promedio.',
    targetView: 'reception_list',
    selectorLocation: 'Recepciones → Nueva Recepción (campo «Fecha de Recepción»)',
    status: 'configurable',
    dateFields: {
      effective: 'receipts.reception_date = created_at',
      technical: 'receipts.updated_at · receipt_items.paid_at',
      financial: 'receipt_items.paid_at',
    },
    writesTo: 'receipts / register_reception (/api/inventory/receptions)',
    preferenceEnabled: true,
    policyNote:
      'Máximo HOY (Habana) — una recepción futura envenena el mínimo de la tienda y bloquea todos los flujos. La Recepción Express siempre usa NOW().',
  },
  {
    id: 'vale_salida',
    label: 'Vale de Salida',
    area: 'Almacén',
    description: 'Descarga documentada de stock: consumo interno, mermas o entrega contra OT.',
    targetView: 'vales_salida',
    selectorLocation: 'Vales de Salida → Emitir (campo «Fecha del vale») · modo Vale en Vender',
    status: 'configurable',
    dateFields: {
      effective: 'issue_slips.created_at',
      technical: 'audit_logs.created_at',
    },
    writesTo: 'issue_slips / create_vale_salida (/api/vale-salida)',
    preferenceEnabled: true,
    policyNote:
      'Notas obligatorias en vales retro-fechados (trazabilidad C4). La devolución del vale estampa NOW() (reverso).',
  },
  {
    id: 'received_service',
    label: 'Servicio recibido',
    area: 'Almacén',
    description: 'Costo de servicio del período (transporte, aduana, seguro) distribuido al inventario.',
    targetView: 'received-services',
    selectorLocation: 'Servicios Recibidos → Registrar (campo «Fecha del servicio»)',
    status: 'configurable',
    dateFields: {
      effective: 'received_services.service_date',
      technical: 'received_services.created_at',
      financial: 'received_services.due_date · payment_transactions.payment_date',
    },
    writesTo: 'received_services / create_received_service_v2 (/api/received-services)',
    preferenceEnabled: true,
    policyNote:
      'Los servicios generan efecto CONTABLE (costo distribuido); el inventario solo se ve afectado al aplicar la distribución. La anulación estampa NOW().',
  },
  {
    id: 'cash_shift',
    label: 'Caja — turnos y arqueo',
    area: 'Caja',
    description: 'Apertura y cierre de turno de caja. El arqueo suma por ventana temporal real.',
    targetView: 'cash',
    selectorLocation: 'No aplica — ventana temporal del turno',
    status: 'fija',
    dateFields: {
      effective: 'ventana: apertura created_at < operaciones ≤ closed_at (NOW())',
      technical: 'cash_closures.closed_at = NOW() del RPC',
    },
    writesTo: 'cash_closures / close_cash_shift (/api/cash-closures/close)',
    preferenceEnabled: false,
    policyNote:
      'FIJA por diseño: el turno mide lo realmente cobrado en su ventana. No se elige fecha de trabajo en caja; las ventas retro-fechadas fuera de la ventana quedan fuera del arqueo (aviso no bloqueante en Vender).',
  },

  // ── Flujos descubiertos con selector visible (auditoría #7–#11, #17) ──
  {
    id: 'devolution',
    label: 'Devolución / nota de crédito',
    area: 'Ventas',
    description: 'Devolución de venta: reintegra productos y emite nota de crédito / egreso de caja.',
    targetView: 'devolutions',
    selectorLocation: 'Devoluciones → Nueva Devolución (campo «Fecha de la devolución»)',
    status: 'configurable',
    dateFields: {
      effective: 'devolutions.created_at',
      technical: 'devolutions.processed_at',
      financial: 'payment_transactions.payment_date',
    },
    writesTo: 'devolutions / create_devolution_v2 (/api/devolutions)',
    preferenceEnabled: true,
    policyNote:
      'La API ya soportaba operation_date (paridad con checkout); esta misión añade el selector visible a la UI. El egreso de caja del arqueo estampa NOW().',
  },
  {
    id: 'inventory_adjustment',
    label: 'Ajuste de inventario individual',
    area: 'Almacén',
    description: 'Corrección puntual de existencias con justificación documental.',
    targetView: 'inventory',
    selectorLocation: 'Inventario → Ajustar (modal de ajuste, campo fecha)',
    status: 'configurable',
    dateFields: {
      effective: 'stock_movements.movement_date = created_at',
      technical: 'products.updated_at',
    },
    writesTo: 'stock_movements / perform_inventory_adjustment (RPC directo)',
    preferenceEnabled: true,
    policyNote:
      'El Ajuste por Conteo (documental) estampa siempre NOW() — flujo rápido por diseño. El ajuste individual sí es retro-fechable dentro de la política.',
  },
  {
    id: 'transfer',
    label: 'Transferencia entre tiendas',
    area: 'Logística',
    description: 'Traslado de stock entre tiendas con tránsito y confirmación de recepción.',
    targetView: 'transferencias',
    selectorLocation: 'Transferencias → Nueva (campo fecha) · detalle → Confirmar (fecha de recepción)',
    status: 'configurable',
    dateFields: {
      effective: 'transfers.created_at · stock_movements.movement_date (confirm)',
      technical: 'transfers.confirmed_at',
    },
    writesTo: 'transfers / create_transfer + confirm_transfer',
    preferenceEnabled: true,
    policyNote:
      'Se valida contra el MÁXIMO de AMBAS tiendas (origen y destino). La confirmación propaga la fecha al Kardex de las dos tiendas.',
  },
  {
    id: 'catalog_sale',
    label: 'Venta por catálogo',
    area: 'Ventas',
    description: 'Venta asistida desde el catálogo de productos (mismo motor que Vender).',
    targetView: 'sales_catalog',
    selectorLocation: 'Catálogo → Confirmar venta (campo «Fecha de operación»)',
    status: 'configurable',
    dateFields: {
      effective: 'transactions.created_at = completed_at',
      technical: 'audit_logs.created_at',
      financial: 'payment_transactions.payment_date',
    },
    writesTo: 'transactions / create_sale_v2 (/api/pos/checkout)',
    preferenceEnabled: true,
    policyNote: 'Misma política y mismo endpoint que la venta POS.',
  },

  // ── Reglas fijas / informativas documentadas (auditoría §2.7) ──
  {
    id: 'purchase_order',
    label: 'Orden de compra',
    area: 'Logística',
    description: 'Pedido a proveedor. Su fecha esperada es de planificación, no operativa.',
    targetView: 'purchase-orders',
    selectorLocation: 'No aplica — fecha esperada informativa',
    status: 'informativa',
    dateFields: {
      effective: '— (no genera movimiento al crearse)',
      technical: 'purchase_orders.created_at',
    },
    writesTo: 'purchase_orders / create_purchase_order',
    preferenceEnabled: false,
    policyNote:
      'La fecha esperada (expected_date) es informativa. El movimiento real de stock ocurre en la RECEPCIÓN contra la OC, que sí respeta la política forward-only.',
  },
  {
    id: 'supplier_payment',
    label: 'Pago a proveedor (CxP / OT)',
    area: 'Costo',
    description: 'Pago de cuenta por pagar o de orden de trabajo. Registra la fecha financiera.',
    targetView: 'accounts_payable',
    selectorLocation: 'Cuentas por Pagar → Pagar · OT → pagos',
    status: 'configurable',
    dateFields: {
      effective: 'payment_transactions.payment_date',
      technical: 'payment_transactions.created_at',
    },
    writesTo: 'payment_transactions / register_supplier_payment',
    preferenceEnabled: false,
    policyNote:
      'La fecha financiera del pago no puede ser futura (gate + ruta). El backdating dentro de 6 meses es legítito («fechas históricas», V2.12.32). Sin preferencia de fecha de trabajo: el pago se fecha en su propio flujo.',
  },
];

/** IDs de los tipos con preferencia de fecha de trabajo habilitada. */
export const PREFERENCE_ENABLED_TYPES = MOVEMENT_TYPES.filter((t) => t.preferenceEnabled).map((t) => t.id);

/** Tipos por área (para el filtro de la matriz). */
export const WORK_DATE_AREAS: WorkDateArea[] = ['Ventas', 'Logística', 'Almacén', 'Caja', 'Costo'];

/** Búsqueda de un tipo por ID. */
export function getMovementType(id: string): MovementTypeInfo | undefined {
  return MOVEMENT_TYPES.find((t) => t.id === id);
}

/** Los 5 flujos prioritarios de la misión deben existir en el registro. */
export const PRIORITY_TYPE_IDS = ['sale', 'reception', 'vale_salida', 'received_service', 'cash_shift'] as const;
