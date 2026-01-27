import { z } from 'zod';

// ============================================
// Enums and Basics
// ============================================

export const userRoleSchema = z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']);

export const paymentMethodSchema = z.enum(['cash', 'card', 'transfer', 'wallet', 'other']);

export const discountTypeSchema = z.enum(['fixed', 'percentage']);

export const transactionStatusSchema = z.enum([
  'pending',
  'completed',
  'failed',
  'compensated',
  'cancelled',
  'refunded',
  'voided',
]);

// ============================================
// Entities
// ============================================

export const userStoreMembershipSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  store_id: z.string().uuid().or(z.string().length(0).transform(() => null)).nullable().optional(),
  role: userRoleSchema.default('clerk'),
  status: z.enum(['active', 'revoked']).default('active'),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  store: z.object({
    id: z.string(),
    name: z.string(),
    address: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    created_at: z.string().optional(),
  }).nullable().optional().catch(null),
});

export const profileSchema = z.object({
  id: z.string().default(''),
  full_name: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().default('Usuario sin nombre')),
  email: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().email().catch('no-email@costpro.com')),
  role: userRoleSchema.default('clerk'),
  roles: z.array(userRoleSchema).default([]),
  is_active: z.boolean().default(true),
  store_id: z.string().nullable().optional().default(null),
  active_store_id: z.string().nullable().optional().default(null),
  logo_url: z.string().nullable().optional().default(null),
  max_stores_limit: z.number().optional().default(1),
  max_users_limit: z.number().optional().default(1),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  memberships: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(userStoreMembershipSchema).catch([])
  ).default([]),
});

export const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().nullable().optional(),
  sku: z.string().min(1, "El SKU es obligatorio"),
  price: z.number().min(0).default(0),
  cost_price: z.number().min(0).default(0),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  stock_current: z.number().default(0),
  cost_average: z.number().nullable().optional().default(0),
  min_stock: z.number().default(0),
  store_id: z.string().uuid({ message: "La tienda es obligatoria" }),
  public_image_url: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  has_movements: z.boolean().default(false),
});

export const productVariantSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid().optional(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  price: z.number().min(0).default(0),
  conversion_factor: z.number().min(0).default(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  product: productSchema,
  variant: productVariantSchema.nullable(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  cost: z.number().min(0),
  subtotal: z.number(),
});

export const transactionSchema = z.object({
  id: z.string().uuid().or(z.string()),
  store_id: z.string().uuid().optional().nullable(),
  seller_id: z.string().uuid().optional().nullable(),
  total_amount: z.coerce.number().default(0),
  status: transactionStatusSchema.default('pending'),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  completed_at: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  void_reason: z.string().nullable().optional(),
  payment_method: paymentMethodSchema.optional().default('cash'),
  discount_type: discountTypeSchema.optional().default('fixed'),
  discount_value: z.coerce.number().optional().default(0),
  subtotal: z.coerce.number().optional().default(0),
  idempotency_key: z.string().nullable().optional(),
});

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity_change: z.coerce.number(),
  movement_type: z.string().default('adjustment'),
  reference_id: z.string().nullable().optional(),
  reference_doc: z.string().nullable().optional(),
  movement_date: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().optional(),
  unit_cost: z.coerce.number().nullable().optional().default(0),
  unit_price: z.coerce.number().nullable().optional().default(0),
  balance_after: z.coerce.number().nullable().optional().default(0),
});

export const receiptSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  user_id: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'voided']).default('active'),
  total_cost: z.coerce.number().default(0),
  reference_doc: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  store_id: z.string().uuid().nullable().optional(),
  supplier: z.string().nullable().optional(),
  reception_date: z.string().nullable().optional(),
});

export const receiptItemSchema = z.object({
  id: z.string().uuid(),
  receipt_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.coerce.number(),
  unit_cost: z.coerce.number(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  products: z.object({
    name: z.string(),
    sku: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    public_image_url: z.string().nullable().optional(),
  }).nullable().optional(),
});

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  action: z.string(),
  table_name: z.string(),
  record_id: z.string().nullable().optional(),
  old_data: z.any().nullable().optional(),
  new_data: z.any().nullable().optional(),
  metadata: z.any().nullable().optional(),
  store_id: z.string().uuid().nullable().optional(),
  store_name: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
});

// ============================================
// RPC Params and Responses
// ============================================

export const getProductsForPosResponseSchema = productSchema.extend({
  product_variants: z.array(productVariantSchema).nullable(),
});

export const transactionItemSchema = z.object({
  id: z.string(),
  transaction_id: z.string(),
  product_id: z.string(),
  variant_id: z.string().nullable(),
  quantity: z.number(),
  price_at_sale: z.number(),
  cost_at_sale: z.number(),
  created_at: z.string(),
  products: z.object({
    name: z.string(),
    sku: z.string().nullable(),
  }).nullable(),
});

export const paginatedProductSchema = productSchema.extend({
  total_count: z.number().optional(),
});

export const dashboardKpiResponseSchema = z.object({
  total_sales: z.number(),
  total_cost: z.number(),
  total_profit: z.number(),
  transaction_count: z.number(),
  avg_ticket: z.number(),
  total_cash: z.number(),
  total_card: z.number(),
});

export const createSaleParamsSchema = z.object({
  p_store_id: z.string().nullable(),
  p_seller_id: z.string(),
  p_payment_method: z.string(),
  p_total_amount: z.number(),
  p_subtotal: z.number(),
  p_discount_type: z.string(),
  p_discount_value: z.number(),
  p_items: z.array(z.object({
    product_id: z.string(),
    variant_id: z.string().nullable(),
    quantity: z.number().positive(),
    price: z.number().min(0),
    cost: z.number().min(0),
  })),
});

// ============================================
// Cost Sheet
// ============================================

export const costSheetHeaderSchema = z.object({
  code: z.string(),
  name: z.string(),
  date: z.string(),
  quantity: z.number(),
  currency: z.string(),
  category: z.string(),
  type: z.string(),
  unit: z.string(),
}).catchall(z.any());

export const costSheetRowSchema: z.ZodType<any> = z.lazy(() => z.object({
  id: z.string(),
  label: z.string(),
  valorHistorico: z.number().optional(),
  value: z.number().optional(),
  baseDeCalculoRef: z.string().nullable().optional(),
  base_ref: z.string().nullable().optional(),
  calculationMethod: z.enum(['Prorrateo', 'ValorFijo']).optional(),
  totalFormula: z.string().nullable().optional(),
  formula: z.string().optional(),
  is_percent: z.boolean().optional(),
  children: z.array(costSheetRowSchema).optional(),
}).catchall(z.any()));

export const costSheetSectionSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  rows: z.array(costSheetRowSchema),
});

export const costSheetColumnSchema = z.object({
  key: z.string(),
  title: z.string().optional(),
  formula: z.string().optional(),
  type: z.enum(['number', 'string', 'formula']).optional(),
});

export const costSheetAnnexSchema = z.object({
  id: z.string(),
  title: z.string(),
  columns: z.array(costSheetColumnSchema),
  data: z.array(z.record(z.string(), z.any())),
});

export const costSheetSignatureSchema = z.object({
  prepared_by: z.string(),
  approved_by: z.string(),
});

export const costSheetDataSchema = z.object({
  header: costSheetHeaderSchema,
  sections: z.array(costSheetSectionSchema),
  annexes: z.array(costSheetAnnexSchema),
  signature: costSheetSignatureSchema,
});

// ============================================
// Import Schemas
// ============================================

export const catalogImportRowSchema = z.object({
  sku: z.string().min(1, "El SKU es obligatorio"),
  name: z.string().min(1, "El nombre es obligatorio"),
  cost: z.coerce.number().min(0, "El costo debe ser un número válido (mínimo 0)"),
  price: z.coerce.number().min(0, "El precio debe ser un número válido (mínimo 0)"),
  imageUrl: z.string().optional().nullable().default(''),
}).refine(data => data.price >= data.cost, {
  message: "El precio de venta no puede ser menor que el costo.",
  path: ["price"]
});

export const receptionImportRowSchema = z.object({
  sku: z.string().min(1, "El SKU es obligatorio"),
  quantity: z.coerce.number().int().positive("La cantidad debe ser un número entero positivo"),
  cost: z.coerce.number().min(0, "El costo debe ser un número válido (mínimo 0)"),
});

export const transferStatusSchema = z.enum(['PENDIENTE', 'CONFIRMADA', 'CANCELADA']);

export const transferItemSchema = z.object({
  id: z.string().uuid().optional(),
  transfer_id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_cost: z.number().min(0),
});

export const transferSchema = z.object({
  id: z.string().uuid(),
  origin_store_id: z.string().uuid(),
  destination_store_id: z.string().uuid(),
  created_by: z.string().uuid(),
  status: transferStatusSchema,
  notes: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
