-- ══════════════════════════════════════════════════════════════════════
-- F-20 G7 — set_purchase_order_status RPC (state machine server-side)
-- Condición #6: Definir transiciones manuales válidas con auditoría
-- ══════════════════════════════════════════════════════════════════════
--
-- Tabla de transiciones permitidas:
-- | Desde    | Hacia      | Permitido |
-- |----------|-----------|-----------|
-- | draft    | sent      | ✅        |
-- | draft    | cancelled | ✅        |
-- | sent     | cancelled | ✅        |
-- | partial  | cancelled | ✅        |
-- | received | *         | ❌ (terminal) |
-- | cancelled| *         | ❌ (terminal) |
-- | *        | partial   | ❌ (solo vía receive_against_po) |
-- | *        | received  | ❌ (solo vía receive_against_po) |
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_purchase_order_status(
  p_po_id uuid,
  p_new_status public.purchase_status_enum,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id     uuid;
  v_current      public.purchase_status_enum;
  v_po_number    text;
  v_allowed      text[];
  v_is_allowed   boolean := false;
BEGIN
  -- ─── 1. Cargar PO con lock exclusivo ───
  SELECT store_id, status, po_number
    INTO v_store_id, v_current, v_po_number
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Si no hay cambio, retornar success sin hacer nada ───
  IF v_current = p_new_status THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'po_status', v_current::text,
      'po_number', v_po_number
    );
  END IF;

  -- ─── 4. Definir transiciones permitidas (state machine) ───
  -- 'partial' y 'received' NUNCA son destino válido manualmente
  -- (solo vía receive_against_po).
  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'    THEN ARRAY['cancelled']
    WHEN 'partial' THEN ARRAY['cancelled']
    ELSE ARRAY[]::text[]  -- received, cancelled: terminal, no transitions
  END;

  -- ─── 5. Verificar transición permitida ───
  SELECT EXISTS(SELECT 1 FROM unnest(v_allowed) a WHERE a = p_new_status::text)
    INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current::text, p_new_status::text,
      CASE WHEN array_length(v_allowed, 1) IS NULL THEN 'none' ELSE array_to_string(v_allowed, ', ') END;
  END IF;

  -- ─── 6. Aplicar transición ───
  UPDATE public.purchase_orders
  SET status      = p_new_status,
      received_at = CASE WHEN p_new_status = 'received' THEN NOW() ELSE received_at END
  WHERE id = p_po_id;

  -- ─── 7. Auditoría (action = PO_STATUS_CHANGED) ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_user_id, v_store_id, 'PO_STATUS_CHANGED', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'po_number', v_po_number,
      'from_status', v_current::text,
      'to_status', p_new_status::text,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', p_new_status::text,
    'po_number', v_po_number,
    'previous_status', v_current::text
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(uuid, public.purchase_status_enum, uuid, text) TO authenticated;

-- ═══ DOWN ═══
-- DROP FUNCTION IF EXISTS public.set_purchase_order_status(uuid, public.purchase_status_enum, uuid, text);
