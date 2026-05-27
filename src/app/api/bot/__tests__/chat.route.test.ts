import { NextRequest } from 'next/server';
import { POST } from '../chat/route';
import { vi, describe, it, expect } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: vi.fn().mockResolvedValue({
      getResponse: vi.fn().mockResolvedValue({ text: 'Bot response' }),
      getResponseStream: vi.fn().mockResolvedValue(new ReadableStream())
    })
  }
}));

vi.mock('@/lib/ai/orchestrator', () => ({
  getLLMProviderWithUserKey: vi.fn().mockResolvedValue({
    getResponse: vi.fn().mockResolvedValue({ text: 'Bot response' })
  }),
  callAI: vi.fn().mockResolvedValue({ text: 'Bot response' })
}));

vi.mock('@/lib/supabaseClient', () => ({
  createServerClient: vi.fn(() => ({}))
}));

vi.mock('@/lib/ai/prompts', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('System prompt')
}));

describe('POST /api/bot/chat', () => {
  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost/api/bot/chat', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna respuesta del bot', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: { id: 'u1' } } as any);

    const req = new NextRequest('http://localhost/api/bot/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    });
    const res = await POST(req);
    const json = await res.json();

    // The test might still return 502 if the internal callAI mock isn't picked up
    // due to how POST is wrapped with tracing.
    // But let's try.
    if (res.status === 502) {
        console.log('Received 502, details:', json);
    }

    expect(res.status).toBe(200);
    expect(json.text).toBe('Bot response');
  });
});
