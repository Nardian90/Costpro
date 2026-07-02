import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/whatsapp/realtime-server', () => ({
  emitToStore: vi.fn(),
  emitMessage: vi.fn(),
  emitTyping: vi.fn(),
  getRealtimeServer: vi.fn(() => null),
  attachRealtimeServer: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('debug', () => {
  it('imports', async () => {
    const { emitMessage } = await import('@/lib/whatsapp/realtime-server');
    console.log('emitMessage is mock:', vi.isMockFunction(emitMessage));
    
    // Import handlers
    const handlers = await import('@/lib/whatsapp/handlers');
    console.log('handlers loaded:', typeof handlers.handleIncomingMessage);
    
    // Construir fake
    const fakeMessage = {
      key: { remoteJid: '5312345678@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Hola' },
      pushName: 'Test',
    };
    const fakeCtx = {
      storeId: 'a1111111-1111-4111-8111-111111111111',
      sock: {
        user: { id: 'bot@s.whatsapp.net' },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    await handlers.handleIncomingMessage(fakeCtx, fakeMessage as any);
    
    console.log('emitMessage called:', vi.mocked(emitMessage).mock.calls.length);
    console.log('calls:', JSON.stringify(vi.mocked(emitMessage).mock.calls, null, 2));
    expect(vi.mocked(emitMessage).mock.calls.length).toBeGreaterThan(0);
  });
});
