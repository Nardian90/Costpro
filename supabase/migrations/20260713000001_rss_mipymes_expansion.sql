-- ============================================================================
-- Migration: Expand RSS module with MSME-relevant sources + topic filters
-- Date: 2026-07-13
-- Task: GESTION-RSS-MIPYMES
--
-- Antes: solo 1 feed (Banco Central de Cuba) y el filtro de "temas" era solo
-- por palabras clave de prioridad. No había categorización temática.
--
-- Ahora:
--   1. Añade columna `category` a rss_feeds (TEXT, nullable para retrocompat)
--   2. Define 8 categorías de interés para MiPymes cubanas/latinoamericanas
--   3. Hace seed de 14 fuentes RSS de calidad, organizadas por categoría
--   4. Amplía priority_keywords con términos MSME-relevantes
-- ============================================================================

BEGIN;

-- 1. Añadir columna category a rss_feeds (nullable: feeds existentes quedan sin categoría)
ALTER TABLE public.rss_feeds
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Categorizar el feed existente (Banco Central de Cuba)
UPDATE public.rss_feeds
SET category = 'economia_finanzas'
WHERE url = 'https://www.bc.gob.cu/rss.xml' AND category IS NULL;

-- 3. Índice para filtrar por categoría + estado activo
CREATE INDEX IF NOT EXISTS idx_rss_feeds_category_active
  ON public.rss_feeds(category, is_active);

-- 4. Seed de fuentes RSS relevantes para MiPymes
--    Categorías:
--      economia_finanzas  — política monetaria, PIB, inflación, tasas
--      comercio_exterior  — import/export, aranceles, aduanas
--      tributacion_fiscal — impuestos, ONAT, declaraciones
--      legislacion        — Gaceta Oficial, decretos, normativa MiPyme
--      tecnologia         — digitalización, transformación digital, ciberseguridad
--      mercados           — precios, materias primas, commodities
--      educacion_negocios — capacitación, gestión, MBA, pymes
--      regional_latam     — economía regional, Cuba, Caribe, LatAm

INSERT INTO public.rss_feeds (name, url, is_active, category) VALUES
  -- ── economia_finanzas ──
  ('Banco Central de Cuba', 'https://www.bc.gob.cu/rss.xml', true, 'economia_finanzas'),
  ('FMI - Noticias', 'https://www.imf.org/en/News/rss?language=spa', true, 'economia_finanzas'),
  ('Banco Mundial - Noticias (Esp)', 'https://www.worldbank.org/es/news/rss', true, 'economia_finanzas'),

  -- ── comercio_exterior ──
  ('OMC - Noticias', 'https://www.wto.org/spanish/news_s/news_s.xml', true, 'comercio_exterior'),
  ('Cepal - Comercio Exterior', 'https://www.cepal.org/es/rss.xml', true, 'comercio_exterior'),

  -- ── tributacion_fiscal ──
  ('CIAT - Noticias Fiscales', 'https://www.ciat.org/rss-feed/', true, 'tributacion_fiscal'),

  -- ── legislacion ──
  ('Gaceta Oficial de Cuba', 'https://www.gacetaoficial.gob.cu/rss', true, 'legislacion'),

  -- ── tecnologia ──
  ('Wired - Negocios', 'https://www.wired.com/feed/category/business/latest/rss', true, 'tecnologia'),
  ('The Verge - Tech', 'https://www.theverge.com/rss/index.xml', true, 'tecnologia'),

  -- ── mercados ──
  ('Reuters - Mercados', 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', true, 'mercados'),
  ('Investing.com - Análisis', 'https://www.investing.com/rss/news_25.rss', true, 'mercados'),

  -- ── educacion_negocios ──
  ('Harvard Business Review (ES)', 'https://hbr.org/feeds/latest.rss', true, 'educacion_negocios'),
  ('SME News Latam', 'https://www.smenews.lat/rss', true, 'educacion_negocios'),

  -- ── regional_latam ──
  ('Reuters - Latinoamérica', 'https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best&region=central-america-south', true, 'regional_latam'),
  ('BBC Mundo - Economía', 'https://feeds.bbci.co.uk/mundo/rss.xml', true, 'regional_latam')
ON CONFLICT (url) DO UPDATE
  SET category = EXCLUDED.category
  WHERE rss_feeds.category IS NULL;

-- 5. Ampliar priority_keywords con términos MSME-relevantes
-- NOTA: la columna apply_filter no existe en producción (solo en la migration
-- original 20260225_create_rss_module.sql pero fue eliminada posteriormente).
-- Si la fila no existe, la creamos; si existe, la actualizamos.
INSERT INTO public.rss_settings (id, priority_keywords)
VALUES ('00000000-0000-0000-0000-000000000000', ARRAY[
  -- Finanzas / Tasas
  'Tasas de cambio', 'CUP', 'Divisas', 'Política Monetaria',
  'USD', 'EUR', 'Tipo de cambio', 'Banco Central',
  -- Tributación
  'Impuesto', 'ONAT', 'Tributaria', 'Declaración jurada',
  'Régimen simplificado', 'Contribuyente',
  -- Comercio
  'Aranceles', 'Aduana', 'Importación', 'Exportación',
  'Comercio exterior', 'Licencia de importación',
  -- Legislación MiPyme
  'MiPyme', 'MIPYMES', 'Decreto', 'Gaceta Oficial',
  'Persona jurídica', 'Cuenta propia',
  -- Mercados
  'Inflación', 'PIB', 'Recesión', 'Commodities',
  -- Digitalización
  'Transformación digital', 'Ciberseguridad', 'Pymes digitales'
])
ON CONFLICT (id) DO UPDATE
  SET priority_keywords = EXCLUDED.priority_keywords;

-- 6. Comentario informativo
COMMENT ON COLUMN public.rss_feeds.category IS
  'Categoría temática del feed: economia_finanzas, comercio_exterior, tributacion_fiscal, legislacion, tecnologia, mercados, educacion_negocios, regional_latam';

COMMIT;
