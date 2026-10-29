-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO — PR 3 · ETAPA 1 (1/2): MODELO DE DATOS MAESTRO
-- master_products · catalog_store_links · master_change_log ·
-- master_change_proposals · catalog_governors · products.master_product_id
-- ═══════════════════════════════════════════════════════════════════════════
-- DISEÑO (informe 28-10-2026, cap. 7 — Alternativa D, modelo híbrido):
--   · El maestro porta SOLO identidad (SKU, nombre, imagen, código de barras,
--     unidad, tipo artículo, descripción) por organización. NUNCA precio,
--     costo, existencia ni datos comerciales (separación identidad/oferta,
--     patrón MDM — cap. 12 del informe).
--   · catalog_store_links: conexión explícita por (tenant, store) con estado;
--     desconectar NO borra productos ni historial (misión §4.2).
--   · products.master_product_id: vínculo anulable; NULL = producto no
--     gestionado por el catálogo (funciona exactamente como hoy). Máx. una
--     fila local por (maestro, tienda) — índice único parcial.
--   · master_change_log: auditoría de cambios YA aplicados de identidad.
--   · master_change_proposals: propuestas PENDIENTES de aprobación
--     (separación exigida por misión §4.4).
--   · catalog_governors: capacidad organizacional específica (misión §6) —
--     NO se convierte automáticamente a ningún admin global en gobernador.
-- INVARIANTES PRESERVADOS: identificadores históricos intactos; datos
--   comerciales locales intactos; la capa es aditiva y reversible.
-- SEGURIDAD: RLS habilitado desde la creación; escrituras SOLO vía RPC
--   SECURITY DEFINER (migración 20261028112000); GRANT de tabla solo SELECT;
--   helpers STABLE SECURITY DEFINER con search_path fijado.
-- REVERSIBILIDAD: DROP de las tablas/índices/columna/trigger restaura el
--   estado previo (ningún dato existente se reescribe).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) master_products — identidad canónica por organización
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  sku TEXT NOT NULL CHECK (sku <> '' AND btrim(sku) = sku),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  description TEXT,
  image_path TEXT,
  barcode TEXT,
  barcode_type TEXT,
  unit_of_measure TEXT,
  is_service BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.master_products IS
  'Catálogo maestro por organización (Alternativa D): identidad compartida (SKU, nombre, imagen). Sin datos comerciales. Escritura solo vía RPC gobernadas.';

-- SKU único DENTRO de la organización (misión §5): no global entre organizaciones
CREATE UNIQUE INDEX IF NOT EXISTS master_products_tenant_sku_unique
  ON public.master_products (tenant_id, sku);

-- Código de barras: semántica global parcial idéntica a products_barcode_unique
CREATE UNIQUE INDEX IF NOT EXISTS master_products_barcode_unique
  ON public.master_products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE INDEX IF NOT EXISTS idx_master_products_tenant_status
  ON public.master_products (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_master_products_tenant_name
  ON public.master_products (tenant_id, lower(name));

-- ─────────────────────────────────────────────────────────────────────────
-- 2) catalog_store_links — conexión tienda ↔ catálogo de su organización
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_store_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected')),
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coherencia organizacional (equivalente a un CHECK con subconsulta, que
-- PostgreSQL no permite): la tienda debe pertenecer AL MISMO tenant del link.
CREATE OR REPLACE FUNCTION public.fn_catalog_link_tenant_coherence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_store_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = NEW.store_id;
  IF v_store_tenant IS NULL OR v_store_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'ERR_TENANT_MISMATCH: la tienda % no pertenece a la organización %', NEW.store_id, NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_catalog_link_tenant_coherence ON public.catalog_store_links;
CREATE TRIGGER trg_catalog_link_tenant_coherence
  BEFORE INSERT OR UPDATE OF tenant_id, store_id ON public.catalog_store_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_catalog_link_tenant_coherence();

COMMENT ON TABLE public.catalog_store_links IS
  'Conexión de cada tienda al catálogo maestro de su organización. Desconectar conserva productos, vínculos e historial. Historial de ciclos en audit_logs.';

CREATE INDEX IF NOT EXISTS idx_catalog_store_links_tenant_status
  ON public.catalog_store_links (tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) master_change_log — auditoría de cambios de identidad YA aplicados
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_product_id UUID NOT NULL REFERENCES public.master_products(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  actor_id UUID REFERENCES public.profiles(id),
  origin_store_id UUID REFERENCES public.stores(id),
  proposal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_change_log_master
  ON public.master_change_log (master_product_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) master_change_proposals — propuestas pendientes de aprobación
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_product_id UUID NOT NULL REFERENCES public.master_products(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  proposed_by UUID NOT NULL REFERENCES public.profiles(id),
  origin_store_id UUID REFERENCES public.stores(id),
  changes JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_proposals_tenant_status
  ON public.master_change_proposals (tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) catalog_governors — capacidad organizacional de gobernar el catálogo
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.catalog_governors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  granted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE public.catalog_governors IS
  'Capacidad organizacional específica de gobernar el catálogo (misión §6). El propietario del tenant es gobernador por diseño; nadie más salvo concesión explícita. Los administradores de plataforma NO son gobernadores automáticos.';

-- ─────────────────────────────────────────────────────────────────────────
-- 6) products.master_product_id — vínculo anulable hacia la identidad
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS master_product_id UUID REFERENCES public.master_products(id);

-- Máximo UNA fila local por (maestro, tienda) — misión §4.3
CREATE UNIQUE INDEX IF NOT EXISTS products_master_store_unique
  ON public.products (master_product_id, store_id) WHERE master_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_master_product_id
  ON public.products (master_product_id) WHERE master_product_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Trigger de identidad compartida: el servidor ignora escrituras locales
--    no autorizadas sobre SKU y nombre de productos vinculados (misión §5)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_products_master_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.master_product_id IS NULL THEN
    RETURN NEW; -- producto no gestionado: coste cero, comportamiento actual
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.master_products WHERE id = NEW.master_product_id) THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: el maestro % no existe', NEW.master_product_id;
  END IF;

  -- La identidad mostrada y persistida en la fila local proviene SIEMPRE del
  -- maestro: cualquier intento de sobrescribir SKU/nombre desde la ficha
  -- local es ignorado (coerción al valor canónico).
  SELECT m.sku, m.name INTO NEW.sku, NEW.name
    FROM public.master_products m WHERE m.id = NEW.master_product_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_master_identity_guard ON public.products;
CREATE TRIGGER trg_products_master_identity_guard
  BEFORE INSERT OR UPDATE OF sku, name, master_product_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_master_identity_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 8) ensure_product_barcode: NO auto-generar código interno en filas
--    vinculadas al maestro (el código canónico vive en el maestro; la
--    reutilización legítima del mismo maestro entre tiendas no debe
--    colisionar con products_barcode_unique — misión §5, código de barras)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_product_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    BEGIN
      -- CP-CATÁLOGO (2026-10-28): filas vinculadas al catálogo maestro dejan
      -- el barcode en NULL — el código canónico reside en master_products y
      -- las búsquedas lo resuelven por el vínculo. Generar un INTERNAL aquí
      -- crearía códigos sintéticos divergentes por tienda.
      IF NEW.master_product_id IS NOT NULL THEN
        IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
          NEW.barcode_type := NULL;
        END IF;
        RETURN NEW;
      END IF;
      -- If barcode is NULL or empty, generate an internal one
      IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
        NEW.barcode := public.generate_internal_barcode();
        NEW.barcode_type := 'INTERNAL';
      ELSE
        -- If barcode was provided, check if it looks like an internal one
        IF NEW.barcode LIKE 'INT%' THEN
          NEW.barcode_type := 'INTERNAL';
        ELSIF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
          -- User provided a commercial barcode without specifying type
          -- Default to EAN13 for commercial barcodes
          NEW.barcode_type := 'EAN13';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) Helpers de capacidad (STABLE, SECURITY DEFINER, search_path fijado)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_catalog_governor(p_tenant_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.catalog_governors WHERE tenant_id = p_tenant_id AND user_id = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_catalog_store_connected(p_tenant_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.catalog_store_links
     WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND status = 'connected'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_master_catalog(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.is_admin()
    OR public.is_catalog_governor(p_tenant_id, auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.catalog_store_links l
        JOIN public.user_store_memberships m
          ON m.store_id = l.store_id AND m.user_id = auth.uid() AND m.status = 'active'
       WHERE l.tenant_id = p_tenant_id AND l.status = 'connected'
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10) RLS: habilitado desde la creación; SOLO políticas de SELECT
--     (toda escritura pasa por las RPC de 20261028112000)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.master_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_store_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_governors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_products_select ON public.master_products;
CREATE POLICY master_products_select ON public.master_products
  FOR SELECT TO authenticated
  USING (public.can_read_master_catalog(tenant_id));

DROP POLICY IF EXISTS catalog_store_links_select ON public.catalog_store_links;
CREATE POLICY catalog_store_links_select ON public.catalog_store_links
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_catalog_governor(tenant_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.tenant_id = catalog_store_links.tenant_id
    )
  );

DROP POLICY IF EXISTS master_change_log_select ON public.master_change_log;
CREATE POLICY master_change_log_select ON public.master_change_log
  FOR SELECT TO authenticated
  USING (public.can_read_master_catalog(tenant_id));

DROP POLICY IF EXISTS master_change_proposals_select ON public.master_change_proposals;
CREATE POLICY master_change_proposals_select ON public.master_change_proposals
  FOR SELECT TO authenticated
  USING (public.can_read_master_catalog(tenant_id));

DROP POLICY IF EXISTS catalog_governors_select ON public.catalog_governors;
CREATE POLICY catalog_governors_select ON public.catalog_governors
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.tenant_id = catalog_governors.tenant_id
    )
  );
-- Sin políticas INSERT/UPDATE/DELETE en las cinco tablas → escritura denegada
-- por defecto a authenticated (defensa en profundidad junto a los GRANT).

-- ─────────────────────────────────────────────────────────────────────────
-- 11) GRANTs de tabla: solo lectura para authenticated (escritura vía RPC)
-- ─────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.master_products TO authenticated;
GRANT SELECT ON public.catalog_store_links TO authenticated;
GRANT SELECT ON public.master_change_log TO authenticated;
GRANT SELECT ON public.master_change_proposals TO authenticated;
GRANT SELECT ON public.catalog_governors TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 12) Verificación post-migración fail-closed
-- ─────────────────────────────────────────────────────────────────────────
DO $verification$
DECLARE
  v_tablas INTEGER;
  v_rls_on INTEGER;
  v_policies INTEGER;
  v_col INTEGER;
  v_triggers INTEGER;
BEGIN
  SELECT count(*) INTO v_tablas FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('master_products','catalog_store_links','master_change_log','master_change_proposals','catalog_governors');
  SELECT count(*) INTO v_rls_on FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relrowsecurity = true
     AND c.relname IN ('master_products','catalog_store_links','master_change_log','master_change_proposals','catalog_governors');
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('master_products','catalog_store_links','master_change_log','master_change_proposals','catalog_governors');
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'master_product_id';
  SELECT count(*) INTO v_triggers FROM pg_trigger
   WHERE tgname IN ('trg_products_master_identity_guard','trg_catalog_link_tenant_coherence') AND NOT tgisinternal;

  IF v_tablas <> 5 OR v_rls_on <> 5 OR v_policies <> 5 OR v_col <> 1 OR v_triggers <> 2 THEN
    RAISE EXCEPTION 'GUARD modelo maestro: tablas=% rls=% policies=% columna=% triggers=% (esperado 5/5/5/1/2)', v_tablas, v_rls_on, v_policies, v_col, v_triggers;
  END IF;
  RAISE NOTICE 'Modelo maestro OK: 5 tablas con RLS (solo SELECT), products.master_product_id presente, 2 triggers de coherencia';
END
$verification$;
