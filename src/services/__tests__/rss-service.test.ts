import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rssService } from '../rss-service';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tk' } }, error: null }))
    }
  }
}));

describe('rssService', () => {
  const createMockChain = (data: any = null, error: any = null) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('obtiene feeds', async () => {
    const mockFeeds = [{ id: '1' }];
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockFeeds) as any);
    const result = await rssService.getFeeds();
    expect(result).toEqual(mockFeeds);
  });

  it('agrega un feed', async () => {
    const mockFeed = { id: '1', url: 'u' };
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockFeed) as any);
    const result = await rssService.addFeed({ url: 'u', name: 'n', is_active: true });
    expect(result).toEqual(mockFeed);
  });

  it('actualiza un feed', async () => {
    const mockFeed = { id: '1' };
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockFeed) as any);
    const result = await rssService.updateFeed('1', { name: 'n' });
    expect(result).toEqual(mockFeed);
  });

  it('elimina un feed', async () => {
    vi.mocked(supabase.from).mockReturnValue(createMockChain() as any);
    await expect(rssService.deleteFeed('1')).resolves.not.toThrow();
  });

  it('obtiene settings', async () => {
    const mockSettings = { id: '1' };
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockSettings) as any);
    const result = await rssService.getSettings();
    expect(result).toEqual(mockSettings);
  });

  it('actualiza settings', async () => {
    const mockSettings = { id: '1' };
    vi.mocked(supabase.from).mockReturnValue(createMockChain(mockSettings) as any);
    const result = await rssService.updateSettings('1', { cache_duration_minutes: 10 });
    expect(result).toEqual(mockSettings);
  });
});
