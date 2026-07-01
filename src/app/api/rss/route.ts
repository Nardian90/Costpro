import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import Parser from 'rss-parser';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { RSSNewsItem } from '@/types';
import { isPrivateIP } from '@/lib/network-utils';

// Cache results for 60 minutes
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const parser = new Parser();

function isSafeURL(raw: string): boolean {
  try {
    const url = new URL(raw);
    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(url.protocol)) return false;

    const hostname = url.hostname.toLowerCase();
    if (isPrivateIP(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

const handler = withAuth(async (req, session) => {
  // BUG-028/Pattern 1: Use session.user.id for rate limiting.
  const clientId = session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });

  try {
    const supabase = getSupabaseAuthClient(session.token);

    // 1. Fetch active feeds and settings
    const [{ data: feeds }, { data: settings }] = await Promise.all([
      supabase.from('rss_feeds').select('*').eq('is_active', true),
      supabase.from('rss_settings').select('*').single(),
    ]);

    if (!feeds) {
      return NextResponse.json({ items: [] });
    }

    const priorityKeywords = settings?.priority_keywords || ['Tasas de cambio', 'CUP', 'Divisas', 'Política Monetaria'];

    // 2. Fetch and parse feeds
    const feedPromises = feeds.map(async (feed) => {
      try {
        if (!isSafeURL(feed.url)) {
          console.warn(`RSS: URL bloqueada por política SSRF: ${feed.url}`);
          return [];
        }
        const parsedFeed = await parser.parseURL(feed.url);
        return parsedFeed.items.map((item) => ({
          ...item,
          feedName: feed.name || parsedFeed.title,
        }));
      } catch (err) {
        console.error(`Error parsing feed ${feed.url}:`, err);
        return [];
      }
    });

    const allItems = (await Promise.all(feedPromises)).flat();

    // 3. Process items
    const processedItems: RSSNewsItem[] = allItems.map((item: any) => {
      const title = item.title || 'Sin título';
      const content = item.content || item.description || '';
      const contentSnippet = item.contentSnippet || content.substring(0, 200);
      const link = item.link || '';
      const pubDate = item.pubDate || item.isoDate || new Date().toISOString();

      // Priority check
      const isPriority = priorityKeywords.some((keyword: string) =>
        title.toLowerCase().includes(keyword.toLowerCase()) ||
        content.toLowerCase().includes(keyword.toLowerCase())
      );

      // Exchange rate detection (specific for BCC)
      let isExchangeRate = false;
      let exchangeRateData: { currency: string; value: number; date: string } | undefined = undefined;

      if (item.feedName?.includes('Banco Central') || link.includes('bc.gob.cu')) {
        if (title.toLowerCase().includes('tasas de cambio') || title.toLowerCase().includes('tipo de cambio')) {
          isExchangeRate = true;
          // Pattern matching for Cuba BCC
          // Example: USD - 120.00, EUR - 130.00
          const usdMatch = content.match(/USD\s*-\s*([\d.]+)/i) || title.match(/USD\s*-\s*([\d.]+)/i);
          if (usdMatch) {
            exchangeRateData = {
              currency: 'USD',
              value: parseFloat(usdMatch[1]),
              date: pubDate,
            };
          }
        }
      }

      return {
        id: item.guid || item.id || link || Math.random().toString(36).substring(7),
        title,
        link,
        pubDate,
        content,
        contentSnippet,
        feedName: item.feedName,
        isPriority: isPriority || isExchangeRate,
        isExchangeRate,
        exchangeRateData,
      };
    });

    // 4. Sort: Priority first, then by date
    const sortedItems = processedItems.sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

    return NextResponse.json({ items: sortedItems });
  } catch (err: any) {
    console.error('RSS API Error:', err);
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? err.message : 'Error interno del servidor' }, { status: 500 });
  }

});

async function getHandler(req: NextRequest) {
  return handler(req);
}

export const GET = withTracing(getHandler, 'GET /api/rss');
