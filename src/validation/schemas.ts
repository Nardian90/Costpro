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
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  role: userRoleSchema.catch('clerk'),
  status: z.enum(['active', 'revoked']).catch('active'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const profileSchema = z.object({
  id: z.string().uuid().or(z.string().length(0).transform(() => null)).nullable().optional().catch(null),
  full_name: z.string().catch('Usuario'),
  email: z.string().email().catch(''),
  role: userRoleSchema.catch('clerk'),
  roles: z.array(userRoleSchema).optional().catch([]),
  is_active: z.boolean().catch(true),
  store_id: z.string().uuid().or(z.string().length(0).transform(() => null)).nullable().optional().catch(null),
  active_store_id: z.string().uuid().or(z.string().length(0).transform(() => null)).nullable().optional().catch(null),
  max_stores_limit: z.number().optional().catch(1),
  max_users_limit: z.number().optional().catch(1),
  created_by: z.string().uuid().nullable().optional().catch(null),
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().optional().catch(undefined),
  memberships: z.array(userStoreMembershipSchema).optional().catch([]),
});

export const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  sku: z.string().min(1, "El SKU es obligatorio"),
  price: z.number().min(0).catch(0),
  cost_price: z.number().min(0).catch(0),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  stock_current: z.number().catch(0),
  cost_average: z.number().nullable().optional().catch(0),
  min_stock: z.number().catch(0),
  store_id: z.string().uuid({ message: "La tienda es obligatoria" }),
  public_image_url: z.string().nullable().optional(),
  is_active: z.boolean().catch(true),
  has_movements: z.boolean().catch(false),
});

export const productVariantSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid().optional(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  price: z.number().min(0).catch(0),
  conversion_factor: z.number().min(0).catch(1),
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
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  total_amount: z.number(),
  status: transactionStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  void_reason: z.string().nullable(),
  payment_method: paymentMethodSchema,
  discount_type: discountTypeSchema,
  discount_value: z.number(),
  subtotal: z.number(),
  idempotency_key: z.string().nullable(),
});

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional().catch(null),
  quantity_change: z.number().catch(0),
  movement_type: z.string().catch('adjustment'),
  reference_id: z.string().nullable().optional().catch(null),
  reference_doc: z.string().nullable().optional().catch(null),
  movement_date: z.string().nullable().optional().catch(null),
  created_by: z.string().uuid().nullable().optional().catch(null),
  created_at: z.string().catch(() => new Date().toISOString()),
  unit_cost: z.number().nullable().optional().catch(0),
  unit_price: z.number().nullable().optional().catch(0),
  balance_after: z.number().nullable().optional().catch(0),
});

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  action: z.string(),
  table_name: z.string(),
  record_id: z.string().nullable().optional(),
  old_data: z.any().nullable(),
  new_data: z.any().nullable(),
  metadata: z.any().nullable(),
  created_at: z.string(),
  updated_at: z.string().optional(),
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
  p_store_id: z.string().uuid().nullable(),
  p_seller_id: z.string().uuid(),
  p_payment_method: z.string(),
  p_total_amount: z.number(),
  p_subtotal: z.number(),
  p_discount_type: z.string(),
  p_discount_value: z.number(),
  p_items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().nullable(),
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
