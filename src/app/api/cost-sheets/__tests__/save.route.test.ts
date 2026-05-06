import { NextRequest } from 'next/server';
import { POST } from '../save/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn(),
  supabase: {}
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() })
}));

vi.mock('@/lib/cost-engine', () => ({
  calculateFicha: vi.fn().mockReturnValue({ total: 100, rows: [{ id: 'r1', total: 100 }] })
}));

vi.mock('@/lib/cost-engine/build-ficha', () => ({
  buildEngineFicha: vi.fn().mockReturnValue({ meta: {}, sections: [] })
}));

const makeRequest = (body: any, token: string | null = 'valid-token') => {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new NextRequest('http://localhost/api/cost-sheets/save', {
    method: 'POST',
    body: JSON.stringify(body),
    headers
  });
};

describe('POST /api/cost-sheets/save', () => {
  const mockSession = {
    token: 'valid-token',
    user: { id: 'user-1' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest({}, null);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 400 si el body no tiene updateData', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const req = makeRequest({ currentData: {} });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('retorna 200 y persiste la ficha cuando los datos son válidos', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'sheet-123' },
      error: null
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

    vi.mocked(getSupabaseAuthClient).mockReturnValue({
      from: mockFrom
    } as any);

    const updateData = {
      header: { name: 'Ficha Nueva' },
      annexes: [
        { id: 'I', data: [{ description: 'Mat', consumption_norm: 1, price: 10 }] }
      ]
    };

    const req = makeRequest({ updateData });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.id).toBe('sheet-123');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('acepta el campo scenarios y scenarioConfig opcionales', async () => {
     const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'sheet-1' }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

    vi.mocked(getSupabaseAuthClient).mockReturnValue({ from: mockFrom } as any);

    const updateData = {
      header: { name: 'Multi Scenario' },
      scenarios: [{ id: 'v1', label: 'Base' }],
      scenarioConfig: { activeId: 'v1' }
    };

    const req = makeRequest({ updateData });
    await POST(req);

    const insertedData = mockInsert.mock.calls[0][0].data;
    expect(insertedData.scenarios).toBeDefined();
    expect(insertedData.scenarioConfig).toBeDefined();
  });

  it('retorna 500 si supabase falla en el upsert', async () => {
    const { getServerSession } = await import('@/lib/auth');
    const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession as any);

    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Database Insert Fail' }
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

    vi.mocked(getSupabaseAuthClient).mockReturnValue({
      from: mockFrom
    } as any);

    const req = makeRequest({ updateData: { header: { name: 'Fail' } } });
    const res = await POST(req);

    expect(res.status).toBe(500);
  });
});
