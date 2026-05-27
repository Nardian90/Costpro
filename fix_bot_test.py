import os

content = """import { NextRequest } from 'next/server';
import { POST } from '../chat/route';
import { vi, describe, it, expect } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/ai/orchestrator', () => ({
  getLLMProviderWithUserKey: vi.fn().mockResolvedValue({
    getResponse: vi.fn().mockResolvedValue({ text: 'Bot response' })
  })
}));

// Mock buildSystemPrompt to avoid internal calls
vi.mock('../chat/route', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildSystemPrompt: vi.fn().mockResolvedValue('System prompt'),
  };
});

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

    expect(res.status).toBe(200);
    expect(json.text).toBe('Bot response');
  });
});
"""

with open('src/app/api/bot/__tests__/chat.route.test.ts', 'w') as f:
    f.write(content)

print("Fixed chat.route.test.ts")
