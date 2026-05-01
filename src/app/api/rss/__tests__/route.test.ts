import { NextRequest } from 'next/server';
import { GET } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockSupabaseAuthClient, mockParseURL } = vi.hoisted(() => ({
  mockSupabaseAuthClient: vi.fn(),
  mockParseURL: vi.fn(),
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
  getSupabaseAuthClient: (token: string) => mockSupabaseAuthClient(token),
}));

vi.mock('rss-parser', () => ({
  default: function Parser() {
    return { parseURL: mockParseURL };
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeAuthRequest = () =>
  new NextRequest('http://localhost/api/rss', {
    headers: { Authorization: 'Bearer valid-token' },
  });

const makeUnauthRequest = () =>
  new NextRequest('http://localhost/api/rss', {
    headers: { Authorization: 'Bearer null' },
  });

const createMockSupabaseFrom = (feeds: any[], settings: any) => {
  // rss_feeds: from → select → eq
  const mockFeedEq = vi.fn().mockResolvedValue({ data: feeds, error: null });
  const mockFeedSelect = vi.fn().mockReturnValue({ eq: mockFeedEq });

  // rss_settings: from → select → single
  const mockSettingsSingle = vi.fn().mockResolvedValue({ data: settings, error: null });
  const mockSettingsSelect = vi.fn().mockReturnValue({ single: mockSettingsSingle });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'rss_feeds') {
      return { select: mockFeedSelect };
    }
    if (table === 'rss_settings') {
      return { select: mockSettingsSelect };
    }
    return { select: vi.fn() };
  });

  mockSupabaseAuthClient.mockReturnValue({ from: mockFrom });
  return { mockFrom, mockFeedSelect, mockFeedEq, mockSettingsSingle };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/rss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('autenticación', () => {
    it('retorna 401 sin header Authorization', async () => {
      const req = new NextRequest('http://localhost/api/rss');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 con Authorization "Bearer null"', async () => {
      const req = makeUnauthRequest();
      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/no autorizado/i);
    });
  });

  describe('happy path', () => {
    it('retorna items vacíos cuando no hay feeds activos', async () => {
      createMockSupabaseFrom([], null);

      const req = makeAuthRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toEqual([]);
    });

    it('retorna items vacíos cuando feeds es null', async () => {
      // feeds query returns null
      mockSupabaseAuthClient.mockReturnValue({
        from: (table: string) => {
          if (table === 'rss_feeds') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
          if (table === 'rss_settings') return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
          return { select: vi.fn() };
        },
      });

      const req = makeAuthRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toEqual([]);
    });

    it('retorna noticias parseadas de los feeds RSS', async () => {
      const feeds = [
        { id: '1', url: 'https://example.com/feed.xml', name: 'Noticias Cuba', is_active: true },
      ];
      const settings = { priority_keywords: ['Tasas de cambio', 'CUP'] };
      createMockSupabaseFrom(feeds, settings);

      mockParseURL.mockResolvedValue({
        title: 'Noticias Cuba RSS',
        items: [
          {
            title: 'Anuncio importante sobre CUP',
            link: 'https://example.com/news/1',
            pubDate: '2025-01-15T10:00:00Z',
            content: 'Contenido de la noticia sobre divisas',
            contentSnippet: 'Contenido de la noticia...',
            guid: 'news-1',
          },
          {
            title: 'Otra noticia regular',
            link: 'https://example.com/news/2',
            pubDate: '2025-01-14T10:00:00Z',
            content: 'Contenido regular',
            contentSnippet: 'Contenido regular...',
            guid: 'news-2',
          },
        ],
      });

      const req = makeAuthRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toBeDefined();
      expect(json.items.length).toBe(2);
      expect(json.items[0].title).toBe('Anuncio importante sobre CUP');
      expect(json.items[0].feedName).toBe('Noticias Cuba');
      expect(json.items[0].isPriority).toBe(true); // Contains 'CUP' keyword
      expect(json.items[1].isPriority).toBe(false); // Regular news
    });

    it('ordena los items con prioridad primero', async () => {
      const feeds = [
        { id: '1', url: 'https://example.com/feed.xml', name: 'Feed Test', is_active: true },
      ];
      const settings = { priority_keywords: ['Importante'] };
      createMockSupabaseFrom(feeds, settings);

      mockParseURL.mockResolvedValue({
        title: 'Feed Test',
        items: [
          {
            title: 'Noticia regular',
            link: 'https://example.com/2',
            pubDate: '2025-01-16T10:00:00Z',
            content: 'Contenido normal',
            guid: 'regular',
          },
          {
            title: 'Noticia Importante y urgente',
            link: 'https://example.com/1',
            pubDate: '2025-01-15T10:00:00Z',
            content: 'Contenido importante',
            guid: 'important',
          },
        ],
      });

      const req = makeAuthRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items.length).toBe(2);
      // Priority item should come first
      expect(json.items[0].isPriority).toBe(true);
      expect(json.items[0].title).toContain('Importante');
    });

    it('maneja errores de parseo individual de feeds sin fallar', async () => {
      const feeds = [
        { id: '1', url: 'https://broken.com/feed.xml', name: 'Feed Roto', is_active: true },
        { id: '2', url: 'https://working.com/feed.xml', name: 'Feed Funcional', is_active: true },
      ];
      createMockSupabaseFrom(feeds, null);

      mockParseURL.mockImplementation(async (url: string) => {
        if (url.includes('broken')) throw new Error('Network error');
        return {
          title: 'Working Feed',
          items: [
            { title: 'Noticia OK', link: 'https://example.com/1', pubDate: '2025-01-15', guid: 'ok' },
          ],
        };
      });

      const req = makeAuthRequest();
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      // Should have 1 item from the working feed
      expect(json.items.length).toBe(1);
      expect(json.items[0].title).toBe('Noticia OK');
    });

    it('retorna 500 cuando ocurre un error inesperado', async () => {
      mockSupabaseAuthClient.mockReturnValue({
        from: () => {
          throw new Error('Database connection failed');
        },
      });

      const req = makeAuthRequest();
      const res = await GET(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Database connection failed');
    });
  });
});
