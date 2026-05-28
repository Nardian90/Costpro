// ============================================
// Tipos de la Aplicación - Plataforma Tienda Online
// ============================================

export type UserRole = 'admin' | 'encargado' | 'usuario' | 'manager' | 'clerk' | 'warehouse' | 'costo';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet' | 'other' | 'mixed';

export type DiscountType = 'fixed' | 'percentage';

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'compensated'
  | 'cancelled'
  | 'refunded'
  | 'voided';

export type MovementType =
  | 'sale'
  | 'purchase'
  | 'adjustment'
  | 'return'
  | 'initial'
  | 'transfer'
  | 'void';

export type PurchaseStatus = 'draft' | 'received' | 'cancelled';

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

export interface RSSFeed {
  id: string;
  url: string;
  name: string | null;
  is_active: boolean;
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

export interface Store {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  reeup?: string | null;
  bank_account?: string | null;
  is_active?: boolean;
  slug?: string | null;
  plantilla?: StoreTemplate | null;
  created_at?: string;
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
  cost_price: number;
  image_url?: string | null;
  category?: string | null;
  unit_of_measure?: string | null;
  supplier?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  stock_current: number;
  cost_average?: number | null;
  min_stock?: number | null;
  store_id?: string | null;
  public_image_url?: string | null;
  is_active?: boolean;
  is_complete?: boolean;
  has_movements?: boolean;
  visible_en_tienda?: boolean;
  product_variants?: ProductVariant[] | null;
}

export interface ProductVariant {
  id: string;
  product_id?: string | null;
  name: string;
  sku?: string | null;
  price: number;
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
  status: 'active' | 'voided' | 'pending' | 'partial';
  total_cost: number;
  reference_doc?: string | null;
  notes?: string | null;
  store_id?: string | null;
  supplier?: string | null;
  reception_date?: string | null;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
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
// Transferencias
// ============================================

export type TransferStatus = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA';

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
}

export interface TransferItem {
  id?: string | null;
  transfer_id?: string | null;
  product_id: string;
  quantity: number;
  unit_cost: number;
  product?: Product | null;
}

export interface PurchaseOrder {
  id: string;
  store_id: string;
  supplier: string;
  status: PurchaseStatus;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
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
  canVoidTransactions: boolean;
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
    canVoidTransactions: true,
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
    canVoidTransactions: true,
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
    canVoidTransactions: false,
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
    canVoidTransactions: true,
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
    canVoidTransactions: false,
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
    canVoidTransactions: false,
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
    canVoidTransactions: false,
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
    canVoidTransactions: false,
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

// ============================================
// Academy Module
// ============================================

export interface AcademyCard {
  id: string;
  category: string;
  difficulty: 'Básico' | 'Operativo' | 'Experto';
  question: string;
  answer: string;
  source: string;
  created_at: string;
}

export interface UserAcademyProgress {
  id: string;
  user_id: string;
  card_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  last_review: string | null;
  mastery_score: number;
  learning_cards?: AcademyCard;
}
