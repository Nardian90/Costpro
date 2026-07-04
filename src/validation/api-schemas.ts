import { z } from 'zod';
import { STORE_TEMPLATES } from '@/config/app';

/**
 * Lenient UUID validation: accepts any 8-4-4-4-12 hex pattern.
 *
 * Rationale: Supabase may generate non-RFC4122 UUIDs (missing variant/version bits).
 * This regex validates the structural format (shape + hex chars) which is sufficient
 * for input validation — the UUID must still exist in the DB for any operation to succeed.
 *
 * This is the SINGLE source of truth — import from here instead of re-declaring locally.
 */
export const uuidLoose = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'UUID inválido'
);

// ─── Users ───────────────────────────────────────────────────────────────────
export const managedCreateUserSchema = z.object({
  p_email: z.string().email('Email inválido'),
  p_password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
  p_full_name: z.string().min(1, 'Nombre requerido'),
  p_role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo', 'superadmin']),
  p_store_id: uuidLoose.nullable().optional(),
  p_memberships: z.array(z.any()).optional(),
  p_max_stores: z.number().int().optional(),
  p_max_users: z.number().int().optional(),
});

export const toggleUserStatusSchema = z.object({
  user_id: uuidLoose,
  is_active: z.boolean(),
});

export const deleteUserSchema = z.object({
  user_id: uuidLoose,
});

export const resetPasswordSchema = z.object({
  user_id: uuidLoose,
  new_password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
  send_reset_email: z.boolean().optional().default(true),
});

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryAdjustSchema = z.object({
  productId: uuidLoose,
  storeId: uuidLoose,
  quantity: z.number().min(-9999).max(99999),
  movementType: z.enum(['add', 'subtract', 'set']),
  version: z.number().int().positive('version debe ser positivo'),
  reason: z.string().max(500).optional(),
});

export const inventoryAdjustmentsSchema = z.object({
  storeId: uuidLoose,
  items: z.array(z.object({
    product_id: uuidLoose,
    quantity: z.number(),
    movement_type: z.enum(['add', 'subtract', 'set']).optional(),
    reason: z.string().max(500).optional(),
  })).min(1, 'Se requiere al menos un ítem'),
});

// ─── Cost sheets ─────────────────────────────────────────────────────────────
export const costSheetSaveSchema = z.object({
  updateData: z.record(z.string(), z.unknown()),
  currentData: z.record(z.string(), z.unknown()).optional(),
  // FIX-AUDIT-2: store_id is mandatory for multi-store data isolation
  store_id: uuidLoose,
  storeId: uuidLoose.optional(), // alias support
});

export const aiChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'model']),
    content: z.string().max(8000),
  })).min(1).max(50),
  aiProvider: z.string().min(1).max(50).optional(),
  sheetData: z.record(z.string(), z.unknown()).optional().nullable(),
  aiApiKey: z.string().optional(),
});

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsGenerateSchema = z.object({
  type: z.enum(['cost_sheet', 'inventory', 'sales', 'transfer', 'cash', 'profit', 'kardex', 'purchases', 'audit', 'daily_income', 'daily_expenses']),
  format: z.enum(['a4', 'letter', 'legal']).optional().default('a4'),
  orientation: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  data: z.record(z.string(), z.unknown()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  store_id: uuidLoose.optional().nullable(),
  columns: z.array(z.string()).optional(),
  name: z.string().optional(),
  definition_id: uuidLoose.optional(),
  calculatedValues: z.record(z.string(), z.any()).optional(),
  calculatedAnnexes: z.array(z.any()).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

// ─── Academy ─────────────────────────────────────────────────────────────────
export const academyGenerateSchema = z.object({
  filename: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).optional().default(3),
  aiProvider: z.string().min(1).max(50),
  aiApiKey: z.string().optional(),
});

export const academyReviewSchema = z.object({
  score: z.number().int().min(0).max(5),
});

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logsSchema = z.object({
  context: z.string().max(100).optional(),
  error: z.object({
    message: z.string().max(1000),
    stack: z.string().max(5000).optional(),
    code: z.string().max(50).optional(),
  }),
});

// ─── Bot ────────────────────────────────────────────────────────────────────
export const botMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool', 'model']),
  content: z.string().max(32000),
  tool_calls: z.array(z.record(z.string(), z.unknown())).optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
  imageData: z.object({
    mimeType: z.string(),
    data: z.string(),
  }).nullable().optional(),
});

export const botChatSchema = z.object({
  message: z.string().min(1).max(4000).optional(),
  // FIX-BOTCHAT-LIMIT: Cap messages array at 50 to prevent context-window abuse.
  // The frontend already slices to last 30, but defense in depth at API boundary.
  // A malicious client could send 1000 messages of 32K each = 32MB payload → OOM.
  messages: z.array(botMessageSchema).max(50, 'Too many messages (max 50)').optional(),
  conversationId: uuidLoose.optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  aiProvider: z.string().optional(),
  aiApiKey: z.string().optional(),
  model: z.string().optional(),
  storeId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional().default(false),
});

// ─── Ofertas Comerciales ─────────────────────────────────────────────────────
export const ofertaItemSchema = z.object({
  codigo: z.string().max(50).optional().default(''),
  descripcion: z.string().min(1, 'Descripción requerida').max(2000),
  um: z.string().max(20).default('U'),
  cantidad: z.number().positive('Cantidad debe ser > 0'),
  precio_unitario: z.number().positive('Precio debe ser > 0'),
});

export const ofertaCreateSchema = z.object({
  store_id: uuidLoose,
  numero: z.string().min(1, 'Número de oferta requerido').max(50),
  fecha: z.string().min(1, 'Fecha requerida'),
  objeto: z.string().min(1, 'Objeto requerido').max(500),
  suministrador: z.object({
    empresa: z.string().min(1, 'Empresa requerida').max(200),
    codigo_reup: z.string().max(50).optional().default(''),
    codigo_nit: z.string().max(50).optional().default(''),
    direccion: z.string().max(500).optional().default(''),
    telefono: z.string().max(50).optional().default(''),
    cuenta_bancaria: z.string().max(100).optional().default(''),
    email: z.string().max(200).optional().default(''),
  }),
  cliente: z.object({
    empresa: z.string().min(1, 'Empresa requerida').max(200),
    codigo_reup: z.string().max(50).optional().default(''),
    codigo_nit: z.string().max(50).optional().default(''),
    direccion: z.string().max(500).optional().default(''),
    telefono: z.string().max(50).optional().default(''),
    email: z.string().max(200).optional().default(''),
    contacto: z.string().max(200).optional().default(''),
  }),
  productos: z.array(ofertaItemSchema).min(1, 'Al menos un producto requerido'),
  stamp_url: z.string().optional().nullable(),
  sign_url: z.string().optional().nullable(),
  stamp_scale: z.number().min(50).max(200).optional().default(100),
  sign_scale: z.number().min(50).max(200).optional().default(100),
  descuento: z.number().min(0).optional().default(0),
  itbis: z.number().min(0).max(100).optional().default(0),
  moneda: z.string().max(10).optional().default('CUP'),
  validez: z.string().max(200).optional().default('30 días'),
  condiciones_pago: z.string().max(500).optional().default('Pago en la fecha de entrega'),
  condiciones_entrega: z.string().max(500).optional().default('Según acuerdo entre las partes'),
  notas: z.string().max(2000).optional().default(''),
});

export const ofertaUpdateSchema = ofertaCreateSchema.partial().extend({
  id: uuidLoose,
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).optional(),
});

export const ofertaPdfExportSchema = z.object({
  ofertaId: uuidLoose.optional(),
  store_id: uuidLoose.optional(),
  oferta: z.record(z.string(), z.unknown()).optional(),
});

// ─── Stores ───────────────────────────────────────────────────────────────────
export const createStoreSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  // F4-FIX: address es opcional para soportar el flujo 'create-quick' donde
  // solo se envía name + slug. El admin completa la dirección después desde
  // StoreConfigModal. Antes era min(1) lo que causaba 400 "Datos inválidos".
  address: z.string().max(200).optional().default(''),
  logo_url: z.string().url().optional().nullable(),
  reeup: z.string().regex(/^\d{11}$/, 'REEUP debe tener 11 dígitos').optional().nullable(),
  nit: z.string().regex(/^\d{1,15}$/, 'NIT debe contener solo dígitos').optional().nullable(),
  bank_account: z.string().min(1).optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
  slug: z.string().min(1).max(100).optional().nullable(),
  plantilla: z.enum(STORE_TEMPLATES).optional().nullable(),
  signature_url: z.string().url().optional().nullable(),
  stamp_url: z.string().url().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  // ── Storefront config (2026-07-04) ──
  banner_url: z.string().url().optional().nullable(),
  store_tagline: z.string().max(200).optional().nullable(),
  whatsapp_group_url: z.string().url().optional().nullable().or(z.literal('')),
  telegram_url: z.string().url().optional().nullable().or(z.literal('')),
  services: z.array(z.object({
    icon: z.string().max(50),
    title: z.string().max(100),
    description: z.string().max(300).optional(),
  })).max(6).optional().nullable(),
  promo_images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(200).optional(),
    link: z.string().url().optional().nullable(),
  })).max(5).optional().nullable(),
  opening_hours: z.string().max(200).optional().nullable(),
});

export const updateStoreSchema = z.object({
  storeId: uuidLoose,
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(200).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  reeup: z.string().regex(/^\d{11}$/).optional().nullable(),
  nit: z.string().regex(/^\d{1,15}$/, 'NIT debe contener solo dígitos').optional().nullable(),
  bank_account: z.string().min(1).optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  slug: z.string().min(1).max(100).optional().nullable(),
  plantilla: z.enum(STORE_TEMPLATES).optional().nullable(),
  signature_url: z.string().url().optional().nullable(),
  stamp_url: z.string().url().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  // F2-T03: is_active permitido en PATCH para implementar toggle activar/desactivar
  // sin necesidad de pasar por el DELETE handler (que además revoca memberships).
  // El toggle preserva memberships y configuración; el DELETE las revoca todas.
  // Diferencia clave: toggle = pausa temporal; DELETE = baja permanente con cleanup.
  is_active: z.boolean().optional(),
  // ── Storefront config (2026-07-04) ──
  banner_url: z.string().url().optional().nullable(),
  store_tagline: z.string().max(200).optional().nullable(),
  whatsapp_group_url: z.string().url().optional().nullable().or(z.literal('')),
  telegram_url: z.string().url().optional().nullable().or(z.literal('')),
  services: z.array(z.object({
    icon: z.string().max(50),
    title: z.string().max(100),
    description: z.string().max(300).optional(),
  })).max(6).optional().nullable(),
  promo_images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(200).optional(),
    link: z.string().url().optional().nullable(),
  })).max(5).optional().nullable(),
  opening_hours: z.string().max(200).optional().nullable(),
});

export const deleteStoreSchema = z.object({
  storeId: uuidLoose,
});

// ─── Store Cost Templates (FC Automatizada) ──────────────────────────────────
export const upsertStoreCostTemplateSchema = z.object({
  store_id: uuidLoose,
  template_id: z.string().min(1, 'ID de plantilla requerido').max(100),
  template_data: z.record(z.string(), z.unknown())
    .refine(val => JSON.stringify(val).length < 500_000, { message: 'Payload demasiado grande (máx 500KB)' })
    .optional().nullable(),
  modalidad: z.enum(['produccion', 'servicios', 'comercializacion'], {
    message: 'Modalidad inválida. Debe ser: produccion, servicios o comercializacion',
  }),
  pdf_format: z.enum([
    'standard', 'pro', 'res148', 'ejecutivo', 'contabilidad',
    'auditoria', 'simplificado', 'bilingue', 'comparativo', 'exportacion',
  ]).optional().default('res148'),
});

export const getStoreCostTemplateSchema = z.object({
  store_id: uuidLoose,
});

// ─── Product Cost Sheets (FC Automatizada) ───────────────────────────────────
export const getProductCostSheetSchema = z.object({
  product_id: uuidLoose,
  store_id: uuidLoose.optional(),
});

export const saveProductCostSheetSchema = z.object({
  product_id: uuidLoose,
  store_id: uuidLoose,
  template_id: z.string().min(1, 'ID de plantilla requerido').max(100),
  modalidad: z.enum(['produccion', 'servicios', 'comercializacion'], {
    message: 'Modalidad inválida',
  }),
  calculated_data: z.record(z.string(), z.unknown())
    .refine(val => JSON.stringify(val).length < 500_000, { message: 'Payload demasiado grande (máx 500KB)' }),
  cost_price: z.number().min(0, 'El costo unitario no puede ser negativo'),
});

export const quickPdfSchema = z.object({
  product_id: uuidLoose,
  store_id: uuidLoose.optional(),
  pdf_format: z.enum([
    'standard', 'pro', 'res148', 'ejecutivo', 'contabilidad',
    'auditoria', 'simplificado', 'bilingue', 'comparativo', 'exportacion',
  ]).optional().default('res148'),
});

// ─── FC Recalculate ──────────────────────────────────────────────────────────
const priceChangeRecordSchema = z.object({
  productId: uuidLoose,
  storeId: uuidLoose,
  oldCostPrice: z.number().min(0, 'Precio anterior inválido'),
  newCostPrice: z.number().min(0, 'Precio nuevo inválido'),
  changedBy: z.string().optional(),
  forceRecalculation: z.boolean().optional().default(false),
});

export const recalculateSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('single'),
    productId: uuidLoose,
    storeId: uuidLoose,
    oldCostPrice: z.number().min(0, 'Precio anterior inválido'),
    newCostPrice: z.number().min(0, 'Precio nuevo inválido'),
    changedBy: z.string().optional(),
    forceRecalculation: z.boolean().optional().default(false),
  }),
  z.object({
    mode: z.literal('batch'),
    changes: z.array(priceChangeRecordSchema).min(1, 'Al menos un cambio requerido').max(100, 'Máximo 100 cambios por lote'),
  }),
]);

// ─── Helper para respuesta de error estandarizada ────────────────────────────
export function zodError(errors: z.ZodError) {
  return {
    ok: false,
    error: 'Validation failed',
    details: errors.issues.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  };
}
