import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockSupabaseAuthClient, mockParseURL } = vi.hoisted(() => ({
  mockSupabaseAuthClient: vi.fn(),
  mockParseURL: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => async (req: NextRequest) => {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader === 'Bearer null') {
      return new Response(
        JSON.stringify({ error: 'No autorizado', message: 'Se requiere sesión activa' }),
        { status: 401 }
      );
    }
    return handler(req, { token: 'valid-token', user: { id: 'u1', role: 'admin' } });
  },
}));

vi.mock('@/lib/supabaseClient', () => ({
  createServerClient: vi.fn(() => mockSupabaseAuthClient()),
  getSupabaseAuthClient: vi.fn(() => mockSupabaseAuthClient()),
}));

vi.mock('rss-parser', () => ({
  default: function Parser() {
    return { parseURL: mockParseURL };
  },
}));

const makeAuthRequest = () =>
  new NextRequest('http://localhost/api/rss', {
    headers: { Authorization: 'Bearer valid-token' },
  });

const makeUnauthRequest = () =>
  new NextRequest('http://localhost/api/rss', {
    headers: { Authorization: 'Bearer null' },
  });

describe('GET /api/rss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna noticias parseadas de los feeds RSS', async () => {
    const mockFeeds = [{ id: 'f1', name: 'Feed 1', url: 'https://test.com/rss' }];
    const mockParsedItems = [{ guid: '1', title: 'News 1', link: 'l1', pubDate: '2023-01-01' }];

    mockSupabaseAuthClient.mockReturnValue({
        from: (table: string) => ({
            select: () => ({
                eq: () => Promise.resolve({ data: mockFeeds, error: null }),
                single: () => Promise.resolve({ data: { priority_keywords: [] }, error: null })
            })
        })
    });

    mockParseURL.mockResolvedValue({ items: mockParsedItems, title: 'Test Feed' });

    const res = await GET(makeAuthRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.items[0].title).toBe('News 1');
  });
});
