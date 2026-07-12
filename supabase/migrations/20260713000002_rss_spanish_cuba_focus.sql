-- ============================================================================
-- Migration: RSS feeds cleanup + Spanish/Cuba-focused expansion
-- Date: 2026-07-13
-- Task: GESTION-RSS-MIPYMES-CUBA
--
-- Cambios:
--   1. DELETE 7 feeds en inglés (Wired, The Verge, Reuters×2, HBR, SME News, Investing.com)
--   2. KEEP 8 feeds en español (BCC, FMI-es, BM-es, OMC-es, CEPAL, CIAT, Gaceta, BBC Mundo)
--   3. INSERT 16 nuevas fuentes en español:
--      - 8 medios cubanos (Granma, Cubadebate, Juventud Rebelde, OnCuba, El Toque,
--        14ymedio, Diario de Cuba, ADN Cuba)
--      - 5 medios internacionales en español (El País Economía, Expansión, Cinco Días,
--        El Economista, América Economía)
--      - 3 organismos multilaterales en español (BID, OIT, OPS)
--
-- Total resultante: 24 feeds, todos en español, categorizados en 8 temas MiPyme.
-- ============================================================================

BEGIN;

-- 1. Eliminar feeds en inglés (no son de interés para MiPymes cubanas)
DELETE FROM public.rss_feeds WHERE url IN (
  'https://www.wired.com/feed/category/business/latest/rss',
  'https://www.theverge.com/rss/index.xml',
  'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
  'https://www.investing.com/rss/news_25.rss',
  'https://hbr.org/feeds/latest.rss',
  'https://www.smenews.lat/rss',
  'https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best&region=central-america-south'
);

-- 2. Insertar nuevas fuentes en español (Cuba + MiPymes)
--    Categorías: economia_finanzas, comercio_exterior, tributacion_fiscal,
--                legislacion, tecnologia, mercados, educacion_negocios, regional_latam
INSERT INTO public.rss_feeds (name, url, is_active, category) VALUES
  -- ── Medios cubanos nacionales ──
  ('Granma (Cuba)',                'https://www.granma.cu/feed',                      'regional_latam'),
  ('Cubadebate',                   'https://www.cubadebate.cu/feed/',                 'regional_latam'),
  ('Juventud Rebelde',             'https://www.juventudrebelde.cu/feed',             'regional_latam'),
  ('OnCuba News',                  'https://oncubanews.com/feed/',                    'regional_latam'),
  ('El Toque',                     'https://eltoque.com/feed',                        'economia_finanzas'),
  ('14ymedio',                     'https://www.14ymedio.com/feed',                   'regional_latam'),
  ('Diario de Cuba',               'https://diariodecuba.com/feed',                   'regional_latam'),
  ('ADN Cuba',                     'https://adncuba.com/feed',                        'regional_latam'),
  -- ── Medios internacionales en español (economía/negocios) ──
  ('El País - Economía',           'https://feeds.elpais.com/mrss/s/pages/elpais/economia.html', 'economia_finanzas'),
  ('Expansión',                    'https://www.expansion.com/rss/portada.xml',       'mercados'),
  ('Cinco Días',                   'https://cincodias.elpais.com/rss/portada.xml',    'mercados'),
  ('El Economista (España)',       'https://www.eleconomista.es/rss/portada.xml',     'mercados'),
  ('América Economía',             'https://www.americaeconomia.com/rss.xml',         'educacion_negocios'),
  -- ── Organismos multilaterales en español ──
  ('BID - Noticias (Esp)',         'https://www.iadb.org/es/rss.xml',                 'comercio_exterior'),
  ('OIT - Noticias (Esp)',         'https://www.ilo.org/es/rss/news.xml',            'legislacion'),
  ('OPS - Noticias (Esp)',         'https://www.paho.org/es/rss.xml',                 'regional_latam')
ON CONFLICT (url) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category;

COMMIT;
