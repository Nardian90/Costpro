-- W9.4.7 — H5-B1: retiro forense de `public.reverse_transaction` (V1, V2.12.12)
-- ============================================================================
-- Objetivo : retirar la función legacy reverse_transaction V1, cuyo único
--            caller vivo (route.ts RPC_MAP_V1.transaction) fue neutralizado en
--            el mismo commit (R1) y cuyos scripts manuales fueron migrados (R2).
-- Alcance  : SOLO esta función, por firma exacta. NO toca reverse_transaction_v2
--            (OID 138188), ni triggers, ni ACLs de terceros, ni datos.
-- Garantías: guard previo — la migración FALLA si el objeto vivo no coincide
--            exactamente con el auditado en FASE 1 (firma/owner/secdef/ACL/hash).
-- Idempotencia: si V1 ya no existe, no-op (NOTICE), sin error.
-- Rollback : git revert + re-CREATE con la definición archivada en
--            audit-evidence/20260902-w9.4.7-h5b1/14-pre-apply-snapshot/
--            (el hash SHA-256 de pg_get_functiondef pre-DROP:
--             aa9c8e3072748b3998d74c3c3500070910a03dba753ca2ea848bba3e45214557)
-- ============================================================================

DO $guard$
DECLARE
  v_oid      oid;
  v_owner    text;
  v_secdef   boolean;
  v_acl      text;
  v_args     text;
  v_def_hash text;
BEGIN
  SELECT p.oid,
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         array_to_string(COALESCE(p.proacl, '{NULL}'), ','),
         pg_get_function_identity_arguments(p.oid)
    INTO v_oid, v_owner, v_secdef, v_acl, v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'reverse_transaction'
    AND n.nspname = 'public';

  -- Idempotencia: ya retirada → no-op seguro
  IF v_oid IS NULL THEN
    RAISE NOTICE 'H5-B1: public.reverse_transaction ya ausente — no-op';
    RETURN;
  END IF;

  -- GUARD 1: firma exacta (identity args con nombres, PG17)
  IF v_args <> 'p_transaction_id uuid, p_reason text, p_user_id uuid' THEN
    RAISE EXCEPTION 'H5-B1 GUARD FAIL: firma inesperada [%]', v_args;
  END IF;

  -- GUARD 2: owner
  IF v_owner <> 'postgres' THEN
    RAISE EXCEPTION 'H5-B1 GUARD FAIL: owner inesperado [%]', v_owner;
  END IF;

  -- GUARD 3: SECURITY DEFINER
  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'H5-B1 GUARD FAIL: se esperaba SECURITY DEFINER';
  END IF;

  -- GUARD 4: ACL exacta (estado post hardening W9 F06-C2)
  IF v_acl <> 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'H5-B1 GUARD FAIL: ACL inesperada [%]', v_acl;
  END IF;

  -- GUARD 5: hash del cuerpo = versión V2.12.12 auditada (evita borrar otra cosa)
  SELECT encode(digest(pg_get_functiondef(v_oid), 'sha256'), 'hex')
    INTO v_def_hash;
  IF v_def_hash <> 'aa9c8e3072748b3998d74c3c3500070910a03dba753ca2ea848bba3e45214557' THEN
    RAISE EXCEPTION 'H5-B1 GUARD FAIL: definición no coincide con V2.12.12 auditada (hash=%)', v_def_hash;
  END IF;

  IF v_oid <> 136653 THEN
    -- Informativo, no fatal (el OID es específico de esta instancia; el hash ya
    -- garantiza la identidad del cuerpo)
    RAISE NOTICE 'H5-B1: OID % difiere del auditado 136653 — cuerpo idéntico, se continúa', v_oid;
  END IF;

  DROP FUNCTION public.reverse_transaction(uuid, text, uuid);
  RAISE NOTICE 'H5-B1: public.reverse_transaction(uuid,text,uuid) retirada (OID %)', v_oid;
END
$guard$;
