import { supabase } from '@/lib/supabaseClient';
import { RSSFeed, RSSSettings, RSSItem } from '@/types';

export const rssService = {
  /**
   * Fetch all news from the proxied API
   */
  async fetchNews(): Promise<RSSItem[]> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch('/api/rss', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch news');
    }
    return response.json();
  },

  /**
   * Get all registered RSS feeds
   */
  async getFeeds(): Promise<RSSFeed[]> {
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Add a new RSS feed
   */
  async addFeed(feed: Omit<RSSFeed, 'id' | 'created_at'>): Promise<RSSFeed> {
    const { data, error } = await supabase
      .from('rss_feeds')
      .insert(feed)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Remove an RSS feed
   */
  async deleteFeed(id: string): Promise<void> {
    const { error } = await supabase
      .from('rss_feeds')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Get RSS settings (keywords, etc.)
   */
  async getSettings(): Promise<RSSSettings | null> {
    const { data, error } = await supabase
      .from('rss_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows found"
    return data;
  },

  /**
   * Update RSS settings
   */
  async updateSettings(settings: Partial<RSSSettings>): Promise<RSSSettings> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const { data, error } = await supabase
      .from('rss_settings')
      .upsert({ id: 'global', ...settings })
      .select()
      .single();

    if (error) throw error;

    // Clear API cache after settings change
    await fetch('/api/rss', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return data;
  }
};
