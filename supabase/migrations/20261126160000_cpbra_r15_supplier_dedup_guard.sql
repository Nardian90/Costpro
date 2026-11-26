-- ============================================================================
-- CP-BRA-REMEDIATION-001 (20261126160000) — R-15: dedup server-side de
-- proveedores locales (PRO-001).
--
-- Defecto (RISK-REGISTER R-15): `suppliers` sin UNIQUE y sin NINGÚN control
--   server-side de duplicados — el INSERT directo del cliente (RLS abierto a
--   miembros) permitía duplicar terceros silenciosamente (incidente real
--   «Tienda Pueblo» vs «TiendaPueblo»). La advertencia de la UI (#1716)
--   protegía SOLO el frontend; la capa autoritativa seguía expuesta
--   (misión §5: una regla no puede considerarse protegida solo en frontend).
--
-- Corrección (respeta la decisión del propietario §8.4 de CP-AP-ACCOUNTING:
--   unicidad NO estricta por nombre — la duplicación DELIBERADA sigue
--   permitida, pero nunca silenciosa):
--   · RPC create_supplier_local como vía autoritativa de alta local:
--     - reuso EXACTO case-insensitive (comportamiento vigente del hook);
--     - sospechosos por nombre normalizado (espaciado/caso), NIT o teléfono;
--     - con sospechosos: O confirmación explícita (p_confirm_duplicate +
--       p_duplicate_reason) + auditoría SUPPLIER_DUPLICATE_CONFIRMED,
--       O rechazo fail-closed ERR_SUPPLIER_DUPLICATE_SUSPECTED (con los
--       candidatos en el mensaje);
--     - autorización: has_store_access_as / admin, anti-spoofing p_user_id.
--
-- NO se añade UNIQUE parcial: reversaría la decisión documentada del
--   propietario (§8.4) y exigiría saneamiento histórico previo. El guard RPC
--   cierra la vía silenciosa; la BD aísla por tienda (store_id) como hoy.
--
-- Idempotente (CREATE OR REPLACE). Sin cambios de RLS: el RPC hace su propia
--   autorización y queda EXCLUSIVO para service_role + authenticated (el
--   hook de la app lo invoca con la sesión del usuario).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.create_supplier_local(
  p_store_id uuid,
  p_name text,
  p_tax_id text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_confirm_duplicate boolean DEFAULT false,
  p_duplicate_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_name text := btrim(COALESCE(p_name, ''));
  v_norm text := lower(btrim(COALESCE(p_name, '')));
  v_created public.suppliers;
  v_suspects jsonb;
  v_n_suspects integer := 0;
BEGIN
  -- Validación de entrada (espejo del hook: nombre obligatorio no vacío).
  IF v_name = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_NAME_REQUIRED';
  END IF;

  -- Autorización fail-closed (canon ADN-009: actor de la sesión, nunca del
  -- parámetro del cliente salvo canal service_role).
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF NOT (public.is_admin_check(v_caller)
            OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 1) Reuso EXACTO (case-insensitive): comportamiento vigente del hook —
  --    la coincidencia exacta reutiliza, no inserta.
  SELECT s.* INTO v_created
  FROM public.suppliers s
  WHERE s.store_id = p_store_id
    AND COALESCE(s.is_active, true)
    AND lower(btrim(s.name)) = lower(v_name)
  ORDER BY s.created_at
  LIMIT 1;
  IF v_created.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'reused', 'supplier', to_jsonb(v_created));
  END IF;

  -- 2) Sospechosos R-15: nombre normalizado (espaciado/caso — la causa raíz
  --    del quirk «TiendaPueblo»), NIT o teléfono de un proveedor ACTIVO de
  --    la misma tienda. La coincidencia exacta ya se descartó arriba.
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at), '[]'::jsonb)
    INTO v_suspects
  FROM (
    SELECT s.id, s.name, s.tax_id, s.phone, s.email, s.created_at
    FROM public.suppliers s
    WHERE s.store_id = p_store_id
      AND COALESCE(s.is_active, true)
      AND (
        regexp_replace(lower(btrim(s.name)), '\s', '', 'g') = regexp_replace(v_norm, '\s', '', 'g')
        OR (COALESCE(btrim(p_tax_id), '') <> ''
            AND lower(btrim(COALESCE(s.tax_id, ''))) = lower(btrim(p_tax_id)))
        OR (COALESCE(btrim(p_phone), '') <> ''
            AND btrim(COALESCE(s.phone, '')) = btrim(p_phone))
      )
  ) x;
  v_n_suspects := jsonb_array_length(COALESCE(v_suspects, '[]'::jsonb));

  IF v_n_suspects > 0 THEN
    -- Duplicación sospechada: fail-closed salvo confirmación EXPLÍCITA con
    -- motivo (la decisión del usuario de la UI queda verificada aquí).
    IF NOT (p_confirm_duplicate
            AND length(btrim(COALESCE(p_duplicate_reason, ''))) >= 3) THEN
      RAISE EXCEPTION
        'ERR_SUPPLIER_DUPLICATE_SUSPECTED: hay % proveedor(es) activo(s) coincidente(s) por nombre normalizado/NIT/teléfono en la tienda. Reutilice el existente o confirme la creación deliberada (p_confirm_duplicate=true + p_duplicate_reason). candidatos=%',
        v_n_suspects, v_suspects;
    END IF;
  END IF;

  -- 3) Alta local (normaliza campos opcionales: NULL en vez de cadena vacía).
  INSERT INTO public.suppliers (
    store_id, name, tax_id, phone, email, address, notes, is_active
  ) VALUES (
    p_store_id,
    v_name,
    NULLIF(btrim(COALESCE(p_tax_id, '')), ''),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_email, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    true
  )
  RETURNING * INTO v_created;

  -- 4) Trazabilidad: la duplicación deliberada se audita SIEMPRE (nunca
  --    silenciosa). Sin sospechos: alta normal (sin ruido de auditoría).
  IF v_n_suspects > 0 THEN
    INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
    VALUES (v_caller, p_store_id, 'SUPPLIER_DUPLICATE_CONFIRMED', 'suppliers', v_created.id,
      jsonb_build_object(
        'name', v_name,
        'reason', btrim(COALESCE(p_duplicate_reason, '')),
        'candidates', v_suspects,
        'decision', 'explicit_user_confirmation'
      ));
  END IF;

  RETURN jsonb_build_object('status', 'created', 'supplier', to_jsonb(v_created));
END $function$;

REVOKE EXECUTE ON FUNCTION public.create_supplier_local(uuid, text, text, text, text, text, text, boolean, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_local(uuid, text, text, text, text, text, text, boolean, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_supplier_local(uuid, text, text, text, text, text, text, boolean, text, uuid) IS
  'CP-BRA-REMEDIATION-001 (R-15): alta autoritativa de proveedor local con dedup server-side — reuso exacto; sospechosos por nombre normalizado/NIT/teléfono → ERR_SUPPLIER_DUPLICATE_SUSPECTED salvo confirmación explícita auditada (SUPPLIER_DUPLICATE_CONFIRMED). Unicidad NO estricta por decisión del propietario (§8.4 CP-AP): la duplicación deliberada es posible pero jamás silenciosa.';

COMMIT;
