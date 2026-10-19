-- ============================================================================
-- FASE A (ADITIVA) - CP-SEC-027: vistas public_catalog_v / public_storefronts_v / public_variants_v + GRANT SELECT a anon
--
-- Origen VERBATIM: supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql (main 98e0d31e, PR #1424, fusionado 2026-10-19T10:51:49Z)
-- Extraccion mecanica de lineas exactas del archivo fusionado; cero SQL
-- reescrito ni alternativo. La division en fases es la que recomienda el
-- propio encabezado de la migracion (despliegue en tres fases, ventana
-- corta, cero interrupcion).
--
-- Crear las tres vistas (security_barrier, columnas de presentacion sin
-- costos) y conceder SELECT SOLO a anon. Sin impacto sobre los flujos
-- vivos: el codigo desplegado hoy no consulta estas vistas y las tablas
-- siguen abiertas a anon hasta la Fase C. Idempotente (CREATE OR REPLACE
-- + GRANT). Orden exacto: seccion 1 (catalogo), 2 (tiendas), 3 (variantes),
-- 4 (grants).
-- NO EJECUTAR sin autorizacion expresa del propietario.
-- ============================================================================

CREATE OR REPLACE VIEW public.public_catalog_v
WITH (security_barrier = true) AS
SELECT
    p.id,
    p.store_id,
    p.name,
    p.description,
    p.sku,
    p.price,
    p.price_currency,
    p.price_visible,
    p.stock_visible,
    p.stock_current,
    p.on_promotion,
    p.unit_of_measure,
    p.image_url,
    p.public_image_url,
    p.category,
    p.is_active,
    p.visible_en_tienda
FROM public.products p
WHERE p.is_active = true AND p.visible_en_tienda = true;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. VISTA DE TIENDAS PÚBLICAS — public_storefronts_v
--    Columnas de vitrina EXACTAS que consulta hoy la vitrina SSR
--    (generateStaticParams, generateMetadata, TiendaPublicPage) y la
--    storefront API pública.
--    EXCLUIDAS deliberadamente: tenant_id, bank_account, nit, signature_url,
--    stamp_url, created_by, latitude, longitude, is_archived, archived_at,
--    archived_by, backup_restore_protected, created_at.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.public_storefronts_v
WITH (security_barrier = true) AS
SELECT
    s.id,
    s.name,
    s.address,
    s.phone,
    s.email,
    s.logo_url,
    s.slug,
    s.plantilla,
    s.reeup,
    s.is_active,
    s.banner_url,
    s.store_tagline,
    s.whatsapp_group_url,
    s.telegram_url,
    s.services,
    s.promo_images,
    s.opening_hours,
    s.banner_cta_text,
    s.banner_cta_link
FROM public.stores s
WHERE s.is_active = true;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. VISTA DE VARIANTES PÚBLICAS — public_variants_v
--    Presentación de variantes de productos PÚBLICOS (is_active AND
--    visible_en_tienda del producto padre — más estricta que la policy
--    out-of-band anterior, que no verificaba is_active del padre).
--    EXCLUIDAS deliberadamente: precio_empresa (comercialmente sensible:
--    los propios flujos públicos la excluyen — FIX-SEC-H6), created_at,
--    updated_at.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.public_variants_v
WITH (security_barrier = true) AS
SELECT
    v.id,
    v.product_id,
    v.name,
    v.sku,
    v.price,
    v.conversion_factor
FROM public.product_variants v
WHERE EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = v.product_id
      AND p.is_active = true
      AND p.visible_en_tienda = true
);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. GRANTS de la nueva superficie pública (solo lectura, solo anon)
-- ──────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.public_catalog_v TO anon;
GRANT SELECT ON public.public_storefronts_v TO anon;
GRANT SELECT ON public.public_variants_v TO anon;
