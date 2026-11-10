-- =====================================================================
-- 20261110120000_cp_plantillas_privadas_propietario.sql — FASE 2 PLANTILLAS
-- ============================================================================
-- CP-PLANTILLAS-FASE2 (ETAPA 2): completar el sistema de plantillas de
-- fichas de costo. La tabla cost_sheet_templates YA tiene las columnas
-- necesarias (type, created_by, store_id) — esta migración NO cambia
-- columnas ni toca datos: solo ajusta POLÍTICAS RLS para que el
-- propietario pueda gestionar sus plantillas privadas, y codifica el
-- drift detectado por la auditoría FASE 1 (rem-inv-4 / 3add529c4).
--
-- ESTADO INICIAL VERIFICADO (producción y CostproE2E, 2026-11-10):
--   "Templates visibility" SELECT TO public:
--     (type='system') OR is_admin()
--     OR (type='public' AND (store_id IS NULL OR has_store_access(store_id)))
--     OR (type='private' AND created_by=auth.uid())
--   "Templates insert"  INSERT TO authenticated WITH CHECK is_admin()
--   "Templates update"  UPDATE TO authenticated USING is_admin() WITH CHECK is_admin()
--   "Templates delete"  DELETE TO authenticated USING is_admin()
--
-- DRIFT REGULARIZADO: la política SELECT vigente (variante has_store_access,
-- bypass is_admin, rol public) NO estaba en ninguna migración del repo —
-- fue aplicada out-of-band. Esta migración la codifica TAL CUAL está en
-- producción (sin eliminar ningún permiso válido: definición idéntica).
--
-- CAMBIOS:
--   1) SELECT  — sin cambios semánticos (regularización documental del drift).
--   2) INSERT  — admin (como hoy) O propietario creando plantilla privada
--                propia con store_id NULL. La publicación pública sigue
--                restringida a admin/superadmin vía is_admin().
--   3) UPDATE  — dividida en dos políticas permisivas (OR):
--                a) admin (semántica actual intacta: gestionar públicas,
--                   publicar/despublicar, cambiar tienda);
--                b) propietario de plantilla PRIVADA: USING exige fila
--                   actual (created_by=auth.uid() AND type='private');
--                   WITH CHECK exige fila nueva (created_by=auth.uid()
--                   AND type='private' AND store_id IS NULL) → un usuario
--                   normal NO puede cambiar created_by (transferir
--                   propiedad), NO puede pasar private→public (publicar),
--                   NO puede pasar private→system, NI colgar un store_id.
--                   Solo puede cambiar name/description/category/data.
--   4) DELETE  — admin (como hoy) O propietario de su plantilla privada.
--                Eliminar plantillas públicas sigue siendo solo admin.
--   5) Trigger updated_at — mantiene updated_at al día en cada UPDATE
--                (la UI muestra "Actualizado"). Sin cambios de columnas.
--
-- PROTECCIÓN DE TRANSICIONES (publicar / retirar publicación):
--   Publicar = UPDATE del MISMO registro (type private→public + store_id)
--   → solo pasa por la política admin (is_admin). Nunca crea duplicados.
--   Retirar publicación = UPDATE (type public→private) → también admin;
--   conserva id, created_by y data.
--
-- NO TOCA: políticas de otras tablas, is_admin(), has_store_access(),
-- store_cost_templates (otro proceso funcional), estructura de columnas.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE
-- FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- =====================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- GUARD DE CONTEXTO: la tabla y las funciones de seguridad deben existir
-- con la forma esperada (fail-closed si el entorno no es el auditado).
-- ─────────────────────────────────────────────────────────────────────
DO $plantillas_f2$
DECLARE
  v_faltan_columnas text;
BEGIN
  -- La tabla debe existir (fue creada out-of-band en feb-2026).
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cost_sheet_templates') THEN
    RAISE EXCEPTION 'PLANTILLAS-F2-GUARD: falta public.cost_sheet_templates — revisar drift antes de aplicar';
  END IF;

  -- Columnas obligatorias del contrato de la FASE 1.
  SELECT string_agg(c, ', ') INTO v_faltan_columnas
    FROM unnest(ARRAY['id','name','description','category','data','type','created_by','store_id','created_at','updated_at']) AS c
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cost_sheet_templates' AND column_name = c);
  IF v_faltan_columnas IS NOT NULL THEN
    RAISE EXCEPTION 'PLANTILLAS-F2-GUARD: cost_sheet_templates carece de columnas obligatorias (%): revisar drift', v_faltan_columnas;
  END IF;

  -- is_admin() debe existir (reconoce admin+superadmin desde 20261026120000).
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                 WHERE n.nspname = 'public' AND p.proname = 'is_admin') THEN
    RAISE EXCEPTION 'PLANTILLAS-F2-GUARD: falta public.is_admin() — no se puede relajar la seguridad de publicación';
  END IF;

  -- has_store_access() debe existir (usada por la política SELECT vigente).
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                 WHERE n.nspname = 'public' AND p.proname = 'has_store_access') THEN
    RAISE EXCEPTION 'PLANTILLAS-F2-GUARD: falta public.has_store_access() — no se puede recrear la política SELECT vigente';
  END IF;

  -- RLS debe seguir habilitado (nunca relajar).
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cost_sheet_templates' AND rowsecurity) THEN
    RAISE EXCEPTION 'PLANTILLAS-F2-GUARD: RLS de cost_sheet_templates NO está habilitado — abortando';
  END IF;
END
$plantillas_f2$;

-- ─────────────────────────────────────────────────────────────────────
-- 1) SELECT — regularización del drift: definición IDÉNTICA a la vigente
--    en producción (verificada 2026-11-10 vía pg_policies). No elimina
--    ningún permiso válido; documenta en el repo lo que la BD ya aplica.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Templates visibility" ON public.cost_sheet_templates;

CREATE POLICY "Templates visibility" ON public.cost_sheet_templates
  FOR SELECT TO public
  USING (
    (type = 'system'::text)
    OR is_admin()
    OR (type = 'public'::text AND (store_id IS NULL OR has_store_access(store_id)))
    OR (type = 'private'::text AND created_by = auth.uid())
  );

COMMENT ON POLICY "Templates visibility" ON public.cost_sheet_templates IS
  'SELECT: system visible a todos; admin ve todo; public visible si es global o el usuario tiene acceso a la tienda (has_store_access); private solo su propietario. Regulariza el drift out-of-band detectado por FASE 1 (rem-inv-4).';

-- ─────────────────────────────────────────────────────────────────────
-- 2) INSERT — admins como hoy; los usuarios autenticados además pueden
--    crear plantillas PRIVADAS propias (created_by=auth.uid(),
--    type=''private'', store_id NULL). Un usuario normal NO puede
--    insertar type=''public'' ni ''system'' (la publicación queda en
--    manos de admin/superadmin vía is_admin()).
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Templates insert" ON public.cost_sheet_templates;

CREATE POLICY "Templates insert" ON public.cost_sheet_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (auth.uid() = created_by AND type = 'private'::text AND store_id IS NULL)
  );

COMMENT ON POLICY "Templates insert" ON public.cost_sheet_templates IS
  'INSERT: admins sin cambios; usuarios autenticados solo plantillas privadas propias sin tienda. Publicación pública restringida a admin/superadmin.';

-- ─────────────────────────────────────────────────────────────────────
-- 3) UPDATE — dos políticas permisivas (OR):
--    a) admin: semántica actual (gestión completa: publicar, retirar,
--       cambiar tienda, editar públicas).
--    b) propietario-privada: solo sus plantillas privadas; la fila nueva
--       debe seguir siendo privada, propia y sin tienda → impide
--       transferir created_by, publicar (private→public), convertir a
--       system o alterar el ámbito con modificaciones directas.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Templates update" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates update admin" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates update owner private" ON public.cost_sheet_templates;

CREATE POLICY "Templates update admin" ON public.cost_sheet_templates
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

COMMENT ON POLICY "Templates update admin" ON public.cost_sheet_templates IS
  'UPDATE (admin/superadmin): gestión completa incluida publicación/retirada (transición private↔public del MISMO registro) y ámbito de tienda.';

CREATE POLICY "Templates update owner private" ON public.cost_sheet_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND type = 'private'::text)
  WITH CHECK (auth.uid() = created_by AND type = 'private'::text AND store_id IS NULL);

COMMENT ON POLICY "Templates update owner private" ON public.cost_sheet_templates IS
  'UPDATE (propietario): solo plantillas privadas propias. La fila nueva debe conservar created_by, type=private y store_id NULL → imposible transferir propiedad, publicar o convertir a sistema desde el cliente.';

-- ─────────────────────────────────────────────────────────────────────
-- 4) DELETE — admins como hoy; el propietario además puede eliminar SUS
--    plantillas privadas. Eliminar plantillas públicas sigue siendo
--    exclusivo de admin/superadmin.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Templates delete" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates delete admin" ON public.cost_sheet_templates;
DROP POLICY IF EXISTS "Templates delete owner private" ON public.cost_sheet_templates;

CREATE POLICY "Templates delete admin" ON public.cost_sheet_templates
  FOR DELETE TO authenticated
  USING (is_admin());

COMMENT ON POLICY "Templates delete admin" ON public.cost_sheet_templates IS
  'DELETE (admin/superadmin): sin cambios respecto al estado anterior.';

CREATE POLICY "Templates delete owner private" ON public.cost_sheet_templates
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by AND type = 'private'::text);

COMMENT ON POLICY "Templates delete owner private" ON public.cost_sheet_templates IS
  'DELETE (propietario): solo sus plantillas privadas. Las públicas solo las eliminan admins.';

-- ─────────────────────────────────────────────────────────────────────
-- 5) Trigger updated_at — mantiene el sello temporal al día en cada
--    UPDATE (renombrar, actualizar contenido, publicar, retirar, cambiar
--    tienda). No cambia columnas ni datos existentes.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cost_sheet_templates_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cost_sheet_templates_touch_updated_at ON public.cost_sheet_templates;

CREATE TRIGGER trg_cost_sheet_templates_touch_updated_at
  BEFORE UPDATE ON public.cost_sheet_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.cost_sheet_templates_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN POST-MIGRACIÓN (documentada; se ejecuta aparte en E2E):
--   · pg_policies debe mostrar exactamente 6 políticas en la tabla:
--     Templates visibility / insert / update admin / update owner private /
--     delete admin / delete owner private.
--   · Usuario normal: INSERT private propia OK; INSERT public/ajena/system
--     denegado; UPDATE propia private OK (solo name/description/category/
--     data); UPDATE que toque created_by/type/store_id denegado; DELETE
--     propia private OK; DELETE pública denegado; SELECT solo las suyas +
--     públicas autorizadas + system.
--   · Admin/superadmin: todo lo anterior de gestión (incluida transición
--     private→public y vuelta) sin depender de membresía de tienda.
-- ─────────────────────────────────────────────────────────────────────

COMMIT;
