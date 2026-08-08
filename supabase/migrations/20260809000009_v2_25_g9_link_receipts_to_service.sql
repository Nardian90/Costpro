-- ══════════════════════════════════════════════════════════════════════
-- F-30 G9 — RPC link_receipts_to_service (cross-store validation + INSERT atomico)
-- Resuelve: Iter 3 (2C+4A), Iter 9 #10
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.link_receipts_to_service(
  p_service_id uuid,
  p_receipt_ids jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_status text;
  v_receipt_id uuid;
  v_count integer := 0;
  v_allocated_per_receipt numeric;
  v_total_receipts integer;
  v_service_total numeric;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, total_amount INTO v_store_id, v_status, v_service_total
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_ACTIVE: cannot link to % service', v_status;
  END IF;

  IF p_receipt_ids IS NULL OR jsonb_array_length(p_receipt_ids) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_RECEIPT_IDS';
  END IF;

  v_total_receipts := jsonb_array_length(p_receipt_ids);
  v_allocated_per_receipt := v_service_total / v_total_receipts;

  FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM receipts
      WHERE id = v_receipt_id AND store_id = v_store_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
    END IF;
  END LOOP;

  FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) ORDER BY value LOOP
    INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
    VALUES (p_service_id, v_receipt_id, 100.0 / v_total_receipts, v_allocated_per_receipt);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_LINKED', 'received_services', p_service_id,
    jsonb_build_object('receipt_ids_linked', v_count, 'receipt_ids', p_receipt_ids));

  RETURN jsonb_build_object('status', 'success', 'links_created', v_count);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.link_receipts_to_service TO authenticated;
