-- ============================================================================
-- REVERSIÓN DE LA FASE C - CP-SEC-027 (reabre la superficie anon de tablas)
--
-- Origen VERBATIM: bloque PROCEDIMIENTO DE REVERSIÓN de la migración fusionada
-- supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql
-- (main 98e0d31e = 2be38e21b, sha256 idéntico 5c2b8f97a2bfef2c…, PR #1424,
-- fusionado 2026-10-19T10:51:49Z) — líneas 206-224 del archivo fuente.
--
-- VERSIÓN 2 (2026-10-19, revisión final del propietario): la extracción
-- mecánica original (extraer_sql_fases_cpsec027.js) perdió las líneas de
-- continuación de los CREATE POLICY (FOR SELECT TO … USING …) al
-- descomentar el bloque, produciendo SQL sintácticamente INVÁLIDO, y omitió
-- el BEGIN del bloque transaccional. Regenerado a mano contra el archivo
-- fuente; predicados cotejados uno a uno con la captura T-0
-- (t0_linea_base_readonly.sql §1: products is_active+visible_en_tienda;
-- stores is_active; variantes EXISTS visible_en_tienda). Cero SQL inventado.
--
-- EMERGENCIA: restaura el acceso anon a las tablas tal y como estaba en la
-- línea base (grants + las 3 policies con sus predicados exactos).
-- LIMITACIÓN CRÍTICA: REABRE LA EXPOSICIÓN P1 que CP-SEC-027 cierra (anon
-- vuelve a leer cost_average y tenant_id por las rutas públicas); es un
-- estado de emergencia conocido y aceptable SOLO para restaurar el
-- servicio, con re-escalamiento inmediato y nueva ventana para re-cerrar.
-- Validar contra la captura T-0 antes de ejecutar si hay dudas de deriva.
-- Las vistas de la Fase A y sus grants NO se tocan (inofensivas).
-- Idempotente. Transaccional (BEGIN/COMMIT) según el bloque fuente.
-- NO EJECUTAR sin autorización expresa del propietario.
-- ============================================================================

BEGIN;

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.product_variants TO anon;

DROP POLICY IF EXISTS "products_public_read_anon" ON public.products;
CREATE POLICY "products_public_read_anon" ON public.products
    FOR SELECT TO anon
    USING (is_active = true AND visible_en_tienda = true);

DROP POLICY IF EXISTS "stores_select_anon" ON public.stores;
CREATE POLICY "stores_select_anon" ON public.stores
    FOR SELECT TO anon
    USING (stores.is_active = true);

DROP POLICY IF EXISTS "Variantes públicas - lectura autenticada"
    ON public.product_variants;
CREATE POLICY "Variantes públicas - lectura" ON public.product_variants
    FOR SELECT TO anon, authenticated
    USING (EXISTS (SELECT 1 FROM public.products
            WHERE products.id = product_variants.product_id
              AND products.visible_en_tienda = true));

COMMIT;
