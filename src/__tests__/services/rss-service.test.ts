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
    vi.clearAllMocks();
  });

  describe('getNews', () => {
    it('fetches news from /api/rss', async () => {
      const mockSession = { data: { session: { access_token: 'token' } } };
      (supabase.auth.getSession as any).mockResolvedValue(mockSession);

      const mockNews = { items: [{ id: '1', title: 'News' }] };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockNews,
      });

      const result = await rssService.getNews();
      expect(result).toEqual(mockNews.items);
      expect(global.fetch).toHaveBeenCalledWith('/api/rss', expect.any(Object));
    });

    it('throws error if response is not ok', async () => {
      (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      await expect(rssService.getNews()).rejects.toThrow('Error al obtener noticias RSS');
    });
  });

  describe('database operations', () => {
    it('getFeeds calls supabase', async () => {
      const mockData = [{ id: '1', name: 'Feed' }];
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockFrom);

      const result = await rssService.getFeeds();
      expect(result).toEqual(mockData);
      expect(supabase.from).toHaveBeenCalledWith('rss_feeds');
    });

    it('addFeed inserts data', async () => {
      const newFeed = { url: 'url', name: 'name', is_active: true };
      const mockData = { id: '1', ...newFeed };
      const mockFrom = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockFrom);

      const result = await rssService.addFeed(newFeed);
      expect(result).toEqual(mockData);
    });

    it('updateFeed updates data', async () => {
      const mockData = { id: '1', name: 'Updated' };
      const mockFrom = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockFrom);

      const result = await rssService.updateFeed('1', { name: 'Updated' });
      expect(result).toEqual(mockData);
    });

    it('deleteFeed deletes data', async () => {
      const mockFrom = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as any).mockReturnValue(mockFrom);

      await rssService.deleteFeed('1');
      expect(supabase.from).toHaveBeenCalledWith('rss_feeds');
    });

    it('getSettings fetches single row', async () => {
      const mockData = { id: '1', priority_keywords: [] };
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockFrom);

      const result = await rssService.getSettings();
      expect(result).toEqual(mockData);
    });

    it('updateSettings updates single row', async () => {
      const mockData = { id: '1', priority_keywords: ['test'] };
      const mockFrom = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      (supabase.from as any).mockReturnValue(mockFrom);

      const result = await rssService.updateSettings('1', { priority_keywords: ['test'] });
      expect(result).toEqual(mockData);
    });
  });
});
