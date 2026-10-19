-- ============================================================================
-- FASE C (RESTRICCION) - CP-SEC-027: retirada del acceso anon a las TABLAS
--
-- Origen VERBATIM: supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql (main 98e0d31e, PR #1424, fusionado 2026-10-19T10:51:49Z)
-- Extraccion mecanica de lineas exactas del archivo fusionado; cero SQL
-- reescrito ni alternativo. La division en fases es la que recomienda el
-- propio encabezado de la migracion (despliegue en tres fases, ventana
-- corta, cero interrupcion).
--
-- PRECONDICION: Fase B verificada en vivo (vitrina y storefront API
-- funcionando con las vistas; E2E-SF-001/002/003 aprobadas).
-- 5a: DROP de products_public_read_anon y stores_select_anon.
-- 5b: policy de variantes recreada SOLO para authenticated con el mismo
--      predicado (cero cambio de comportamiento con sesion).
-- 5c: REVOKE SELECT de products/stores/product_variants a anon
--      (defensa en profundidad). Cierra la exposicion P1.
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY + REVOKE.
-- NO EJECUTAR sin autorizacion expresa del propietario.
-- ============================================================================

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
