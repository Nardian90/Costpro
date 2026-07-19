-- ════════════════════════════════════════════════════════════════════
-- Añadir columna is_special a rss_feeds + marcar Gaceta Oficial como especial
-- ════════════════════════════════════════════════════════════════════
-- Los feeds "especiales" se destacan en el agregador de noticias:
-- aparecen primero, con badge visual, y son fuentes prioritarias
-- (Gaceta Oficial, tasas de cambio, etc.)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.rss_feeds
  ADD COLUMN IF NOT EXISTS is_special BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rss_feeds.is_special IS
  'Si true, el feed se destaca como especial en el agregador (badge, prioridad, aparece primero). Ej: Gaceta Oficial, tasas de cambio.';

-- Marcar Gaceta Oficial como especial
UPDATE public.rss_feeds
SET is_special = true, is_active = true
WHERE url ILIKE '%gacetaoficial.gob.cu%';

-- Si no existe, insertarla
INSERT INTO public.rss_feeds (name, url, is_active, category, is_special)
SELECT 'Gaceta Oficial de Cuba', 'https://www.gacetaoficial.gob.cu/rss', true, 'legislacion', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.rss_feeds WHERE url ILIKE '%gacetaoficial.gob.cu%'
);

-- Verificación
SELECT 'gaceta_special' AS status,
       (SELECT count(*) FROM public.rss_feeds WHERE is_special = true) AS special_count,
       (SELECT name FROM public.rss_feeds WHERE is_special = true LIMIT 1) AS first_special;
