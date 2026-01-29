import { z } from 'zod';

// ============================================
// Enums and Basics
// ============================================

export const userRoleSchema = z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse']);

/**
 * Resilient UUID schema that handles common "JS-isms" like 'null', 'undefined', or empty strings
 * by converting them to actual null before validation.
 */
export const resilientUuid = z.preprocess((val) => {
  if (val === 'null' || val === 'undefined' || val === '' || val === null) return null;
  return val;
}, z.string().uuid().nullable().optional());

/**
 * Same as resilientUuid but with a .catch(null) to ensure that even invalid UUID strings
 * don't crash the entire validation process, returning null instead.
 */
export const optionalResilientUuid = resilientUuid.catch(null);

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

export const storeSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  created_at: z.string().optional(),
});

export const userStoreMembershipSchema = z.object({
  id: optionalResilientUuid,
  user_id: optionalResilientUuid,
  store_id: optionalResilientUuid,
  role: userRoleSchema.default('clerk'),
  status: z.enum(['active', 'revoked']).default('active'),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  store: storeSchema.nullable().optional().catch(null),
});

export const profileSchema = z.object({
  id: z.string().default(''),
  full_name: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().default('Usuario sin nombre')),
  email: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.string().email().catch('no-email@costpro.com')),
  role: userRoleSchema.default('clerk'),
  roles: z.array(userRoleSchema).default([]),
  is_active: z.boolean().default(true),
  store_id: z.string().nullable().default(null),
  active_store_id: z.string().nullable().default(null),
  logo_url: z.string().nullable().default(null),
  ai_provider: z.string().default('gemini'),
  ai_api_key: z.string().nullable().default(''),
  max_stores_limit: z.number().default(1),
  max_users_limit: z.number().default(1),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  memberships: z.preprocess(
    (val) => (Array.isArray(val) ? val : []),
    z.array(userStoreMembershipSchema).catch([])
  ).default([]),
});

export const productSchema = z.object({
  id: resilientUuid.pipe(z.string().uuid()).catch(''), // Ensure it's a string for Product interface
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().nullable().optional(),
  sku: z.preprocess((val) => val === '' ? null : val, z.string().nullable().optional()),
  price: z.coerce.number().min(0).default(0),
  cost_price: z.coerce.number().min(0).default(0),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  stock_current: z.coerce.number().default(0),
  cost_average: z.coerce.number().nullable().default(0),
  min_stock: z.coerce.number().default(0),
  store_id: optionalResilientUuid,
  public_image_url: z.string().nullable().optional(),
  is_active: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'string') return val === 'true';
    return val;
  }, z.boolean().default(true)),
  has_movements: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'string') return val === 'true';
    return val;
  }, z.boolean().default(false)),
});

export const productVariantSchema = z.object({
  id: resilientUuid.pipe(z.string().uuid()).catch(''),
  product_id: optionalResilientUuid,
  name: z.string(),
  sku: z.string().nullable().optional(),
  price: z.coerce.number().min(0).default(0),
  conversion_factor: z.coerce.number().min(0).default(1),
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
  store_id: optionalResilientUuid,
  seller_id: optionalResilientUuid,
  seller_name: z.string().nullable().optional().catch('Desconocido'),
  total_amount: z.coerce.number().catch(0).default(0),
  status: transactionStatusSchema.catch('pending').default('pending'),
  created_at: z.preprocess((val) => val || new Date().toISOString(), z.string()),
  updated_at: z.string().optional().nullable(),
  completed_at: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  void_reason: z.string().nullable().optional(),
  payment_method: paymentMethodSchema.catch('cash').optional().default('cash'),
  discount_type: discountTypeSchema.catch('fixed').optional().default('fixed'),
  discount_value: z.coerce.number().catch(0).default(0),
  subtotal: z.coerce.number().catch(0).default(0),
  idempotency_key: z.string().nullable().optional(),
});

export const stockMovementSchema = z.object({
  id: resilientUuid.pipe(z.string().uuid()).catch(''),
  store_id: optionalResilientUuid,
  product_id: optionalResilientUuid,
  variant_id: optionalResilientUuid,
  quantity_change: z.coerce.number(),
  movement_type: z.string().default('adjustment'),
  reference_id: z.string().nullable().optional(),
  reference_doc: z.string().nullable().optional(),
  movement_date: z.string().nullable().optional(),
  created_by: optionalResilientUuid,
  created_at: z.string().optional(),
  unit_cost: z.coerce.number().nullable().optional().catch(0).default(0),
  unit_price: z.coerce.number().nullable().optional().catch(0).default(0),
  balance_after: z.coerce.number().nullable().optional().catch(0).default(0),
});

export const receiptSchema = z.object({
  id: resilientUuid.pipe(z.string().uuid()).catch(''),
  created_at: z.preprocess((val) => val || new Date().toISOString(), z.string()),
  updated_at: z.string().optional().nullable(),
  user_id: optionalResilientUuid,
  status: z.enum(['active', 'voided', 'pending', 'partial']).catch('active').default('active'),
  total_cost: z.coerce.number().catch(0).default(0),
  reference_doc: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  store_id: optionalResilientUuid,
  supplier: z.string().nullable().optional(),
  reception_date: z.string().nullable().optional(),
});

export const receiptItemSchema = z.object({
  id: z.string().uuid(),
  receipt_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.coerce.number().catch(0),
  unit_cost: z.coerce.number().catch(0),
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
  id: resilientUuid.pipe(z.string().uuid()).catch(''),
  user_id: optionalResilientUuid,
  action: z.string(),
  table_name: z.string(),
  record_id: z.string().nullable().optional(),
  old_data: z.any().nullable().optional(),
  new_data: z.any().nullable().optional(),
  metadata: z.any().nullable().optional(),
  store_id: optionalResilientUuid,
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
  quantity: z.coerce.number(),
  price_at_sale: z.coerce.number(),
  cost_at_sale: z.coerce.number(),
  created_at: z.string(),
  products: z.object({
    name: z.string(),
    sku: z.string().nullable(),
  }).nullable().optional(),
});

export const paginatedProductSchema = productSchema.extend({
  total_count: z.number().optional(),
});

export const dashboardKpiResponseSchema = z.object({
  total_sales: z.coerce.number().default(0),
  total_cost: z.coerce.number().nullable().optional(),
  total_profit: z.coerce.number().nullable().optional(),
  transaction_count: z.coerce.number().default(0),
  avg_ticket: z.coerce.number().default(0),
  total_cash: z.coerce.number().default(0),
  total_card: z.coerce.number().default(0),
});

export const createSaleParamsSchema = z.object({
  p_store_id: resilientUuid,
  p_seller_id: resilientUuid,
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

export const registerReceptionParamsSchema = z.object({
  p_store_id: resilientUuid,
  p_supplier: z.string().min(1),
  p_reception_date: z.string(),
  p_invoice_number: z.string().min(1),
  p_items: z.array(z.object({
    product_id: z.string().uuid().nullable(),
    sku: z.string().nullable().optional(),
    quantity: z.number().positive(),
    unit_cost: z.number().min(0),
  })),
});

export const adjustStockInputSchema = z.object({
  productId: resilientUuid,
  storeId: resilientUuid,
  userId: resilientUuid,
  quantityDelta: z.number().int(),
  unitCostAdjustment: z.number().nullable(),
  reason: z.string().min(1),
});

export const inventoryAdjustmentResponseSchema = z.object({
  status: z.string(),
  nuevo_stock: z.number(),
  nuevo_costo_total: z.number(),
  nuevo_costo_unitario: z.number(),
  movimiento_registrado: z.boolean()
});

export const performInventoryAdjustmentParamsSchema = z.object({
  p_product_id: resilientUuid,
  p_store_id: resilientUuid,
  p_user_id: resilientUuid,
  p_quantity_delta: z.number().int(),
  p_unit_cost_adjustment: z.number().nullable(),
  p_reason: z.string().min(1),
});

export const getPaginatedProductsParamsSchema = z.object({
  p_limit: z.number().int().default(20),
  p_offset: z.number().int().default(0),
  p_store_id: resilientUuid,
  p_search_term: z.string().nullable().optional(),
  p_category: z.string().nullable().optional(),
});

export const getProductsForPosParamsSchema = z.object({
  p_store_id: resilientUuid,
  p_search_term: z.string().nullable().optional(),
  p_category: z.string().nullable().optional(),
});

export const bulkUpdateProductItemSchema = z.object({
  store_id: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  cost_price: z.number().min(0),
  price: z.number().min(0),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
});

export const bulkUpdateProductsInputSchema = z.object({
  products: z.array(bulkUpdateProductItemSchema),
  storeId: z.string().uuid(),
});

export const bulkUpdateProductsParamsSchema = z.object({
  _products: z.array(bulkUpdateProductItemSchema),
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
  id: optionalResilientUuid,
  transfer_id: optionalResilientUuid,
  product_id: resilientUuid.pipe(z.string().uuid()).catch(''),
  quantity: z.number().positive(),
  unit_cost: z.number().min(0),
});

export const transferSchema = z.object({
  id: resilientUuid.pipe(z.string().uuid()).catch(''),
  origin_store_id: resilientUuid.pipe(z.string().uuid()).catch(''),
  destination_store_id: resilientUuid.pipe(z.string().uuid()).catch(''),
  created_by: resilientUuid.pipe(z.string().uuid()).catch(''),
  status: transferStatusSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const transferWithDetailsSchema = transferSchema.extend({
  origin_store: storeSchema.nullable().optional(),
  destination_store: storeSchema.nullable().optional(),
  creator: z.object({
    full_name: z.string(),
  }).nullable().optional(),
  items: z.array(
    transferItemSchema.extend({
      product: productSchema.nullable().optional(),
    })
  ).optional(),
});

// ============================================
// Sync Schemas
// ============================================

export const syncOperationTypeSchema = z.enum(['CREATE', 'UPDATE', 'DELETE']);

export const syncOperationSchema = z.object({
  id: optionalResilientUuid, // Local ID
  idempotencyKey: resilientUuid.pipe(z.string().uuid()).catch(''),
  operationType: syncOperationTypeSchema,
  entity: z.string(),
  payload: z.any(),
  createdAt: z.string(),
  clientClock: z.number(),
  status: z.enum(['pending', 'in-flight', 'failed', 'synced']).default('pending'),
  attempts: z.number().default(0),
  lastError: z.string().nullable().optional(),
  serverData: z.any().optional(),
});

export const syncBatchSchema = z.object({
  clientInfo: z.object({
    userId: z.string(),
    deviceId: z.string(),
  }),
  operations: z.array(syncOperationSchema),
});

export const syncResultItemSchema = z.object({
  idempotencyKey: resilientUuid.pipe(z.string().uuid()).catch(''),
  status: z.enum(['ok', 'conflict', 'error']),
  serverId: z.any().optional(),
  serverVersion: z.number().optional(),
  serverData: z.any().optional(),
  error: z.string().optional(),
});

export const syncBatchResponseSchema = z.object({
  results: z.array(syncResultItemSchema),
});

// ============================================
// Report Schemas
// ============================================

export const reportTypeSchema = z.enum(['sales', 'profit', 'inventory', 'kardex', 'purchases', 'audit']);

export const reportDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "El nombre del reporte es obligatorio"),
  type: reportTypeSchema,
  filters: z.any().default({}),
  date_range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  columns: z.array(z.string()).default([]),
  layout: z.any().default({}),
  created_by: z.string().uuid().optional(),
  store_id: z.string().uuid().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const reportRunSchema = z.object({
  id: z.string().uuid().optional(),
  report_definition_id: z.string().uuid(),
  executed_by: z.string().uuid(),
  executed_at: z.string().optional(),
  parameters_snapshot: z.any(),
  file_url: z.string().nullable().optional(),
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  error_message: z.string().nullable().optional(),
  store_id: z.string().uuid().optional(),
});
