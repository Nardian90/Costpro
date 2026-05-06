import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as auth from '@/lib/auth';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeRequest = (body: any) => {
  return new NextRequest('http://localhost/api/logs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

const mockUser = {
  id: 'u1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as any;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 200 incluso sin sesión (best-effort auth)', async () => {
    vi.mocked(auth.getServerSession).mockResolvedValue(null);
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('retorna ok: true y escribe en consola', async () => {
    vi.mocked(auth.getServerSession).mockResolvedValue({ user: mockUser, token: 't1' });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = { level: 'info', context: 'TEST', message: 'err' };
    const req = makeRequest(body);

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('ignora silenciosamente si falla el procesamiento (retorna 200)', async () => {
    vi.mocked(auth.getServerSession).mockResolvedValue({ user: mockUser, token: 't1' });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('Disk full');
    });

    const req = makeRequest({ message: 'test' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    consoleSpy.mockRestore();
  });
});
