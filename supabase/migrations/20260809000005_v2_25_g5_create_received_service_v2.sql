-- ══════════════════════════════════════════════════════════════════════
-- F-30 G5 — RPC create_received_service_v2 + SEQUENCE
-- Reemplaza postHandler de received-services/route.ts
-- Resuelve: Iter 1 (todos), Iter 3 #2, Iter 8 #1-6
-- ══════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS public.service_number_seq START 1;

CREATE OR REPLACE FUNCTION public.create_received_service_v2(
  p_store_id uuid,
  p_supplier text,
  p_total_amount numeric,
  p_service_type_id uuid DEFAULT NULL,
  p_service_type_name text DEFAULT 'Otro',
  p_service_date date DEFAULT NULL,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_payment_terms_days integer DEFAULT 30,
  p_distribution_method text DEFAULT 'amount',
  p_reference_doc text DEFAULT NULL,
  p_observations text DEFAULT NULL,
  p_receipt_ids jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_service_id uuid;
  v_service_number text;
  v_receipt_id uuid;
  v_count integer;
  v_allocated_per_receipt numeric;
  v_link_count integer;
  v_caller_uid uuid := COALESCE(p_created_by, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
  END IF;

  IF p_exchange_rate < 0.01 OR p_exchange_rate > 10000 THEN
    RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: % out of range [0.01, 10000]', p_exchange_rate;
  END IF;

  IF p_payment_terms_days < 1 OR p_payment_terms_days > 365 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_TERMS: % out of range [1, 365]', p_payment_terms_days;
  END IF;

  IF p_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
    RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
  END IF;

  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id AND store_id = p_store_id AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
    END IF;
  END IF;

  PERFORM public.validate_operation_date(COALESCE(p_service_date, CURRENT_DATE)::timestamp with time zone, p_store_id);

  SELECT 'SRV-' || to_char(COALESCE(p_service_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
         LPAD(nextval('service_number_seq')::text, 5, '0')
  INTO v_service_number;

  INSERT INTO received_services (
    store_id, service_number, service_date, service_type_id, service_type_name,
    supplier, reference_doc, currency, exchange_rate, total_amount,
    observations, status, distribution_method, created_by,
    payment_terms_days, due_date
  ) VALUES (
    p_store_id, v_service_number, COALESCE(p_service_date, CURRENT_DATE),
    p_service_type_id, p_service_type_name, p_supplier, p_reference_doc,
    p_currency, p_exchange_rate, p_total_amount, p_observations,
    'draft', p_distribution_method, v_caller_uid,
    p_payment_terms_days, (COALESCE(p_service_date, CURRENT_DATE) + p_payment_terms_days)::date
  ) RETURNING id INTO v_service_id;

  v_link_count := jsonb_array_length(p_receipt_ids);
  IF v_link_count > 0 THEN
    v_allocated_per_receipt := p_total_amount / v_link_count;
    FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
      IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = p_store_id AND status = 'active') THEN
        RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
      END IF;
      INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
      VALUES (v_service_id, v_receipt_id, 100.0 / v_link_count, v_allocated_per_receipt);
    END LOOP;
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'SERVICE_CREATED', 'received_services', v_service_id,
    jsonb_build_object(
      'service_number', v_service_number, 'supplier', p_supplier,
      'total_amount', p_total_amount, 'currency', p_currency,
      'receipt_ids_linked', v_link_count
    ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', v_service_id,
    'service_number', v_service_number, 'link_count', v_link_count
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_received_service_v2 TO authenticated;
