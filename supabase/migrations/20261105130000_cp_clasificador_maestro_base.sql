-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CLASIFICADOR MAESTRO DE CLIENTES Y PROVEEDORES — FASE 3 (1/2): BASE
-- master_parties · party_store_links · party_change_log ·
-- classification (generada) · RLS · ACL endurecida · audit_logs CHECK
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO DE ADOPTAR-Y-EVOLUCIONAR (FASE 1 · auditoría de producción):
--   En producción ya existía un BORRADOR de esta misma misión aplicado fuera
--   del control de versiones (sin migración en el repo): tablas
--   master_parties / party_store_links / party_change_log con 2 registros
--   reales (CL-0001, PR-0001), 1 conexión de tienda y sus RPCs. El repo NO
--   referenciaba nada de ello (grep 0 resultados). REGLA DE LA MISIÓN: no
--   destruir datos ni historial → esta migración ADOPTA ese estado y lo pone
--   bajo control de versiones, EVOLUCIONANDOLO a los requisitos exigidos:
--     · Columna generada `classification` ('cliente'|'proveedor'|'ambos')
--       derivada de is_client/is_supplier (identidad ≠ clasificación
--       comercial; una persona puede ser ambos).
--     · ACL endurecida al patrón Catálogo Maestro (solo SELECT para clientes;
--       la escritura vive en las RPC SECURITY DEFINER de 20261105130100).
--       Antes: grants por defecto (INSERT/UPDATE/DELETE/TRUNCATE a anon y
--       authenticated) mitigados por RLS pero contrarios al patrón del repo.
--     · audit_logs_store_id_check tolera master_parties (lección CP-CAT-004).
--   · El maestro porta SOLO identidad (código, nombre, contacto, NIT/CI,
--     tipo de persona, observaciones) por ORGANIZACIÓN (tenant_id). NUNCA
--     saldos, cuentas corrientes ni datos comerciales/contables: las
--     operaciones comerciales y contables permanecen POR TIENDA.
--   · party_store_links: conexión explícita por (tenant, store), 1 fila por
--     tienda; desconectar NO borra registros ni historial.
--   · party_change_log: trazabilidad de modificaciones por campo (misión).
--   · Estado del registro: 'active' (activo) / 'archived' (desactivado).
--     Registros CON historial comercial JAMÁS se eliminan físicamente
--     (guard en delete_master_party, 20261105130100).
--   · Las filas locales de tiendas (customers/suppliers) llevan la columna
--     master_party_id como referencia opcional (patrón products.master_product_id).
-- REVERSIBILIDAD: DROP de tablas/columna/funciones/constraint restaura el
--   estado previo; ninguna fila de tablas existentes se reescribe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) master_parties — identidad canónica de clientes y proveedores por org
--    (reconstrucción idempotente: en producción ya existe y se conserva)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  code TEXT NOT NULL CHECK (code <> '' AND btrim(code) = code),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_id TEXT,
  party_type TEXT NOT NULL DEFAULT 'natural' CHECK (party_type IN ('natural','juridica')),
  is_client BOOLEAN NOT NULL DEFAULT true,
  is_supplier BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT master_parties_kind_required CHECK (is_client = true OR is_supplier = true)
);

COMMENT ON TABLE public.master_parties IS
  'Clasificador Maestro de Clientes y Proveedores (FASE 3): identidad compartida por organización. Clasificación comercial declarativa (is_client/is_supplier → classification generada cliente/proveedor/ambos). Sin datos comerciales ni contables. Escritura solo vía RPC gobernadas; registros con historial comercial jamás se eliminan físicamente.';

CREATE UNIQUE INDEX IF NOT EXISTS master_parties_tenant_code_unique
  ON public.master_parties (tenant_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS master_parties_tenant_taxid_unique
  ON public.master_parties (upper(btrim(tax_id)))
  WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';
CREATE INDEX IF NOT EXISTS idx_master_parties_tenant_status
  ON public.master_parties (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_master_parties_tenant_name
  ON public.master_parties (tenant_id, lower(name));

-- ─────────────────────────────────────────────────────────────────────────
-- 2) party_store_links — conexión tienda ↔ clasificador de su organización
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.party_store_links (
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

COMMENT ON TABLE public.party_store_links IS
  'Conexión de cada tienda al Clasificador Maestro de Clientes y Proveedores de su organización. Desconectar conserva registros, referencias e historial. Ciclo de conexión en audit_logs.';

CREATE INDEX IF NOT EXISTS idx_party_store_links_tenant
  ON public.party_store_links (tenant_id, status);

-- Coherencia organizacional: la tienda debe pertenecer AL MISMO tenant.
CREATE OR REPLACE FUNCTION public.fn_party_link_tenant_coherence()
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

DROP TRIGGER IF EXISTS trg_party_link_tenant_coherence ON public.party_store_links;
CREATE TRIGGER trg_party_link_tenant_coherence
  BEFORE INSERT OR UPDATE OF tenant_id, store_id ON public.party_store_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_party_link_tenant_coherence();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) party_change_log — trazabilidad de modificaciones por campo (misión)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.party_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_party_id UUID NOT NULL REFERENCES public.master_parties(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  actor_id UUID REFERENCES public.profiles(id),
  origin_store_id UUID REFERENCES public.stores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.party_change_log IS
  'Trazabilidad de modificaciones del Clasificador Maestro: una fila por campo cambiado (old → new, actor, tienda de origen).';

CREATE INDEX IF NOT EXISTS idx_party_change_log_party
  ON public.party_change_log (master_party_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) EVOLUCIÓN: classification generada (cliente/proveedor/ambos)
--    Columna GENERADA ALWAYS AS … STORED: siempre coherente con
--    is_client/is_supplier (una sola fuente de verdad, cero triggers de sync).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.master_parties
  ADD COLUMN IF NOT EXISTS classification TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN is_client AND is_supplier THEN 'ambos'
      WHEN is_client THEN 'cliente'
      WHEN is_supplier THEN 'proveedor'
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN public.master_parties.classification IS
  'Clasificación comercial (generada): cliente | proveedor | ambos. Derivada de is_client/is_supplier — la identidad del tercero es una, la clasificación comercial es declarativa y admite ambos roles.';

CREATE INDEX IF NOT EXISTS idx_master_parties_tenant_class_status
  ON public.master_parties (tenant_id, classification, status);

-- updated_at (reconstrucción del trigger existente)
CREATE OR REPLACE FUNCTION public.fn_master_parties_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.updated_at = OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_master_parties_touch_updated_at ON public.master_parties;
CREATE TRIGGER trg_master_parties_touch_updated_at
  BEFORE UPDATE OF name, code, address, phone, email, tax_id, party_type, is_client, is_supplier, status, notes
  ON public.master_parties
  FOR EACH ROW EXECUTE FUNCTION public.fn_master_parties_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Helpers de capacidad (STABLE, SECURITY DEFINER, search_path fijado)
--    Gobernanza: la misma capacidad del Catálogo Maestro (propietario del
--    tenant + catalog_governors) — una sola gobernanza para los dos maestros.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_party_store_connected(p_tenant_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.party_store_links
     WHERE tenant_id = p_tenant_id AND store_id = p_store_id AND status = 'connected'
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_read_master_parties(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_admin()
    OR public.is_catalog_governor(p_tenant_id, auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.party_store_links l
        JOIN public.user_store_memberships m
          ON m.store_id = l.store_id AND m.user_id = auth.uid() AND m.status = 'active'
       WHERE l.tenant_id = p_tenant_id AND l.status = 'connected'
    );
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) RLS: habilitado; SOLO políticas de SELECT (escritura vía RPC)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.master_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_store_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_parties_select ON public.master_parties;
CREATE POLICY master_parties_select ON public.master_parties
  FOR SELECT TO authenticated
  USING (public.can_read_master_parties(tenant_id));

DROP POLICY IF EXISTS party_store_links_select ON public.party_store_links;
CREATE POLICY party_store_links_select ON public.party_store_links
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_catalog_governor(tenant_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.tenant_id = party_store_links.tenant_id
    )
  );

DROP POLICY IF EXISTS party_change_log_select ON public.party_change_log;
CREATE POLICY party_change_log_select ON public.party_change_log
  FOR SELECT TO authenticated
  USING (public.can_read_master_parties(tenant_id));

-- Sin políticas INSERT/UPDATE/DELETE → escritura denegada por defecto.
-- REGLA 8 de la misión: ninguna política existente se modifica ni debilita.

-- ─────────────────────────────────────────────────────────────────────────
-- 7) ACL endurecida al patrón Catálogo Maestro (solo SELECT). Los grants por
--    defecto de las tablas preexistentes (INSERT/UPDATE/DELETE/TRUNCATE a
--    anon/authenticated) quedaban mitigados por RLS; se dejan SIN ambigüedad.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.master_parties FROM anon, authenticated;
REVOKE ALL ON public.party_store_links FROM anon, authenticated;
REVOKE ALL ON public.party_change_log FROM anon, authenticated;
GRANT SELECT ON public.master_parties TO authenticated, service_role;
GRANT SELECT ON public.party_store_links TO authenticated, service_role;
GRANT SELECT ON public.party_change_log TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) audit_logs_store_id_check: tolerar table_name='master_parties' con
--    store_id NULL (operaciones a nivel organización, lección CP-CAT-004).
-- ─────────────────────────────────────────────────────────────────────────
DO $fix$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'audit_logs_store_id_check'
     AND conrelid = 'public.audit_logs'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CP-CLASIFICADOR: audit_logs_store_id_check no existe (esquema inesperado)';
  END IF;
  IF v_def NOT LIKE '%master_parties%' THEN
    ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_store_id_check;
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_store_id_check
      CHECK (
        store_id IS NOT NULL
        OR table_name = ANY (ARRAY['profiles'::text, 'stores'::text, 'system'::text, 'master_products'::text, 'master_parties'::text])
      );
  END IF;
END
$fix$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) Verificación post-migración fail-closed
-- ─────────────────────────────────────────────────────────────────────────
DO $verification$
DECLARE
  v_tablas INTEGER;
  v_rls_on INTEGER;
  v_policies INTEGER;
  v_col INTEGER;
  v_check_def text;
  v_anon_writable INTEGER;
BEGIN
  SELECT count(*) INTO v_tablas FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('master_parties','party_store_links','party_change_log');
  SELECT count(*) INTO v_rls_on FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relrowsecurity = true
     AND c.relname IN ('master_parties','party_store_links','party_change_log');
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('master_parties','party_store_links','party_change_log');
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'master_parties' AND column_name = 'classification';
  SELECT pg_get_constraintdef(oid) INTO v_check_def FROM pg_constraint
   WHERE conname = 'audit_logs_store_id_check' AND conrelid = 'public.audit_logs'::regclass;
  SELECT count(*) INTO v_anon_writable FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND table_name IN ('master_parties','party_store_links','party_change_log')
     AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');

  IF v_tablas <> 3 OR v_rls_on <> 3 OR v_policies <> 3 OR v_col <> 1 THEN
    RAISE EXCEPTION 'GUARD clasificador maestro: tablas=% rls=% policies=% classification=% (esperado 3/3/3/1)', v_tablas, v_rls_on, v_policies, v_col;
  END IF;
  IF v_check_def IS NULL OR v_check_def NOT LIKE '%master_parties%' THEN
    RAISE EXCEPTION 'GUARD clasificador maestro: audit_logs_store_id_check no tolera master_parties';
  END IF;
  IF v_anon_writable <> 0 THEN
    RAISE EXCEPTION 'GUARD clasificador maestro: anon conserva permisos de escritura (ACL no endurecida)';
  END IF;
  RAISE NOTICE 'Clasificador Maestro OK: 3 tablas con RLS solo-SELECT, classification generada, ACL endurecida, audit CHECK ampliado';
END
$verification$;
