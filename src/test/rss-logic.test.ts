import { describe, it, expect } from 'vitest';
import { RSSNewsItem } from '@/types';

// Mocking the logic used in the API route
function processRSSItems(allItems: any[], priorityKeywords: string[]): RSSNewsItem[] {
  const processedItems: RSSNewsItem[] = allItems.map((item: any) => {
    const title = item.title || 'Sin título';
    const content = item.content || item.description || '';
    const contentSnippet = item.contentSnippet || content.substring(0, 200);
    const link = item.link || '';
    const pubDate = item.pubDate || item.isoDate || new Date().toISOString();

    const isPriority = priorityKeywords.some((keyword: string) =>
      title.toLowerCase().includes(keyword.toLowerCase()) ||
      content.toLowerCase().includes(keyword.toLowerCase())
    );

    let isExchangeRate = false;
    let exchangeRateData = undefined;

    if (item.feedName?.includes('Banco Central') || link.includes('bc.gob.cu')) {
      if (title.toLowerCase().includes('tasas de cambio') || title.toLowerCase().includes('tipo de cambio')) {
        isExchangeRate = true;
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

  return processedItems.sort((a, b) => {
    if (a.isPriority && !b.isPriority) return -1;
    if (!a.isPriority && b.isPriority) return 1;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
}

describe('RSS Logic', () => {
  const priorityKeywords = ['CUP', 'Divisas'];

  it('should mark items as priority if they contain keywords', () => {
    const items = [
      { title: 'Noticia normal', content: 'Contenido normal' },
      { title: 'Nueva política sobre el CUP', content: 'Detalles' },
    ];
    const processed = processRSSItems(items, priorityKeywords);
    expect(processed[0].title).toContain('CUP');
    expect(processed[0].isPriority).toBe(true);
    expect(processed[1].isPriority).toBe(false);
  });

  it('should detect exchange rate from BCC feed', () => {
    const items = [
      {
        title: 'Tasas de cambio',
        content: 'El Banco Central informa: USD - 120.00',
        feedName: 'Banco Central de Cuba',
        link: 'https://www.bc.gob.cu/noticia/1'
      }
    ];
    const processed = processRSSItems(items, priorityKeywords);
    expect(processed[0].isExchangeRate).toBe(true);
    expect(processed[0].exchangeRateData?.value).toBe(120);
    expect(processed[0].exchangeRateData?.currency).toBe('USD');
  });

  it('should sort priority items first', () => {
    const items = [
      { title: 'Z - Noticia vieja pero prioritaria', content: 'CUP', pubDate: '2023-01-01' },
      { title: 'A - Noticia nueva normal', content: 'Normal', pubDate: '2023-01-02' },
    ];
    const processed = processRSSItems(items, priorityKeywords);
    expect(processed[0].title).toContain('Z - Noticia vieja');
    expect(processed[1].title).toContain('A - Noticia nueva');
  });
});
