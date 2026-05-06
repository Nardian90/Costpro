import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  __esModule: true,
  getServerSession: mockGetServerSession,
}));

const makeRequest = (body: any) => {
  return new NextRequest('http://localhost/api/logs', { method: 'POST', body: JSON.stringify(body) });
};

describe('POST /api/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('retorna 200 incluso sin sesión (best-effort auth)', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest({ context: 'TEST', message: 'test msg' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('retorna ok: true con payload válido', async () => {
    const req = makeRequest({ context: 'TEST', error: { message: 'some error' } });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
