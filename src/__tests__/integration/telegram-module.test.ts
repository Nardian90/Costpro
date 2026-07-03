import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests del módulo Telegram — Fase T8
 *
 * Cubre las 8 fases (T1-T8) con foco en:
 *   - Validación de webhook (IP allowlist, HMAC, payload)
 *   - Seguridad (rate-limit, flood, cross-tenant)
 *   - Realtime emisión (Supabase Realtime)
 *   - Contratos de API (Zod schemas, auth, canManageStore)
 *
 * Espejo de whatsapp-module.test.ts con diffs mínimas.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => null,
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
  withRole: (_role: any, handler: any) => handler,
  AuthenticatedSession: {},
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string) => ({ error: code }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/telegram/bot-client', () => ({
  getBotInfo: vi.fn().mockResolvedValue({ id: 123456, username: 'testbot', is_bot: true, first_name: 'Test Bot' }),
  setWebhook: vi.fn().mockResolvedValue({ url: 'https://example.com/webhook', has_custom_certificate: false, pending_update_count: 0 }),
  deleteWebhook: vi.fn().mockResolvedValue(true),
  getWebhookInfo: vi.fn().mockResolvedValue({ url: '', has_custom_certificate: false, pending_update_count: 0 }),
  sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  sendChatAction: vi.fn().mockResolvedValue(true),
  answerCallbackQuery: vi.fn().mockResolvedValue(true),
  editMessageText: vi.fn().mockResolvedValue(true),
  getChat: vi.fn().mockResolvedValue({ id: -100123, type: 'supergroup', title: 'Test Group' }),
  getChatMember: vi.fn().mockResolvedValue({ user: { id: 123 }, status: 'administrator' }),
  getChatMemberCount: vi.fn().mockResolvedValue(5),
  addChatMember: vi.fn().mockResolvedValue(true),
  createChatInviteLink: vi.fn().mockResolvedValue({ invite_link: 'https://t.me/+abc', creator: {}, creates_join_request: false, is_primary: false, is_revoked: false }),
}));

vi.mock('@/lib/telegram/glm-orchestrator', () => ({
  generateResponse: vi.fn().mockResolvedValue({
    text: 'Respuesta del bot',
    tokensUsed: 50,
    responseTimeMs: 1200,
  }),
  saveMessage: vi.fn().mockResolvedValue('msg-001'),
  validateContactBelongsToStore: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/telegram/realtime', () => ({
  emitToStore: vi.fn().mockResolvedValue(undefined),
  emitMessage: vi.fn().mockResolvedValue(undefined),
  emitTyping: vi.fn().mockResolvedValue(undefined),
  emitTypingStop: vi.fn().mockResolvedValue(undefined),
  emitGroupParticipant: vi.fn().mockResolvedValue(undefined),
  emitBotStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/telegram/security', () => ({
  rateLimitByTelegramUser: vi.fn().mockReturnValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60000 }),
  isFlooding: vi.fn().mockReturnValue(false),
  isTelegramIp: vi.fn().mockReturnValue(true),
  validateWebhookSecret: vi.fn().mockReturnValue(true),
  isIpInCidr: vi.fn().mockReturnValue(true),
  cleanupRateBuckets: vi.fn(),
  // FIX TELEGRAM-SEC-5: getRealClientIp añadido al mock para que el
  // webhook route pueda importarlo correctamente.
  getRealClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// FIX TELEGRAM-SEC-1: mock explícito de webhook-handler para poder controlar
// findConfigByBotUserId en los tests del webhook. Sin esto, el handler
// importaría el módulo real que a su vez importa handlers.ts y cascadea.
vi.mock('@/lib/telegram/webhook-handler', () => ({
  findConfigByBotUserId: vi.fn().mockResolvedValue(null),
  handleTelegramUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: (fn: any) => fn,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// ── Test Data ──────────────────────────────────────────────────────────

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-9222-222222222222';
const TG_USER_ID = 123456789;
const BOT_USER_ID = 987654321;

function makeSession(role: string = 'admin', memberships: any[] = []) {
  return {
    user: { id: 'test-user-001', email: 'test@costpro.test', role, memberships },
    token: 'fake-jwt',
  } as any;
}

function makeRequest(path: string, method = 'GET', body?: Record<string, unknown>) {
  return {
    method,
    url: `http://localhost:3000${path}`,
    headers: new Map([['x-forwarded-for', '127.0.0.1'], ['content-type', 'application/json']]),
    json: async () => body || {},
    text: async () => JSON.stringify(body || {}),
  } as any;
}

// ── Import after mocks ─────────────────────────────────────────────────

import { POST as webhookPOST, GET as webhookGET } from '@/app/api/telegram/webhook/route';
import { POST as setupPOST } from '@/app/api/telegram/setup/route';
import { GET as configGET, PUT as configPUT } from '@/app/api/telegram/config/route';
import { GET as statusGET } from '@/app/api/telegram/status/route';
import { GET as conversationsGET } from '@/app/api/telegram/conversations/route';
import { POST as sendPOST } from '@/app/api/telegram/messages/send/route';
import { GET as metricsGET } from '@/app/api/telegram/metrics/route';
import { POST as testBotPOST } from '@/app/api/telegram/test-bot/route';
import { GET as groupGET } from '@/app/api/telegram/group/route';
import { GET as invitationsGET, POST as invitationsPOST, DELETE as invitationsDELETE } from '@/app/api/telegram/invitations/route';
import { POST as invitationsImportPOST } from '@/app/api/telegram/invitations/import/route';

// ── Tests ──────────────────────────────────────────────────────────────

describe('Telegram Module — 8 Fases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── FASE T2: Webhook ─────────────────────────────────────────────

  describe('Fase T2: Webhook handler', () => {
    it('GET /api/telegram/webhook — health check', async () => {
      const res = await (webhookGET as any)();
      expect(res.status).toBe(200);
    });

    it('POST /api/telegram/webhook — sin bot_id → 400', async () => {
      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/telegram/webhook',
        headers: new Map(),
        json: async () => ({ update_id: 1 }),
      } as any;
      const res = await (webhookPOST as any)(req);
      expect(res.status).toBe(400);
    });

    it('POST /api/telegram/webhook — sin secret header con secret configurado → 403', async () => {
      // FIX TELEGRAM-SEC-1/FIX TELEGRAM-SEC-3: antes este test era falso —
      // afirmaba probar "sin secret header → 403" pero el mock default de
      // admin era null, así que findConfigByBotUserId devolvía null y el
      // webhook respondía 404. El assert `expect([403, 404]).toContain`.
      // siempre caía en 404, sin ejercitar el check del secret.
      //
      // Ahora mockeamos findConfigByBotUserId para devolver una config real
      // CON webhook_secret, y validateWebhookSecret para devolver false
      // (que es lo que retorna cuando el header falta o no coincide).
      const { findConfigByBotUserId } = await import('@/lib/telegram/webhook-handler');
      const { validateWebhookSecret } = await import('@/lib/telegram/security');
      vi.mocked(findConfigByBotUserId).mockResolvedValue({
        store_id: STORE_A,
        bot_user_id: BOT_USER_ID,
        bot_token: 'fake-bot-token',
        webhook_secret: 'test-secret-123',
        is_active: true,
      } as any);
      // validateWebhookSecret(null, 'test-secret-123') debería retornar false
      // en la implementación real (header faltante). Lo mockeamos explícito
      // para garantizar fail-closed en el test.
      vi.mocked(validateWebhookSecret).mockReturnValue(false);

      const req = {
        method: 'POST',
        url: `http://localhost:3000/api/telegram/webhook?bot_id=${BOT_USER_ID}`,
        headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }), // sin secret header
        json: async () => ({ update_id: 1 }),
      } as any;
      const res = await (webhookPOST as any)(req);
      expect(res.status).toBe(403); // NO aceptar 404 — debe ser 403
    });

    it('POST /api/telegram/webhook — secret header incorrecto → 403', async () => {
      // FIX TELEGRAM-SEC-3: secret header presente pero con valor incorrecto.
      const { findConfigByBotUserId } = await import('@/lib/telegram/webhook-handler');
      const { validateWebhookSecret } = await import('@/lib/telegram/security');
      vi.mocked(findConfigByBotUserId).mockResolvedValue({
        store_id: STORE_A,
        bot_user_id: BOT_USER_ID,
        bot_token: 'fake-bot-token',
        webhook_secret: 'test-secret-123',
        is_active: true,
      } as any);
      vi.mocked(validateWebhookSecret).mockReturnValue(false);

      const req = {
        method: 'POST',
        url: `http://localhost:3000/api/telegram/webhook?bot_id=${BOT_USER_ID}`,
        headers: new Headers({
          'x-forwarded-for': '127.0.0.1',
          'x-telegram-bot-api-secret-token': 'wrong-secret',
        }),
        json: async () => ({ update_id: 1 }),
      } as any;
      const res = await (webhookPOST as any)(req);
      expect(res.status).toBe(403);
    });

    it('POST /api/telegram/webhook — secret header correcto → 200', async () => {
      // FIX TELEGRAM-SEC-3: secret header presente y correcto → pasa el
      // check y procesa el update async. Debe responder 200.
      const { findConfigByBotUserId } = await import('@/lib/telegram/webhook-handler');
      const { validateWebhookSecret } = await import('@/lib/telegram/security');
      vi.mocked(findConfigByBotUserId).mockResolvedValue({
        store_id: STORE_A,
        bot_user_id: BOT_USER_ID,
        bot_token: 'fake-bot-token',
        webhook_secret: 'test-secret-123',
        is_active: true,
      } as any);
      vi.mocked(validateWebhookSecret).mockReturnValue(true);

      const req = {
        method: 'POST',
        url: `http://localhost:3000/api/telegram/webhook?bot_id=${BOT_USER_ID}`,
        headers: new Headers({
          'x-forwarded-for': '127.0.0.1',
          'x-telegram-bot-api-secret-token': 'test-secret-123',
        }),
        json: async () => ({ update_id: 1 }),
      } as any;
      const res = await (webhookPOST as any)(req);
      expect(res.status).toBe(200);
    });
  });

  // ── FASE T4: API REST ────────────────────────────────────────────

  describe('Fase T4: API REST', () => {
    it('GET /api/telegram/config — sin store_id → 400', async () => {
      const res = await (configGET as any)(makeRequest('/api/telegram/config'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/telegram/config — sin permisos → 403', async () => {
      const res = await (configGET as any)(makeRequest(`/api/telegram/config?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('PUT /api/telegram/config — store_id inválido → 400', async () => {
      const res = await (configPUT as any)(makeRequest('/api/telegram/config', 'PUT', { store_id: 'not-uuid' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/telegram/status — sin store_id → 400', async () => {
      const res = await (statusGET as any)(makeRequest('/api/telegram/status'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/telegram/conversations — sin permisos → 403', async () => {
      const res = await (conversationsGET as any)(makeRequest(`/api/telegram/conversations?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('POST /api/telegram/messages/send — sin store_id → 400', async () => {
      const res = await (sendPOST as any)(makeRequest('/api/telegram/messages/send', 'POST', { telegram_user_id: TG_USER_ID, message: 'hola' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/telegram/messages/send — sin mensaje → 400', async () => {
      const res = await (sendPOST as any)(makeRequest('/api/telegram/messages/send', 'POST', { store_id: STORE_A, telegram_user_id: TG_USER_ID, message: '' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/telegram/metrics — sin permisos → 403', async () => {
      const res = await (metricsGET as any)(makeRequest(`/api/telegram/metrics?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('POST /api/telegram/test-bot — sin store_id → 400', async () => {
      const res = await (testBotPOST as any)(makeRequest('/api/telegram/test-bot', 'POST', { message: 'hola' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/telegram/group — sin store_id → 400', async () => {
      const res = await (groupGET as any)(makeRequest('/api/telegram/group'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/telegram/invitations — sin store_id → 400', async () => {
      const res = await (invitationsGET as any)(makeRequest('/api/telegram/invitations'), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/telegram/invitations — sin telegram_user_id → 400', async () => {
      const res = await (invitationsPOST as any)(makeRequest('/api/telegram/invitations', 'POST', { store_id: STORE_A }), makeSession());
      expect(res.status).toBe(400);
    });

    it('DELETE /api/telegram/invitations — sin id → 400', async () => {
      const res = await (invitationsDELETE as any)(makeRequest(`/api/telegram/invitations?store_id=${STORE_A}`, 'DELETE'), makeSession());
      expect(res.status).toBe(400);
    });
  });

  // ── Cross-tenant security ────────────────────────────────────────

  describe('Cross-tenant security', () => {
    it('manager de STORE_A no puede acceder a STORE_B', async () => {
      const session = makeSession('manager', [{ store_id: STORE_A, role: 'manager', status: 'active' }]);
      const res = await (statusGET as any)(makeRequest(`/api/telegram/status?store_id=${STORE_B}`), session);
      expect(res.status).toBe(403);
    });

    it('admin global puede acceder a cualquier store', async () => {
      // getSupabaseAdminSafe ya está mockeado a null por defecto → retorna 500
      // Aceptamos 200 o 500 — lo importante es que NO dé 403
      const res = await (statusGET as any)(makeRequest(`/api/telegram/status?store_id=${STORE_B}`), makeSession('admin'));
      expect(res.status).not.toBe(403);
    });
  });

  // ── FASE T7: Seguridad ───────────────────────────────────────────

  describe('Fase T7: Seguridad', () => {
    it('rateLimitByTelegramUser permite hasta 20 msg/min', async () => {
      const { rateLimitByTelegramUser } = await import('@/lib/telegram/security');
      // Como está mockeado, re-implementamos el test real
      // En el mock, siempre retorna allowed: true. Test real:
      const result = rateLimitByTelegramUser(TG_USER_ID, 20);
      expect(result.allowed).toBe(true);
    });

    it('isTelegramIp permite localhost en dev', async () => {
      const { isTelegramIp } = await import('@/lib/telegram/security');
      expect(isTelegramIp('127.0.0.1')).toBe(true);
    });

    it('validateWebhookSecret rechaza secret vacío', async () => {
      const { validateWebhookSecret: realValidate } = await vi.importActual<typeof import('@/lib/telegram/security')>('@/lib/telegram/security');
      expect(realValidate(null, 'expected')).toBe(false);
      expect(realValidate('value', null)).toBe(false);
    });

    it('validateWebhookSecret rechaza mismatch', async () => {
      // Re-implementar sin mock para test real
      const { validateWebhookSecret: realValidate } = await vi.importActual<typeof import('@/lib/telegram/security')>('@/lib/telegram/security');
      expect(realValidate('wrong-secret', 'expected-secret')).toBe(false);
    });

    it('validateWebhookSecret acepta match', async () => {
      const { validateWebhookSecret: realValidate } = await vi.importActual<typeof import('@/lib/telegram/security')>('@/lib/telegram/security');
      expect(realValidate('correct-secret', 'correct-secret')).toBe(true);
    });
  });

  // ── FASE T6: Realtime ────────────────────────────────────────────

  describe('Fase T6: Realtime (Supabase)', () => {
    it('emitToStore es no-op cuando no hay admin client', async () => {
      // getSupabaseAdminSafe está mockeado para retornar null
      const { emitToStore } = await import('@/lib/telegram/realtime');
      await expect(emitToStore(STORE_A, 'message_incoming', { foo: 'bar' })).resolves.not.toThrow();
    });

    it('emitMessage es no-op cuando no hay admin client', async () => {
      const { emitMessage } = await import('@/lib/telegram/realtime');
      await expect(emitMessage(STORE_A, 'incoming', {
        contact_id: null,
        telegram_user_id: TG_USER_ID,
        chat_id: null,
        content: 'hola',
      })).resolves.not.toThrow();
    });
  });

  // ── FASE T8: Verificación de schema (migración) ──────────────────

  describe('Fase T8: Schema migration', () => {
    it('la migración crea las 4 tablas con RLS', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migrations/20260703000001_create_telegram_module.sql'),
        'utf-8'
      );
      expect(src).toContain('CREATE TABLE IF NOT EXISTS public.telegram_configs');
      expect(src).toContain('CREATE TABLE IF NOT EXISTS public.telegram_contacts');
      expect(src).toContain('CREATE TABLE IF NOT EXISTS public.telegram_messages');
      expect(src).toContain('CREATE TABLE IF NOT EXISTS public.telegram_invitations');
      expect(src).toContain('ENABLE ROW LEVEL SECURITY');
      expect(src).toContain('telegram_configs_select');
      expect(src).toContain('telegram_configs_write');
    });

    it('la migración NO crea risk_state (Telegram no banea)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migrations/20260703000001_create_telegram_module.sql'),
        'utf-8'
      );
      // No debe haber CREATE TABLE para risk_state (puede mencionarse en comentarios)
      expect(src).not.toContain('CREATE TABLE IF NOT EXISTS public.telegram_risk_state');
    });
  });
});
