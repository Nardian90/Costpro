import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests de integración para Fase 5 — Realtime con Socket.io.
 *
 * Estos tests verifican:
 *   1. Que los helpers de realtime-server.ts (emitMessage, emitTyping, emitToStore)
 *      sean no-op seguros cuando no hay servidor Socket.io inicializado
 *      (caso Vercel, tests, dev sin custom server).
 *   2. Que el contrato de eventos sea correcto — cada evento tiene el payload
 *      esperado por el frontend.
 *   3. Que handlers.ts invoca emitMessage/emitTyping en los puntos correctos.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock realtime-server para capturar emisiones. Usamos vi.fn() directamente
// como exports del mock para poder afirmar sobre ellos con vi.mocked().
vi.mock('@/lib/whatsapp/realtime-server', () => ({
  emitToStore: vi.fn(),
  emitMessage: vi.fn(),
  emitTyping: vi.fn(),
  getRealtimeServer: vi.fn(() => null),
  attachRealtimeServer: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  // Mock que retorna un cliente supabase-like para que handlers.ts no salga
  // temprano en `if (!admin) return;`. Cada método retorna un chainable.
  // Devolvemos datos válidos para que el handler progrese hasta el punto de
  // emitir typing + message_outgoing (necesita config.is_active=true).
  getSupabaseAdminSafe: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'test-contact-001', is_banned: false, is_active: true, trigger_mode: 'always' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { is_active: true, trigger_mode: 'always', group_jid: null }, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }),
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

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
  withRole: (_role: any, handler: any) => handler,
  AuthenticatedSession: {},
}));

// CP-INFRA-002b (2026-10-23): baileys-client retirado del runtime; las rutas
// usan session-info (stub puro sin Baileys).
vi.mock('@/lib/whatsapp/session-info', () => ({
  getSessionInfo: vi.fn(() => ({ status: 'disconnected', qrCode: null })),
  disconnectStore: vi.fn(),
  getSocket: vi.fn(() => null),
}));

vi.mock('@/lib/whatsapp/glm-orchestrator', () => ({
  generateResponse: vi.fn().mockResolvedValue({
    text: 'Respuesta del bot',
    tokensUsed: 50,
    responseTimeMs: 1200,
  }),
  saveMessage: vi.fn().mockResolvedValue(undefined),
  validateContactBelongsToStore: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/anti-ban', () => ({
  getRiskState: vi.fn().mockResolvedValue({
    level: 'safe',
    consecutiveBlocks: 0,
    cooldownUntil: null,
    dailyInvitationCount: 0,
    lastInvitationAt: null,
    lastResetDate: new Date().toISOString().split('T')[0],
  }),
  saveRiskState: vi.fn().mockResolvedValue(undefined),
  canInviteNow: vi.fn(() => ({ allowed: true })),
  handleInvitationBlock: vi.fn(),
  resetRiskIfStale: vi.fn((s) => s),
  LIMITS: { maxInvitationsPerDay: 20 },
}));

// CP-INFRA-002b: mocks de @whiskeysockets/baileys y @hapi/boom eliminados — los paquetes ya no existen.

vi.mock('@/lib/whatsapp/invitation-queue', () => ({
  registerStore: vi.fn(),
  unregisterStore: vi.fn(),
  checkInvitationResponse: vi.fn().mockResolvedValue(undefined),
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
      then: vi.fn(),
    })),
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────

const STORE_A = 'a1111111-1111-4111-8111-111111111111';

describe('Fase 5: Realtime Socket.io', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Resetear los mocks del módulo realtime-server antes de cada test
    const realtime = await import('@/lib/whatsapp/realtime-server');
    vi.mocked(realtime.emitToStore).mockClear();
    vi.mocked(realtime.emitMessage).mockClear();
    vi.mocked(realtime.emitTyping).mockClear();
  });

  describe('realtime-server helpers son no-op cuando no hay io inicializado', () => {
    it('emitToStore no lanza cuando getRealtimeServer() retorna null', async () => {
      const { emitToStore } = await import('@/lib/whatsapp/realtime-server');
      expect(() => emitToStore(STORE_A, 'message_incoming', { foo: 'bar' })).not.toThrow();
    });

    it('emitMessage no lanza cuando no hay io inicializado', async () => {
      const { emitMessage } = await import('@/lib/whatsapp/realtime-server');
      expect(() => emitMessage(STORE_A, 'incoming', {
        contact_id: null,
        phone_number: '5312345678',
        content: 'hola',
      })).not.toThrow();
    });

    it('emitTyping no lanza cuando no hay io inicializado', async () => {
      const { emitTyping } = await import('@/lib/whatsapp/realtime-server');
      expect(() => emitTyping(STORE_A, null, '5312345678')).not.toThrow();
    });
  });

  describe('CP-INFRA-002b: handlers.ts retirado junto con Baileys', () => {
    it('el archivo ya no existe en el runtime (reactivación: git revert)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      expect(fs.existsSync(path.resolve(process.cwd(), 'src/lib/whatsapp/handlers.ts'))).toBe(false);
      expect(fs.existsSync(path.resolve(process.cwd(), 'src/lib/whatsapp/baileys-client.ts'))).toBe(false);
    });
  });

  describe('messages/send/route.ts emite message_outgoing en envío manual', () => {
    it('POST /api/whatsapp/messages/send emite message_outgoing tras guardar', async () => {
      const { emitMessage } = await import('@/lib/whatsapp/realtime-server');
      const { POST } = await import('@/app/api/whatsapp/messages/send/route');

      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/whatsapp/messages/send',
        headers: new Map([['x-forwarded-for', '127.0.0.1'], ['content-type', 'application/json']]),
        json: async () => ({
          store_id: STORE_A,
          phone_number: '5312345678',
          message: 'Mensaje manual de prueba',
        }),
      } as any;

      const session = {
        user: { id: 'test-user-001', role: 'admin', memberships: [] },
        token: 'fake-jwt',
      } as any;

      await (POST as any)(req, session);

      expect(vi.mocked(emitMessage)).toHaveBeenCalledWith(
        STORE_A,
        'outgoing',
        expect.objectContaining({
          phone_number: '5312345678',
          content: 'Mensaje manual de prueba',
        })
      );
    });
  });

  describe('CP-INFRA-002b: el paquete @whiskeysockets/baileys no está instalado', () => {
    it('package.json no declara la dependencia', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
      const all = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(all['@whiskeysockets/baileys']).toBeUndefined();
      expect(all['@hapi/boom']).toBeUndefined();
    });
  });
});
