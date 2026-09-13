-- DECLARED FINAL STATE (Git) de auto_match_bank_items
-- fuente: 20260727000006_v2_12_9_spoofing_p_user_id.sql stmt#3

CREATE OR REPLACE FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_store_id uuid;
  v_item RECORD;
  v_matched_count integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  -- Get store_id from statement
  SELECT store_id INTO v_store_id FROM public.bank_statements WHERE id = p_statement_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STATEMENT_NOT_FOUND';
  END IF;

  IF NOT public.has_store_access_as(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Match items: for each unmatched bank_item, find a transaction with same amount (±1) and date (±3 days)
  FOR v_item IN
    SELECT id, amount, type, transaction_date
    FROM public.bank_statement_items
    WHERE bank_statement_id = p_statement_id AND is_matched = false
  LOOP
    IF v_item.type = 'credit' THEN
      -- Match with cash/transfer sales
      UPDATE public.bank_statement_items bsi
      SET matched_transaction_id = t.id, is_matched = true, is_reconciled = true
      FROM public.transactions t
      WHERE bsi.id = v_item.id
        AND t.store_id = v_store_id
        AND t.status = 'completed'
        AND ABS(t.total_amount - v_item.amount) < 1
        AND ABS(t.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transaction_id = t.id AND other.id != bsi.id
        );
    ELSE
      -- Match with receipts (purchases)
      UPDATE public.bank_statement_items bsi
      SET matched_transfer_id = r.id, is_matched = true, is_reconciled = true
      FROM public.receipts r
      WHERE bsi.id = v_item.id
        AND r.store_id = v_store_id
        AND r.status = 'active'
        AND ABS(r.total_cost - v_item.amount) < 1
        AND ABS(r.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transfer_id = r.id AND other.id != bsi.id
        );
    END IF;

    IF FOUND THEN
      v_matched_count := v_matched_count + 1;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
    END IF;
  END LOOP;

  -- Update statement status
  IF v_unmatched_count = 0 THEN
    UPDATE public.bank_statements SET status = 'reconciled', reconciled_by = v_uid, reconciled_at = now(), updated_at = now()
    WHERE id = p_statement_id;
  ELSE
    UPDATE public.bank_statements SET status = 'discrepancy', updated_at = now()
    WHERE id = p_statement_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'matched', v_matched_count,
    'unmatched', v_unmatched_count,
    'statement_status', CASE WHEN v_unmatched_count = 0 THEN 'reconciled' ELSE 'discrepancy' END
  );
END;
$function$
