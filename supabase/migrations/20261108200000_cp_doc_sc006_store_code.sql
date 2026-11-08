-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-DOC-SC-DATA-MAPPING-006 · PARTE 1 — CÓDIGO CONSECUTIVO DE TIENDA
-- ═══════════════════════════════════════════════════════════════════════════
-- OBJETIVO: cada tienda de COSTPRO dispone de un código documental numérico
--   consecutivo y PERSISTENTE, usado por los modelos SC (Res. 11/2007 MFP)
--   como «Código de la entidad receptora» y «Código del almacén receptor».
--
-- DISEÑO (auditoría CP-DOC-SC-DATA-MAPPING-006 §2):
--   * No existía NINGÚN campo de consecutivo en stores (solo slug único y
--     nit fiscal). Se añade una columna NUEVA aditiva — no se sobrescribe
--     ningún identificador existente (id uuid, slug, nit quedan intactos).
--   * ÁMBITO DE UNICIDAD = TENANT (organización). COSTPRO es multi-tenant
--     (stores.tenant_id → tenants) y la cuota de tiendas es por tenant;
--     el precedente interno master_parties.code también numera por tenant.
--     Las tiendas legacy sin tenant_id comparten el ámbito pseudo-tenant
--     00000000-0000-0000-0000-000000000000 (bucket estable, sin FK).
--   * ASIGNACIÓN = trigger BEFORE INSERT (base de datos, transaccional):
--     nunca MAX()+1 desde el frontend. La serialización usa el MISMO
--     pg_advisory_xact_lock('tenant_stores:<tenant>') que ya toma
--     create_store_with_membership (REM-INV-5); los advisory xact locks son
--     reentrantes dentro de la misma transacción, por lo que NO hay deadlock
--     y dos creaciones concurrentes del mismo tenant quedan serializadas.
--     La función es SECURITY DEFINER porque el SELECT MAX debe ver TODAS las
--     tiendas del tenant (con RLS, un gestor que crea una tienda nueva no es
--     aún miembro y vería un máximo vacío → colisión).
--   * Una tienda creada CON store_code explícito lo conserva intacto
--     (semilla/E2E); un duplicado explícito falla por el índice único.
--   * REGULARIZACIÓN: las tiendas existentes (todas nacen sin código por ser
--     columna nueva) reciben consecutivo en orden de creación (created_at,
--     id) DENTRO de esta misma migración, transaccionalmente, y cada
--     asignación queda auditada en audit_logs. Los códigos son estables
--     durante la vida de la tienda: no hay proceso que los reasigne.
--
-- IDEMPOTENCIA: re-ejecutable (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO
--   NOTHING); la regularización solo toca filas con store_code IS NULL.
-- REVERSIBILIDAD (no destructiva sobre datos comerciales):
--   DROP TRIGGER IF EXISTS trg_stores_assign_store_code ON public.stores;
--   DROP FUNCTION IF EXISTS public.assign_store_code();
--   DROP INDEX IF EXISTS public.stores_tenant_store_code_unique;
--   ALTER TABLE public.stores DROP COLUMN IF EXISTS store_code;
-- DESPLIEGUE: NO aplicar a producción sin autorización expresa del
--   propietario (misión §14). Validado en el proyecto aislado E2E.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columna nueva (aditiva) ──────────────────────────────────────────────
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_code integer;
COMMENT ON COLUMN public.stores.store_code IS
  'CP-DOC-SC-DATA-MAPPING-006: código documental consecutivo de la tienda por tenant (ámbito: tenant_id; legacy sin tenant → bucket 00000000-0000-0000-0000-000000000000). Asignado por trg_stores_assign_store_code al crear; estable durante la vida de la tienda. Lo consumen los modelos SC-2-xx como código de entidad receptora / almacén.';

-- ── 2. Trigger de asignación (backend = base de datos, transaccional) ──────
CREATE OR REPLACE FUNCTION public.assign_store_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_scope uuid := COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_lock_key text := 'tenant_stores:' || COALESCE(NEW.tenant_id::text, 'null');
  v_next integer;
BEGIN
  -- Una tienda con código explícito lo conserva (semillas, E2E, regularización).
  IF NEW.store_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialización por tenant (reentrante con create_store_with_membership).
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  -- MAX()+1 es seguro AQUÍ: la serialización por tenant ya excluye la
  -- carrera (dos transacciones simultáneas no leen el mismo máximo).
  SELECT COALESCE(MAX(s.store_code), 0) + 1 INTO v_next
    FROM public.stores s
   WHERE COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_scope;

  NEW.store_code := v_next;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stores_assign_store_code ON public.stores;
CREATE TRIGGER trg_stores_assign_store_code
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_store_code();

-- ── 3. Unicidad (expresión: cubre tenant_id NULL del legacy) ────────────────
CREATE UNIQUE INDEX IF NOT EXISTS stores_tenant_store_code_unique
  ON public.stores (
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    store_code
  )
  WHERE store_code IS NOT NULL;

-- ── 4. Regularización transaccional de tiendas existentes sin código ───────
-- Orden de creación (created_at, id): la tienda más antigua del tenant = 1.
-- No se modifica ningún dato comercial; solo la columna nueva.
WITH scope AS (
  SELECT s.id,
         COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS scope_id,
         (ROW_NUMBER() OVER (
            PARTITION BY COALESCE(s.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
            ORDER BY s.created_at ASC NULLS LAST, s.id ASC
          ))::integer AS new_code
    FROM public.stores s
   WHERE s.store_code IS NULL
), updated AS (
  UPDATE public.stores st
     SET store_code = scope.new_code
    FROM scope
   WHERE st.id = scope.id
  RETURNING st.id, st.store_code, st.tenant_id
)
INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, metadata)
SELECT 'stores',
       u.id,
       'STORE_CODE_REGULARIZED',
       jsonb_build_object('store_code', NULL),
       jsonb_build_object('store_code', u.store_code),
       jsonb_build_object(
         'mission', 'CP-DOC-SC-DATA-MAPPING-006',
         'scope', COALESCE(u.tenant_id::text, '00000000-0000-0000-0000-000000000000'),
         'source', 'migration_regularization'
       )
  FROM updated u;

-- ── 5. Validaciones de integridad (abortan la migración si fallan) ─────────
DO $$
BEGIN
  -- 5a. Tras la regularización no quedan tiendas sin código.
  IF EXISTS (SELECT 1 FROM public.stores WHERE store_code IS NULL) THEN
    RAISE EXCEPTION 'STORE_CODE_REGULARIZATION_INCOMPLETE: quedan tiendas sin store_code';
  END IF;

  -- 5b. Sin duplicados dentro del ámbito de unicidad (por si el índice no
  --     existiera aún en algún entorno heredado).
  IF EXISTS (
    SELECT 1 FROM public.stores
     GROUP BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), store_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'STORE_CODE_DUPLICATES: códigos duplicados dentro del ámbito tenant';
  END IF;
END;
$$;

-- Historial de auditoría: las asignaciones de regularización quedan en
-- audit_logs (action = STORE_CODE_REGULARIZED). Las asignaciones futuras por
-- el trigger no auditan fila a fila para no duplicar la auditoría INSERT de
-- stores (trigger_audit_store_changes) que ya registra la creación completa.
