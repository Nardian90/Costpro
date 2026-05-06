import { z } from "zod";

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
  "card",
  "transfer",
  "wallet",
  "other",
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
  logo_url: z.string().nullable().optional(),
  reeup: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  created_at: z.string().optional(),
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
      z.string().optional(),
    )
    .catch("Usuario sin nombre")
    .default("Usuario sin nombre"),
  email: z
    .preprocess(
      (val) => (val === "" || val === null ? undefined : val),
      z.string().email().optional(),
    )
    .catch("no-email@costpro.com")
    .default("no-email@costpro.com"),
  role: userRoleSchema.optional().catch("clerk").default("clerk"),
  roles: z.array(userRoleSchema).optional().catch([]).default([]),
  role_id: resilientUuid,
  is_active: z.boolean().optional().catch(true).default(true),
  store_id: resilientUuid,
  active_store_id: resilientUuid,
  logo_url: z.string().nullable().optional(),
  plan: z.string().optional().catch("free").default("free"),
  reeup: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  ai_provider: z.string().optional(),
  ai_api_key: z.string().nullable().optional(),
  max_stores_limit: z.number().optional(),
  max_users_limit: z.number().optional(),
  created_by: resilientUuid,
  created_at: z.preprocess(
      (val) => val || new Date().toISOString(),
      z.string().optional(),
    ).catch(() => new Date().toISOString()).default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  memberships: z
    .preprocess(
      (val) => (Array.isArray(val) ? val : []),
      z.array(userStoreMembershipSchema).optional().catch([]),
    )
    .optional()
    .default([]),
});

export const productSchema = z.object({
  id: resilientUuid.pipe(z.string().regex(uuidRegex)).catch(""),
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().nullable().optional(),
  sku: z.string().min(1, "El SKU es obligatorio"),
  price: z.coerce.number().min(0).optional().default(0),
  cost_price: z.coerce.number().min(0).optional().default(0),
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
  has_movements: z
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
});

export const updateProductInputSchema = productSchema.partial().omit({
  id: true,
  created_at: true,
  updated_at: true,
  public_image_url: true,
  has_movements: true,
});

export const createProductVariantInputSchema = productVariantSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const cartItemSchema = z.object({
  product_id: z.string().regex(uuidRegex),
  variant_id: z.string().regex(uuidRegex).nullable(),
  sku: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  price: z.number().min(0),
  cost: z.number().min(0).optional().default(0),
  discount: z.number().min(0).optional().default(0),
  unit_of_measure: z.string().nullable().optional(),
});

export const transactionSchema = z.object({
  id: z.string().regex(uuidRegex).or(z.string()),
  store_id: optionalResilientUuid,
  seller_id: optionalResilientUuid,
  seller_name: z.string().nullable().optional().catch("Desconocido").default("Desconocido"),
  total_amount: z.coerce.number().optional().catch(0).default(0),
  status: transactionStatusSchema.optional().catch("pending").default("pending"),
  created_at: z.preprocess(
    (val) => val || new Date().toISOString(),
    z.string().optional(),
  ).catch(() => new Date().toISOString()).default(() => new Date().toISOString()),
  updated_at: z.string().optional().nullable(),
  completed_at: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  void_reason: z.string().nullable().optional(),
  payment_method: paymentMethodSchema.optional().catch("cash").default("cash"),
  discount_type: discountTypeSchema.optional().catch("fixed").default("fixed"),
  discount_value: z.coerce.number().optional().catch(0).default(0),
  subtotal: z.coerce.number().optional().catch(0).default(0),
  tax_amount: z.coerce.number().optional().catch(0).default(0),
  applied_taxes: z.array(z.any()).optional().catch([]).default([]),
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
  metadata: z.record(z.any()).optional().nullable(),
});

export const scenarioConfigSchema = z
  .object({
    activeScenarios: z.array(z.string()).default(["v1"]),
    primaryScenarioId: z.string().default("v1"),
    showComparison: z.boolean().default(false),
  })
  .catchall(z.any());

export const costSheetScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    color: z.string().optional(),
  })
  .catchall(z.any());

export const costSheetHeaderSchema = z
  .object({
    id: z.string().optional(),
    title: z.string(),
    entity: z.string().optional(),
    date: z.string().optional(),
    description: z.string().optional(),
  })
  .catchall(z.any());

export const costSheetRowSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    unitOfMeasure: z.string().optional(),
    formula: z.string().optional(),
    type: z.enum(["number", "string", "formula", "text"]).optional(),
    valorHistorico: z.number().optional(),
    totalFormula: z.number().optional(),
    vhFormula: z.number().optional(),
    coefficients: z.record(z.string(), z.number()).optional(),
  })
  .catchall(z.any());

export const costSheetSectionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    rows: z.array(z.any()),
  })
  .catchall(z.any());

export const costSheetColumnSchema = z
  .object({
    id: z.string(),
    header: z.string().optional(),
    title: z.string().optional(),
    formula: z.string().optional(),
    type: z.enum(["number", "string", "formula", "text"]).optional(),
  })
  .catchall(z.any());

export const costSheetAnnexSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    coefficient: z.number().optional().default(1),
    adjustmentColumn: z.string().optional().default("PRECIO UNITARIO"),
    columns: z.array(costSheetColumnSchema),
    data: z.array(z.record(z.string(), z.any())),
  })
  .catchall(z.any());

export const costSheetSignatureSchema = z
  .object({
    prepared_by: z.string(),
    approved_by: z.string(),
  })
  .catchall(z.any());

export const costSheetDataSchema = z
  .object({
    header: costSheetHeaderSchema,
    sections: z.array(costSheetSectionSchema),
    annexes: z.array(costSheetAnnexSchema),
    signature: costSheetSignatureSchema,
    scenarioConfig: scenarioConfigSchema.optional(),
    scenarios: z.array(costSheetScenarioSchema).optional(),
  })
  .catchall(z.any());

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
    .int()
    .positive("La cantidad debe ser un número entero positivo"),
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
    .enum(["pending", "in-flight", "failed", "synced"])
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
});

export const confirmTransferParamsSchema = z.object({
  p_transfer_id: z.string().regex(uuidRegex),
  p_user_id: z.string().regex(uuidRegex),
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
