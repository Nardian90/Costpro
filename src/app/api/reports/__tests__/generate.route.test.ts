import { NextRequest } from 'next/server';
import { POST } from '../generate/route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn()
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseAuthClient: vi.fn().mockReturnValue({
    auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }) }) }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null })
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://pdf' } })
      })
    }
  })
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(function() {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      setFont: vi.fn(),
      text: vi.fn(),
      line: vi.fn(),
      addPage: vi.fn(),
      autoTable: vi.fn(),
      setDrawColor: vi.fn(),
      output: vi.fn().mockReturnValue(new ArrayBuffer(8)),
      getNumberOfPages: vi.fn().mockReturnValue(1)
    };
  })
}));

vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

describe('POST /api/reports/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 sin sesión', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ type: 'inventory' })
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('genera reporte exitosamente', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: 'u1' },
      token: 'valid-token'
    } as any);

    const req = new NextRequest('http://localhost/api/reports/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({ type: 'inventory', name: 'Test', columns: ['id'] })
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.url).toBe('http://pdf');
  });
});
