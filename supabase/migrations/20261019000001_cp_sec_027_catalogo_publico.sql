-- ============================================================================
-- CP-SEC-027 — Catálogo público sin exposición de costos (P1)
-- Fecha: 2026-10-19 · Rama: fix/cp-sec-027-catalogo-publico
--
-- PROBLEMA (hallazgo F3 de DT-03, verificado en vivo 2026-10-19 con la clave
-- publishable vía PostgREST; evidencia en
-- docs/audits/evidence/20261019-cp-sec-027-publico/):
--   · products_public_read_anon (SELECT TO anon: is_active AND
--     visible_en_tienda, creada en 20260726000032) exponía TODAS las columnas
--     legibles de products al rol anon — incluidas cost_average (costo WAC
--     real), cost_price, precio_empresa, supplier, min_stock y tenant_id.
--     Evidencia: 103/103 productos públicos con costo real legibles por anon.
--   · stores_select_anon (SELECT TO anon: is_active, creada en
--     20260614000001) exponía TODAS las columnas de stores — incluidas
--     tenant_id, bank_account, nit, signature_url, stamp_url.
--   · "Variantes públicas - lectura" (SELECT TO anon,authenticated — creada
--     OUT-OF-BAND, sin representación previa en el stream de migraciones)
--     exponía precio_empresa (comercialmente sensible; el propio código la
--     excluye del API pública desde FIX-SEC-H6) y conversion_factor.
--
-- CORRECCIÓN (enfoque decidido por el propietario: vista public_catalog_v):
--   1. Tres vistas de solo lectura como ÚNICA superficie pública:
--        public_catalog_v      — productos: columnas de presentación
--        public_storefronts_v  — tiendas: columnas de vitrina
--        public_variants_v     — variantes: columnas de presentación
--   2. DROP de las policies anon sobre las TABLAS.
--   3. REVOKE SELECT sobre las TABLAS al rol anon (defensa en profundidad).
--   4. GRANT SELECT sobre las VISTAS al rol anon.
--
-- SIN EFECTO sobre:
--   · authenticated: sus policies quedan intactas; la policy de variantes se
--     recrea con el MISMO predicado, solo sin anon (cero cambio de
--     comportamiento para usuarios con sesión).
--   · service_role: los publish flows (WhatsApp/Telegram) y la vitrina SSR
--     (ruta RPC get_paginated_products) usan service-role y consultan las
--     tablas directamente, sin pasar por la superficie anon.
--   · RPCs: ningún GRANT EXECUTE se crea ni se revoca aquí.
--
-- CONSUMIDORES ANON ACTIVOS verificados en código (todos migrados a las
-- vistas en este mismo cambio):
--   · src/app/tienda/[slug]/page.tsx        (vitrina SSR)
--   · src/app/api/storefront/[slug]/route.ts (API pública de vitrina)
--
-- REVERSIBILIDAD: procedimiento completo auditable al final del archivo.
--
-- DESPLIEGUE RECOMENDADO (dos fases, ventana corta, cero interrupción):
--   FASE 1 (aditiva, sin impacto): ejecutar SOLO las secciones 1-4 (CREATE
--   vistas + GRANT). Los flujos actuales siguen funcionando contra las tablas.
--   FASE 2 (código): desplegar la aplicación con los consumidores migrados a
--   las vistas (vitrina SSR + storefront API — mismos commits de este PR).
--   FASE 3 (retirada): ejecutar las secciones 5a-5c (DROP policies + REVOKE).
--   Cierre de la ventana: entre fases 2 y 3 la exposición anon a las tablas
--   sigue abierta (comportamiento pre-fix); entre fases 1 y 2 no hay ningún
--   cambio visible. Aplicación en un solo paso (todo el archivo de una vez)
--   es equivalente SI el despliegue del código ocurre inmediatamente después;
--   en ese caso la vitrina puede fallar por segundos hasta desplegar código.
--   La aplicación de esta migración a la BD viva requiere autorización
--   expresa del propietario (no ejecutar automáticamente).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. VISTA DE PRODUCTOS PÚBLICOS — public_catalog_v
--    Columnas de presentación EXACTAS que consumen hoy los flujos públicos
--    (publish flows de WhatsApp/Telegram, vitrina SSR, storefront API).
--    EXCLUIDAS deliberadamente: cost_price, cost_average, precio_empresa,
--    precio_empresa_currency, supplier, min_stock, tenant_id, cost_sheet_id,
--    status, is_complete, has_movements, fc_auto_enabled, barcode,
--    barcode_type, category_id, search_vector, created_at, updated_at.
--    La vista se ejecuta con privilegios de su owner (postgres, dueño de
--    products, sin FORCE RLS) → el WHERE de la vista es la frontera pública.
--    security_barrier impide el pushdown de predicados que podrían inferir
--    información fuera de la frontera definida por el WHERE de la vista.
-- ──────────────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RETIRADA del acceso anon a las TABLAS
--
-- 5a. Policies anon de tabla:
-- ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products_public_read_anon" ON public.products;
DROP POLICY IF EXISTS "stores_select_anon" ON public.stores;

-- 5b. La policy de variantes se recrea SIN anon. Mismo predicado para
--     authenticated (cero cambio de comportamiento con sesión). Primera
--     representación en el stream de migraciones de esta policy que
--     previamente existía solo out-of-band en la BD viva.
DROP POLICY IF EXISTS "Variantes públicas - lectura" ON public.product_variants;
DROP POLICY IF EXISTS "Variantes públicas - lectura autenticada" ON public.product_variants;
CREATE POLICY "Variantes públicas - lectura autenticada" ON public.product_variants
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1
        FROM public.products
        WHERE products.id = product_variants.product_id
          AND products.visible_en_tienda = true
    ));

-- 5c. Revocación del privilegio de tabla al rol anon (defensa en profundidad:
--     aunque una policy anon reapareciera por despliegue parcial, sin GRANT
--     no hay lectura posible vía PostgREST).
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.stores FROM anon;
REVOKE SELECT ON public.product_variants FROM anon;

-- ============================================================================
-- PROCEDIMIENTO DE REVERSIÓN completo (auditable, ejecutado solo por el
-- propietario con autorización expresa; idempotente):
--
--   BEGIN;
--   REVOKE SELECT ON public.public_catalog_v FROM anon;
--   REVOKE SELECT ON public.public_storefronts_v FROM anon;
--   REVOKE SELECT ON public.public_variants_v FROM anon;
--   DROP VIEW IF EXISTS public.public_variants_v;
--   DROP VIEW IF EXISTS public.public_storefronts_v;
--   DROP VIEW IF EXISTS public.public_catalog_v;
--   GRANT SELECT ON public.products TO anon;
--   GRANT SELECT ON public.stores TO anon;
--   GRANT SELECT ON public.product_variants TO anon;
--   DROP POLICY IF EXISTS "products_public_read_anon" ON public.products;
--   CREATE POLICY "products_public_read_anon" ON public.products
--       FOR SELECT TO anon
--       USING (is_active = true AND visible_en_tienda = true);
--   DROP POLICY IF EXISTS "stores_select_anon" ON public.stores;
--   CREATE POLICY "stores_select_anon" ON public.stores
--       FOR SELECT TO anon
--       USING (stores.is_active = true);
--   DROP POLICY IF EXISTS "Variantes públicas - lectura autenticada"
--       ON public.product_variants;
--   CREATE POLICY "Variantes públicas - lectura" ON public.product_variants
--       FOR SELECT TO anon, authenticated
--       USING (EXISTS (SELECT 1 FROM public.products
--               WHERE products.id = product_variants.product_id
--                 AND products.visible_en_tienda = true));
--   COMMIT;
--
-- VERIFICACIÓN POST-MIGRACIÓN (read-only, con la clave publishable anon):
--   · GET /rest/v1/products?select=id,cost_average        → 401 (privilegio revocado)
--   · GET /rest/v1/products?select=id,name                → 401
--   · GET /rest/v1/stores?select=id,tenant_id             → 401
--   · GET /rest/v1/product_variants?select=precio_empresa → 401
--   · GET /rest/v1/public_catalog_v?select=id,name,price&limit=3
--     → 200; cost_average AUSENTE del schema OpenAPI de la vista
--   · GET /rest/v1/public_storefronts_v?select=slug       → 200 (vitrina OK)
--   · GET /rest/v1/public_variants_v?limit=1              → 200
--   · GET /tienda/<slug>                                  → 200 HTML con productos
--   · GET /api/storefront/<slug>                          → 200 JSON
--   (script reproducible: scripts/cpsec027_post_migration_verify.js)
-- ============================================================================
