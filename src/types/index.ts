// ============================================
// Tipos de la Aplicación - Plataforma Tienda Online
// ============================================

export type UserRole = 'admin' | 'manager' | 'clerk' | 'warehouse';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet' | 'other';

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
  store_id: string | null;
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
// Tienda
// ============================================

export interface Store {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

// ============================================
// Producto
// ============================================

export interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: number;
  cost_price: number;
  image_url: string | null;
  category: string | null;
  unit_of_measure: string | null;
  supplier: string | null;
  created_at: string;
  updated_at: string;
  stock_current: number;
  cost_average: number;
  min_stock: number;
  store_id: string | null;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  conversion_factor: number;
  created_at: string;
  updated_at: string;
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
  store_id: string;
  product_id: string;
  variant_id: string | null;
  quantity_change: number;
  movement_type: MovementType;
  reference_id: string | null;
  reference_doc: string | null;
  movement_date: string;
  created_by: string | null;
  created_at: string;
  unit_cost?: number;
  unit_price?: number;
  balance_after?: number;
}

// ============================================
// Transacciones y Ventas
// ============================================

export interface Transaction {
  id: string;
  store_id: string;
  seller_id: string;
  total_amount: number;
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  void_reason: string | null;
  payment_method: PaymentMethod;
  discount_type: DiscountType;
  discount_value: number;
  subtotal: number;
  idempotency_key: string | null;
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
  user_id: string | null;
  status: 'active' | 'voided';
  total_cost: number;
  reference_doc: string | null;
  notes: string | null;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
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
  closed_at: string;
  created_at: string;
  declared_total: number;
  system_expected_total: number;
  difference: number;
}

// ============================================
// Auditoría
// ============================================

export interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: any;
  new_data: any;
  metadata: any;
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
  cost_of_goods: number;
  profit: number;
}

export interface SalesSummary {
  total_billed: number;
  transaction_count: number;
  average_ticket: number;
  total_cash: number;
  total_transfer: number;
}

export interface SalesKPIs {
    total_sales: number;
    total_cost: number;
    total_profit: number;
    transaction_count: number;
    avg_ticket: number;
    total_cash: number;
    total_card: number;
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
};
