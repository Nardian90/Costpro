-- ============================================================================
-- Migration: 20261127150000_cpbra_pay_commission_encargado.sql
-- Misión:    CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 — FASE 3 (pay_commission §0.2)
-- Fecha:     2026-11-27
-- ============================================================================
-- DECISIÓN DEL PROPIETARIO (misión §0.2, vinculante): AUTORIZADOS PARA PAGAR
--   COMISIONES: admin, manager Y ENCARGADO — dentro de su tienda. Clerk y
--   usuario ordinario NO. La autorización debe verificarse en el servidor y
--   en la barrera autoritativa de base de datos. Compatibilidad con el modelo
--   de administración de COSTPRO (admin de plataforma), sin privilegios
--   implícitos nuevos.
--
-- ESTADO PREVIO (auditoría §5.2 de la misión):
--   · ACL real de pay_commission: authenticated + service_role (20261026100000
--     retira anon/PUBLIC). CUALQUIER usuario autenticado puede invocarla
--     directamente — la barrera autoritativa es el gate DENTRO del cuerpo
--     (SECURITY DEFINER): has_store_role_as(admin|manager) → ERR_FORBIDDEN_ROLE.
--   · DEFECTO vs §0.2: el gate NO incluye 'encargado' → un encargado de tienda
--     (membresía activa) es RECHAZADO al pagar una comisión. Además la ruta
--     /api/commissions/payments/[id] verificaba SOLO el rol GLOBAL (isAdminLevel
--     || manager), no la membresía — el encargado nunca llegaba a la barrera DB.
--   · FIN-014: bulk-pay conserva un fallback legacy a UPDATE directo si el RPC
--     no existe — bypass del protocolo del cajón (se elimina en esta misión,
--     commit de la ruta).
--
-- SOLUCIÓN (cuerpo byte-idéntico salvo el gate — verificado programáticamente):
--   el gate adopta el patrón canónico R-05: un solo
--   has_store_role_as(v_uid, store, ARRAY['admin','manager','encargado'])
--   — el MISMO helper que confirma ajustes de inventario. Toda la mecánica
--   del protocolo del cajón queda intacta: actor (auth.uid()/service_role
--   con p_user_id de la ruta), advisory lock por tienda, guard físico de
--   moneda para efectivo, idempotencia natural (paid → replay), gate de
--   estado (approved|draft → paid, ERR_COMMISSION_STATE_CHANGED), fechas.
--   ACL re-declarada invariante: authenticated + service_role, sin anon/PUBLIC.
-- ============================================================================

-- ─── UP ─────────────────────────────────────────────────────────────────────
BEGIN;

-- Guard fail-closed: pay_commission existe con la firma certificada (7 args)
DO $pc_guard$
DECLARE
  v_found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'pay_commission'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid'
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'PC-GUARD: pay_commission(uuid,text,text,text,numeric,timestamptz,uuid) no existe con la firma certificada — abortando (estado inesperado)';
  END IF;
END;
$pc_guard$;

CREATE OR REPLACE FUNCTION public.pay_commission(p_payment_id uuid, p_payment_method text, p_reference text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_comm record;
  v_currency text;
  v_phys_out numeric := 0;
  v_phys_available numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  SELECT id, store_id, status, currency, exchange_rate, amount_cup, final_amount
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;
  IF v_comm.id IS NULL THEN
    RAISE EXCEPTION 'ERR_COMMISSION_NOT_FOUND: %', p_payment_id;
  END IF;

  -- §0.2 (CP-BRA-FINAL-COMPLIANCE-CLOSURE-001): rol de GESTIÓN autorizado a
  -- pagar comisiones en su tienda = admin, manager O ENCARGADO (membresía
  -- activa vía has_store_role_as; compat de admin de plataforma preservada
  -- dentro de la propia función — sin privilegios implícitos nuevos). Un solo
  -- gate con el patrón canónico R-05 (mismo helper que
  -- confirm_inventory_adjustment). Clerk/usuario/otra tienda → rechazo.
  IF NOT public.has_store_role_as(v_uid, v_comm.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: pagar comisiones requiere rol de gestión (admin, manager o encargado)';
  END IF;

  -- Idempotencia natural (misma semántica que la ruta: ya pagada → replay)
  IF v_comm.status = 'paid' THEN
    RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', true,
      'message', 'La comisión ya estaba pagada');
  END IF;
  IF v_comm.status NOT IN ('approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_INVALID_COMMISSION_STATUS: no se puede pagar una comisión con estado "%"', v_comm.status;
  END IF;
  -- CP-FIN-004: normalización del heredado 'zelle' al canónico
  IF lower(trim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF lower(trim(p_payment_method)) NOT IN ('cash', 'transfer', 'external_transfer', 'mixed') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD: %', p_payment_method;
  END IF;
  IF p_currency IS NOT NULL AND upper(trim(p_currency)) NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', p_currency;
  END IF;

  -- Fecha del pago: nunca futura (regla 1 del negocio, validada en servidor)
  IF p_paid_at IS NOT NULL AND p_paid_at > now() THEN
    RAISE EXCEPTION 'ERR_PAYMENT_DATE_FUTURE: la fecha del pago (%) no puede ser posterior a ahora (%)', p_paid_at, now();
  END IF;

  v_currency := COALESCE(upper(btrim(p_currency)), v_comm.currency);

  -- Protocolo del cajón: advisory ANTES de la lectura que autoriza la salida
  PERFORM pg_advisory_xact_lock(hashtext(v_comm.store_id::text));

  -- Fase A: una comisión pagada en EFECTIVO entrega BILLETES de su moneda.
  -- Efecto físico por moneda = final_amount en la moneda efectiva del pago
  -- (término v_comm del libro — misma fuente autoritativa). Fail-closed;
  -- lectura post-lock con upper bound 'infinity' (coherente con el lock).
  -- NOTA 'mixed': el libro (v_comm) solo cuenta payment_method='cash' — los
  -- pagos mixtos de comisión no participan del físico en la fórmula vigente
  -- (gap contable PREEXISTENTE, documentado como residual): se valida
  -- estrictamente 'cash' para no alterar la aceptación de 'mixed'.
  IF lower(trim(p_payment_method)) = 'cash' THEN
    v_phys_out := v_comm.final_amount;
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      v_comm.store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> v_currency)::numeric, 0);
    IF COALESCE(v_phys_out, 0) > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, comisión=%',
        v_currency, round(v_phys_available, 2), round(COALESCE(v_phys_out, 0), 2);
    END IF;
  END IF;

  UPDATE public.commission_payments SET
    status = 'paid',
    paid_at = COALESCE(p_paid_at, now()),
    paid_by = v_uid,
    payment_method = lower(trim(p_payment_method)),
    payment_reference = p_reference,
    currency = COALESCE(upper(btrim(p_currency)), currency),
    exchange_rate = CASE WHEN p_exchange_rate IS NOT NULL THEN p_exchange_rate
                         WHEN upper(btrim(COALESCE(p_currency, currency))) <> 'CUP' THEN COALESCE(exchange_rate, 1.0)
                         ELSE 1.0 END,
    updated_at = now()
  WHERE id = p_payment_id
    AND status IN ('approved', 'draft')
    AND store_id = v_comm.store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_COMMISSION_STATE_CHANGED: la comisión cambió de estado concurrentemente — reintentar';
  END IF;

  SELECT id, store_id, status, currency, amount_cup, final_amount, paid_at, paid_by, payment_method
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;

  RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', false);
END;
$function$;


-- ACL invariante (20261026100000): app vía cliente de sesión — sin anon/PUBLIC
REVOKE ALL ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamp with time zone, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamp with time zone, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamp with time zone, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamp with time zone, uuid) IS
  '§0.2 CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 (20261127150000): el gate de autorización del protocolo del cajón exige rol de GESTIÓN en la tienda de la comisión — admin, manager O ENCARGADO (has_store_role_as ARRAY, patrón R-05; compat admin plataforma preservada). Clerk/usuario/otra tienda → ERR_FORBIDDEN_ROLE. Mecánica del cajón intacta: actor de sesión (p_user_id solo para service_role), advisory lock por tienda, guard físico de moneda para efectivo, idempotencia natural, gate de estado. ACL invariante: authenticated + service_role, sin anon.';

-- Verificación fail-closed (patrón R-05/R-26/R-03: cuerpo sin comentarios)
DO $pc_verify$
DECLARE
  v_def text;
  v_code text;
  v_acl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'pay_commission'
      AND pg_get_function_identity_arguments(p.oid) =
          'p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PC-VERIFY: pay_commission no existe tras la reemisión';
  END IF;

  v_code := regexp_replace(v_def, '--[^\n]*', '', 'g');

  -- El gate incluye EXPLÍCITAMENTE los tres roles de gestión (§0.2)
  IF v_code NOT LIKE '%ARRAY[''admin'', ''manager'', ''encargado'']::text[]%' THEN
    RAISE EXCEPTION 'PC-VERIFY: el gate no exige admin/manager/encargado (decisión §0.2 sin cerrar)';
  END IF;
  IF v_code NOT LIKE '%ERR_FORBIDDEN_ROLE%' THEN
    RAISE EXCEPTION 'PC-VERIFY: falta el rechazo ERR_FORBIDDEN_ROLE';
  END IF;

  -- Protocolo del cajón intacto
  IF v_code NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'PC-VERIFY: falta el advisory lock por tienda';
  END IF;
  IF v_code NOT LIKE '%ERR_INSUFFICIENT_CURRENCY%' THEN
    RAISE EXCEPTION 'PC-VERIFY: falta el guard físico de moneda';
  END IF;
  IF v_code NOT LIKE '%idempotent_replay%' THEN
    RAISE EXCEPTION 'PC-VERIFY: falta la idempotencia natural';
  END IF;
  IF v_code NOT LIKE '%ERR_COMMISSION_STATE_CHANGED%' THEN
    RAISE EXCEPTION 'PC-VERIFY: falta el gate de estado concurrente';
  END IF;
  -- Actor: p_user_id SOLO para service_role (anti-spoofing)
  IF v_code NOT LIKE '%auth.role() = ''service_role''%' OR v_code NOT LIKE '%ELSE auth.uid()%' THEN
    RAISE EXCEPTION 'PC-VERIFY: la regla de actor (p_user_id solo service_role) se alteró';
  END IF;

  -- ACL certificada: authenticated + service_role, sin anon
  SELECT coalesce(array_to_string(array_agg(r.grantee || '=' || r.privilege_type), ','), '')
    INTO v_acl
    FROM information_schema.role_routine_grants r
    WHERE r.specific_schema = 'public'
      AND r.routine_name = 'pay_commission'
      AND r.privilege_type = 'EXECUTE';
  IF v_acl NOT LIKE '%service_role%' OR v_acl NOT LIKE '%authenticated%'
     OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION 'PC-VERIFY: ACL divergente tras la reemisión (%)', v_acl;
  END IF;

  RAISE NOTICE 'PC-VERIFY: gate admin/manager/encargado presente, cajón intacto, actor reglado, ACL (%)', v_acl;
END;
$pc_verify$;

COMMIT;

-- ─── DOWN ───────────────────────────────────────────────────────────────────
-- La reversión restaura el cuerpo previo (20261120210000) reemitiéndolo desde
-- el historial versionado. NO se automatiza: política de reversiones del repo.
-- ============================================================================
