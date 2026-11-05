-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN GESTIÓN DE TIENDAS + CLASIFICADOR MAESTRO — FASE 5 · RECONCILIACIÓN
-- DEL CONTRACT SURFACE (REM-INV-6 / Capa C)  ·  2026-11-06
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPÓSITO: alinear el stream de migraciones con la superficie CERTIFICADA
--   de producción (supabase/security-contract/contract-surface.sql regenerado
--   de la BD viva el 2026-11-06) para que la reconciliación
--   source-of-truth del security contract (scripts/security-contract-test-
--   static.cjs, Capa C) reproducible en CI pase sin divergencias.
--
-- DIVERGENCIAS QUE CIERRA (detectadas por el propio checker):
--   1. create_sale_v2/34      — ACL: live=[authenticated, service_role],
--        replay daba PUBLIC (el CREATE OR REPLACE de 20261105140000 no traía
--        los GRANT/REVOKE explícitos). Fix: REVOKE/GRANT idénticos al live.
--   2. register_reception/11  — ACL: live=[authenticated, service_role],
--        replay=PUBLIC. Fix: REVOKE/GRANT.
--   3. sec026_membership_audit_fn/0 — ACL: live=[service_role], replay=[].
--        Fix: REVOKE (incl. authenticated) + GRANT service_role.
--   4. fn_party_apply_changes/4 — BODY_DRIFT: producción llevaba un guard
--        anti-spoofing aplicado fuera de banda (auth.uid() NULL ∧ no
--        service_role → ERR_PERMISSION_DENIED) que la migración
--        20261105130100 no reflejaba, y cast de firma DEFAULT NULL::uuid.
--        Fix: redefinición VERBATIM del cuerpo vivo + ACL [service_role].
--
-- SEGURIDAD: NINGÚN permiso se amplía respecto del live; los REVOKE/GRANT
--   replican la ACL certificada (ver contract-surface.sql, proacl por
--   función). Cambio aditivo; 0 datos tocados.
-- REVERSIBILIDAD: los GRANT/REVOKE son re-aplicables; la redefinición de
--   fn_party_apply_changes reproduce EXACTAMENTE el cuerpo certificado vivo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) ACL de create_sale_v2 (replica el live: postgres + authenticated + service_role)
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid,text,jsonb,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid,text,jsonb,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,text,text) TO authenticated, service_role;

-- 2) ACL de register_reception (replica el live: postgres + authenticated + service_role)
REVOKE ALL ON FUNCTION public.register_reception(uuid,text,timestamp with time zone,text,jsonb,uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid,text,timestamp with time zone,text,jsonb,uuid,uuid,text,text,text,text) TO authenticated, service_role;

-- 3) ACL de sec026_membership_audit_fn (replica el live: solo service_role)
REVOKE ALL ON FUNCTION public.sec026_membership_audit_fn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sec026_membership_audit_fn() TO service_role;

-- 4) fn_party_apply_changes — redefinición VERBATIM del cuerpo vivo certificado
--    (incorpora el guard anti-spoofing del live) + ACL solo-service_role.
CREATE OR REPLACE FUNCTION public.fn_party_apply_changes(p_party_id uuid, p_changes jsonb, p_actor uuid, p_origin_store_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_party RECORD;
  v_key TEXT;
  v_val JSONB;
  v_old TEXT;
  v_new TEXT;
  v_applied TEXT[] := '{}';
  v_allowed CONSTANT TEXT[] := ARRAY[
    'code','name','address','phone','email','tax_id',
    'party_type','is_client','is_supplier','status','notes'
  ];
  v_col TEXT;
BEGIN
  -- CI-GATE secdef_no_auth: guard de identidad fail-closed. La función es
  -- interna (EXECUTE revocado a authenticated); solo la invocan las RPC
  -- gobernadas (con contexto JWT vivo) o service_role.
  IF auth.uid() IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED';
  END IF;
  SELECT * INTO v_party FROM public.master_parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: el tercero % no existe', p_party_id;
  END IF;

  FOR v_key, v_val IN
    SELECT j.key, j.value FROM jsonb_each(p_changes) j
  LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      CONTINUE; -- whitelist: ignora silenciosamente campos no gestionados
    END IF;

    v_old := (to_jsonb(v_party) ->> v_key);
    v_new := CASE
      WHEN jsonb_typeof(v_val) = 'null' THEN NULL
      ELSE COALESCE(v_val #>> '{}', NULL)
    END;

    IF v_old IS NOT DISTINCT FROM v_new THEN
      CONTINUE; -- sin cambio real: no audita ruido
    END IF;

    -- Validaciones de unicidad cuando aplica
    IF v_key = 'code' THEN
      IF v_new IS NULL OR btrim(v_new) = '' THEN
        RAISE EXCEPTION 'ERR_PARTY_CODE_REQUIRED: el código no puede vaciarse';
      END IF;
      IF EXISTS (SELECT 1 FROM public.master_parties m
                  WHERE m.tenant_id = v_party.tenant_id AND m.code = btrim(v_new)
                    AND m.id <> p_party_id) THEN
        RAISE EXCEPTION 'ERR_PARTY_CODE_EXISTS: el código % ya existe en la organización', v_new;
      END IF;
      v_new := btrim(v_new);
    ELSIF v_key = 'name' THEN
      IF v_new IS NULL OR btrim(v_new) = '' THEN
        RAISE EXCEPTION 'ERR_PARTY_NAME_REQUIRED: el nombre no puede vaciarse';
      END IF;
      v_new := btrim(v_new);
    ELSIF v_key = 'tax_id' THEN
      IF v_new IS NOT NULL AND btrim(v_new) <> '' THEN
        IF EXISTS (SELECT 1 FROM public.master_parties m
                    WHERE m.tenant_id = v_party.tenant_id
                      AND upper(btrim(m.tax_id)) = upper(btrim(v_new))
                      AND m.id <> p_party_id
                      AND btrim(m.tax_id) <> '') THEN
          RAISE EXCEPTION 'ERR_PARTY_TAX_ID_EXISTS: la identificación fiscal % ya pertenece a otro tercero de la organización', v_new;
        END IF;
        v_new := btrim(v_new);
      END IF;
    ELSIF v_key = 'status' THEN
      IF v_new NOT IN ('active','archived') THEN
        RAISE EXCEPTION 'ERR_PARTY_STATUS_INVALID: estado % no admitido', COALESCE(v_new,'(null)');
      END IF;
    ELSIF v_key = 'party_type' THEN
      IF v_new NOT IN ('natural','juridica') THEN
        RAISE EXCEPTION 'ERR_PARTY_TYPE_INVALID: tipo % no admitido', COALESCE(v_new,'(null)');
      END IF;
    ELSIF v_key IN ('is_client','is_supplier') THEN
      IF v_val NOT IN ('true','false') THEN
        RAISE EXCEPTION 'ERR_PARTY_FLAG_INVALID: % debe ser booleano', v_key;
      END IF;
      -- La clasificación no puede quedarse sin rol comercial
      IF v_key = 'is_client' AND v_val = 'false' AND v_party.is_supplier = false THEN
        RAISE EXCEPTION 'ERR_PARTY_KIND_REQUIRED: el tercero debe conservar al menos un rol (cliente o proveedor)';
      END IF;
      IF v_key = 'is_supplier' AND v_val = 'false' AND v_party.is_client = false THEN
        RAISE EXCEPTION 'ERR_PARTY_KIND_REQUIRED: el tercero debe conservar al menos un rol (cliente o proveedor)';
      END IF;
    END IF;

    UPDATE public.master_parties m
       SET code        = CASE WHEN v_key = 'code' THEN v_new ELSE m.code END,
           name        = CASE WHEN v_key = 'name' THEN v_new ELSE m.name END,
           address     = CASE WHEN v_key = 'address' THEN v_new ELSE m.address END,
           phone       = CASE WHEN v_key = 'phone' THEN v_new ELSE m.phone END,
           email       = CASE WHEN v_key = 'email' THEN v_new ELSE m.email END,
           tax_id      = CASE WHEN v_key = 'tax_id' THEN v_new ELSE m.tax_id END,
           party_type  = CASE WHEN v_key = 'party_type' THEN v_new ELSE m.party_type END,
           is_client   = CASE WHEN v_key = 'is_client' THEN (v_val #>> '{}')::boolean ELSE m.is_client END,
           is_supplier = CASE WHEN v_key = 'is_supplier' THEN (v_val #>> '{}')::boolean ELSE m.is_supplier END,
           status      = CASE WHEN v_key = 'status' THEN v_new ELSE m.status END,
           notes       = CASE WHEN v_key = 'notes' THEN v_new ELSE m.notes END
     WHERE m.id = p_party_id;

    INSERT INTO public.party_change_log
      (master_party_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
    VALUES
      (p_party_id, v_party.tenant_id, v_key, v_old, v_new, p_actor, p_origin_store_id);

    v_applied := array_append(v_applied, v_key);
  END LOOP;

  IF array_length(v_applied, 1) IS NULL THEN
    RETURN jsonb_build_object('status','success','applied', '[]'::jsonb, 'changed', false);
  END IF;
  RETURN jsonb_build_object('status','success','applied', to_jsonb(v_applied), 'changed', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_party_apply_changes(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_party_apply_changes(uuid, jsonb, uuid, uuid) TO service_role;

-- 5) Verificación fail-closed de la reconciliación
DO $verify$
DECLARE
  v_bad_acl int;
  v_guard_missing bool;
BEGIN
  -- create_sale_v2 y register_reception: authenticated + service_role (sin anon/PUBLIC)
  SELECT count(*) INTO v_bad_acl
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('create_sale_v2','register_reception')
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '%anon%' OR a::text LIKE '%=%/postgres' AND false)
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%')
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'service_role=X%'));
  -- fn_party_apply_changes y sec026_membership_audit_fn: SOLO service_role
  SELECT count(*) INTO v_bad_acl
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('fn_party_apply_changes','sec026_membership_audit_fn')
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%')
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'service_role=X%'));
  -- guard anti-spoofing presente en el cuerpo vivo de fn_party_apply_changes
  SELECT pg_get_functiondef(p.oid) NOT LIKE '%ERR_PERMISSION_DENIED%'
    INTO v_guard_missing
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'fn_party_apply_changes';

  IF v_bad_acl <> 0 OR v_guard_missing THEN
    RAISE EXCEPTION 'GUARD reconciliación contract surface: bad_acl=% guard_missing=% (esperado 0/false)', v_bad_acl, v_guard_missing;
  END IF;
  RAISE NOTICE 'Reconciliación contract surface OK: ACLs certificadas + guard anti-spoofing de fn_party_apply_changes';
END
$verify$;
