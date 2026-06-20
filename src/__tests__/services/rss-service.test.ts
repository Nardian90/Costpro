import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rssService } from '@/services/rss-service';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('rssService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getNews', () => {
    it('fetches news from /api/rss', async () => {
      const mockSession = { access_token: 'token' };
      (supabase.auth.getSession as any).mockResolvedValue({ data: { session: mockSession } });

      const mockItems = [{ title: 'News 1' }];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: mockItems }),
      });

      const items = await rssService.getNews();
      expect(items).toEqual(mockItems);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/rss', expect.any(Object));
    });

    it('throws error on failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(rssService.getNews()).rejects.toThrow('Error al obtener noticias RSS');
    });
  });

  describe('database operations', () => {
    it('getFeeds calls supabase', async () => {
      const mockData = [{ id: '1' }];
      const mockFrom = vi.mocked(supabase.from);
      const mockSelect = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: null });
      mockFrom.mockReturnValue({ select: mockSelect, order: mockOrder } as any);

      const res = await rssService.getFeeds();
      expect(res).toEqual(mockData);
    });

    it('addFeed calls supabase insert', async () => {
      const mockData = { id: '1' };
      const mockFrom = vi.mocked(supabase.from);
      const mockInsert = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect, single: mockSingle } as any);

      const res = await rssService.addFeed({ url: 'url', name: 'name', is_active: true });
      expect(res).toEqual(mockData);
    });

    it('updateFeed calls supabase update', async () => {
        const mockData = { id: '1' };
        const mockFrom = vi.mocked(supabase.from);
        const mockUpdate = vi.fn().mockReturnThis();
        const mockEq = vi.fn().mockReturnThis();
        const mockSelect = vi.fn().mockReturnThis();
        const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
        mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq, select: mockSelect, single: mockSingle } as any);

        const res = await rssService.updateFeed('1', { name: 'new' });
        expect(res).toEqual(mockData);
    });

    it('deleteFeed calls supabase delete', async () => {
        const mockFrom = vi.mocked(supabase.from);
        const mockDelete = vi.fn().mockReturnThis();
        const mockEq = vi.fn().mockResolvedValue({ error: null });
        mockFrom.mockReturnValue({ delete: mockDelete, eq: mockEq } as any);

        await rssService.deleteFeed('1');
        expect(mockDelete).toHaveBeenCalled();
    });

    it('getSettings calls supabase single', async () => {
        const mockData = { id: '1' };
        const mockFrom = vi.mocked(supabase.from);
        const mockSelect = vi.fn().mockReturnThis();
        const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
        mockFrom.mockReturnValue({ select: mockSelect, single: mockSingle } as any);

        const res = await rssService.getSettings();
        expect(res).toEqual(mockData);
    });

    it('updateSettings calls supabase update', async () => {
        const mockData = { id: '1' };
        const mockFrom = vi.mocked(supabase.from);
        const mockUpdate = vi.fn().mockReturnThis();
        const mockEq = vi.fn().mockReturnThis();
        const mockSelect = vi.fn().mockReturnThis();
        const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
        mockFrom.mockReturnValue({ update: mockUpdate, eq: mockEq, select: mockSelect, single: mockSingle } as any);

        const res = await rssService.updateSettings('1', { priority_keywords: [] });
        expect(res).toEqual(mockData);
    });
  });
});
