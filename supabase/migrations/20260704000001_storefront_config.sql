-- Migration: 20260704000001_storefront_config.sql
-- Objetivo: Hacer altamente configurable la vitrina pública de cada tienda.
--
-- Campos nuevos en stores:
--   banner_url          URL del banner personalizado (Supabase Storage). Si es NULL,
--                       la plantilla usa su banner por defecto.
--   store_tagline       Subtítulo/eslogan corto (ej: "Materiales de construcción
--                       y transporte en toda la región"). Opcional.
--   whatsapp_group_url  URL https://chat.whatsapp.com/... o https://wa.me/...
--                       para unirse al grupo de WhatsApp de la tienda.
--   telegram_url        URL https://t.me/... del canal o grupo de Telegram.
--   services            JSONB array de servicios que presta la empresa.
--                       Ej: [{"icon":"truck","title":"Envíos","description":"..."}]
--                       Máx 6 elementos (validado a nivel de app).
--   promo_images        JSONB array de URLs de imágenes promocionales (hasta 5).
--                       Ej: [{"url":"...","caption":"Oferta verano","link":null}]
--   opening_hours       Texto libre con horario de atención.
--                       Ej: "Lun-Vie 8:00-17:00, Sáb 8:00-12:00"
--
-- Todos los campos son NULLABLES: si están ausentes, la vitrina simplemente
-- omite la sección correspondiente. Esto preserva compatibilidad con tiendas
-- existentes sin requerir backfill.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS store_tagline TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_url TEXT,
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS promo_images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT;

COMMENT ON COLUMN stores.banner_url IS 'URL del banner personalizado para la vitrina pública. Si es NULL, la plantilla usa su banner por defecto.';
COMMENT ON COLUMN stores.store_tagline IS 'Subtítulo o eslogan corto que aparece debajo del nombre en la vitrina.';
COMMENT ON COLUMN stores.whatsapp_group_url IS 'URL para unirse al grupo de WhatsApp de la tienda (formato https://chat.whatsapp.com/...).';
COMMENT ON COLUMN stores.telegram_url IS 'URL del canal o grupo de Telegram (formato https://t.me/...).';
COMMENT ON COLUMN stores.services IS 'Array JSON de servicios: [{icon, title, description}]. Máx 6 elementos.';
COMMENT ON COLUMN stores.promo_images IS 'Array JSON de imágenes promocionales: [{url, caption, link?}]. Máx 5 elementos.';
COMMENT ON COLUMN stores.opening_hours IS 'Horario de atención en texto libre.';

-- Índice parcial para acelerar queries que filtran por tiendas con banner configurado
-- (potencial listado de "tiendas destacadas" en el futuro).
CREATE INDEX IF NOT EXISTS idx_stores_has_banner
  ON stores(id) WHERE banner_url IS NOT NULL;
