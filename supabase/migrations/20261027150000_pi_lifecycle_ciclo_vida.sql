-- ══════════════════════════════════════════════════════════════════════════
-- MISIÓN CICLO DE VIDA DEL INVENTARIO FÍSICO (2026-10-27)
-- Inicio → OPERACIÓN → Almacén → Inventario Físico
--
-- Establece el ciclo de vida de 4 estados sobre el flujo interno existente
-- (9 estados internos, migración 20261023000000; gates superadmin
-- 20261027030000). Mapeo de presentación y política:
--
--   BORRADOR    = draft, prepared
--   EN PROCESO  = in_progress, counted, in_reconciliation,
--                 pending_authorization, conciliated
--   TERMINADO   = closed            (inmutable e irreversible)
--   ANULADO     = voided            (solo desde En proceso, con trazabilidad)
--
-- Cambios (mínimos e indispensables — los estados internos y las reglas de
-- negocio de conteo/conciliación/ajustes NO se tocan):
--
--   1. fn_validate_pi_transition: un Borrador (draft/prepared) ya no puede
--      anularse — de Borrador solo se sale preparando/iniciando o ELIMINANDO.
--   2. void_physical_inventory: anulación EXCLUSIVA de estados En proceso
--      (in_progress…pending_authorization). Conciliado/Cerrado/Anulado se
--      rectifican revirtiendo ajustes (regla existente).
--   3. update_physical_inventory (NUEVA): edición de datos del Borrador.
--      draft = edición completa; prepared = solo campos no congelados.
--   4. delete_physical_inventory (NUEVA): borrado DEFINITIVO del Borrador
--      sin historial de anulación (elimina cabecera, líneas, capturas,
--      hojas y eventos de auditoría del documento; verifica estado con
--      FOR UPDATE y se niega si existen ajustes vinculados).
--   5. RLS de refuerzo: UPDATE directo de tablas solo en estados editables
--      (Terminado/Anulado/Conciliado quedan inmutables también por la vía
--      de persistencia directa, no solo por RPC).
--
-- Sin cambios de datos históricos: el mapeo a los 4 estados del ciclo de
-- vida es DERIVADO (presentación), nunca reasignado. No se inventan
-- estados para registros ambiguos.
-- ══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 0. CORRECCIÓN PREVIA INDISPENSABLE — numeración por tienda (bug latente)
--
--    El trigger fn_generate_pi_number numera IF-YYYY-##### POR TIENDA y año
--    (SELECT COUNT(*)+1 WHERE store_id = NEW.store_id …), pero la restricción
--    heredada UNIQUE(pi_number) es GLOBAL: el PRIMER inventario del año de
--    una segunda tienda colisiona siempre con el 00001 de la primera
--    (duplicate key physical_inventories_pi_number_key) y la CREACIÓN falla
--    — exactamente el caso de uso multitienda del criterio de aceptación 1
--    de la misión. Se ajusta la restricción a compuesta (store_id, pi_number),
--    que es la semántica documentada del trigger. Sin cambios de datos: los
--    números existentes se conservan tal cual.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.physical_inventories
  DROP CONSTRAINT IF EXISTS physical_inventories_pi_number_key;
ALTER TABLE public.physical_inventories
  DROP CONSTRAINT IF EXISTS physical_inventories_pi_number_store_key;
ALTER TABLE public.physical_inventories
  ADD CONSTRAINT physical_inventories_pi_number_store_key UNIQUE (store_id, pi_number);

-- 0.2 Numeración robusta a ELIMINACIONES (MAX+1 en lugar de COUNT+1).
--     El trigger heredado numeraba con COUNT(*)+1 del año en curso: con la
--     eliminación de borradores (indispensable en esta misión) los números
--     se liberan y el conteo regresa sufijos ya ocupados por inventarios
--     supervivientes → duplicate key. Se pasa a MAX(sufijo)+1 por tienda y
--     año (misma semántica documentada IF-YYYY-##### por tienda/año, pero
--     sin colisiones por filas eliminadas). Verificado en vivo (batería A–K).
CREATE OR REPLACE FUNCTION public.fn_generate_pi_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_max INTEGER;
  v_year TEXT := EXTRACT(YEAR FROM NOW())::text;
BEGIN
  IF NEW.pi_number IS NULL THEN
    SELECT COALESCE(MAX(split_part(pi_number, '-', 3)::int), 0) + 1 INTO v_max
    FROM public.physical_inventories
    WHERE store_id = NEW.store_id
      AND pi_number LIKE 'IF-' || v_year || '-_____' ESCAPE '\';
    NEW.pi_number := 'IF-' || v_year || '-' || LPAD(v_max::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. TRANSICIONES VÁLIDAS — el Borrador no se anula: se elimina o se inicia
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pi_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_valid JSONB := '{
    "draft":               ["prepared"],
    "prepared":            ["in_progress"],
    "in_progress":         ["counted","voided"],
    "counted":             ["in_reconciliation","voided"],
    "in_reconciliation":   ["pending_authorization","voided"],
    "pending_authorization":["conciliated","in_reconciliation","voided"],
    "conciliated":         ["closed"],
    "closed":              [],
    "voided":               []
  }'::jsonb;
BEGIN
  IF OLD.status IS NULL OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE((v_valid -> OLD.status) ? NEW.status, false) THEN
    RAISE EXCEPTION 'ERR_INVALID_PI_TRANSITION: el inventario físico no puede pasar de % a %',
      OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pi_transition ON public.physical_inventories;
CREATE TRIGGER trg_validate_pi_transition
  BEFORE UPDATE OF status ON public.physical_inventories
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pi_transition();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. ANULACIÓN — solo inventarios En proceso (con conteo iniciado).
--    Un Borrador se ELIMINA (delete_physical_inventory), no se anula.
--    Un conciliado/cerrado se rectifica revirtiendo los ajustes generados.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_physical_inventory(
  p_pi_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_VOID_REASON_REQUIRED';
  END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status IN ('draft','prepared') THEN
    RAISE EXCEPTION 'ERR_CANNOT_VOID_STATE: un borrador (%) no se anula: elimínelo definitivamente o inicie el inventario', v_pi.status;
  END IF;
  IF v_pi.status IN ('conciliated','closed','voided') THEN
    RAISE EXCEPTION 'ERR_CANNOT_VOID_STATE: un inventario % no puede anularse; utilice la reversión de los ajustes generados', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_VOID';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'voided', voided_at = NOW(), voided_by = v_caller_uid, void_reason = p_reason
    WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_VOIDED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number, 'reason', p_reason,
                             'previous_status', v_pi.status), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'voided');
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. EDICIÓN DEL BORRADOR (NUEVA)
--    draft   → edición completa (corte, descripción, responsable, alcance,
--              modo ciego, observaciones). El alcance define los productos
--              incluidos; la teórica se congela al PREPARAR (regla vigente).
--    prepared → solo campos no congelados (descripción, responsable, modo
--              ciego, observaciones). Corte y alcance quedan fijados por la
--              instantánea congelada: cambiarlos exige eliminar y recrear.
--
--    Contrato de parámetros (la API construye el payload según el estado):
--      · draft: edición completa; los parámetros NULL mantienen el valor
--        actual (corte y alcance incluidos — actualización parcial válida).
--        El corte EFECTIVO (nuevo o vigente) no puede ser futuro.
--      · prepared: los parámetros congelados (p_cutoff_date, p_scope_type,
--        p_categories, p_product_ids) deben llegar NULL; un valor no nulo
--        distinto del actual se rechaza con ERR_FIELD_FROZEN (tamper-evidente).
--      · Textos: NULL limpia el campo (la API normaliza '' → NULL); las
--        validaciones de create (corte no futuro, alcances) se replican.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_physical_inventory(
  p_pi_id UUID,
  p_cutoff_date TIMESTAMPTZ DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_responsible_name TEXT DEFAULT NULL,
  p_scope_type TEXT DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_product_ids UUID[] DEFAULT NULL,
  p_blind_mode BOOLEAN DEFAULT NULL,
  p_observations TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_scope TEXT;
  v_cats TEXT[];
  v_prods UUID[];
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status NOT IN ('draft','prepared') THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE_STATE: solo un Borrador puede editarse (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_UPDATE_PI';
  END IF;

  IF v_pi.status = 'draft' THEN
    -- Edición completa: los campos NULL conservan el valor vigente
    v_scope := COALESCE(p_scope_type, v_pi.scope_type);
    IF COALESCE(p_cutoff_date, v_pi.cutoff_date) > NOW() THEN
      RAISE EXCEPTION 'ERR_INVALID_CUTOFF_DATE: la fecha de corte no puede ser futura';
    END IF;
    IF v_scope NOT IN ('full','category','selection') THEN
      RAISE EXCEPTION 'ERR_INVALID_SCOPE';
    END IF;
    v_cats := CASE WHEN v_scope = 'category' THEN COALESCE(p_categories, v_pi.scope_category_names) END;
    v_prods := CASE WHEN v_scope = 'selection' THEN COALESCE(p_product_ids, v_pi.scope_products) END;
    IF v_scope = 'category' AND (v_cats IS NULL OR array_length(v_cats, 1) = 0) THEN
      RAISE EXCEPTION 'ERR_SCOPE_CATEGORIES_REQUIRED';
    END IF;
    IF v_scope = 'selection' AND (v_prods IS NULL OR array_length(v_prods, 1) = 0) THEN
      RAISE EXCEPTION 'ERR_SCOPE_PRODUCTS_REQUIRED';
    END IF;

    UPDATE public.physical_inventories
      SET cutoff_date = COALESCE(p_cutoff_date, v_pi.cutoff_date),
          description = p_description,
          responsible_name = p_responsible_name,
          scope_type = v_scope,
          scope_category_names = v_cats,
          scope_products = v_prods,
          blind_mode = COALESCE(p_blind_mode, v_pi.blind_mode),
          observations = p_observations
    WHERE id = p_pi_id;
  ELSE
    -- prepared: la instantánea ya está congelada — corte/alcance intocables
    IF (p_cutoff_date IS NOT NULL AND p_cutoff_date <> v_pi.cutoff_date)
       OR (p_scope_type IS NOT NULL AND p_scope_type <> v_pi.scope_type)
       OR (p_categories IS NOT NULL)
       OR (p_product_ids IS NOT NULL) THEN
      RAISE EXCEPTION 'ERR_FIELD_FROZEN: la fecha de corte y el alcance quedaron congelados al preparar; elimine el borrador y créelo de nuevo si deben cambiar';
    END IF;

    UPDATE public.physical_inventories
      SET description = p_description,
          responsible_name = p_responsible_name,
          blind_mode = COALESCE(p_blind_mode, v_pi.blind_mode),
          observations = p_observations
    WHERE id = p_pi_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_UPDATED', 'physical_inventories', p_pi_id,
          jsonb_build_object('cutoff_date', v_pi.cutoff_date, 'description', v_pi.description,
                             'responsible_name', v_pi.responsible_name, 'scope_type', v_pi.scope_type,
                             'blind_mode', v_pi.blind_mode),
          jsonb_build_object('cutoff_date', p_cutoff_date, 'description', p_description,
                             'responsible_name', p_responsible_name, 'scope_type', p_scope_type,
                             'blind_mode', p_blind_mode),
          v_pi.store_id);

  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. BORRADO DEFINITIVO DEL BORRADOR (NUEVA)
--
--    Regla de la misión §2/ESTADO 1: eliminar un Borrador es un borrado
--    DEFINITIVO, SIN registro histórico de anulación o eliminación. Se
--    aplica exclusivamente a draft/prepared (verificado con FOR UPDATE
--    dentro de la transacción: si el inventario ya inició, se rechaza).
--
--    Efectos: desaparecen cabecera, líneas, historial de capturas, hojas de
--    conteo y los eventos de auditoría del documento. Sin efectos sobre
--    existencias (un Borrador jamás genera movimientos: los ajustes solo
--    nacen al conciliar). Se niega si existieran ajustes vinculados
--    (defensa en profundidad: en draft/prepared no pueden existir).
--
--    NOTA AUDITABLE: no se emite evento PHYSICAL_INVENTORY_DELETED — el
--    borrado de un borrador no deja rastro de anulación por diseño (misión).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_physical_inventory(
  p_pi_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status NOT IN ('draft','prepared') THEN
    RAISE EXCEPTION 'ERR_CANNOT_DELETE_STATE: solo un Borrador puede eliminarse definitivamente (estado actual: %); un inventario iniciado se anula con trazabilidad y uno terminado es inmutable', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DELETE_PI';
  END IF;
  IF EXISTS (SELECT 1 FROM public.physical_inventory_adjustments WHERE pi_id = p_pi_id)
     OR EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE source_physical_inventory_id = p_pi_id) THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_LINKED: el inventario tiene ajustes documentales vinculados y no puede eliminarse';
  END IF;

  -- Limpieza de registros asociados al documento (sin líneas/log/hojas
  -- huérfanas ni eventos parciales de auditoría).
  DELETE FROM public.audit_logs
   WHERE table_name = 'physical_inventories' AND record_id = p_pi_id;
  DELETE FROM public.physical_inventories WHERE id = p_pi_id;
  -- items / count_log / sheets caen por ON DELETE CASCADE.

  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id,
                            'pi_number', v_pi.pi_number);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RLS DE REFUERZO — inmutabilidad real en la capa de persistencia
--
--    La matriz de la misión no puede depender solo de la interfaz ni de las
--    RPC: la escritura DIRECTA de tablas (PostgREST/supabase client) también
--    queda acotada por estado. Las RPC SECURITY DEFINER del módulo no se
--    ven afectadas (bypassan RLS y validan estado con FOR UPDATE).
--
--    Estados editables por vía directa: draft, prepared (datos del borrador)
--    e in_progress (datos operativos durante el conteo). Terminado (closed),
--    Anulado (voided) y Conciliado (conciliated, a la espera de cierre)
--    quedan INMUTABLES también por esta vía.
-- ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS physical_inventories_update ON public.physical_inventories;
CREATE POLICY physical_inventories_update ON public.physical_inventories
  FOR UPDATE TO authenticated
  USING (status IN ('draft','prepared','in_progress')
         AND (public.is_admin()
              OR public.has_store_role(store_id, ARRAY['admin','manager','encargado']::text[])))
  WITH CHECK (status IN ('draft','prepared','in_progress')
              AND (public.is_admin()
                   OR public.has_store_role(store_id, ARRAY['admin','manager','encargado']::text[])));
-- Sin política DELETE → denegado (el borrado definitivo SOLO existe como
-- RPC controlada que verifica estado + permisos; sigue denegado aquí).

DROP POLICY IF EXISTS physical_inventory_items_insert ON public.physical_inventory_items;
CREATE POLICY physical_inventory_items_insert ON public.physical_inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND pi.status IN ('draft','prepared','in_progress')
        AND (public.is_admin()
             OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[]))
    )
  );

DROP POLICY IF EXISTS physical_inventory_items_update ON public.physical_inventory_items;
CREATE POLICY physical_inventory_items_update ON public.physical_inventory_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND pi.status IN ('draft','prepared','in_progress')
        AND (public.is_admin()
             OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[]))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physical_inventories pi
      WHERE pi.id = physical_inventory_items.pi_id
        AND pi.status IN ('draft','prepared','in_progress')
        AND (public.is_admin()
             OR public.has_store_role(pi.store_id, ARRAY['admin','manager','encargado']::text[]))
    )
  );
-- Sin política DELETE en items → denegado (ídem cabecera).

-- ──────────────────────────────────────────────────────────────────────────
-- 6. GRANTS / REVOKES (patrón anti-spoofing del módulo)
-- ──────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.update_physical_inventory(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], UUID[], BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_physical_inventory(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_physical_inventory(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], UUID[], BOOLEAN, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_physical_inventory(UUID, UUID) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
