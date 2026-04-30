import { z } from 'zod';

// ─── Users ───────────────────────────────────────────────────────────────────
export const managedCreateUserSchema = z.object({
  p_email: z.string().email('Email inválido'),
  p_password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
  p_full_name: z.string().min(1, 'Nombre requerido'),
  p_role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo', 'superadmin']),
  p_store_id: z.string().uuid('store_id inválido').nullable().optional(),
  p_memberships: z.array(z.any()).optional(),
  p_max_stores: z.number().int().optional(),
  p_max_users: z.number().int().optional(),
});

export const toggleUserStatusSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
  is_active: z.boolean(),
});

export const deleteUserSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
});

export const resetPasswordSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
  new_password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
  send_reset_email: z.boolean().optional().default(true),
});

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryAdjustSchema = z.object({
  productId: z.string().uuid('productId inválido'),
  storeId: z.string().uuid('storeId inválido'),
  quantity: z.number().int().min(-9999).max(99999),
  movementType: z.enum(['add', 'subtract', 'set']),
  version: z.number().int().positive('version debe ser positivo'),
  reason: z.string().max(500).optional(),
});

export const inventoryAdjustmentsSchema = z.object({
  storeId: z.string().uuid('storeId inválido'),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int(),
    movement_type: z.enum(['add', 'subtract', 'set']).optional(),
    reason: z.string().max(500).optional(),
  })).min(1, 'Se requiere al menos un ítem'),
});

// ─── Cost sheets ─────────────────────────────────────────────────────────────
export const costSheetSaveSchema = z.object({
  updateData: z.record(z.string(), z.unknown()),
  currentData: z.record(z.string(), z.unknown()).optional(),
});

export const aiChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(8000),
  })).min(1).max(50),
  aiProvider: z.string().min(1).max(50).optional(),
  sheetData: z.record(z.string(), z.unknown()).optional().nullable(),
  aiApiKey: z.string().optional(),
});

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsGenerateSchema = z.object({
  type: z.enum(['cost-sheet', 'inventory', 'sales', 'transfer', 'cash', 'profit', 'kardex', 'purchases', 'audit']),
  format: z.enum(['a4', 'letter', 'legal']).optional().default('a4'),
  orientation: z.enum(['portrait', 'landscape']).optional().default('portrait'),
  data: z.record(z.string(), z.unknown()).optional(),
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
export const botChatSchema = z.object({
  message: z.string().min(1).max(4000).optional(),
  messages: z.array(z.any()).optional(),
  conversationId: z.string().uuid().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  aiProvider: z.string().optional(),
  aiApiKey: z.string().optional(),
  storeId: z.string().uuid().optional(),
});

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
