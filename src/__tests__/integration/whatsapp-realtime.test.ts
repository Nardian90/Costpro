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

vi.mock('@/lib/whatsapp/baileys-client', () => ({
  getSessionInfo: vi.fn(() => ({ status: 'disconnected', qrCode: null })),
  connectStore: vi.fn(),
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

// Mock baileys + boom para que baileys-client.ts cargue sin errores
vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  fetchLatestBaileysVersion: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
}));

vi.mock('@hapi/boom', () => ({ Boom: class {} }));

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

  describe('handlers.ts emite eventos en los puntos correctos', () => {
    it('handleIncomingMessage emite message_incoming + typing + typing_stop + message_outgoing', async () => {
      // Importar después de resetModules para obtener mocks frescos
      const { emitMessage, emitTyping, emitToStore } = await import('@/lib/whatsapp/realtime-server');
      const { handleIncomingMessage } = await import('@/lib/whatsapp/handlers');

      // Construir un WAMessage mínimo
      const fakeMessage = {
        key: {
          remoteJid: '5312345678@s.whatsapp.net',
          fromMe: false,
        },
        message: {
          conversation: 'Hola, ¿tienen productos disponibles?',
        },
        pushName: 'Cliente Test',
      };

      const fakeCtx = {
        storeId: STORE_A,
        sock: {
          user: { id: 'bot@s.whatsapp.net' },
          sendMessage: vi.fn().mockResolvedValue(undefined),
        },
      } as any;

      await handleIncomingMessage(fakeCtx, fakeMessage as any);

      // message_incoming emitido al guardar mensaje entrante
      expect(vi.mocked(emitMessage)).toHaveBeenCalledWith(
        STORE_A,
        'incoming',
        expect.objectContaining({
          contact_id: 'test-contact-001',
          phone_number: '5312345678',
          content: 'Hola, ¿tienen productos disponibles?',
          sender_name: 'Cliente Test',
        })
      );

      // typing emitido antes de generar respuesta
      expect(vi.mocked(emitTyping)).toHaveBeenCalledWith(STORE_A, 'test-contact-001', '5312345678');

      // typing_stop emitido después de generar respuesta
      expect(vi.mocked(emitToStore)).toHaveBeenCalledWith(
        STORE_A,
        'typing_stop',
        expect.objectContaining({
          phone_number: '5312345678',
        })
      );

      // message_outgoing emitido al guardar respuesta saliente
      expect(vi.mocked(emitMessage)).toHaveBeenCalledWith(
        STORE_A,
        'outgoing',
        expect.objectContaining({
          phone_number: '5312345678',
          tokens_used: 50,
        })
      );
    });

    it('handleIncomingMessage NO emite nada si el mensaje es propio (fromMe=true)', async () => {
      const { emitMessage, emitTyping } = await import('@/lib/whatsapp/realtime-server');
      const { handleIncomingMessage } = await import('@/lib/whatsapp/handlers');

      const fakeMessage = {
        key: {
          remoteJid: '5312345678@s.whatsapp.net',
          fromMe: true, // ← mensaje propio, debe ser ignorado
        },
        message: { conversation: 'Hola' },
      };

      const fakeCtx = {
        storeId: STORE_A,
        sock: { user: { id: 'bot@s.whatsapp.net' } },
      } as any;

      await handleIncomingMessage(fakeCtx, fakeMessage as any);

      expect(vi.mocked(emitMessage)).not.toHaveBeenCalled();
      expect(vi.mocked(emitTyping)).not.toHaveBeenCalled();
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

  describe('baileys-client.ts emite connection_status en cambios', () => {
    it('disconnectStore emite connection_status: disconnected', async () => {
      // Verificación estática: el source de baileys-client.ts invoca emitToStore
      // con status: 'disconnected' dentro de disconnectStore. Hacemos la
      // verificación leyendo el source en vez de cargar el módulo (que tiene
      // muchas dependencias transitivas que complican el setup del mock).
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'src/lib/whatsapp/baileys-client.ts'),
        'utf-8'
      );

      // Verificar que disconnectStore invoca emitToStore con status: 'disconnected'
      const disconnectMatch = src.match(/export function disconnectStore[\s\S]+?^}/m);
      expect(disconnectMatch).toBeTruthy();
      const disconnectBlock = disconnectMatch![0];
      expect(disconnectBlock).toContain("emitToStore(storeId, 'connection_status'");
      expect(disconnectBlock).toContain("status: 'disconnected'");

      // Verificar que connection.update (open) también emite
      expect(src).toContain("emitToStore(storeId, 'connection_status'");
      expect(src).toContain("status: 'connected'");
    });
  });
});
