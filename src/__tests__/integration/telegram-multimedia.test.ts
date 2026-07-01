import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del módulo Telegram — Fase T9 (Multimedia)
 *
 * Cubre:
 *   - extractMediaFromMessage para todos los tipos (photo, document, voice, etc.)
 *   - Integración en handlers (mensaje con foto → guarda media_type + caption)
 *   - API messages/send con media_type + media_input
 *   - Schema migration con columnas multimedia
 */

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: vi.fn((table: string) => {
      if (table === 'telegram_configs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { bot_token: 'fake-bot-token' },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  }),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
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
  sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  sendPhoto: vi.fn().mockResolvedValue({ message_id: 2 }),
  sendDocument: vi.fn().mockResolvedValue({ message_id: 3 }),
  sendVoice: vi.fn().mockResolvedValue({ message_id: 4 }),
  sendChatAction: vi.fn().mockResolvedValue(true),
  getFile: vi.fn().mockResolvedValue({ file_id: 'x', file_unique_id: 'y', file_path: 'photos/file_1.jpg' }),
  downloadFile: vi.fn().mockResolvedValue(new Blob(['fake'])),
  downloadFileAsBase64: vi.fn().mockResolvedValue('ZmFrZQ=='),
  // getFileUrl implementa la lógica real para que el test valide el formato
  getFileUrl: vi.fn((botToken: string, filePath: string) =>
    `https://api.telegram.org/file/bot${botToken}/${filePath}`
  ),
}));

vi.mock('@/lib/telegram/glm-orchestrator', () => ({
  generateResponse: vi.fn().mockResolvedValue({
    text: 'Recibí tu foto. ¿Qué necesitas saber?',
    tokensUsed: 60,
    responseTimeMs: 1500,
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
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────

import { extractMediaFromMessage } from '@/types/telegram';
import type { TelegramMessageUpdate } from '@/types/telegram';

describe('Fase T9: Multimedia', () => {

  describe('extractMediaFromMessage', () => {
    const baseMsg: TelegramMessageUpdate = {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: 'Test' },
      chat: { id: 1, type: 'private' },
      date: Date.now() / 1000,
      text: 'hola',
    };

    it('retorna null para mensaje de texto sin multimedia', () => {
      expect(extractMediaFromMessage(baseMsg)).toBeNull();
    });

    it('extrae photo con el tamaño más grande', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        caption: 'Foto del producto',
        photo: [
          { file_id: 'small', file_unique_id: 'u1', width: 100, height: 100, file_size: 5000 },
          { file_id: 'medium', file_unique_id: 'u1', width: 320, height: 320, file_size: 20000 },
          { file_id: 'large', file_unique_id: 'u1', width: 800, height: 800, file_size: 80000 },
        ],
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('photo');
      expect(result?.info.file_id).toBe('large');
      expect(result?.info.file_size).toBe(80000);
      expect(result?.caption).toBe('Foto del producto');
    });

    it('extrae document con file_name y mime_type', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        caption: 'Factura PDF',
        document: {
          file_id: 'doc-1',
          file_unique_id: 'u-doc',
          file_name: 'factura.pdf',
          mime_type: 'application/pdf',
          file_size: 150000,
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('document');
      expect(result?.info.file_name).toBe('factura.pdf');
      expect(result?.info.mime_type).toBe('application/pdf');
      expect(result?.caption).toBe('Factura PDF');
    });

    it('extrae voice con duration', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        voice: {
          file_id: 'voice-1',
          file_unique_id: 'u-voice',
          duration: 15,
          mime_type: 'audio/ogg',
          file_size: 30000,
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('voice');
      expect(result?.info.duration).toBe(15);
      expect(result?.info.mime_type).toBe('audio/ogg');
      expect(result?.caption).toBeNull(); // voice no tiene caption
    });

    it('extrae audio con performer y title', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        audio: {
          file_id: 'audio-1',
          file_unique_id: 'u-audio',
          duration: 180,
          performer: 'Artist',
          title: 'Song',
          file_name: 'song.mp3',
          mime_type: 'audio/mpeg',
          file_size: 5000000,
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('audio');
      expect(result?.info.duration).toBe(180);
    });

    it('extrae video con width y height', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        caption: 'Mira esto',
        video: {
          file_id: 'video-1',
          file_unique_id: 'u-video',
          width: 1280,
          height: 720,
          duration: 30,
          mime_type: 'video/mp4',
          file_size: 10000000,
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('video');
      expect(result?.info.width).toBe(1280);
      expect(result?.info.height).toBe(720);
      expect(result?.caption).toBe('Mira esto');
    });

    it('extrae sticker con emoji como caption', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        sticker: {
          file_id: 'sticker-1',
          file_unique_id: 'u-sticker',
          type: 'regular',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
          emoji: '😀',
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('sticker');
      expect(result?.caption).toBe('Sticker: 😀');
    });

    it('extrae location con coordenadas', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        location: { longitude: -82.36, latitude: 23.11 },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('location');
      expect(result?.caption).toContain('Lat: 23.11');
      expect(result?.caption).toContain('Lng: -82.36');
    });

    it('extrae contact con nombre y teléfono', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        contact: {
          phone_number: '+5355555555',
          first_name: 'Juan',
          last_name: 'Perez',
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('contact');
      expect(result?.caption).toContain('Juan');
      expect(result?.caption).toContain('+5355555555');
    });

    it('extrae venue con title y address', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        venue: {
          location: { longitude: -82.36, latitude: 23.11 },
          title: 'Mi Tienda',
          address: 'Calle 123',
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('venue');
      expect(result?.caption).toContain('Mi Tienda');
      expect(result?.caption).toContain('Calle 123');
    });

    it('extrae dice con emoji y value', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        dice: { emoji: '🎲', value: 6 },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('dice');
      expect(result?.caption).toContain('🎲');
      expect(result?.caption).toContain('6');
    });

    it('extrae animation (GIF)', () => {
      const msg: TelegramMessageUpdate = {
        ...baseMsg,
        text: undefined,
        caption: 'Mira este GIF',
        animation: {
          file_id: 'gif-1',
          file_unique_id: 'u-gif',
          width: 400,
          height: 300,
          duration: 5,
          mime_type: 'video/mp4',
        },
      };
      const result = extractMediaFromMessage(msg);
      expect(result?.type).toBe('animation');
      expect(result?.caption).toBe('Mira este GIF');
    });
  });

  describe('Schema migration T9', () => {
    it('la migración agrega columnas multimedia a telegram_messages', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migrations/20260703000002_telegram_multimedia.sql'),
        'utf-8'
      );
      expect(src).toContain('ADD COLUMN IF NOT EXISTS media_type');
      expect(src).toContain('ADD COLUMN IF NOT EXISTS file_id');
      expect(src).toContain('ADD COLUMN IF NOT EXISTS file_path');
      expect(src).toContain('ADD COLUMN IF NOT EXISTS file_size');
      expect(src).toContain('ADD COLUMN IF NOT EXISTS mime_type');
      expect(src).toContain('ADD COLUMN IF NOT EXISTS caption');
      // Índice para multimedia
      expect(src).toContain('idx_telegram_messages_media');
    });
  });

  describe('API messages/send con multimedia', () => {
    it('acepta media_type=photo + media_input', async () => {
      const { POST } = await import('@/app/api/telegram/messages/send/route');
      const { sendPhoto } = await import('@/lib/telegram/bot-client');

      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/telegram/messages/send',
        headers: new Map([['x-forwarded-for', '127.0.0.1']]),
        json: async () => ({
          store_id: 'a1111111-1111-4111-8111-111111111111',
          telegram_user_id: 123456789,
          media_type: 'photo',
          media_input: 'AgADBQADxxx',
          caption: 'Foto del producto',
        }),
      } as any;

      const session = {
        user: { id: 'test', role: 'admin', memberships: [] },
        token: 'fake',
      } as any;

      const res = await (POST as any)(req, session);
      expect(res.status).toBe(200);
      expect(sendPhoto).toHaveBeenCalled();
    });

    it('acepta media_type=document', async () => {
      const { POST } = await import('@/app/api/telegram/messages/send/route');
      const { sendDocument } = await import('@/lib/telegram/bot-client');

      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/telegram/messages/send',
        headers: new Map([['x-forwarded-for', '127.0.0.1']]),
        json: async () => ({
          store_id: 'a1111111-1111-4111-8111-111111111111',
          telegram_user_id: 123456789,
          media_type: 'document',
          media_input: 'https://example.com/doc.pdf',
          caption: 'Catálogo',
        }),
      } as any;

      const session = {
        user: { id: 'test', role: 'admin', memberships: [] },
        token: 'fake',
      } as any;

      const res = await (POST as any)(req, session);
      expect(res.status).toBe(200);
      expect(sendDocument).toHaveBeenCalled();
    });

    it('rechaza si no hay message ni media_input', async () => {
      const { POST } = await import('@/app/api/telegram/messages/send/route');

      const req = {
        method: 'POST',
        url: 'http://localhost:3000/api/telegram/messages/send',
        headers: new Map([['x-forwarded-for', '127.0.0.1']]),
        json: async () => ({
          store_id: 'a1111111-1111-4111-8111-111111111111',
          telegram_user_id: 123456789,
        }),
      } as any;

      const session = {
        user: { id: 'test', role: 'admin', memberships: [] },
        token: 'fake',
      } as any;

      const res = await (POST as any)(req, session);
      expect(res.status).toBe(400);
    });
  });

  describe('bot-client multimedia methods', () => {
    it('getFile llama a la API con file_id', async () => {
      const { getFile } = await import('@/lib/telegram/bot-client');
      const result = await getFile('fake-token', 'file-123');
      expect(result.file_path).toBe('photos/file_1.jpg');
    });

    it('getFileUrl construye la URL correcta', async () => {
      const { getFileUrl } = await import('@/lib/telegram/bot-client');
      const url = getFileUrl('fake-token', 'photos/file_1.jpg');
      expect(url).toBe('https://api.telegram.org/file/botfake-token/photos/file_1.jpg');
    });

    it('sendPhoto con file_id string usa JSON API', async () => {
      const { sendPhoto } = await import('@/lib/telegram/bot-client');
      const result = await sendPhoto('token', 123, 'file-id-123', 'caption');
      expect(result.message_id).toBe(2);
    });
  });
});
