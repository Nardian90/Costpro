-- ═══════════════════════════════════════════════════════════════════════════
-- CP-SEC-PAYROLL — PRIVACIDAD DE NÓMINAS: VERIFICACIÓN DE ROL EN RLS Y RPC
-- Misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 (2026-11-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DEFECTO (verificado en producción 2026-11-14 [MEDIDO], fase 1):
--   Las 4 políticas de la migración 20261112180000 (payrolls, payroll_items,
--   payroll_item_concepts, worker_salary_rates) comprueban ÚNICAMENTE la
--   membresía de tienda (store_id = ANY(current_user_store_ids())) y el rol
--   `authenticated` tiene GRANT SELECT: cualquier miembro autenticado de la
--   tienda (encargado, clerk, usuario, warehouse, costo, tenant_admin con
--   membresía) puede LEER nóminas, líneas y tarifas salariales de su tienda.
--   Asimismo los 7 RPC de nómina gatean con has_store_access_as (cualquier
--   miembro activo pasa), lo que permite a un clerk confeccionar, confirmar,
--   contabilizar, pagar o anular nóminas.
--
-- POLÍTICA DE ACCESO APLICADA (misión §3):
--   · superadmin: acceso GLOBAL de lectura/gestión (privilegio legítimo de
--     plataforma; current_user_store_ids() devuelve todas las tiendas activas).
--   · admin de plataforma: acceso EXCLUSIVAMENTE a las tiendas de su tenant
--     (current_user_store_ids() ya codifica ese alcance; NO global).
--   · admin de tienda (membresía activa con rol 'admin'): su tienda.
--   · encargado / clerk / usuario / warehouse / costo / tenant_admin: SIN
--     acceso de lectura ni gestión hasta decisión expresa del propietario.
--   · anon: sin políticas (denegado por ACL: REVOKE ALL vigente).
--
-- IMPLEMENTACIÓN:
--   1) Helper can_read_payroll_store(store_id): para RLS (usa auth.uid()).
--   2) Helper can_manage_payroll_as(user_id, store_id): para RPC (identidad
--      resuelta server-side; anti-spoofing del patrón v2.12.9 intacto).
--   3) Reemplazo de las 4 políticas por SELECT restringida + ALL restrictiva
--      (defensa en profundidad si alguien otorgara INSERT/UPDATE después).
--   4) Los 7 RPC con gate can_manage_payroll_as (cuerpos byte-idénticos a
--      20261112180000 salvo la línea del gate — generados por script y
--      verificados automáticamente).
--
-- SEGURIDAD:
--   · Sin recursión RLS: helpers SECURITY DEFINER con search_path fijo
--     (postgres tiene bypassrls — verificado 2026-11-14).
--   · La autorización NUNCA depende de roles enviados por el cliente: los
--     helpers leen profiles y user_store_memberships por identidad.
--   · postgres y service_role conservan bypassrls → los RPC SECURITY DEFINER
--     y el canal de administración siguen funcionando sin cambios.
--
-- COMPATIBILIDAD:
--   · La app (rutas /api/payrolls*) usa cliente de sesión para GET (sujeto a
--     RLS: ahora vacío para no-admins) y service_role + p_user_id JWT para
--     escrituras (gate interno del RPC: ahora exige nivel administrativo).
--   · Firmas idénticas → sin impacto en PostgREST ni en el contract-surface
--     (se re-certifica tras aplicar).
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE; CREATE OR REPLACE.
-- Reversibilidad: DROP de las políticas nuevas y recreación de las de
--   20261112180000 §3; CREATE OR REPLACE de los 7 RPC con los cuerpos de
--   esa migración (gate has_store_access_as).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Helpers de autorización de nóminas
-- ─────────────────────────────────────────────────────────────────────────

-- RLS: ¿el usuario ACTUAL (auth.uid()) puede LEER datos salariales de la tienda?
CREATE OR REPLACE FUNCTION public.can_read_payroll_store(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  -- superadmin de plataforma: alcance GLOBAL (incluye tiendas inactivas;
  -- privilegio administrativo legítimo de plataforma)
  IF public.is_superadmin() THEN RETURN true; END IF;
  -- admin de plataforma: EXCLUSIVAMENTE tiendas activas de su tenant
  -- (el alcance lo codifica current_user_store_ids(): admin → su tenant)
  IF public.is_admin() AND p_store_id = ANY(public.current_user_store_ids()) THEN
    RETURN true;
  END IF;
  -- admin de tienda: membresía ACTIVA con rol 'admin' en esa tienda
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid()
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role = 'admin'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_read_payroll_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_payroll_store(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_read_payroll_store(uuid) IS
  'CP-SEC-PAYROLL: true si el usuario actual puede LEER datos salariales de la tienda (superadmin global; admin de plataforma limitado a su tenant; admin de tienda por membresía activa). encargado/clerk/usuario/warehouse/costo/tenant_admin: false.';

-- RPC: ¿el usuario EXPLÍCITO puede GESTIONAR nóminas de la tienda? (anti-spoofing:
-- la identidad la resuelve el caller con el patrón v2.12.9 antes de llamar aquí)
CREATE OR REPLACE FUNCTION public.can_manage_payroll_as(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  -- superadmin de plataforma: global (privilegio administrativo legítimo)
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = p_user_id AND role = 'superadmin') THEN
    RETURN true;
  END IF;
  -- admin de plataforma: EXCLUSIVAMENTE tiendas de su tenant
  IF EXISTS (SELECT 1
               FROM public.profiles pr
               JOIN public.stores s ON s.tenant_id = pr.tenant_id
              WHERE pr.id = p_user_id
                AND pr.role = 'admin'
                AND s.id = p_store_id) THEN
    RETURN true;
  END IF;
  -- admin de tienda: membresía ACTIVA con rol 'admin'
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role = 'admin'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_manage_payroll_as(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_payroll_as(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.can_manage_payroll_as(uuid, uuid) IS
  'CP-SEC-PAYROLL: true si el usuario indicado puede GESTIONAR nóminas de la tienda (superadmin global; admin de plataforma solo su tenant; admin de tienda por membresía activa). Resto de roles: false. Solo service_role.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Políticas RLS restrictivas (reemplazan las 4 de 20261112180000 §3)
-- ─────────────────────────────────────────────────────────────────────────

-- payrolls
DROP POLICY IF EXISTS payrolls_store_isolation ON public.payrolls;
DROP POLICY IF EXISTS payrolls_admin_privacy ON public.payrolls;
CREATE POLICY payrolls_admin_privacy ON public.payrolls
  FOR SELECT TO authenticated
  USING (public.can_read_payroll_store(store_id));
CREATE POLICY payrolls_admin_privacy_write ON public.payrolls
  FOR ALL TO authenticated
  USING (public.can_read_payroll_store(store_id))
  WITH CHECK (public.can_read_payroll_store(store_id));

-- payroll_items
DROP POLICY IF EXISTS payroll_items_store_isolation ON public.payroll_items;
DROP POLICY IF EXISTS payroll_items_admin_privacy ON public.payroll_items;
CREATE POLICY payroll_items_admin_privacy ON public.payroll_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payrolls p
                  WHERE p.id = payroll_items.payroll_id
                    AND public.can_read_payroll_store(p.store_id)));
CREATE POLICY payroll_items_admin_privacy_write ON public.payroll_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payrolls p
                  WHERE p.id = payroll_items.payroll_id
                    AND public.can_read_payroll_store(p.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payrolls p
                  WHERE p.id = payroll_items.payroll_id
                    AND public.can_read_payroll_store(p.store_id)));

-- payroll_item_concepts
DROP POLICY IF EXISTS payroll_item_concepts_store_isolation ON public.payroll_item_concepts;
DROP POLICY IF EXISTS payroll_item_concepts_admin_privacy ON public.payroll_item_concepts;
CREATE POLICY payroll_item_concepts_admin_privacy ON public.payroll_item_concepts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_items i
                  JOIN public.payrolls p ON p.id = i.payroll_id
                 WHERE i.id = payroll_item_concepts.item_id
                   AND public.can_read_payroll_store(p.store_id)));
CREATE POLICY payroll_item_concepts_admin_privacy_write ON public.payroll_item_concepts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_items i
                  JOIN public.payrolls p ON p.id = i.payroll_id
                 WHERE i.id = payroll_item_concepts.item_id
                   AND public.can_read_payroll_store(p.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payroll_items i
                  JOIN public.payrolls p ON p.id = i.payroll_id
                 WHERE i.id = payroll_item_concepts.item_id
                   AND public.can_read_payroll_store(p.store_id)));

-- worker_salary_rates
DROP POLICY IF EXISTS worker_salary_rates_store_isolation ON public.worker_salary_rates;
DROP POLICY IF EXISTS worker_salary_rates_admin_privacy ON public.worker_salary_rates;
CREATE POLICY worker_salary_rates_admin_privacy ON public.worker_salary_rates
  FOR SELECT TO authenticated
  USING (public.can_read_payroll_store(store_id));
CREATE POLICY worker_salary_rates_admin_privacy_write ON public.worker_salary_rates
  FOR ALL TO authenticated
  USING (public.can_read_payroll_store(store_id))
  WITH CHECK (public.can_read_payroll_store(store_id));

-- ─────────────────────────────────────────────────────────────────────────
-- 3) RPC: gate administrativo (cuerpos de 20261112180000 con SOLO el gate
--    sustituido — generados y verificados por script)
-- ─────────────────────────────────────────────────────────────────────────

-- ── set_worker_salary_rate (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.set_worker_salary_rate(
  p_worker_id uuid,
  p_rate_type text,
  p_rate_amount numeric,
  p_currency text DEFAULT 'CUP',
  p_valid_from date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_worker public.workers%ROWTYPE;
  v_rate_id uuid := gen_random_uuid();
  v_valid_from date := COALESCE(p_valid_from, CURRENT_DATE);
  v_open public.worker_salary_rates%ROWTYPE;
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_WORKER_NOT_FOUND: %', p_worker_id;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, v_worker.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_rate_type NOT IN ('hourly', 'daily') THEN
    RAISE EXCEPTION 'ERR_INVALID_RATE_TYPE';
  END IF;
  IF p_rate_amount IS NULL OR p_rate_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_RATE_AMOUNT';
  END IF;
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY';
  END IF;
  -- NOTA: la vigencia de una tarifa PUEDE programarse a futuro (aumento
  -- anunciado); la regla de no-futuro del repo aplica a los DOCUMENTOS
  -- (nóminas/ajustes), no a la vigencia de tarifas.

  -- Cerrar la vigencia abierta actual (sin solapes): la tarifa anterior
  -- vige hasta v_valid_from - 1. Si la nueva fecha no avanza sobre la
  -- abierta → solape → error controlado.
  SELECT * INTO v_open FROM public.worker_salary_rates
   WHERE worker_id = p_worker_id AND valid_to IS NULL
   ORDER BY valid_from DESC LIMIT 1 FOR UPDATE;
  IF v_open.id IS NOT NULL THEN
    IF v_valid_from <= v_open.valid_from THEN
      RAISE EXCEPTION 'ERR_RATE_OVERLAP: existe una tarifa vigente desde % (use una fecha posterior)', v_open.valid_from;
    END IF;
    UPDATE public.worker_salary_rates
       SET valid_to = (v_valid_from - 1), updated_at = now()
     WHERE id = v_open.id;
  END IF;

  INSERT INTO public.worker_salary_rates
    (id, worker_id, store_id, tenant_id, rate_type, rate_amount, currency, valid_from, created_by)
  VALUES
    (v_rate_id, p_worker_id, v_worker.store_id, v_worker.tenant_id,
     p_rate_type, round(p_rate_amount, 2), p_currency, v_valid_from, v_caller_uid);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SET_WORKER_SALARY_RATE', 'worker_salary_rates', v_rate_id, v_worker.store_id, v_caller_uid,
    jsonb_build_object('worker_id', p_worker_id, 'rate_type', p_rate_type,
      'rate_amount', round(p_rate_amount, 2), 'currency', p_currency,
      'valid_from', v_valid_from, 'replaced_rate_id', v_open.id));

  RETURN jsonb_build_object('status', 'success', 'rate_id', v_rate_id,
    'worker_id', p_worker_id, 'rate_type', p_rate_type,
    'rate_amount', round(p_rate_amount, 2), 'currency', p_currency,
    'valid_from', v_valid_from);
END;
$function$;

-- ── create_payroll (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.create_payroll(
  p_store_id uuid,
  p_tipo_nomina text,
  p_period_start date,
  p_period_end date,
  p_payment_method text DEFAULT 'efectivo',
  p_cheque_number text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL,
  p_reintegro_number text DEFAULT NULL,
  p_reintegro_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_payroll_id uuid := gen_random_uuid();
  v_payroll_number text;
  v_currency text;
  v_entidad_nombre text;
  v_entidad_codigo text;
  v_reeup text;
  v_nit text;
  v_tenant uuid;
  v_validated jsonb;
  v_row jsonb;
  v_item_id uuid;
  v_concept jsonb;
  v_param_hash text;
  v_existing jsonb;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_tipo_nomina NOT IN ('sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros') THEN
    RAISE EXCEPTION 'ERR_INVALID_TIPO_NOMINA: %', p_tipo_nomina;
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'ERR_INVALID_PERIOD: la fecha inicial no puede ser posterior a la final';
  END IF;
  IF p_period_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT';
  END IF;
  IF p_period_start < (CURRENT_DATE - INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD';
  END IF;

  -- Entidad: nombre y código resueltos SIEMPRE servidor (datos 1 del modelo)
  SELECT s.name, s.reeup, s.nit, s.tenant_id
    INTO v_entidad_nombre, v_reeup, v_nit, v_tenant
    FROM public.stores s WHERE s.id = p_store_id;
  IF v_entidad_nombre IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND';
  END IF;
  v_entidad_codigo := COALESCE(NULLIF(btrim(COALESCE(v_reeup, '')), ''),
                               NULLIF(btrim(COALESCE(v_nit, '')), ''));

  -- Validar y calcular (motor interno; período como parámetros explícitos)
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;
  v_validated := public.fn_payroll_validate_items(p_store_id, p_period_start, p_period_end, p_items);
  v_currency := ((v_validated->'items'->0)->>'rate_currency');

  -- Idempotencia (misma infraestructura que create_vale_salida)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    v_param_hash := md5(p_store_id::text || '|' || p_tipo_nomina || '|' ||
      p_period_start::text || '|' || p_period_end::text || '|' ||
      COALESCE(p_payment_method, '') || '|' || COALESCE(p_cheque_number, '') || '|' ||
      COALESCE(p_items::text, ''));
    v_existing := public.check_idempotency(p_idempotency_key, 'payroll', v_payroll_id, v_param_hash);
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
  v_payroll_number := public.next_document_number(p_store_id, 'payroll', v_caller_uid);

  INSERT INTO public.payrolls (
    id, store_id, tenant_id, payroll_number, status, tipo_nomina,
    period_start, period_end, currency,
    entidad_nombre, entidad_codigo,
    payment_method, cheque_number, cheque_date, reintegro_number, reintegro_date,
    notes,
    total_workers, total_regular_hours, total_overtime_hours, total_accrued_days,
    total_base_salary, total_overtime, total_complementos, total_other_earnings,
    total_social_security, total_gross, total_deductions, total_net,
    total_vacation_days, total_vacation_amount,
    created_by
  ) VALUES (
    v_payroll_id, p_store_id, v_tenant, v_payroll_number, 'draft', p_tipo_nomina,
    p_period_start, p_period_end, COALESCE(v_currency, 'CUP'),
    v_entidad_nombre, v_entidad_codigo,
    p_payment_method, NULLIF(btrim(COALESCE(p_cheque_number, '')), ''), p_cheque_date,
    NULLIF(btrim(COALESCE(p_reintegro_number, '')), ''), p_reintegro_date,
    COALESCE(btrim(p_notes), ''),
    (v_validated->'totals'->>'total_workers')::int,
    (v_validated->'totals'->>'total_regular_hours')::numeric,
    (v_validated->'totals'->>'total_overtime_hours')::numeric,
    (v_validated->'totals'->>'total_accrued_days')::numeric,
    (v_validated->'totals'->>'total_base_salary')::numeric,
    (v_validated->'totals'->>'total_overtime')::numeric,
    (v_validated->'totals'->>'total_complementos')::numeric,
    (v_validated->'totals'->>'total_other_earnings')::numeric,
    (v_validated->'totals'->>'total_social_security')::numeric,
    (v_validated->'totals'->>'total_gross')::numeric,
    (v_validated->'totals'->>'total_deductions')::numeric,
    (v_validated->'totals'->>'total_net')::numeric,
    (v_validated->'totals'->>'total_vacation_days')::numeric,
    (v_validated->'totals'->>'total_vacation_amount')::numeric,
    v_caller_uid
  );

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_validated->'items') LOOP
    v_item_id := gen_random_uuid();
    INSERT INTO public.payroll_items (
      id, payroll_id, worker_id,
      expediente_laboral, worker_names, categoria_ocupacional, cargo, area_trabajo,
      rate_type, rate_amount, rate_currency,
      regular_hours, accrued_days, overtime_hours, overtime_amount,
      vacation_days, vacation_amount,
      base_salary, total_complementos, total_other_earnings, total_social_security,
      total_gross, total_deductions, total_net
    ) VALUES (
      v_item_id, v_payroll_id, (v_row->>'worker_id')::uuid,
      v_row->>'expediente_laboral', v_row->>'worker_names', v_row->>'categoria_ocupacional',
      v_row->>'cargo', v_row->>'area_trabajo',
      v_row->>'rate_type', (v_row->>'rate_amount')::numeric, v_row->>'rate_currency',
      (v_row->>'regular_hours')::numeric, (v_row->>'accrued_days')::numeric,
      (v_row->>'overtime_hours')::numeric, (v_row->>'overtime_amount')::numeric,
      (v_row->>'vacation_days')::numeric, (v_row->>'vacation_amount')::numeric,
      (v_row->>'base_salary')::numeric, (v_row->>'total_complementos')::numeric,
      (v_row->>'total_other_earnings')::numeric, (v_row->>'total_social_security')::numeric,
      (v_row->>'total_gross')::numeric, (v_row->>'total_deductions')::numeric,
      (v_row->>'total_net')::numeric
    );
    FOR v_concept IN SELECT * FROM jsonb_array_elements(COALESCE(v_row->'concepts', '[]'::jsonb)) LOOP
      INSERT INTO public.payroll_item_concepts (item_id, kind, sigla, description, amount)
      VALUES (v_item_id, v_concept->>'kind', btrim(v_concept->>'sigla'),
              COALESCE(btrim(v_concept->>'description'), ''),
              round(COALESCE((v_concept->>'amount')::numeric, 0), 2));
    END LOOP;
  END LOOP;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'payroll', v_payroll_id, v_param_hash,
      jsonb_build_object('status', 'success', 'payroll_id', v_payroll_id,
        'payroll_number', v_payroll_number));
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_PAYROLL', 'payrolls', v_payroll_id, p_store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_payroll_number, 'status', 'draft',
      'tipo_nomina', p_tipo_nomina, 'period_start', p_period_start, 'period_end', p_period_end,
      'payment_method', p_payment_method, 'total_net', (v_validated->'totals'->>'total_net')::numeric,
      'normativa', 'Res. 13/2007 MFP — Modelo SC-4-06 Nómina'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', v_payroll_id,
    'payroll_number', v_payroll_number, 'totals', v_validated->'totals');
END;
$function$;

-- ── update_payroll (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.update_payroll(
  p_payroll_id uuid,
  p_tipo_nomina text,
  p_period_start date,
  p_period_end date,
  p_payment_method text DEFAULT 'efectivo',
  p_cheque_number text DEFAULT NULL,
  p_cheque_date date DEFAULT NULL,
  p_reintegro_number text DEFAULT NULL,
  p_reintegro_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
  v_validated jsonb;
  v_row jsonb;
  v_item_id uuid;
  v_concept jsonb;
  v_currency text;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo se pueden editar nóminas en borrador (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_tipo_nomina NOT IN ('sueldos', 'jornales', 'vacaciones', 'licencias', 'subsidios', 'movilizados', 'otros') THEN
    RAISE EXCEPTION 'ERR_INVALID_TIPO_NOMINA: %', p_tipo_nomina;
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'ERR_INVALID_PERIOD';
  END IF;
  IF p_period_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT';
  END IF;
  IF p_period_start < (CURRENT_DATE - INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT';
  END IF;
  IF p_payment_method NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  v_validated := public.fn_payroll_validate_items(v_pay.store_id, p_period_start, p_period_end, p_items);
  v_currency := ((v_validated->'items'->0)->>'rate_currency');

  UPDATE public.payrolls SET
    tipo_nomina = p_tipo_nomina,
    period_start = p_period_start,
    period_end = p_period_end,
    currency = COALESCE(v_currency, 'CUP'),
    payment_method = p_payment_method,
    cheque_number = NULLIF(btrim(COALESCE(p_cheque_number, '')), ''),
    cheque_date = p_cheque_date,
    reintegro_number = NULLIF(btrim(COALESCE(p_reintegro_number, '')), ''),
    reintegro_date = p_reintegro_date,
    notes = COALESCE(btrim(p_notes), ''),
    total_workers = (v_validated->'totals'->>'total_workers')::int,
    total_regular_hours = (v_validated->'totals'->>'total_regular_hours')::numeric,
    total_overtime_hours = (v_validated->'totals'->>'total_overtime_hours')::numeric,
    total_accrued_days = (v_validated->'totals'->>'total_accrued_days')::numeric,
    total_base_salary = (v_validated->'totals'->>'total_base_salary')::numeric,
    total_overtime = (v_validated->'totals'->>'total_overtime')::numeric,
    total_complementos = (v_validated->'totals'->>'total_complementos')::numeric,
    total_other_earnings = (v_validated->'totals'->>'total_other_earnings')::numeric,
    total_social_security = (v_validated->'totals'->>'total_social_security')::numeric,
    total_gross = (v_validated->'totals'->>'total_gross')::numeric,
    total_deductions = (v_validated->'totals'->>'total_deductions')::numeric,
    total_net = (v_validated->'totals'->>'total_net')::numeric,
    total_vacation_days = (v_validated->'totals'->>'total_vacation_days')::numeric,
    total_vacation_amount = (v_validated->'totals'->>'total_vacation_amount')::numeric,
    updated_at = now()
  WHERE id = p_payroll_id;

  -- Reemplazo transaccional de líneas
  DELETE FROM public.payroll_items WHERE payroll_id = p_payroll_id;
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_validated->'items') LOOP
    v_item_id := gen_random_uuid();
    INSERT INTO public.payroll_items (
      id, payroll_id, worker_id,
      expediente_laboral, worker_names, categoria_ocupacional, cargo, area_trabajo,
      rate_type, rate_amount, rate_currency,
      regular_hours, accrued_days, overtime_hours, overtime_amount,
      vacation_days, vacation_amount,
      base_salary, total_complementos, total_other_earnings, total_social_security,
      total_gross, total_deductions, total_net
    ) VALUES (
      v_item_id, p_payroll_id, (v_row->>'worker_id')::uuid,
      v_row->>'expediente_laboral', v_row->>'worker_names', v_row->>'categoria_ocupacional',
      v_row->>'cargo', v_row->>'area_trabajo',
      v_row->>'rate_type', (v_row->>'rate_amount')::numeric, v_row->>'rate_currency',
      (v_row->>'regular_hours')::numeric, (v_row->>'accrued_days')::numeric,
      (v_row->>'overtime_hours')::numeric, (v_row->>'overtime_amount')::numeric,
      (v_row->>'vacation_days')::numeric, (v_row->>'vacation_amount')::numeric,
      (v_row->>'base_salary')::numeric, (v_row->>'total_complementos')::numeric,
      (v_row->>'total_other_earnings')::numeric, (v_row->>'total_social_security')::numeric,
      (v_row->>'total_gross')::numeric, (v_row->>'total_deductions')::numeric,
      (v_row->>'total_net')::numeric
    );
    FOR v_concept IN SELECT * FROM jsonb_array_elements(COALESCE(v_row->'concepts', '[]'::jsonb)) LOOP
      INSERT INTO public.payroll_item_concepts (item_id, kind, sigla, description, amount)
      VALUES (v_item_id, v_concept->>'kind', btrim(v_concept->>'sigla'),
              COALESCE(btrim(v_concept->>'description'), ''),
              round(COALESCE((v_concept->>'amount')::numeric, 0), 2));
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('UPDATE_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'status', 'draft',
      'total_net', (v_validated->'totals'->>'total_net')::numeric));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'totals', v_validated->'totals');
END;
$function$;

-- ── confirm_payroll (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.confirm_payroll(
  p_payroll_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
  v_items_count integer;
  v_gross numeric := 0;
  v_ded numeric := 0;
  v_net numeric := 0;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo se pueden confirmar nóminas en borrador (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT count(*), COALESCE(sum(total_gross), 0), COALESCE(sum(total_deductions), 0),
         COALESCE(sum(total_net), 0)
    INTO v_items_count, v_gross, v_ded, v_net
    FROM public.payroll_items WHERE payroll_id = p_payroll_id;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;
  -- Consistencia de los totales almacenados (fuente de verdad: filas)
  IF round(v_gross, 2) <> round(v_pay.total_gross, 2)
     OR round(v_ded, 2) <> round(v_pay.total_deductions, 2)
     OR round(v_net, 2) <> round(v_pay.total_net, 2) THEN
    RAISE EXCEPTION 'ERR_INCONSISTENT_TOTALS: el documento no coincide con sus líneas (recalcule y guarde antes de confirmar)';
  END IF;

  UPDATE public.payrolls
     SET status = 'confirmed',
         reviewed_by = v_caller_uid,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CONFIRM_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'from', 'draft', 'to', 'confirmed',
      'total_net', v_net, 'firma', 'revisa y aprueba (SC-4-06)'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'to', 'confirmed',
    'reviewed_by', v_caller_uid);
END;
$function$;

-- ── account_payroll (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.account_payroll(
  p_payroll_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo se contabilizan nóminas confirmadas (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_pay.accounted_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_ACCOUNTED';
  END IF;

  UPDATE public.payrolls
     SET accounted_by = v_caller_uid, accounted_at = now(), updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ACCOUNT_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'firma', 'contabiliza (SC-4-06)'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'accounted_by', v_caller_uid);
END;
$function$;

-- ── mark_payroll_paid (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(
  p_payroll_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo se marcan pagadas las nóminas confirmadas (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.payrolls
     SET status = 'paid', paid_by = v_caller_uid, paid_at = now(), updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('MARK_PAYROLL_PAID', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'from', 'confirmed', 'to', 'paid'));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'to', 'paid');
END;
$function$;

-- ── void_payroll (gate: can_manage_payroll_as) ──
CREATE OR REPLACE FUNCTION public.void_payroll(
  p_payroll_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay public.payrolls%ROWTYPE;
  v_items_count integer;
BEGIN
  SELECT * INTO v_pay FROM public.payrolls WHERE id = p_payroll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PAYROLL_NOT_FOUND';
  END IF;
  IF v_pay.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'ERR_NOT_VOIDABLE: solo se pueden anular nóminas en borrador o confirmadas (estado actual: %)', v_pay.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.can_manage_payroll_as(v_caller_uid, v_pay.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_TOO_LONG';
  END IF;

  SELECT count(*) INTO v_items_count FROM public.payroll_items WHERE payroll_id = p_payroll_id;

  UPDATE public.payrolls
     SET status = 'voided',
         voided_at = now(), voided_by = v_caller_uid, void_reason = btrim(p_reason),
         updated_at = now()
   WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_PAYROLL', 'payrolls', p_payroll_id, v_pay.store_id, v_caller_uid,
    jsonb_build_object('payroll_number', v_pay.payroll_number, 'from', v_pay.status, 'to', 'voided',
      'reason', btrim(p_reason), 'items_count', v_items_count));

  RETURN jsonb_build_object('status', 'success', 'payroll_id', p_payroll_id,
    'payroll_number', v_pay.payroll_number, 'to', 'voided');
END;
$function$;



-- ─────────────────────────────────────────────────────────────────────────
-- 4) Verificación fail-closed de cierre
-- ─────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_viejas int;
  v_select_pol int;
  v_gates_viejos int;
BEGIN
  -- ninguna política antigua (solo-membresía) debe quedar
  SELECT count(*) INTO v_viejas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN ('payrolls_store_isolation', 'payroll_items_store_isolation',
                        'payroll_item_concepts_store_isolation', 'worker_salary_rates_store_isolation');
  IF v_viejas <> 0 THEN
    RAISE EXCEPTION 'CP-SEC-PAYROLL: quedan % políticas antiguas sin reemplazar', v_viejas;
  END IF;

  -- las 4 tablas deben tener su política SELECT restrictiva
  SELECT count(*) INTO v_select_pol
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN ('payrolls_admin_privacy', 'payroll_items_admin_privacy',
                        'payroll_item_concepts_admin_privacy', 'worker_salary_rates_admin_privacy')
     AND cmd = 'SELECT';
  IF v_select_pol <> 4 THEN
    RAISE EXCEPTION 'CP-SEC-PAYROLL: políticas SELECT restrictivas = % (esperado 4)', v_select_pol;
  END IF;

  -- ningún RPC de nómina puede seguir gateando con has_store_access_as
  SELECT count(*) INTO v_gates_viejos
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('create_payroll', 'update_payroll', 'confirm_payroll',
                       'account_payroll', 'mark_payroll_paid', 'void_payroll',
                       'set_worker_salary_rate')
     AND pg_get_functiondef(p.oid) LIKE '%has_store_access_as(v_caller_uid%';
  IF v_gates_viejos <> 0 THEN
    RAISE EXCEPTION 'CP-SEC-PAYROLL: % RPC conservan el gate antiguo has_store_access_as', v_gates_viejos;
  END IF;

  RAISE NOTICE 'CP-SEC-PAYROLL OK: 4 tablas con RLS por rol, 7 RPC con gate administrativo';
END
$verify$;
