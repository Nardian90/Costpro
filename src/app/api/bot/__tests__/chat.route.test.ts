import { NextRequest } from 'next/server';
import * as route from '../chat/route';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

// Mock the internal functions of route.ts by mocking the modules it imports
vi.mock('z-ai-web-dev-sdk', () => {
  return {
    default: {
      create: vi.fn().mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: 'Bot response',
                  },
                },
              ],
            }),
          },
        },
      }),
    },
  };
});

describe('POST /api/bot/chat', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key-long-enough' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost/api/bot/chat', { method: 'POST' });
    const res = await route.POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna respuesta del bot', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: { id: 'u1' } } as any);

    const req = new NextRequest('http://localhost/api/bot/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
        aiProvider: 'gemini'
      })
    });

    const res = await route.POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.text).toBe('Bot response');
  });
});
