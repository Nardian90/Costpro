import { NextRequest } from 'next/server';
import { POST } from '../chat/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

// Mock the new provider
vi.mock('@/lib/ai/provider', () => ({
  callAI: vi.fn().mockResolvedValue({
    text: 'Bot response',
    provider: 'glm',
    model: 'glm-4-flash'
  }),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/config/viewRegistry', () => ({
  getViewDetails: () => null,
}));

vi.mock('@/lib/ai/tools/registry', () => ({
  executeTool: vi.fn(),
}));

vi.mock('@/lib/ai/tools/definitions', () => ({
  TOOLS: [],
}));

vi.mock('@/lib/supabaseClient', () => ({
  createServerClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/ai/prompts/system-prompt-builder', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('System prompt'),
}));

describe('POST /api/bot/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const req = new NextRequest('http://localhost/api/bot/chat', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna respuesta del bot', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: { id: 'u1', name: 'Test' } } as any);

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
