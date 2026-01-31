import { supabase } from '@/lib/supabaseClient';
import { RSSFeed, RSSSettings, RSSNewsItem } from '@/types';

export const rssService = {
  /**
   * Fetches news from the internal API route (which handles parsing and caching).
   */
  async getNews(): Promise<RSSNewsItem[]> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/rss', {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Error al obtener noticias RSS');
    }

    const data = await response.json();
    return data.items || [];
  },

  /**
   * Fetches all RSS feeds from the database.
   */
  async getFeeds(): Promise<RSSFeed[]> {
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('id, url, name, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Adds a new RSS feed.
   */
  async addFeed(feed: Omit<RSSFeed, 'id' | 'created_at' | 'updated_at'>): Promise<RSSFeed> {
    const { data, error } = await supabase
      .from('rss_feeds')
      .insert(feed)
      .select('id, url, name, is_active, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Updates an existing RSS feed.
   */
  async updateFeed(id: string, feed: Partial<RSSFeed>): Promise<RSSFeed> {
    const { data, error } = await supabase
      .from('rss_feeds')
      .update(feed)
      .eq('id', id)
      .select('id, url, name, is_active, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Deletes an RSS feed.
   */
  async deleteFeed(id: string): Promise<void> {
    const { error } = await supabase
      .from('rss_feeds')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Fetches RSS settings.
   */
  async getSettings(): Promise<RSSSettings> {
    const { data, error } = await supabase
      .from('rss_settings')
      .select('id, priority_keywords, cache_duration_minutes, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Updates RSS settings.
   */
  async updateSettings(id: string, settings: Partial<RSSSettings>): Promise<RSSSettings> {
    const { data, error } = await supabase
      .from('rss_settings')
      .update(settings)
      .eq('id', id)
      .select('id, priority_keywords, cache_duration_minutes, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  }
};
