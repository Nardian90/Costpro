-- ══════════════════════════════════════════════════════════════════════
-- F-30 HOTFIX v2.25.1 — Fix 2 bugs encontrados en hot tests
--
-- BUG #1 (ALTO): update_payment_status trigger sobreescribe void reset
--   Causa: void RPC UPDATEs payment_transactions (notes), trigger recalcula
--   payment_status desde SUM(amount_cup) y sobreescribe 'unpaid' → 'paid'
--   Fix: trigger checkea si received_services.status='voided' y skip
--
-- BUG #2 (MEDIO): prevent_received_service_edit no dispara con SET LOCAL
--   Causa: G2 dropeo received_services_read (SELECT USING true) sin crear
--   replacement. Sin SELECT policy, RLS bloquea todas las filas para
--   authenticated. UPDATE afecta 0 rows, trigger nunca dispara.
--   Fix: crear SELECT policy restrictiva con has_store_access
-- ══════════════════════════════════════════════════════════════════════

-- ─── BUG #1 FIX: update_payment_status — skip voided services ───

CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_ref_type TEXT;
  v_ref_id UUID;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
  v_doc_status TEXT;
BEGIN
  v_ref_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_type ELSE NEW.ref_type END;
  v_ref_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_id ELSE NEW.ref_id END;

  IF v_ref_type = 'receipt' THEN
    -- BUG #1 FIX: skip if receipt is voided
    SELECT status INTO v_doc_status FROM receipts WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    -- BUG #1 FIX: skip if received_services is voided
    SELECT status INTO v_doc_status FROM received_services WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type IN ('production_order', 'work') THEN
    SELECT status INTO v_doc_status FROM production_orders WHERE id = v_ref_id;
    IF v_doc_status IN ('cancelled', 'voided') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE production_orders SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ─── BUG #2 FIX: Add SELECT policy on received_services ───
-- G2 dropeo received_services_read (bypass USING true) sin crear replacement.
-- Sin SELECT policy, RLS bloquea todas las filas para authenticated.

CREATE POLICY received_services_select_authenticated
  ON public.received_services
  FOR SELECT TO authenticated
  USING (public.has_store_access(store_id) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
