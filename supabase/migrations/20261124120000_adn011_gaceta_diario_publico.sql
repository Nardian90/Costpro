-- ============================================================================
-- ADN-011 · EL DIARIO CONTABLE — vista pública de publicaciones diarias
-- Migration: 20261124120000_adn011_gaceta_diario_publico.sql
-- Rama: feat/gaceta-diario-20261124 · Fecha: 2026-11-24
--
-- MISIÓN: periódico público (/gaceta) para usuarios contadores. El editor
-- automático (scheduler Z.ai) publica a diario sobre la Gaceta Oficial de
-- Cuba (resoluciones, normativas, novedades MIPymes/ONAT) en un formato
-- de artículo periodístico; cuando no hay novedades oficiales publica una
-- nota sobre CostPro (novedades del producto, tips de uso).
--
-- DECISIÓN DE DISEÑO (replicando el patrón CP-SEC-027, migraciones
-- 20261019000001 + 20261019000002):
--   · Tabla base `gaceta_posts` con RLS habilitado y CERO policies para
--     anon/authenticated → denegación por defecto. La única vía de escritura
--     legítima es service_role (bypass RLS, usada por el editor y los seeds).
--   · La superficie pública es la vista `public_gaceta_v`
--     (security_barrier = true): SOLO columnas de presentación de filas
--     publicadas. anon/authenticated obtienen SELECT sobre la vista y se les
--     REVOCAN los privilegios de escritura (Supabase otorga ALL por defecto
--     a objetos nuevos del schema public; como la vista es auto-actualizable
--     su owner tiene BYPASSRLS → sin el REVOKE, cualquiera con la clave
--     publishable podría escribir a través de ella; lección del cierre
--     CP-SEC-027 de 2026-10-19).
--   · REVOKE SELECT sobre la TABLA a anon/authenticated (defensa en
--     profundidad: nadie lee la tabla por la superficie anon, solo la vista).
--   · No se toca service_role ni RPCs existentes.
--
-- CONSUMIDORES (mismo PR): src/app/gaceta/page.tsx (portada SSR) y
-- src/app/gaceta/[slug]/page.tsx (artículo SSR) leen public_gaceta_v con el
-- cliente anon de servidor, igual que la vitrina /tienda/[slug].
--
-- FORMATO DE `cuerpo` (jsonb, lo define el editor automático y renderiza el
-- SSR del artículo): array de bloques
--   { "t": "h2"|"p"|"li"|"quote"|"dato", "v": "<texto>" }
--   h2    → intertítulo
--   p     → párrafo
--   li    → viñeta (el renderer agrupa consecutivos en <ul>)
--   quote → cita destacada (ej. fragmento literal de una resolución)
--   dato  → dato clave en caja destacada (fechas, plazos, tipos)
--
-- IDEMPOTENCIA: CREATE TABLE IF NOT EXISTS + DO block para índices y
-- comentarios; re-aplicar es un no-op seguro. La vista se recrea con
-- CREATE OR REPLACE.
--
-- REVERSIBILIDAD:
--   DROP VIEW IF EXISTS public.public_gaceta_v;
--   DROP TABLE IF EXISTS public.gaceta_posts;
--   (la tabla es 100% generada por el editor; sin FKs ni dependencias)
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. TABLA BASE — gaceta_posts
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gaceta_posts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha         date NOT NULL,
    slug          text NOT NULL UNIQUE,
    tipo          text NOT NULL CHECK (tipo IN ('gaceta', 'costpro')),
    titular       text NOT NULL,
    bajada        text,
    cuerpo        jsonb NOT NULL DEFAULT '[]'::jsonb,
    etiquetas     text[] NOT NULL DEFAULT '{}'::text[],
    fuente        text,
    destacado     boolean NOT NULL DEFAULT false,
    estado        text NOT NULL DEFAULT 'publicada' CHECK (estado IN ('publicada', 'borrador')),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);
-- Nota: sin UNIQUE(fecha) a propósito — una edición puede traer varias notas
-- (p. ej. una de Gaceta Oficial y una de CostPro el mismo día). La
-- idempotencia del editor la asegura por (fecha, tipo) en su lógica.

COMMENT ON TABLE public.gaceta_posts IS
  'ADN-011: publicaciones del Diario Contable (periódico público /gaceta). Escritura: solo service_role (editor automático). Lectura pública: vía public_gaceta_v.';

DO $do$
BEGIN
    -- Índices de consulta de la portada (más recientes primero, por tipo)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='gaceta_posts_fecha_idx') THEN
        CREATE INDEX gaceta_posts_fecha_idx ON public.gaceta_posts (fecha DESC);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='gaceta_posts_tipo_fecha_idx') THEN
        CREATE INDEX gaceta_posts_tipo_fecha_idx ON public.gaceta_posts (tipo, fecha DESC);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='gaceta_posts_etiquetas_idx') THEN
        CREATE INDEX gaceta_posts_etiquetas_idx ON public.gaceta_posts USING gin (etiquetas);
    END IF;
END;
$do$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RLS — denegación por defecto a anon/authenticated
--    Cero policies: ninguna operación anon/authenticated sobre la tabla.
--    service_role (BYPASSRLS) es el único escritor (editor automático).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.gaceta_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gaceta_posts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.gaceta_posts FROM anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. VISTA PÚBLICA — public_gaceta_v
--    Columnas de presentación EXACTAS que consumen /gaceta (portada y
--    artículo). EXCLUIDAS: creado_en, actualizado_en (internas).
--    Solo filas estado='publicada'. security_barrier impide pushdown de
--    predicados fuera de la frontera definida por el WHERE.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.public_gaceta_v
WITH (security_barrier = true) AS
SELECT
    g.id,
    g.fecha,
    g.slug,
    g.tipo,
    g.titular,
    g.bajada,
    g.cuerpo,
    g.etiquetas,
    g.fuente,
    g.destacado
FROM public.gaceta_posts g
WHERE g.estado = 'publicada';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. GRANT / REVOKE sobre la vista (patrón CP-SEC-027 fase 1 + cierre 2)
-- ──────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.public_gaceta_v TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.public_gaceta_v
    FROM anon, authenticated;

-- Verificación (idempotente y re-ejecutable):
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname='public' AND tablename='gaceta_posts';           -- → 0
--   SELECT has_table_privilege('anon','public.gaceta_posts','SELECT'); -- → false
--   SELECT has_table_privilege('anon','public.public_gaceta_v','SELECT'); -- → true
--   SELECT has_table_privilege('anon','public.public_gaceta_v','INSERT'); -- → false
