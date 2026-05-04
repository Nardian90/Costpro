import { NextRequest } from 'next/server';
import { POST } from '../chat/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() })
}));

vi.mock('@/lib/ai/orchestrator', () => ({
  getLLMProviderWithUserKey: vi.fn().mockResolvedValue({
    getResponse: vi.fn().mockResolvedValue({ text: 'Respuesta de IA', metadata: { model: 'gpt-4' } })
  })
}));

const makeRequest = (body: any, token: string | null = 'valid-token') => {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new NextRequest('http://localhost/api/cost-sheets/ai/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers
  });
};

describe('POST /api/cost-sheets/ai/chat', () => {
  const mockSession = {
    token: 'valid-token',
    user: { id: 'user-1' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    (getServerSession as any).mockResolvedValueOnce(null);

    const req = makeRequest({ messages: [] }, null);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  describe('rate limiting (10 req/min)', () => {
    it('retorna 429 al exceder 10 requests por minuto', async () => {
      const { rateLimit } = await import('@/lib/rate-limit');
      (rateLimit as any).mockResolvedValueOnce({
        allowed: false, remaining: 0, resetAt: new Date(Date.now() + 60000)
      });

      const req = makeRequest({ messages: [{ role: 'user', content: 'hola' }] });
      const res = await POST(req);
      expect(res.status).toBe(429);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  });

  describe('validación de proveedor', () => {
    it('retorna 400 si el proveedor no está en la whitelist', async () => {
      const { getServerSession } = await import('@/lib/auth');
      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const req = makeRequest({ messages: [{ role: 'user', content: 'test' }], aiProvider: 'hacky-provider' });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Proveedor de IA no soportado');
    });
  });

  describe('respuesta exitosa', () => {
    it('retorna el mensaje del asistente con status 200', async () => {
      const { getServerSession } = await import('@/lib/auth');
      (getServerSession as any).mockResolvedValueOnce(mockSession as any);

      const req = makeRequest({ messages: [{ role: 'user', content: 'hola' }], aiProvider: 'openai' });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.text).toBe('Respuesta de IA');
    });
  });

  it('retorna 502 si la IA falla', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getLLMProviderWithUserKey } = await import('@/lib/ai/orchestrator');

    (getServerSession as any).mockResolvedValueOnce(mockSession as any);
    (getLLMProviderWithUserKey as any).mockResolvedValueOnce({
      getResponse: vi.fn().mockRejectedValue(new Error('AI Service Down'))
    } as any);

    const req = makeRequest({ messages: [{ role: 'user', content: 'hola' }] });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });
});
