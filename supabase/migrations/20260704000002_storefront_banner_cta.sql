-- Migration: 20260704000002_storefront_banner_cta.sql
-- Objetivo: Añadir campos para CTA editable encima del banner.
--   banner_cta_text: texto del botón (ej: "Ver promociones", "Consultar catálogo")
--   banner_cta_link: URL opcional. Si es null, el botón hace scroll a #productos

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS banner_cta_text TEXT,
  ADD COLUMN IF NOT EXISTS banner_cta_link TEXT;

COMMENT ON COLUMN stores.banner_cta_text IS 'Texto del CTA superpuesto al banner (opcional). Vacío = no se muestra botón.';
COMMENT ON COLUMN stores.banner_cta_link IS 'URL del CTA del banner (opcional). Si es null, el botón hace scroll a la sección de productos.';
