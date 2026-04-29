import { z } from "zod";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resilientUuid = z.preprocess(
  (val) => (typeof val === "string" && uuidRegex.test(val) ? val : undefined),
  z.string().regex(uuidRegex),
);
const optionalResilientUuid = z.preprocess(
  (val) => (typeof val === "string" && uuidRegex.test(val) ? val : undefined),
  z.string().regex(uuidRegex).optional(),
);

// ============================================
// Auth & Users
// ============================================

export const userRoleSchema = z.enum(["admin", "manager", "operator", "viewer"]);

export const userSchema = z.object({
  id: z.string().regex(uuidRegex),
  email: z.string().email(),
  full_name: z.string().nullable().optional(),
  role: userRoleSchema,
  store_id: z.string().regex(uuidRegex).nullable().optional(),
  created_at: z.string().optional(),
});

export const storeSchema = z.object({
  id: z.string().regex(uuidRegex),
  name: z.string().min(1, "El nombre del establecimiento es obligatorio"),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
});

export const productSchema = z.object({
  id: z.string(),
  sku: z.string().min(1, "El SKU es obligatorio"),
  name: z.string().min(1, "El nombre es obligatorio"),
  category: z.string().nullable().optional(),
  unit: z.string().default("unidad"),
  cost: z.number().min(0).optional().default(0),
  price: z.number().min(0).optional().default(0),
  stock: z.number().optional().default(0),
  is_active: z.boolean().default(true),
});

export const sessionSchema = z.object({
  user: userSchema,
  expires: z.string(),
  token: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const registerSchema = z
  .object({
    email: z.string().email("Correo electrónico inválido"),
    password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
    full_name: z.string().min(2, "El nombre es obligatorio"),
    role: userRoleSchema.default("operator"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const apiKeySchema = z.object({
  id: z.string().regex(uuidRegex).optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  key: z.string().optional(),
  user_id: z.string().regex(uuidRegex),
  role: userRoleSchema,
  status: z.enum(["active", "revoked"]).optional(),
});

export const apiKeysSchema = z.object({
  keys: z.array(
    z.object({
      id: z.string().regex(uuidRegex).optional(),
      name: z.string().min(1, "El nombre es obligatorio"),
      key: z.string().optional(),
      user_id: z.string().regex(uuidRegex),
      role: userRoleSchema,
      status: z.enum(["active", "revoked"]).optional(),
    }),
  ),
});

// ============================================
// ============================================
// Cost Sheet
// ============================================

export const scenarioIdSchema = z.enum(['v1', 'v2', 'v3']);
export const scenarioColorSchema = z.enum(['blue', 'violet', 'amber']);

export const scenarioRowValuesSchema = z.object({
  valorHistorico: z.number().optional(),
  totalFormula: z.string().optional(),
  vhFormula: z.string().optional(),
  coeficiente: z.number().optional(),
  baseDeCalculoRef: z.string().optional(),
}).catchall(z.any());

export const costSheetScenarioSchema = z.object({
  id: scenarioIdSchema,
  label: z.string(),
  color: scenarioColorSchema,
  createdAt: z.number(),
  values: z.record(z.string(), scenarioRowValuesSchema),
  header: z.record(z.string(), z.any()).optional(),
}).catchall(z.any());

export const scenarioConfigSchema = z.object({
  primaryScenarioId: scenarioIdSchema,
  comparisonBaseId: scenarioIdSchema,
}).catchall(z.any());

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
  })
  .catchall(z.any());

export const costSheetRowSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      label: z.string(),
      valorHistorico: z.number().optional(),
      value: z.number().optional(),
      baseDeCalculoRef: z.string().nullable().optional(),
      base_ref: z.string().nullable().optional(),
      calculationMethod: z
        .enum(["Prorrateo", "ValorFijo", "FORMULA", "ANEXO", "ANEXO_REF", "FIJO", "MANUAL"])
        .optional(),
      totalFormula: z.string().nullable().optional(),
      formula: z.string().optional(),
      isPercent: z.boolean().optional(),
      is_percent: z.boolean().optional(),
      children: z.array(costSheetRowSchema).optional(),
    })
    .catchall(z.any()),
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
