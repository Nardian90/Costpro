import { z } from 'zod';

// ─── Users ───────────────────────────────────────────────────────────────────
export const managedCreateUserSchema = z.object({
  p_email: z.string().email('Email inválido'),
  p_password: z.string().min(8, 'Mínimo 8 caracteres').optional().nullable(),
  p_full_name: z.string().min(1, 'Nombre requerido'),
  p_role: z.any().optional(),
  p_store_id: z.preprocess((val) => (val === '' || val === 'null' || val === 'undefined' ? null : val), z.string().uuid().optional().nullable()),
  p_memberships: z.array(z.any()).optional().nullable().default([]),
  p_max_stores: z.any().optional(),
  p_max_users: z.any().optional(),
}).passthrough();

export const toggleUserStatusSchema = z.object({
  user_id: z.string().uuid(),
  is_active: z.any(),
}).passthrough();

export const deleteUserSchema = z.object({
  user_id: z.string().uuid(),
}).passthrough();

export const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  new_password: z.string().optional().nullable(),
  send_reset_email: z.any().optional(),
}).passthrough();

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryAdjustSchema = z.object({
  productId: z.string().uuid(),
  storeId: z.preprocess((val) => (val === '' ? undefined : val), z.string().uuid().optional().nullable()),
  quantity: z.any(),
  movementType: z.any(),
  version: z.any(),
  reason: z.any().optional(),
}).passthrough();

export const inventoryAdjustmentsSchema = z.object({
  storeId: z.preprocess((val) => (val === '' ? undefined : val), z.string().uuid().optional().nullable()),
  items: z.array(z.any()).min(1),
}).passthrough();

// ─── Cost sheets ─────────────────────────────────────────────────────────────
export const costSheetSaveSchema = z.object({
  updateData: z.record(z.string(), z.unknown()),
  currentData: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough();

export const aiChatSchema = z.object({
  messages: z.array(z.object({
    role: z.preprocess((val) => {
      const s = String(val).toLowerCase();
      if (s === 'model' || s === 'assistant') return 'assistant';
      return s;
    }, z.string().default('user')),
    content: z.preprocess((val) => (val === null || val === undefined ? '' : String(val)), z.string().default('')),
  }).passthrough()).optional().nullable().default([]),
  aiProvider: z.any().optional(),
  sheetData: z.any().optional(),
  aiApiKey: z.any().optional(),
}).passthrough();

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsGenerateSchema = z.object({
  type: z.any(),
  format: z.any().optional(),
  orientation: z.any().optional(),
  data: z.any().optional(),
  from: z.any().optional(),
  to: z.any().optional(),
  store_id: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().optional().nullable()),
  columns: z.any().optional(),
  name: z.any().optional(),
  definition_id: z.preprocess((val) => (val === '' ? undefined : val), z.string().uuid().optional().nullable()),
  calculatedValues: z.any().optional(),
  calculatedAnnexes: z.any().optional(),
  options: z.any().optional(),
}).passthrough();

// ─── Academy ─────────────────────────────────────────────────────────────────
export const academyGenerateSchema = z.object({
  filename: z.string().min(1),
  limit: z.any().optional(),
  aiProvider: z.any(),
  aiApiKey: z.any().optional(),
}).passthrough();

export const academyReviewSchema = z.object({
  score: z.any(),
}).passthrough();

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logsSchema = z.object({
  context: z.any().optional(),
  error: z.any(),
}).passthrough();

// ─── Bot ────────────────────────────────────────────────────────────────────
export const botMessageSchema = z.object({
  role: z.preprocess((val) => {
    const s = String(val).toLowerCase();
    if (s === 'model' || s === 'assistant') return 'assistant';
    return s;
  }, z.string().default('user')),
  content: z.preprocess((val) => (val === null || val === undefined ? '' : String(val)), z.string().default('')),
  tool_calls: z.any().optional().nullable(),
  tool_call_id: z.any().optional().nullable(),
  name: z.any().optional().nullable(),
  imageData: z.any().optional().nullable(),
}).passthrough();

export const botChatSchema = z.object({
  message: z.any().optional(),
  messages: z.array(botMessageSchema).optional().nullable().default([]),
  conversationId: z.preprocess((val) => (val === '' || val === 'null' || val === 'undefined' ? undefined : val), z.string().uuid().optional().nullable()),
  context: z.any().optional(),
  aiProvider: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional().nullable()),
  aiApiKey: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional().nullable()),
  model: z.any().optional(),
  storeId: z.preprocess((val) => (val === '' || val === 'null' || val === 'undefined' ? null : val), z.string().uuid().optional().nullable()),
  temperature: z.any().optional(),
  stream: z.any().optional(),
}).passthrough();

// ─── Helper para respuesta de error estandarizada ────────────────────────────
export function zodError(errors: z.ZodError) {
  const firstError = errors.issues[0];
  const path = firstError ? (Array.isArray(firstError.path) ? firstError.path.join('.') : 'root') : 'unknown';
  const message = firstError ? firstError.message : 'Unknown validation error';
  const detail = `${path}: ${message}`;
  return {
    ok: false,
    error: `Validation failed: ${detail}`,
    details: errors.issues.map(e => ({
      path: Array.isArray(e.path) ? e.path.join('.') : 'root',
      message: e.message,
    })),
  };
}
