// ============================================
// Tipos de la Aplicación - Plataforma Tienda Online
// ============================================

// 'superadmin' (misión organizaciones 2026-10-26): rol de PLATAFORMA global —
// solo la cuenta designada (admin@demo.com). No es un rol de tienda ni de
// tenant: concede administración transversal validada por el servidor
// (is_superadmin() en la DB, ROLES_HIERARCHY en la app).
// 'tenant_admin': existe en el enum user_role de la DB (auto-provisionado
// por el flujo de landing); se declara aquí para no degradarlo en
// validación de cliente (antes userRoleSchema hacía .catch('clerk')).
export type UserRole = 'admin' | 'superadmin' | 'encargado' | 'usuario' | 'manager' | 'clerk' | 'warehouse' | 'costo' | 'tenant_admin';

export type PaymentMethod = 'cash' | 'transfer' | 'zelle' | 'other' | 'mixed';

export type DiscountType = 'fixed' | 'percentage';

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'compensated'
  | 'cancelled'
  | 'refunded'
  | 'voided'
  | 'reversed'; // V2.2: reversión contable (invierte stock + kardex)

export type MovementType =
  | 'sale'
  | 'purchase'
  | 'adjustment'
  | 'return'
  | 'initial'
  | 'transfer'
  | 'void';

export type PurchaseStatus = PurchaseOrderStatus;

export type CashSessionStatus = 'open' | 'closed';

export type CashMovementType = 'in' | 'out';

// ============================================
// Usuario y Autenticación
// ============================================

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  roles?: UserRole[]; // New: support for multiple roles (e.g. per store)
  store_id?: string | null;
  active_store_id?: string | null;
  role_id?: string | null;
  logo_url?: string | null;
  reeup?: string | null;
  bank_account?: string | null;
  max_stores_limit?: number;
  max_users_limit?: number;
  created_by?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
}

// ============================================
// Roles y Permisos (Sistema Dinámico)
// ============================================

export interface Role {
  id: string;
  name: string;
  permissions: {
    views: string[];
    all: boolean;
  };
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// RSS y Noticias
// ============================================

// Categorías temáticas de los feeds RSS (interest MiPymes)
export type RSSFeedCategory =
  | 'economia_finanzas'
  | 'comercio_exterior'
  | 'tributacion_fiscal'
  | 'legislacion'
  | 'tecnologia'
  | 'mercados'
  | 'educacion_negocios'
  | 'regional_latam';

export const RSS_FEED_CATEGORIES: Record<RSSFeedCategory, { label: string; icon: string; description: string }> = {
  economia_finanzas:  { label: 'Economía y Finanzas',  icon: '💰', description: 'Política monetaria, PIB, inflación, tasas de interés' },
  comercio_exterior:  { label: 'Comercio Exterior',    icon: '🌍', description: 'Importación, exportación, aranceles, aduanas' },
  tributacion_fiscal: { label: 'Tributación y Fiscal',  icon: '📋', description: 'Impuestos, ONAT, declaraciones, régimen MiPyme' },
  legislacion:        { label: 'Legislación',           icon: '⚖️', description: 'Gaceta Oficial, decretos, normativa MiPyme' },
  tecnologia:         { label: 'Tecnología',            icon: '💻', description: 'Transformación digital, ciberseguridad, innovación' },
  mercados:           { label: 'Mercados',              icon: '📈', description: 'Precios, materias primas, commodities, análisis' },
  educacion_negocios: { label: 'Educación y Negocios',  icon: '🎓', description: 'Capacitación, gestión, MBA, casos de estudio' },
  regional_latam:     { label: 'Regional LatAm',        icon: '🌎', description: 'Economía Cuba, Caribe, América Latina' },
};

export interface RSSFeed {
  id: string;
  url: string;
  name: string | null;
  is_active: boolean;
  category?: RSSFeedCategory | null;
  created_at?: string;
  updated_at?: string;
}

export interface RSSSettings {
  id: string;
  priority_keywords: string[];
  cache_duration_minutes: number;
  created_at?: string;
  updated_at?: string;
}

export interface RSSNewsItem {
  id: string; // Generado o desde el link del RSS
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet?: string;
  feedName?: string;
  category?: RSSFeedCategory | null;
  isPriority: boolean;
  isExchangeRate?: boolean;
  exchangeRateData?: {
    currency: string;
    value: number;
    date: string;
  };
}

// ============================================
// Tienda
// ============================================

export interface UserStoreMembership {
  id?: string | null;
  user_id?: string | null;
  store_id?: string | null;
  role: UserRole;
  status: 'active' | 'revoked';
  created_at?: string | null;
  updated_at?: string | null;
  store?: Store | null;
}

export type StoreTemplate = 'construccion' | 'minimalista' | 'moderna' | 'clasica';

/**
 * Servicio que presta la empresa — se muestra en la vitrina pública.
 * icon: nombre de icono lucide-react (truck, shield, clock, wrench, etc.)
 */
export interface StoreService {
  icon: string;
  title: string;
  description?: string | null;
}

/**
 * Imagen promocional del carrusel de la vitrina.
 * url: URL pública de la imagen (Supabase Storage)
 * caption: texto opcional sobre la imagen
 * link: URL opcional a la que salta al hacer clic
 */
export interface StorePromoImage {
  url: string;
  caption?: string | null;
  link?: string | null;
}

export interface Store {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  reeup?: string | null;
  nit?: string | null;
  bank_account?: string | null;
  signature_url?: string | null;
  stamp_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean;
  slug?: string | null;
  plantilla?: StoreTemplate | null;
  cost_template?: StoreCostTemplate | null;
  created_at?: string;
  // ── Storefront config (2026-07-04) ──
  /** URL del banner personalizado para la vitrina. Si es null usa el default por plantilla. */
  banner_url?: string | null;
  /** Subtítulo o eslogan corto debajo del nombre. */
  store_tagline?: string | null;
  /** URL del grupo de WhatsApp (https://chat.whatsapp.com/...). */
  whatsapp_group_url?: string | null;
  /** URL del canal/grupo de Telegram (https://t.me/...). */
  telegram_url?: string | null;
  /** Array de servicios que presta la empresa (máx 6). */
  services?: StoreService[] | null;
  /** Array de imágenes promocionales del carrusel (máx 5). */
  promo_images?: StorePromoImage[] | null;
  /** Horario de atención en texto libre. */
  opening_hours?: string | null;
  /** Texto del CTA superpuesto al banner (opcional). */
  banner_cta_text?: string | null;
  /** URL del CTA del banner (opcional). Si es null, scroll a #productos. */
  banner_cta_link?: string | null;
}

// ============================================
// Producto
// ============================================

export type BarcodeType = 'EAN13' | 'UPC' | 'CODE128' | 'SKU' | 'auto' | (string & {});

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  barcode_type?: BarcodeType | null;
  price: number;
  precio_empresa?: number | null;
  // HARDENING-PRECIO-EMPRESA: moneda independiente para precio_empresa (venta mayorista).
  // Puede diferir de price_currency. NULL cuando precio_empresa es NULL.
  precio_empresa_currency?: string | null;
  cost_price: number;
  price_currency?: string;
  image_url?: string | null;
  category?: string | null;
  unit_of_measure?: string | null;
  supplier?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  stock_current: number;
  cost_average?: number | null;
  min_stock?: number | null;
  /** @description ID de la tienda a la que pertenece este producto. Siempre debería tener valor, pero las RPCs de Supabase pueden devolver null/undefined durante la hidratación. */
  store_id?: string | null;
  public_image_url?: string | null;
  is_active?: boolean;
  is_complete?: boolean;
  has_movements?: boolean;
  visible_en_tienda?: boolean;
  /** Precio visible en la tienda pública (toggle de vitrina por producto) */
  price_visible?: boolean;
  /** Stock visible en la tienda pública (toggle de vitrina por producto) */
  stock_visible?: boolean;
  /** Marca el producto como en promoción/oferta en la vitrina */
  on_promotion?: boolean;
  /**
   * Tipo de artículo (MISIÓN TIPO-DE-ARTÍCULO 2026-10-19):
   * TRUE = servicio intangible — sin existencias propias; el frontend NO le
   * aplica guards de stock (carrito, checkout, conteo). La BD lo respeta
   * desde 20260810000070 y create_sale_v2 desde 20261017000000.
   * FALSE/undefined = producto físico — sujeto a las validaciones vigentes.
   * Independiente de la categoría comercial (category).
   */
  is_service?: boolean;
  product_variants?: ProductVariant[] | null;
  cost_sheet_id?: string | null;
  fc_auto_enabled?: boolean;
}

export interface ProductVariant {
  id: string;
  product_id?: string | null;
  name: string;
  sku?: string | null;
  price: number;
  precio_empresa?: number | null;
  conversion_factor: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// Inventario
// ============================================

export interface Inventory {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold: number;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  created_at: string;
  product_id: string;
  type: MovementType;
  quantity_change: number;
  reference_id: string | null;
  user_id: string | null;
  balance_after: number | null;
  unit_cost?: number;
}

export interface InventoryBatch {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  received_at: string;
}

export interface StockMovement {
  id: string;
  /** @description ID de la tienda. Puede ser null en datos heredados. */
  store_id?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  quantity_change: number;
  movement_type: MovementType | string;
  reference_id?: string | null;
  reference_doc?: string | null;
  movement_date?: string | null;
  created_by?: string | null;
  created_at: string;
  unit_cost?: number;
  unit_price?: number;
  balance_after?: number;
  product?: {
    name: string;
    sku: string | null;
  };
}

// ============================================
// Transacciones y Ventas
// ============================================

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price_sold: number;
  cost_at_sale: number;
  created_at: string;
}

export interface TaxConfiguration {
  id: string;
  name: string;
  type: 'fixed' | 'percentage';
  value: number;
  min_exempt?: number | null;
  is_active: boolean;
  store_id?: string | null;
}

export interface Transaction {
  id: string;
  /** @description ID de la tienda. Puede ser null en datos heredados. */
  store_id?: string | null;
  seller_id?: string | null;
  total_amount: number;
  status: TransactionStatus;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  void_reason?: string | null;
  payment_method?: PaymentMethod | null;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  applied_taxes?: any[] | null;
  idempotency_key?: string | null;
  // V2.2: campos de auditoría de reversión contable
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  original_transaction_id?: string | null;
  // PR-4.4G: campos de pago para visualización USD/Zelle
  cash_amount?: number | null;
  transfer_amount?: number | null;
  zelle_amount?: number | null;
  sale_currency?: string | null;
  sale_exchange_rate?: number | null;
  customer_name?: string | null;
  invoice_number?: string | null;
  // MISIÓN CAJA v2.24.0 (D6): liquidación del cobro — vuelto multimoneda
  // persistido ENLAZADO a la venta (sin fila de caja aparte). NULL en ventas
  // legacy y en ventas sin efectivo: la identidad canónica es
  // (recibido − vuelto) CUP + (recibido − vuelto) USD × tasa ≈ cash_amount.
  cash_received_cup?: number | null;
  cash_received_usd?: number | null;
  change_given_cup?: number | null;
  change_given_usd?: number | null;
  change_currency?: 'CUP' | 'USD' | null;
  /** Tasa USD usada en la liquidación (cobro o vuelto en USD). */
  change_exchange_rate?: number | null;
  /** Fuente de la tasa (store_exchange_rates | global_bcc_seg3 | global_eltoque). */
  change_rate_source?: string | null;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  price_at_sale: number;
  cost_at_sale: number;
  created_at: string;
  products?: {
    name: string;
    sku: string | null;
  } | null;
  // PR-4.4H: Currency fields for traceability (USD/Zelle vs CUP)
  // These are NULL for historical sales but populated for new sales going forward
  price_currency?: string | null;
  price_at_sale_cup?: number | null;
  cash_paid?: number | null;
  transfer_paid?: number | null;
  zelle_paid?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
  cash_currency?: string | null;
  transfer_currency?: string | null;
  zelle_currency?: string | null;
}

export interface CartItem {
  product_id: string;
  variant_id: string | null;
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
  price: number;
  cost: number;
  subtotal: number;
}

export interface Discount {
  type: DiscountType;
  value: number;
}

// ============================================
// Recepciones y Órdenes de Compra
// ============================================

export interface Receipt {
  id: string;
  created_at: string;
  updated_at?: string | null;
  user_id?: string | null;
  status: 'active' | 'voided' | 'pending' | 'partial' | 'confirmed' | 'reversed'; // V2.2: +confirmed, +reversed
  total_cost: number;
  reference_doc?: string | null;
  notes?: string | null;
  store_id?: string | null;
  supplier?: string | null;
  reception_date?: string | null;
  // FIX-PAYMENT-TRACKING (2026-07-12): campos de pago a proveedor
  payment_status?: 'unpaid' | 'partial' | 'paid';
  payment_method?: 'cash' | 'transfer' | 'zelle' | null;
  paid_amount?: number;
  due_date?: string | null;
  paid_at?: string | null;
  payment_terms_days?: number;
  // V2.2: campos de auditoría de reversión contable
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  original_receipt_id?: string | null;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  moneda_recepcion?: string;
  tasa_cambio_recepcion?: number;
  created_at?: string;
  updated_at?: string;
  products?: {
    name: string;
    sku?: string | null;
    image_url?: string | null;
    public_image_url?: string | null;
  } | null;
}

// ============================================
// Payment Tracking — Pagos a proveedores
// ============================================
export interface PaymentTransaction {
  id: string;
  store_id: string;
  // PR-4.4I + ajustes (2026-10) + ingresos/egresos de caja (2026-10-20):
  // 'adjustment' = ajuste extraordinario del reporte; 'cash_flow' = documento
  // Ingreso/Egreso de caja (fondo de cambio y otros) — ver CashFlowDocument.
  ref_type: 'receipt' | 'service' | 'production_order' | 'work' | 'sale' | 'commission' | 'adjustment' | 'cash_flow';
  ref_id: string;
  amount: number;
  payment_method: 'cash' | 'transfer' | 'zelle' | 'card' | 'wallet' | 'other' | 'mixed';
  currency: string;
  exchange_rate: number;
  amount_cup: number;
  /** Dirección del flujo: in = entra efectivo, out = sale, refund = reembolso */
  direction?: 'in' | 'out' | 'refund';
  payment_date: string;
  reference?: string | null;
  notes?: string | null;
  paid_by?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashReport {
  sales: Array<{
    payment_method: string;
    currency: string;
    transaction_count: number;
    total: number;
  }>;
  payments: Array<{
    payment_method: string;
    currency: string;
    ref_type: 'receipt' | 'service' | 'production_order' | 'work';
    payment_count: number;
    total: number;
  }>;
  commissions: Array<{
    payment_method: string;
    currency: string;
    commission_count: number;
    total: number;
  }>;
  // MISIÓN PERSONALIZACIÓN REPORTE ENTREGA (2026-10-25): filas de venta
  // individuales del período con su composición REAL de pagos (buckets
  // método × moneda de la MISMA reconstrucción que sales_split). Input de la
  // selección de ventas en pantalla/PDF/Excel — capa de presentación, sin
  // migraciones. `items`/`tx`/`payments` permiten recomputar la tabla por
  // producto del conjunto seleccionado con buildItemsSummary (misma función
  // del servidor). sales_rows_truncated: el payload se acotó a 1000 filas
  // (el split/grupos se calculan siempre sobre el universo completo).
  sales_rows?: Array<{
    id: string;
    created_at: string;
    customer_name?: string | null;
    reference?: string | null;
    status?: string;
    source: 'ledger' | 'reconstruction' | 'no-items';
    buckets: Array<{ method: 'cash' | 'transfer' | 'zelle'; currency: string; amount: number; amount_cup: number }>;
    tx?: Record<string, unknown>;
    items?: Array<Record<string, unknown>>;
    payments?: Array<Record<string, unknown>>;
  }>;
  sales_rows_truncated?: boolean;
  // FIX (2026-07-15): Órdenes de producción/servicios (anticipos + pagos recibidos).
  // Son INGRESOS del cliente, van en sección aparte del reporte de caja.
  production?: Array<{
    payment_method: string;
    currency: string;
    ref_type: 'production_order' | 'work';
    payment_count: number;
    total: number;
  }>;
  // MISIÓN INGRESOS/EGRESOS 2026-10-20: movimientos de caja documentados
  // (fondo de cambio y otros). GRUPOS agregados del RPC get_cash_report
  // (las FILAS del ledger las enriquece /api/cash-report como `cash_flows`).
  cash_flow_groups?: Array<{
    payment_method: string;
    currency: string;
    direction: 'in' | 'out';
    flow_count: number;
    total: number;
    total_cup: number;
  }>;
  // MISIÓN DE SEGUIMIENTO 2026-10-21 (v2.22.0): reembolsos de devoluciones
  // comerciales por método (informativo; SOLO el tramo cash resta al balance).
  refunds?: Array<{
    payment_method: string;
    currency: string;
    refund_count: number;
    total: number;
    total_cup: number;
  }>;
  totals: {
    sales_total_cup: number;
    payments_total_cup: number;
    commissions_total_cup: number;
    production_total_cup?: number;
    cash_flow_in_total_cup?: number;
    cash_flow_out_total_cup?: number;
    /** v2.22.0: reembolsos de devolución SOLO en efectivo (término del balance). */
    refunds_cash_total_cup?: number;
    balance_cup: number;
  };
  start_date: string;
  end_date: string;
  cash_balance_cup: number;
  cash_breakdown: Array<{ denom: number; count: number; total: number }>;
  period?: { start: string; end: string };
}

// ============================================
// Ingresos/Egresos de Caja — MISIÓN 2026-10-20
// ============================================

/** Conceptos autorizados del documento Ingresos/Egresos (extensible). */
export type CashFlowConcept =
  | 'constitucion_fondo'
  | 'reposicion_fondo'
  | 'devolucion_total_fondo'
  | 'devolucion_parcial_fondo'
  | 'otro_ingreso'
  | 'otro_egreso'
  /** MISIÓN CAJA v2.24.0 (D4): entrega del efectivo acumulado — el ÚNICO
   *  concepto autorizable SIN turno abierto (outside_shift, closure_id NULL,
   *  rol admin/manager/encargado + contraparte obligatoria, validación POR
   *  MONEDA contra el libro físico get_cash_currency_summary). */
  | 'entrega_efectivo';

export interface CashFlowDocument {
  id: string;
  store_id: string;
  document_number: string;
  doc_type: 'ingreso' | 'egreso';
  concept: CashFlowConcept;
  amount: number;
  currency: 'CUP' | 'USD';
  exchange_rate: number;
  amount_cup: number;
  payment_method: 'cash';
  operation_date: string;
  status: 'confirmado' | 'anulado';
  closure_id: string | null;
  responsible_user_id: string;
  counterparty: string | null;
  justification: string;
  notes: string | null;
  related_document_id: string | null;
  payment_transaction_id: string | null;
  annulment_payment_transaction_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  created_by: string;
  confirmed_at: string;
  confirmed_by: string;
  annulled_at: string | null;
  annulled_by: string | null;
  annulment_reason: string | null;
  /** Embeds opcionales de la consulta */
  responsible?: { full_name: string } | null;
  annulled_by_profile?: { full_name: string } | null;
  related_document?: { document_number: string; concept: CashFlowConcept } | null;
}

/** Respuesta del RPC get_cash_flow_summary (KPIs de la vista). */
export interface CashFlowSummary {
  window_start: string;
  has_pending_shift: boolean;
  opening_balance: number;
  total_sales: number;
  cash_sales: number;
  cash_outflows: number;
  cash_production: number;
  cash_commissions: number;
  cash_flow_in: number;
  cash_flow_out: number;
  /** v2.22.0 (MISIÓN DE SEGUIMIENTO): reembolsos EN EFECTIVO de devoluciones. */
  cash_refunds: number;
  /** v2.23.0 (decisión del propietario 2026-10-21): reembolsos por VOUCHER de devoluciones (base NETA). */
  voucher_refunds: number;
  expected_cash: number;
  transfer_sales: number;
  zelle_sales: number;
  expected_total: number;
  fondo_vigente: number;
  fondo_ingresado: number;
  fondo_devuelto: number;
  period: {
    from: string;
    to: string;
    in_cup: number;
    out_cup: number;
    in_usd: number;
    out_usd: number;
    ingresos_count: number;
    egresos_count: number;
    annulled_count: number;
  };
}

// ============================================
// Production Orders — Órdenes de Producción y Trabajo
// ============================================
export interface ProductionOrder {
  id: string;
  store_id: string;
  order_number: string;
  order_type: 'production' | 'service' | 'work';
  status: 'draft' | 'approved' | 'in_progress' | 'paused' | 'completed' | 'closed' | 'voided' | 'reversed'; // V2.2: +reversed
  customer_name?: string | null;
  customer_ci?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  budget_total: number;
  budget_currency: string;
  advance_amount: number;
  advance_method?: 'cash' | 'transfer' | 'zelle' | null;
  advance_currency: string;
  paid_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  output_product_id?: string | null;
  output_quantity: number;
  transaction_id?: string | null;
  order_date: string;
  start_date?: string | null;
  completion_date?: string | null;
  closed_at?: string | null;
  description?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // V2.2: auditoría de reversión contable
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
}

export interface ProductionOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id?: string | null;
  budgeted_qty: number;
  budgeted_unit_cost: number;
  actual_qty: number;
  actual_unit_cost: number;
  withdrawn_at?: string | null;
  status: 'pending' | 'partial' | 'completed';
  notes?: string | null;
  // V2.12.36: exceso facturable al cliente
  exceso_qty?: number;
  exceso_importe?: number;
  exceso_moneda?: string;
  facturar_exceso?: boolean;
  products?: { id: string; name: string; sku?: string | null; stock_current: number } | null;
}

// ============================================
// EM-R5: Orden de Compra
// ============================================

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  store_id: string;
  supplier_id?: string | null;
  supplier_name: string;
  po_number?: string | null;
  status: PurchaseOrderStatus;
  total_amount: number;
  notes?: string | null;
  expected_date?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id?: string | null;
  product_name: string;
  sku?: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  unit_of_measure: string;
  created_at: string;
}

// ============================================
// Transferencias
// ============================================

export type TransferStatus = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'REVERSADA'; // V2.2: +REVERSADA

export interface Transfer {
  id: string;
  origin_store_id: string;
  destination_store_id: string;
  created_by: string;
  status: TransferStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  origin_store?: Store | null;
  destination_store?: Store | null;
  creator?: { full_name: string } | null;
  items?: TransferItem[] | null;
  // V2.2: campos de auditoría de reversión contable
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
}

export interface TransferItem {
  id?: string | null;
  transfer_id?: string | null;
  product_id: string;
  quantity: number;
  unit_cost: number;
  product?: Product | null;
}

// ============================================
// V2.2: Devoluciones (estaban ausentes en types)
// ============================================
export type DevolutionStatus = 'pending' | 'completed' | 'voided' | 'reversed';

export interface Devolution {
  id: string;
  store_id: string;
  devolution_number: string;
  customer_name?: string | null;
  customer_ci?: string | null;
  reason: string;
  total_amount: number;
  payment_method?: 'cash' | 'transfer' | 'zelle' | null;
  status: DevolutionStatus;
  processed_at: string;
  processed_by?: string | null;
  transaction_id?: string | null;
  // V2.2: auditoría de reversión
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  items?: Array<{
    id: string;
    devolution_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
  }> | null;
}

// ============================================
// V2.2: Inventory Adjustments (estaban ausentes en types)
// ============================================
export type InventoryAdjustmentStatus = 'pending' | 'confirmed' | 'reversed';

export interface InventoryAdjustment {
  id: string;
  store_id: string;
  adjustment_number?: string | null;
  reason: string;
  status: InventoryAdjustmentStatus;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  // V2.2: auditoría de reversión
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
  items?: Array<{
    id: string;
    adjustment_id: string;
    product_id: string;
    quantity_change: number;
    unit_cost?: number;
    reason?: string | null;
  }> | null;
}

export interface PurchaseItem {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  created_at: string;
}

// ============================================
// Caja y Sesiones
// ============================================

export interface CashRegisterSession {
  id: string;
  store_id: string;
  cashier_id: string;
  opening_cash: number;
  opened_at: string;
  status: CashSessionStatus;
}

export interface CashMovement {
  id: string;
  session_id: string;
  movement_type: CashMovementType;
  method: PaymentMethod;
  amount: number;
  reason: string | null;
  created_at: string;
}

export interface CashClosure {
  id: string;
  user_id: string;
  store_id: string;
  session_reference: string | null;
  declared_cash: number;
  declared_vouchers: number;
  system_total: number;
  notes: string | null;
  status: 'pendiente' | 'cerrado';
  closed_at: string | null;
  created_at: string;
  declared_total: number;
  system_expected_total: number;
  difference: number;
  opening_balance?: number; // FIX F3-01: fondo inicial preservado al cerrar (lado canónico CUP)
  cash_movements_total?: number; // FIX F3-03: total de movimientos (entradas/salidas)
  // MISIÓN CAJA v2.24.0 (D8): apertura/arqueo por moneda — el lado canónico
  // CUP se conserva; el lado USD es el efectivo físico nativo del cajón.
  opening_balance_cup?: number | null;
  opening_balance_usd?: number | null;
  /** Diferencia documentada al abrir: contado − esperado (NO se autoajusta). */
  opening_difference_cup?: number | null;
  opening_difference_usd?: number | null;
  opening_difference_note?: string | null;
  /** Efectivo USD contado al cerrar (p_declared_cash_usd del RPC v2.24.0). */
  declared_cash_usd?: number | null;
  /** Efectivo USD esperado por el sistema al cerrar. */
  system_expected_cash_usd?: number | null;
  /** Diferencia USD = contado − esperado (se registra tal cual). */
  difference_usd?: number | null;
  profile?: {
    full_name: string;
  };
}

// ============================================
// Auditoría
// ============================================

export interface AuditLog {
  id: string;
  created_at: string;
  updated_at?: string | null;
  user_id?: string | null;
  table_name: string;
  record_id?: string | null;
  action: string;
  old_data?: any;
  new_data?: any;
  metadata?: any;
  store_id?: string | null;
  store_name?: string | null;
  profile?: {
    full_name?: string | null;
    role?: UserRole | null;
  } | null;
}

// ============================================
// Eventos de Negocio
// ============================================

export interface BusinessEvent {
  id: string;
  event_type: string;
  entity_id: string;
  payload: any;
  created_at: string;
}

// ============================================
// Reportes y Dashboard
// ============================================

export interface DashboardKPIs {
  gross_sales: number;
  cost_of_goods: number | null;
  profit: number | null;
}

export interface SalesSummary {
  total_billed: number;
  transaction_count: number;
  average_ticket: number;
  total_cash: number;
  total_transfer: number;
}


export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  is_active: boolean;
  store_id?: string | null;
  active_store_id?: string | null;
  role_id?: string | null;
  logo_url?: string | null;
  reeup?: string | null;
  bank_account?: string | null;
  max_stores_limit?: number;
  max_users_limit?: number;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  memberships?: UserStoreMembership[];
  ai_provider?: string | null;
  ai_api_key?: string | null;
  plan?: "free" | "pro" | string;
  // Misión organizaciones (2026-10-26): empresa a la que pertenece el
  // usuario (invariante: una sola por usuario ordinario). NULL = sin
  // asignar (incidencia visible en SISTEMA → Usuarios).
  tenant_id?: string | null;
  tenant_name?: string | null;
  deleted_at?: string | null;
};

export interface SalesKPIs {
    total_sales: number;
    total_cost: number | null;
    total_profit: number | null;
    transaction_count: number;
    avg_ticket: number;
    total_cash: number;
    total_card: number;
}

export type ReportType = 'sales' | 'profit' | 'inventory' | 'kardex' | 'purchases' | 'audit' | 'cost_sheet' | 'daily_income' | 'daily_expenses' | 'transfer' | 'cash';

export interface ReportDefinition {
  id: string;
  name: string;
  type: ReportType;
  filters: any;
  date_range: {
    from: string;
    to: string;
  };
  columns: string[];
  format?: "a4" | "letter" | "legal";
  layout: any;
  created_by: string;
  store_id: string;
  created_at: string;
  updated_at: string;
}

export interface ReportRun {
  id: string;
  report_definition_id: string;
  executed_by: string;
  executed_at: string;
  parameters_snapshot: any;
  file_url: string | null;
  status: 'pending' | 'completed' | 'failed';
  error_message?: string | null;
  store_id: string;
}

export interface InventoryReport {
  product_id: string;
  product_name: string;
  sku: string | null;
  current_stock: number;
  total_inputs: number;
  total_outputs: number;
  sale_price: number;
  cost_price: number;
  total_sale_amount: number;
  total_cost_amount: number;
  profit: number;
}

export interface ProductStockLedger {
  created_at: string;
  movement_type: string;
  reference_id: string | null;
  quantity_change: number;
  entry: number;
  exit: number;
  running_balance: number;
}

// ============================================
// Filtros y Búsqueda
// ============================================

export interface SalesFilters {
  search_query?: string;
  status?: TransactionStatus;
  payment_method?: PaymentMethod;
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  sort_column?: string;
  sort_direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface InventoryFilters {
  search?: string;
  category?: string;
  supplier?: string;
  low_stock_only?: boolean;
}

// ============================================
// Permisos por Rol
// ============================================

export interface RolePermissions {
  canCreateProducts: boolean;
  canEditProducts: boolean;
  canDeleteProducts: boolean;
  canViewInventory: boolean;
  canAdjustStock: boolean;
  canReceiveProducts: boolean;
  canCreateSales: boolean;
  canViewSales: boolean;
  canViewAllSales: boolean;
  /** MODELO C Nivel 1: deshacer (POS undo) la venta propia recién creada (ventana 30s). */
  canUndoSales: boolean;
  /** MODELO C Nivel 2: reversión administrativa de ventas de la tienda (rol admin/manager/encargado). */
  canReverseSales: boolean;
  canCloseCashRegister: boolean;
  canViewDashboard: boolean;
  canManageUsers: boolean;
  canManageStores: boolean;
  canViewAudits: boolean;
  canPerformInventoryCount: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canViewInventory: true,
    canAdjustStock: true,
    canReceiveProducts: true,
    canCreateSales: true,
    canViewSales: true,
    canViewAllSales: true,
    canUndoSales: true,
    canReverseSales: true,
    canCloseCashRegister: true,
    canViewDashboard: true,
    canManageUsers: true,
    canManageStores: true,
    canViewAudits: true,
    canPerformInventoryCount: true,
  },
  encargado: {
    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: false,
    canViewInventory: true,
    canAdjustStock: true,
    canReceiveProducts: true,
    canCreateSales: true,
    canViewSales: true,
    canViewAllSales: true,
    canUndoSales: true,
    canReverseSales: true,
    canCloseCashRegister: true,
    canViewDashboard: true,
    canManageUsers: true,
    canManageStores: true,
    canViewAudits: true,
    canPerformInventoryCount: true,
  },
  usuario: {
    canCreateProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canViewInventory: true,
    canAdjustStock: false,
    canReceiveProducts: false,
    canCreateSales: true,
    canViewSales: true,
    canViewAllSales: false,
    canUndoSales: false,
    canReverseSales: false,
    canCloseCashRegister: false,
    canViewDashboard: true,
    canManageUsers: false,
    canManageStores: false,
    canViewAudits: false,
    canPerformInventoryCount: true,
  },
  manager: {
    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: false,
    canViewInventory: true,
    canAdjustStock: true,
    canReceiveProducts: true,
    canCreateSales: true,
    canViewSales: true,
    canViewAllSales: true,
    canUndoSales: true,
    canReverseSales: true,
    canCloseCashRegister: true,
    canViewDashboard: true,
    canManageUsers: false,
    canManageStores: false,
    canViewAudits: true,
    canPerformInventoryCount: true,
  },
  clerk: {
    canCreateProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canViewInventory: true,
    canAdjustStock: false,
    canReceiveProducts: false,
    canCreateSales: true,
    canViewSales: true,
    canViewAllSales: false,
    canUndoSales: true,
    canReverseSales: false,
    canCloseCashRegister: false,
    canViewDashboard: true,
    canManageUsers: false,
    canManageStores: false,
    canViewAudits: false,
    canPerformInventoryCount: true,
  },
  warehouse: {
    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: false,
    canViewInventory: true,
    canAdjustStock: true,
    canReceiveProducts: true,
    canCreateSales: false,
    canViewSales: false,
    canViewAllSales: false,
    canUndoSales: false,
    canReverseSales: false,
    canCloseCashRegister: false,
    canViewDashboard: false,
    canManageUsers: false,
    canManageStores: false,
    canViewAudits: false,
    canPerformInventoryCount: true,
  },
  costo: {
    canCreateProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canViewInventory: false,
    canAdjustStock: false,
    canReceiveProducts: false,
    canCreateSales: false,
    canViewSales: false,
    canViewAllSales: false,
    canUndoSales: false,
    canReverseSales: false,
    canCloseCashRegister: false,
    canViewDashboard: false,
    canManageUsers: false,
    canManageStores: false,
    canViewAudits: false,
    canPerformInventoryCount: false,
  },
};

export function getMergedPermissions(roles: UserRole[]): RolePermissions {
  const merged: RolePermissions = {
    canCreateProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canViewInventory: false,
    canAdjustStock: false,
    canReceiveProducts: false,
    canCreateSales: false,
    canViewSales: false,
    canViewAllSales: false,
    canUndoSales: false,
    canReverseSales: false,
    canCloseCashRegister: false,
    canViewDashboard: false,
    canManageUsers: false,
    canManageStores: false,
    canViewAudits: false,
    canPerformInventoryCount: false,
  };

  roles.forEach(role => {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return;

    (Object.keys(perms) as Array<keyof RolePermissions>).forEach(key => {
      if (perms[key]) merged[key] = true;
    });
  });

  return merged;
}

// CP-INFRA-002b (2026-10-23): interfaces del módulo Academy retiradas junto
// con sus vistas y rutas. Las tablas Supabase (learning_cards, user_progress)
// NO se tocan — solo desaparece la interfaz TS del producto activo.

// ============================================
// FC Automatizada por Tienda (Fase 1)
// ============================================

export type FCModalidad = 'produccion' | 'servicios' | 'comercializacion';

export type FCPdfFormat =
  | 'standard' | 'pro' | 'res148' | 'ejecutivo' | 'contabilidad'
  | 'auditoria' | 'simplificado' | 'bilingue' | 'comparativo' | 'exportacion';

export type CostSheetSyncStatus = 'pending' | 'synced' | 'conflict';

export type ProductFCStatus = 'vigente' | 'pendiente' | 'sin_fc';

export interface StoreCostTemplate {
  id: string;
  store_id: string;
  template_id?: string | null;
  template_data?: Record<string, unknown> | null;
  modalidad?: FCModalidad | null;
  pdf_format?: FCPdfFormat | null;
  is_active?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProductCostSheet {
  id: string;
  product_id: string;
  store_id?: string | null;
  template_id?: string | null;
  modalidad?: FCModalidad | null;
  calculated_data?: Record<string, unknown> | null;
  cost_price?: number | string | null;
  cost_price_updated_at?: string | null;
  sync_status?: CostSheetSyncStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}
