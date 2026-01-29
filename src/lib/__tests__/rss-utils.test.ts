import { describe, it, expect } from 'vitest';
import { classifyRSSItem } from '../rss-utils';

describe('classifyRSSItem', () => {
  it('should mark BCC exchange rate news as priority and exchange rate', () => {
    const item = {
      title: 'Nueva Tasa de Cambio',
      contentSnippet: 'El banco central anuncia cambios...',
      link: 'https://bc.gob.cu/1',
      pubDate: '2026-02-25T10:00:00Z'
    };
    const result = classifyRSSItem(item, 'Banco Central de Cuba', ['CUP']);

    expect(result.isPriority).toBe(true);
    expect(result.isExchangeRate).toBe(true);
  });

  it('should mark news with priority keywords as priority', () => {
    const item = {
      title: 'Inversión en CUP',
      contentSnippet: 'Se proyecta crecimiento...',
      link: 'https://news.com/1',
      pubDate: '2026-02-25T10:00:00Z'
    };
    const result = classifyRSSItem(item, 'Noticias Locales', ['CUP', 'Divisas']);

    expect(result.isPriority).toBe(true);
    expect(result.isExchangeRate).toBe(false);
  });

  it('should not mark regular news as priority', () => {
    const item = {
      title: 'Clima hoy',
      contentSnippet: 'Soleado con nubes...',
      link: 'https://news.com/2',
      pubDate: '2026-02-25T10:00:00Z'
    };
    const result = classifyRSSItem(item, 'Noticias Locales', ['CUP']);

    expect(result.isPriority).toBe(false);
  });
});
