-- ============================================================================
-- CP-OPS-ENERVIDA — Migración (terceros): consolidación Local ↔ Maestro.
--
-- Causa raíz §3: los registros locales (customers/suppliers con
-- master_party_id NULL) y el Maestro (master_parties por tenant) coexisten
-- sin mecanismo de consolidación controlada — los locales con documentos
-- no se pueden eliminar (protección correcta) pero tampoco vincular, y el
-- guard de historial de delete_master_party comparaba
-- transactions.customer_id (espacio de UUID de customers) contra
-- master_parties.id (espacio distinto) ⇒ inefectivo para el lado cliente.
--
-- Esta migración añade:
--   1. consolidate_local_party: vincular un local a un maestro existente
--      ('link') o promoverlo a maestro ('promove') — SIN borrar el local
--      (la trazabilidad histórica queda intacta), con party_change_log +
--      audit_logs. Un local vinculado deja de aparecer como tercero
--      independiente seleccionable (search_master_parties ya filtra
--      master_party_id IS NULL en su rama local).
--   2. delete_master_party (reemisión): el guard de historial ahora SÍ ve
--      las ventas de los customers VINCULADOS y las recepciones cuyo
--      snapshot coincide con los suppliers VINCULADOS al maestro.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1. consolidate_local_party
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consolidate_local_party(
  p_kind text,
  p_local_id uuid,
  p_mode text,
  p_master_party_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_local record;
  v_store_id uuid;
  v_tenant uuid;
  v_master record;
  v_master_id uuid;
  v_code text;
  v_max_seq integer;
  v_name_dups jsonb := '[]'::jsonb;
  v_is_client boolean;
  v_is_supplier boolean;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF v_kind NOT IN ('supplier', 'customer') THEN
    RAISE EXCEPTION 'ERR_KIND_INVALID: esperaba supplier|customer (recibido: %)', v_kind;
  END IF;
  IF v_mode NOT IN ('link', 'promote') THEN
    RAISE EXCEPTION 'ERR_MODE_INVALID: esperaba link|promote (recibido: %)', v_mode;
  END IF;

  -- Fila local + tienda (la gestión es por tienda, como create_master_party).
  IF v_kind = 'supplier' THEN
    SELECT * INTO v_local FROM public.suppliers WHERE id = p_local_id FOR UPDATE;
  ELSE
    SELECT * INTO v_local FROM public.customers WHERE id = p_local_id FOR UPDATE;
  END IF;
  IF v_local.id IS NULL THEN
    RAISE EXCEPTION 'ERR_LOCAL_PARTY_NOT_FOUND: % %', v_kind, p_local_id;
  END IF;

  v_store_id := v_local.store_id;
  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = v_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin acceso a la tienda del tercero local';
  END IF;
  IF NOT public.is_admin_check(v_caller_uid)
     AND NOT public.has_store_role_as(v_caller_uid, v_store_id, ARRAY['admin','manager','encargado']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: rol insuficiente para consolidar terceros';
  END IF;

  -- Idempotencia: ya vinculado al mismo maestro.
  IF v_local.master_party_id IS NOT NULL THEN
    IF p_mode = 'link' AND p_master_party_id = v_local.master_party_id THEN
      RETURN jsonb_build_object('status', 'no_change',
        'master_party_id', v_local.master_party_id,
        'already_linked', true);
    END IF;
    RAISE EXCEPTION
      'ERR_LOCAL_ALREADY_LINKED: el registro local ya está vinculado al maestro % (desvincule antes o edite desde el maestro)',
      v_local.master_party_id;
  END IF;

  IF v_mode = 'link' THEN
    ------------------------------------------------------------------
    -- VINCULAR a un maestro EXISTENTE (decisión humana explícita: la UI
    -- propone candidatos, nunca se auto-fusiona por nombre).
    ------------------------------------------------------------------
    SELECT * INTO v_master FROM public.master_parties
    WHERE id = p_master_party_id FOR UPDATE;
    IF v_master.id IS NULL THEN
      RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: %', p_master_party_id;
    END IF;
    IF v_master.tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'ERR_TENANT_MISMATCH: el maestro pertenece a otra organización (aislamiento entre tenants)';
    END IF;
    IF v_master.status <> 'active' THEN
      RAISE EXCEPTION 'ERR_PARTY_NOT_ACTIVE: el maestro está %', v_master.status;
    END IF;
    v_master_id := v_master.id;

  ELSE
    ------------------------------------------------------------------
    -- PROMOVER el local a maestro (el local no tiene equivalente y es
    -- válido). Mismas reglas duras de create_master_party: código auto
    -- CP-####, tax_id único por tenant, duplicados suaves de nombre solo
    -- se INFORMAN (nunca fusión automática).
    ------------------------------------------------------------------
    IF COALESCE(btrim(v_local.name), '') = '' OR btrim(v_local.name) = '—' THEN
      RAISE EXCEPTION 'ERR_PARTY_NAME_REQUIRED: el registro local no tiene nombre suficiente para promoverlo (caso pendiente de depuración)';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('master_parties:' || v_tenant::text, 0));
    SELECT COALESCE(max(NULLIF(regexp_replace(m.code, '\D', '', 'g'), '')::integer), 0) + 1
      INTO v_max_seq
      FROM public.master_parties m
     WHERE m.tenant_id = v_tenant AND m.code ~ '^CP-\d+$';
    v_code := 'CP-' || lpad(COALESCE(v_max_seq, 1)::text, 4, '0');

    IF v_kind = 'supplier' AND COALESCE(btrim(v_local.tax_id), '') <> '' AND EXISTS (
      SELECT 1 FROM public.master_parties m
       WHERE m.tenant_id = v_tenant AND upper(btrim(m.tax_id)) = upper(btrim(v_local.tax_id))) THEN
      RAISE EXCEPTION 'ERR_PARTY_TAX_ID_EXISTS: la identificación fiscal % ya pertenece a un tercero del maestro (vincúlelo en su lugar)', v_local.tax_id;
    END IF;
    IF v_kind = 'customer' AND COALESCE(btrim(v_local.ci), '') <> '' AND EXISTS (
      SELECT 1 FROM public.master_parties m
       WHERE m.tenant_id = v_tenant AND upper(btrim(m.tax_id)) = upper(btrim(v_local.ci))) THEN
      RAISE EXCEPTION 'ERR_PARTY_TAX_ID_EXISTS: la identificación % ya pertenece a un tercero del maestro (vincúlelo en su lugar)', v_local.ci;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', m2.id, 'code', m2.code, 'name', m2.name)), '[]'::jsonb)
      INTO v_name_dups
      FROM (SELECT id, code, name FROM public.master_parties
             WHERE tenant_id = v_tenant AND lower(btrim(name)) = lower(btrim(v_local.name))
               AND status = 'active' LIMIT 5) m2;

    v_is_client := (v_kind = 'customer');
    v_is_supplier := (v_kind = 'supplier');

    INSERT INTO public.master_parties
      (tenant_id, code, name, address, phone, email, tax_id, party_type,
       is_client, is_supplier, status, notes, created_by)
    VALUES
      (v_tenant, v_code, btrim(v_local.name),
       v_local.address, v_local.phone, v_local.email,
       CASE WHEN v_kind = 'supplier' THEN NULLIF(btrim(COALESCE(v_local.tax_id, '')), '')
            ELSE NULLIF(btrim(COALESCE(v_local.ci, '')), '') END,
       'natural',
       v_is_client, v_is_supplier, 'active',
       'Promovido desde registro local de la tienda ' || v_store_id::text,
       v_caller_uid)
    RETURNING id INTO v_master_id;

    INSERT INTO public.party_change_log
      (master_party_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
    VALUES
      (v_master_id, v_tenant, 'code', NULL, v_code, v_caller_uid, v_store_id),
      (v_master_id, v_tenant, 'name', NULL, btrim(v_local.name), v_caller_uid, v_store_id);
  END IF;

  -- Vinculación del local (el registro local SE CONSERVA — trazabilidad).
  IF v_kind = 'supplier' THEN
    UPDATE public.suppliers SET master_party_id = v_master_id WHERE id = p_local_id;
  ELSE
    UPDATE public.customers SET master_party_id = v_master_id WHERE id = p_local_id;
  END IF;

  INSERT INTO public.party_change_log
    (master_party_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
  VALUES
    (v_master_id, v_tenant, 'local_link', NULL, v_kind || ':' || p_local_id::text, v_caller_uid, v_store_id);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    CASE WHEN v_mode = 'promote' THEN 'PARTY_PROMOTED_TO_MASTER' ELSE 'PARTY_LINKED_TO_MASTER' END,
    CASE WHEN v_kind = 'supplier' THEN 'suppliers' ELSE 'customers' END,
    p_local_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'kind', v_kind, 'local_id', p_local_id, 'local_name', v_local.name,
      'master_party_id', v_master_id, 'mode', v_mode,
      'name_duplicates_in_master', v_name_dups
    ));

  RETURN jsonb_build_object(
    'status', 'success', 'master_party_id', v_master_id,
    'kind', v_kind, 'local_id', p_local_id, 'mode', v_mode,
    'name_duplicates_in_master', v_name_dups
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consolidate_local_party(text, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_local_party(text, uuid, text, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.consolidate_local_party(text, uuid, text, uuid, uuid) IS
  'CP-OPS-ENERVIDA §3: vincula (link) o promueve (promote) un tercero LOCAL al Maestro sin destruir el registro local. Fusiones de identidad ambigua quedan fuera (decisión humana por la UI).';

-- ---------------------------------------------------------------------------
-- §2. delete_master_party — reemisión con guard de historial CORREGIDO.
--    El espacio de UUID de transactions.customer_id es el de customers: la
--    comparación directa contra master_parties.id era casi siempre falsa.
--    Ahora: ventas de los customers VINCULADOS + recepciones que coinciden
--    con el maestro O con cualquiera de sus suppliers VINCULADOS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_master_party(
  p_party_id uuid,
  p_origin_store_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_party record;
  v_history boolean;
  v_origin_tenant uuid;
BEGIN
  IF v_caller_uid IS NULL OR p_party_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_party FROM public.master_parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PARTY_NOT_FOUND: %', p_party_id;
  END IF;

  IF NOT public.is_catalog_governor(v_party.tenant_id, v_caller_uid) THEN
    IF p_origin_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: se requiere tienda de origen';
    END IF;
    SELECT tenant_id INTO v_origin_tenant FROM public.stores WHERE id = p_origin_store_id;
    IF v_origin_tenant IS NULL OR v_origin_tenant <> v_party.tenant_id THEN
      RAISE EXCEPTION 'ERR_TENANT_MISMATCH: la tienda de origen no pertenece a la organización del tercero';
    END IF;
    IF NOT public.is_party_store_connected(v_party.tenant_id, p_origin_store_id) THEN
      RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda de origen no usa el clasificador';
    END IF;
    IF NOT public.is_admin_check(v_caller_uid)
       AND NOT public.has_store_role_as(v_caller_uid, p_origin_store_id, ARRAY['admin','manager','encargado']) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de eliminación de terceros en la tienda';
    END IF;
  END IF;

  -- CP-OPS-ENERVIDA: historial = OPERACIONES reales. Ahora incluye las
  -- ventas de los CUSTOMERS VINCULADOS al maestro (mismo espacio de UUID) y
  -- las recepciones cuyo snapshot de proveedor coincide con el maestro O
  -- con cualquiera de sus SUPPLIERS VINCULADOS.
  SELECT
      EXISTS (SELECT 1 FROM public.transactions t
               WHERE t.customer_id = p_party_id
                  OR t.customer_id IN (SELECT c.id FROM public.customers c
                                        WHERE c.master_party_id = p_party_id))
      OR EXISTS (
        SELECT 1 FROM public.receipts r
          JOIN public.stores st ON st.id = r.store_id
         WHERE st.tenant_id = v_party.tenant_id
           AND (
             r.supplier = v_party.name
             OR (COALESCE(v_party.tax_id,'') <> '' AND r.supplier_tax_id = v_party.tax_id)
             OR r.supplier IN (SELECT s.name FROM public.suppliers s
                                WHERE s.master_party_id = p_party_id)
             OR EXISTS (SELECT 1 FROM public.suppliers s2
                         WHERE s2.master_party_id = p_party_id
                           AND COALESCE(s2.tax_id, '') <> ''
                           AND r.supplier_tax_id = s2.tax_id)
           )
      )
    INTO v_history;
  IF v_history THEN
    RAISE EXCEPTION 'ERR_PARTY_HAS_HISTORY: el tercero % tiene ventas o recepciones históricas; solo puede desactivarse (status=archived)', p_party_id;
  END IF;

  UPDATE public.customers SET master_party_id = NULL WHERE master_party_id = p_party_id;
  UPDATE public.suppliers SET master_party_id = NULL WHERE master_party_id = p_party_id;
  DELETE FROM public.party_change_log WHERE master_party_id = p_party_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('DELETE_MASTER_PARTY', 'master_parties', p_party_id,
          p_origin_store_id, v_caller_uid,
          jsonb_build_object('code', v_party.code, 'name', v_party.name,
            'is_client', v_party.is_client, 'is_supplier', v_party.is_supplier,
            'tenant_id', v_party.tenant_id));

  DELETE FROM public.master_parties WHERE id = p_party_id;

  RETURN jsonb_build_object('status','success','master_party_id', p_party_id, 'deleted', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_master_party(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_master_party(uuid, uuid, uuid) TO service_role;
