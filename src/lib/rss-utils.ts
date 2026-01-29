import { RSSItem } from '@/types';

/**
 * Utility to classify news items based on keywords and source.
 */
export function classifyRSSItem(
  item: any,
  sourceName: string,
  priorityKeywords: string[]
): RSSItem {
  const title = item.title || '';
  const contentSnippet = item.contentSnippet || item.content || '';
  const fullText = `${title} ${contentSnippet}`.toLowerCase();

  // 1. Identify priority news
  const isPriority = priorityKeywords.some(keyword =>
    fullText.includes(keyword.toLowerCase())
  );

  // 2. Identify BCC Exchange Rate (Specific logic for bc.gob.cu)
  const isExchangeRate =
    sourceName.toLowerCase().includes('banco central') &&
    (fullText.includes('tasa de cambio') || fullText.includes('tipo de cambio'));

  return {
    id: item.guid || item.id || item.link,
    title,
    link: item.link,
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    contentSnippet,
    sourceName,
    isPriority: isPriority || isExchangeRate,
    isExchangeRate
  };
}

/**
 * Default keywords for priority news
 */
export const DEFAULT_PRIORITY_KEYWORDS = [
  'Tasas de cambio',
  'CUP',
  'Divisas',
  'Política Monetaria',
  'Economía',
  'Aranceles'
];
