import { z } from "zod";
import { STORE_TEMPLATES } from "@/config/app";

// ============================================
// Enums and Basics
// ============================================

export const userRoleSchema = z.enum([
  "admin",
  "encargado",
  "usuario",
  "manager",
  "clerk",
  "warehouse",
  "costo",
]);

/**
 * Permissive UUID regex that matches the standard 8-4-4-4-12 format
 * without being strict about the version or variant bits.
 */
export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resilient UUID schema that handles common "JS-isms" like 'null', 'undefined', or empty strings
 * by converting them to actual null before validation.
 */
export const resilientUuid = z
  .preprocess((val) => {
    if (val === "null" || val === "undefined" || val === "" || val === null)
      return null;
    return val;
  }, z.string().regex(uuidRegex).nullable().optional())
  .optional()
  .nullable();

/**
 * Same as resilientUuid but with a .catch(null) to ensure that even invalid UUID strings
 * don't crash the entire validation process, returning null instead.
 */
export const optionalResilientUuid = resilientUuid.catch(null);

export const paymentMethodSchema = z.enum([
  "cash",
  "transfer",
  "zelle",
  "other",
  "mixed",
]);

export const discountTypeSchema = z.enum(["fixed", "percentage"]);

export const transactionStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "compensated",
  "cancelled",
  "refunded",
  "voided",
]);

// ============================================
// Entities
// ============================================

export const storeSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  reeup: z.string().nullable().optional(),
  nit: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  signature_url: z.string().nullable().optional(),
  stamp_url: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  is_active: z.boolean().optional(),
  // FIX-VISIBILITY: Campos de visibilidad y promoción para la tienda pública
  price_visible: z.boolean().optional().default(true),
  stock_visible: z.boolean().optional().default(true),
  on_promotion: z.boolean().optional().default(false),
  price_currency: z.string().optional().default('CUP'),
  slug: z.string().nullable().optional(),
  plantilla: z.enum(STORE_TEMPLATES).nullable().optional(),
  created_at: z.string().optional(),
  // FIX-FC-PERSIST: Include cost_template from store_cost_templates join
  // FIX-FC-PERSIST-V2: Include id, store_id — needed by normalizeCostTemplate
  // Supabase returns this as an array from the relation, so we normalize it
  store_cost_templates: z.union([
    z.array(z.object({
      id: z.string().optional(),
      store_id: z.string().optional(),
      template_id: z.string().optional(),
      modalidad: z.string().optional(),
      pdf_format: z.string().optional(),
      is_active: z.boolean().optional(),
    })),
    z.object({
      id: z.string().optional(),
      store_id: z.string().optional(),
      template_id: z.string().optional(),
      modalidad: z.string().optional(),
      pdf_format: z.string().optional(),
      is_active: z.boolean().optional(),
    }),
  ]).nullable().optional(),
  // ── Storefront config (2026-07-04) ──
  banner_url: z.string().nullable().optional(),
  store_tagline: z.string().max(200).nullable().optional(),
  whatsapp_group_url: z.string().url().nullable().optional().or(z.literal('')),
  telegram_url: z.string().url().nullable().optional().or(z.literal('')),
  services: z.array(z.object({
    icon: z.string().max(50),
    title: z.string().max(100),
    description: z.string().max(300).optional(),
  })).max(6).nullable().optional(),
  promo_images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(200).optional(),
    link: z.string().url().optional().nullable(),
  })).max(5).nullable().optional(),
  opening_hours: z.string().max(200).nullable().optional(),
  banner_cta_text: z.string().max(50).nullable().optional(),
  banner_cta_link: z.string().url().nullable().optional().or(z.literal('')),
});

export const userStoreMembershipSchema = z.object({
  id: optionalResilientUuid,
  user_id: optionalResilientUuid,
  store_id: optionalResilientUuid,
  role: userRoleSchema.default("clerk"),
  status: z.enum(["active", "revoked"]).default("active"),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  store: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    storeSchema.nullable().optional().catch(null),
  ),
});

export const profileSchema = z.object({
  id: z.string(),
  full_name: z
    .preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.string(),
    )
    .catch("Usuario sin nombre"),
  email: z
    .preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.string().email(),
    )
    .catch("no-email@costpro.com"),
  role: userRoleSchema.catch("clerk"),
  roles: z.array(userRoleSchema).catch([]),
  role_id: resilientUuid,
  is_active: z.boolean().catch(true),
  store_id: resilientUuid,
  active_store_id: resilientUuid,
  logo_url: z.string().nullable().optional(),
  plan: z.preprocess(
    (val) => (typeof val === 'object' && val !== null ? (val as any).name || "free" : val),
    z.string()
  ).catch("free"),
  reeup: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  ai_provider: z.string().optional(),
  ai_api_key: z.string().nullable().optional(),
  max_stores_limit: z.number().optional(),
  max_users_limit: z.number().optional(),
  created_by: resilientUuid,
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  memberships: z
    .preprocess(
      (val) => (Array.isArray(val) ? val : []),
      z.array(userStoreMembershipSchema).catch([]),
    )
    .optional(),
});

export const productSchema = z.object({
  id: resilientUuid.pipe(z.string().regex(uuidRegex)).catch(""),
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().nullable().optional(),
  sku: z.string().min(1, "El SKU es obligatorio"),
  barcode: z.string().nullable().optional(),
  barcode_type: z.string().nullable().optional(),
  price: z.coerce.number().min(0).optional().default(0),
  precio_empresa: z.coerce.number().nullable().optional().default(null),
  cost_price: z.coerce.number().min(0).optional().default(0),
  price_currency: z.string().optional().default('CUP'),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  stock_current: z.coerce.number().optional().default(0),
  cost_average: z.coerce.number().nullable().optional().default(0),
  min_stock: z.coerce.number().optional().default(0),
  store_id: optionalResilientUuid,
  public_image_url: z.string().nullable().optional(),
  is_active: z
    .preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") return val === "true";
      return val;
    }, z.boolean().optional())
    .default(true),
  // Virtual field: not a DB column, derived from stock_movements existence.
  // Always defaults to false when not returned by RPC. Used to gate delete/toggle actions.
  has_movements: z.boolean().optional().default(false),
  visible_en_tienda: z
    .preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") return val === "true";
      return val;
    }, z.boolean().optional())
    .default(false),
  // FC Automatizada — Fase 1
  cost_sheet_id: optionalResilientUuid.nullable().optional(),
  fc_auto_enabled: z
    .preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") return val === "true";
      return val;
    }, z.boolean().optional())
    .default(true),
  // FIX-VISIBILITY: Campos de visibilidad y promoción — deben estar en productSchema
  // para que Zod safeParse los preserve al validar la respuesta del RPC
  price_visible: z
    .preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") return val === "true";
      return val;
    }, z.boolean().optional())
    .default(true),
  stock_visible: z
    .preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") return val === "true";
      return val;
    }, z.boolean().optional())
    .default(true),
  on_promotion: z
    .preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === "string") return val === "true";
      return val;
    }, z.boolean().optional())
    .default(false),
});

export const productVariantSchema = z.object({
  id: resilientUuid.pipe(z.string().regex(uuidRegex)).catch(""),
  product_id: optionalResilientUuid,
  name: z.string(),
  sku: z.string().nullable().optional(),
  price: z.coerce.number().min(0).optional().default(0),
  precio_empresa: z.coerce.number().nullable().optional().default(null),
  conversion_factor: z.coerce.number().min(0).optional().default(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const createProductInputSchema = productSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  public_image_url: true,
  has_movements: true,
}).refine(
  // Q6: prevenir precio < costo (margen negativo en creación)
  (data) => !data.cost_price || !data.price || data.price >= data.cost_price,
  { message: "El precio de venta no puede ser menor que el costo (margen negativo)", path: ["price"] }
);

export const updateProductInputSchema = productSchema.partial().omit({
  id: true,
  created_at: true,
  updated_at: true,
  public_image_url: true,
  has_movements: true,
}).refine(
  // Q6: prevenir precio < costo (margen negativo en edición)
  (data) => {
    // Solo validar si ambos campos están presentes en el update
    if (data.cost_price === undefined || data.price === undefined) return true;
    return data.price >= data.cost_price;
  },
  { message: "El precio de venta no puede ser menor que el costo (margen negativo)", path: ["price"] }
);

export const createProductVariantInputSchema = productVariantSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const cartItemSchema = z.object({
  product_id: z.string().regex(uuidRegex),
  variant_id: z.string().regex(uuidRegex).nullable(),
  product: productSchema,
  variant: productVariantSchema.nullable(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  discount_type: z.string().nullable().optional(),
  discount_value: z.number().optional(),
  cash_paid: z.number().optional(),
  transfer_paid: z.number().optional(),
  cost: z.number().min(0),
  subtotal: z.number(),
});

export const transactionSchema = z.object({
  id: z.string().regex(uuidRegex).or(z.string()),
  store_id: optionalResilientUuid,
  seller_id: optionalResilientUuid,
  seller_name: z.string().nullable().optional().catch("Desconocido"),
  total_amount: z.coerce.number().catch(0).default(0),
  status: transactionStatusSchema.catch("pending").default("pending"),
  created_at: z.preprocess(
    (val) => val || new Date().toISOString(),
    z.string(),
  ),
  updated_at: z.string().optional().nullable(),
  completed_at: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  void_reason: z.string().nullable().optional(),
  payment_method: paymentMethodSchema.catch("cash").optional().default("cash"),
  discount_type: discountTypeSchema.catch("fixed").optional().default("fixed"),
  discount_value: z.coerce.number().catch(0).default(0),
  subtotal: z.coerce.number().catch(0).default(0),
  tax_amount: z.coerce.number().catch(0).default(0),
  applied_taxes: z.array(z.any()).catch([]).optional(),
  idempotency_key: z.string().nullable().optional(),
});

export const stockMovementSchema = z.object({
  id: resilientUuid.pipe(z.string().regex(uuidRegex)).catch(""),
  store_id: optionalResilientUuid,
  product_id: optionalResilientUuid,
  variant_id: optionalResilientUuid,
  quantity_change: z.coerce.number(),
  movement_type: z.string().default("adjustment"),
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
  id: resilientUuid.pipe(z.string().regex(uuidRegex)).catch(""),
  created_at: z.preprocess(
    (val) => val || new Date().toISOString(),
    z.string(),
  ),
  updated_at: z.string().optional().nullable(),
  user_id: optionalResilientUuid,
  status: z
    .enum(["active", "voided", "pending", "partial"])
    .catch("active")
    .default("active"),
  total_cost: z.coerce.number().catch(0).default(0),
  reference_doc: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  store_id: optionalResilientUuid,
  supplier: z.string().nullable().optional(),
  reception_date: z.string().nullable().optional(),
});

export const receiptItemSchema = z.object({
  id: z.string().regex(uuidRegex),
  receipt_id: z.string().regex(uuidRegex),
  product_id: z.string().regex(uuidRegex),
  quantity: z.coerce.number().catch(0),
  unit_cost: z.coerce.number().catch(0),
  moneda_recepcion: z.string().optional().default('CUP'),
  tasa_cambio_recepcion: z.coerce.number().optional().default(1.0),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  products: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    z
      .object({
        name: z.string(),
        sku: z.string().nullable().optional(),
        image_url: z.string().nullable().optional(),
        public_image_url: z.string().nullable().optional(),
      })
      .nullable()
      .optional()
      .catch(null),
  ),
});

export const auditLogSchema = z.object({
  id: resilientUuid.pipe(z.string().regex(uuidRegex)).catch(""),
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

export type AuditLog = z.infer<typeof auditLogSchema> & {
  profile?: {
    full_name?: string | null;
    role?: string | null;
  } | null;
};

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
  products: z
    .object({
      name: z.string(),
      sku: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export const paginatedProductSchema = productSchema.extend({
  total_count: z.number().optional(),
  is_complete: z.boolean().optional().default(true),
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
  p_store_id: z.string().regex(uuidRegex), // Use string for required RPC params
  p_seller_id: z.string().regex(uuidRegex), // Use string for required RPC params
  // POS-3b audit P0.1: Persistencia de cliente en la venta.
  // Opcional para no romper llamadas existentes sin cliente.
  p_customer_id: z.string().regex(uuidRegex).nullable().optional(),
  p_customer_name: z.string().optional(),
  p_payment_method: z.string(),
  p_total_amount: z.number(),
  p_subtotal: z.number(),
  p_discount_type: z.string(),
  p_discount_value: z.number(),
  p_items: z.array(
    z.object({
      product_id: z.string().regex(uuidRegex),
      variant_id: z.string().regex(uuidRegex).nullable(),
      quantity: z.number().positive(),
      price: z.number().min(0),
      discount_type: z.string().nullable().optional(),
      discount_value: z.number().optional(),
      cash_paid: z.number().optional(),
      transfer_paid: z.number().optional(),
      cost: z.number().min(0),
      // FIX-MULTI-MONEDA: moneda y tasa por item
      currency: z.string().optional().default('CUP'),
      exchange_rate: z.number().optional().default(1.0),
    }),
  ),
  p_applied_taxes: z.array(z.any()).optional(),
  p_tax_amount: z.number().optional(),
  p_cash_amount: z.number().optional(),
  p_transfer_amount: z.number().optional(),
  p_transaction_id: z.string().regex(uuidRegex).optional(),
  p_idempotency_key: z.string().optional(),
  // Política de secuencia global (forward-only locking):
  // fecha de operación elegida por el usuario. Si se omite, el backend usa NOW().
  // El backend valida que no sea anterior al MAX global (lanza ERR_BACKDATED_DOCUMENT).
  p_operation_date: z.string().datetime().optional(),
  // FIX-MULTI-MONEDA: moneda de venta y tasa de cambio
  p_sale_currency: z.string().optional().default('CUP'),
  p_sale_exchange_rate: z.number().optional().default(1.0),
});

export const registerReceptionParamsSchema = z.object({
  p_store_id: z.string().regex(uuidRegex),
  p_supplier: z.string().min(1),
  // REC-1 QW-R9: validar que p_reception_date sea ISO datetime válido.
  p_reception_date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    'p_reception_date debe ser ISO 8601 datetime válido (ej. 2026-06-17T15:30:00.000Z)'
  ),
  p_invoice_number: z.string().min(1),
  p_items: z.array(
    z.object({
      product_id: z.string().regex(uuidRegex).nullable(),
      sku: z.string().nullable().optional(),
      quantity: z.number().positive(),
      unit_cost: z.number().min(0),
      // REC-2 MM-R11: ampliar schema con UM, sale_price y variant_id
      unit_of_measure: z.string().optional(),
      sale_price: z.number().min(0).optional(),
      variant_id: z.string().regex(uuidRegex).nullable().optional(),
      // FIX-COSTEO-DINAMICO: moneda y tasa de cambio por item
      moneda_recepcion: z.string().optional().default('CUP'),
      tasa_cambio_recepcion: z.number().min(0).optional().default(1.0),
    }),
  ),
});

export const adjustStockInputSchema = z.object({
  productId: z.string().regex(uuidRegex),
  storeId: z.string().regex(uuidRegex),
  userId: z.string().regex(uuidRegex),
  quantityDelta: z.number(),
  unitCostAdjustment: z.number().nullable(),
  reason: z.string().min(1),
  // Política forward-only locking: fecha opcional
  operationDate: z.string().datetime().optional(),
});

export const inventoryAdjustmentResponseSchema = z.object({
  status: z.string(),
  nuevo_stock: z.number(),
  nuevo_costo_total: z.number(),
  nuevo_costo_unitario: z.number(),
  movimiento_registrado: z.boolean(),
});

export const performInventoryAdjustmentParamsSchema = z.object({
  p_product_id: resilientUuid,
  p_store_id: resilientUuid,
  p_user_id: resilientUuid,
  p_quantity_delta: z.number(),
  p_unit_cost_adjustment: z.number().nullable(),
  p_reason: z.string().min(1),
  // Política forward-only locking: fecha opcional
  p_operation_date: z.string().datetime().optional(),
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
  store_id: z.string().regex(uuidRegex),
  sku: z.string().min(1),
  name: z.string().min(1),
  cost_price: z.number().min(0),
  discount_type: z.string().nullable().optional(),
  discount_value: z.number().optional(),
  cash_paid: z.number().optional(),
  transfer_paid: z.number().optional(),
  price: z.number().min(0),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit_of_measure: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  barcode_type: z.string().nullable().optional(),
  min_stock: z.number().min(0).nullable().optional(),
});

export const bulkUpdateProductsInputSchema = z.object({
  products: z.array(bulkUpdateProductItemSchema),
  storeId: z.string().regex(uuidRegex),
});

export const bulkUpdateProductsParamsSchema = z.object({
  _products: z.array(bulkUpdateProductItemSchema),
});

export const managedCreateUserParamsSchema = z.object({
  p_email: z.string().email(),
  p_full_name: z.string().min(1),
  p_role: userRoleSchema,
  p_plan: z.enum(['basico', 'profesional', 'enterprise']).optional(),
  p_store_id: z.string().regex(uuidRegex).nullable().optional(),
  p_memberships: z
    .array(
      z.object({
        store_id: z.string().regex(uuidRegex),
        role: userRoleSchema,
      }),
    )
    .optional(),
  p_max_stores: z.number().int().min(0).optional(),
  p_max_users: z.number().int().min(0).optional(),
  p_password: z.string().min(6).optional(),
});

export const manageUserMembershipsParamsSchema = z.object({
  p_user_id: z.string().regex(uuidRegex),
  p_memberships: z.array(
    z.object({
      store_id: z.string().regex(uuidRegex),
      role: userRoleSchema,
      status: z.enum(["active", "revoked"]).optional(),
    }),
  ),
});


// ============================================
// Scenarios
// ============================================

export const scenarioIdSchema = z.enum(['v1', 'v2', 'v3']);
export const scenarioColorSchema = z.enum(['blue', 'violet', 'amber']);

export const scenarioRowValuesSchema = z.object({
  valorHistorico: z.number().optional(),
  totalFormula: z.string().optional(),
  vhFormula: z.string().optional(),
  coeficiente: z.number().optional(),
  baseDeCalculoRef: z.string().optional(),
});

export const costSheetScenarioSchema = z.object({
  id: scenarioIdSchema,
  label: z.string(),
  color: scenarioColorSchema,
  createdAt: z.number(),
  values: z.record(z.string(), scenarioRowValuesSchema),
  header: z.record(z.string(), z.any()).optional(),
});

export const scenarioConfigSchema = z.object({
  primaryScenarioId: scenarioIdSchema,
  comparisonBaseId: scenarioIdSchema,
});

// ============================================
// Cost Sheet
// ============================================

export const costSheetHeaderSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    date: z.string(),
    quantity: z.union([z.number(), z.string()]),
    currency: z.string(),
    category: z.string(),
    type: z.string(),
    unit: z.string(),
    product_code: z.string().optional().default(""),
    company: z.string().optional().default(""),
    organism: z.string().optional().default(""),
    union: z.string().optional().default(""),
    destination: z.string().optional().default(""),
    production_level: z.union([z.number(), z.string()]).optional().default(0),
    capacity_utilization: z
      .union([z.number(), z.string()])
      .optional()
      .default(0),
    sale_price: z.union([z.number(), z.string()]).optional().default(0),
    client: z.string().optional().default(""),
  });

export const costSheetRowSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      label: z.string(),
      valorHistorico: z.number().optional(),
      value: z.number().optional(),
      baseDeCalculoRef: z.string().nullable().optional(),
      base_ref: z.string().nullable().optional(),
      baseRef: z.string().nullable().optional(),
      vhFormula: z.string().nullable().optional(),
      calculationMethod: z
        .enum(["Prorrateo", "ValorFijo", "FORMULA", "ANEXO", "ANEXO_REF", "FIJO", "MANUAL"])
        .optional(),
      totalFormula: z.string().nullable().optional(),
      formula: z.string().optional(),
      isPercent: z.boolean().optional(),
      is_percent: z.boolean().optional(),
      children: z.array(costSheetRowSchema).optional(),
      // Allow dynamic fields (um, unit, note, fuente, coeficiente, type, classification, etc.)
    }).passthrough(),
);

export const costSheetSectionSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  rows: z.array(costSheetRowSchema),
});

export const costSheetColumnSchema = z
  .object({
    key: z.string(),
    label: z.string().optional(),
    title: z.string().optional(),
    formula: z.string().optional(),
    type: z.enum(["number", "string", "formula", "text"]).optional(),
  }).passthrough();

export const costSheetAnnexSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    coefficient: z.number().optional().default(1),
    adjustmentColumn: z.string().optional().default("PRECIO UNITARIO"),
    columns: z.array(costSheetColumnSchema),
    data: z.array(z.record(z.string(), z.any())),
    // Allow isAdjustmentActive and other dynamic fields
  }).passthrough();

export const costSheetSignatureSchema = z
  .object({
    prepared_by: z.string(),
    approved_by: z.string(),
  });

export const costSheetDataSchema = z
  .object({
    header: costSheetHeaderSchema,
    sections: z.array(costSheetSectionSchema),
    annexes: z.array(costSheetAnnexSchema),
    signature: costSheetSignatureSchema,
    scenarioConfig: scenarioConfigSchema.optional(),
    scenarios: z.array(costSheetScenarioSchema).optional(),
  });

// ============================================
// Import Schemas
// ============================================

export const catalogImportRowSchema = z
  .object({
    sku: z.string().min(1, "El SKU es obligatorio"),
    name: z.string().min(1, "El nombre es obligatorio"),
    cost: z.coerce
      .number()
      .min(0, "El costo debe ser un número válido (mínimo 0)"),
    price: z.coerce
      .number()
      .min(0, "El precio debe ser un número válido (mínimo 0)"),
    imageUrl: z.string().optional().nullable().default(""),
  })
  .refine((data) => data.price >= data.cost, {
    message: "El precio de venta no puede ser menor que el costo.",
    path: ["price"],
  });

export const receptionImportRowSchema = z.object({
  sku: z.string().min(1, "El SKU es obligatorio"),
  quantity: z.coerce
    .number()
    .positive("La cantidad debe ser un número positivo (hasta 4 decimales)")
    .refine(v => Number(v.toFixed(4)) === v, { message: 'Máximo 4 decimales permitidos' }),
  cost: z.coerce
    .number()
    .min(0, "El costo debe ser un número válido (mínimo 0)"),
});

export const transferStatusSchema = z.enum([
  "PENDIENTE",
  "CONFIRMADA",
  "CANCELADA",
]);

export const transferItemSchema = z.object({
  id: optionalResilientUuid,
  transfer_id: optionalResilientUuid,
  product_id: z.string().regex(uuidRegex),
  quantity: z.number().positive(),
  unit_cost: z.number().min(0),
});

export const transferSchema = z.object({
  id: z.string().regex(uuidRegex),
  origin_store_id: z.string().regex(uuidRegex),
  destination_store_id: z.string().regex(uuidRegex),
  created_by: z.string().regex(uuidRegex),
  status: transferStatusSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const transferWithDetailsSchema = transferSchema.extend({
  origin_store: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    storeSchema.nullable().optional().catch(null),
  ),
  destination_store: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    storeSchema.nullable().optional().catch(null),
  ),
  creator: z.preprocess(
    (val) => (Array.isArray(val) ? val[0] : val),
    z
      .object({
        full_name: z.string(),
      })
      .nullable()
      .optional()
      .catch(null),
  ),
  items: z
    .array(
      transferItemSchema.extend({
        product: z.preprocess(
          (val) => (Array.isArray(val) ? val[0] : val),
          productSchema.nullable().optional().catch(null),
        ),
      }),
    )
    .optional(),
});

// ============================================
// Sync Schemas
// ============================================

export const syncOperationTypeSchema = z.enum(["CREATE", "UPDATE", "DELETE"]);

export const syncOperationSchema = z.object({
  id: optionalResilientUuid,
  idempotencyKey: z.string().regex(uuidRegex),
  operationType: syncOperationTypeSchema,
  entity: z.string(),
  payload: z.any(),
  createdAt: z.string(),
  clientClock: z.number(),
  status: z
    .enum(["pending", "in-flight", "failed", "synced", "discarded"])
    .default("pending"),
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
  idempotencyKey: z.string().regex(uuidRegex),
  status: z.enum(["ok", "conflict", "error"]),
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

export const reportTypeSchema = z.enum([
  "sales",
  "profit",
  "inventory",
  "kardex",
  "purchases",
  "audit",
]);

export const reportDefinitionSchema = z.object({
  id: z.string().regex(uuidRegex).optional(),
  name: z.string().min(1, "El nombre del reporte es obligatorio"),
  type: reportTypeSchema,
  filters: z.any().default({}),
  date_range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  columns: z.array(z.string()).default([]),
  layout: z.any().default({}),
  created_by: z.string().regex(uuidRegex).optional(),
  store_id: z.string().regex(uuidRegex).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const reportRunSchema = z.object({
  id: z.string().regex(uuidRegex).optional(),
  report_definition_id: z.string().regex(uuidRegex),
  executed_by: z.string().regex(uuidRegex),
  executed_at: z.string().optional(),
  parameters_snapshot: z.any(),
  file_url: z.string().nullable().optional(),
  status: z.enum(["pending", "completed", "failed"]).default("pending"),
  error_message: z.string().nullable().optional(),
  store_id: z.string().regex(uuidRegex).optional(),
});

// ============================================
// RPC Parameter Schemas (Hardened Contracts)
// ============================================

export const managedDeleteProductParamsSchema = z.object({
  p_product_id: z.string().regex(uuidRegex),
});

export const managedToggleProductActiveParamsSchema = z.object({
  p_product_id: z.string().regex(uuidRegex),
  p_is_active: z.boolean(),
});

export const createTransferParamsSchema = z.object({
  p_origin_store_id: z.string().regex(uuidRegex),
  p_destination_store_id: z.string().regex(uuidRegex),
  p_items: z.array(
    z.object({
      product_id: z.string().regex(uuidRegex),
      quantity: z.number().positive(),
      unit_cost: z.number().min(0),
    }),
  ),
  p_notes: z.string().nullable(),
  // Política forward-only locking: fecha de operación opcional.
  p_operation_date: z.string().datetime().optional(),
});

export const confirmTransferParamsSchema = z.object({
  p_transfer_id: z.string().regex(uuidRegex),
  p_user_id: z.string().regex(uuidRegex),
  // Política forward-only locking: fecha de operación opcional.
  p_operation_date: z.string().datetime().optional(),
});

export const getSalesSinceLastClosureParamsSchema = z.object({
  p_store_id: z.string().regex(uuidRegex),
});

export const getTransferableStoresParamsSchema = z.object({
  p_user_id: z.string().regex(uuidRegex),
  p_current_store_id: z.string().regex(uuidRegex),
});

export const getAuditLogsParamsSchema = z.object({
  p_store_id: z.string().regex(uuidRegex).nullable(),
  p_search_term: z.string().nullable(),
  p_date_from: z.string().nullable(),
  p_date_to: z.string().nullable(),
  p_limit: z.number().int().positive().optional().default(1000),
});

export const getTransactionsParamsSchema = z.object({
  p_store_id: resilientUuid,
  p_limit: z.number().int().positive().optional().default(1000),
});

export const getDashboardKpisParamsSchema = z.object({
  p_store_id: resilientUuid,
  p_date_from: z.string().nullable().optional(),
  p_date_to: z.string().nullable().optional(),
});

export const taxConfigurationSchema = z.object({
  id: z.string().regex(uuidRegex),
  name: z.string(),
  type: z.enum(["fixed", "percentage"]),
  value: z.coerce.number(),
  min_exempt: z.coerce.number().optional().nullable(),
  is_active: z.boolean().default(true),
  store_id: optionalResilientUuid,
});
