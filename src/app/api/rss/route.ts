import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { classifyRSSItem, DEFAULT_PRIORITY_KEYWORDS } from '@/lib/rss-utils';
import { RSSItem } from '@/types';
import { supabase, getSupabaseAuthClient } from '@/lib/supabaseClient';

// Simple in-memory cache
let cache: {
  items: RSSItem[];
  timestamp: number;
} | null = null;

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Validates the user session and role.
 */
async function validateSession(req: NextRequest, requiredRole?: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  const authClient = getSupabaseAuthClient(token);

  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return { error: 'Invalid session', status: 401 };
  }

  if (requiredRole) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== requiredRole && profile?.role !== 'admin') {
      return { error: 'Forbidden', status: 403 };
    }
  }

  return { user, token };
}

export async function GET(req: NextRequest) {
  try {
    // 1. Validate session
    const auth = await validateSession(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const now = Date.now();

    // 2. Check cache
    if (cache && (now - cache.timestamp) < CACHE_DURATION) {
      return NextResponse.json(cache.items);
    }

    // 3. Fetch settings and feeds from DB
    const [feedsRes, settingsRes] = await Promise.all([
      supabase.from('rss_feeds').select('*').eq('is_active', true),
      supabase.from('rss_settings').select('*').single()
    ]);

    const feeds = (feedsRes.data || []).length > 0
      ? feedsRes.data!
      : [{ name: 'Banco Central de Cuba', url: 'https://www.bc.gob.cu/rss.xml' }];

    const keywords = settingsRes.data?.priority_keywords || DEFAULT_PRIORITY_KEYWORDS;
    const applyFilter = settingsRes.data?.apply_filter ?? false;

    // 4. Parse feeds
    const parser = new Parser({
      timeout: 15000, // Increased timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });

    let allItems: RSSItem[] = [];

    for (const feed of feeds) {
      try {
        const parsedFeed = await parser.parseURL(feed.url);
        const classifiedItems = (parsedFeed.items || []).map(item =>
          classifyRSSItem(item, feed.name, keywords)
        );
        allItems.push(...classifiedItems);
      } catch (feedError: any) {
        console.error(`Error fetching feed ${feed.url}:`, feedError.message);
      }
    }

    // 5. Apply Filter if enabled
    if (applyFilter) {
      allItems = allItems.filter(item => item.isPriority);
    }

    // 6. Sort
    const sortedItems = allItems.sort((a, b) => {
      // Priority first
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      // Then date
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

    // 7. Update cache
    cache = {
      items: sortedItems,
      timestamp: now
    };

    return NextResponse.json(sortedItems);
  } catch (error: any) {
    console.error('RSS Aggregator error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await validateSession(req, 'admin');
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    cache = null;
    return NextResponse.json({ message: 'Cache cleared' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
