-- DECLARED FINAL STATE (Git) de snapshot_commission_rule
-- fuente: 20260715000010_commission_rules_add_product_mode.sql stmt#5

CREATE OR REPLACE FUNCTION public.snapshot_commission_rule()
RETURNS TRIGGER AS $$
DECLARE
  v_next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.commission_rule_versions
  WHERE rule_id = NEW.id;

  INSERT INTO public.commission_rule_versions (rule_id, version, snapshot, changed_by)
  VALUES (
    NEW.id,
    v_next_version,
    jsonb_build_object(
      'type', NEW.type,
      'value_percent', NEW.value_percent,
      'fixed_value', NEW.fixed_value,
      'salary_amount', NEW.salary_amount,
      'base_calculation', NEW.base_calculation,
      'priority', NEW.priority,
      'valid_from', NEW.valid_from,
      'valid_to', NEW.valid_to,
      'worker_id', NEW.worker_id,
      'store_id', NEW.store_id,
      'min_price', NEW.min_price,
      'max_price', NEW.max_price,
      'product_commission_amount', NEW.product_commission_amount,
      'product_commission_mode', NEW.product_commission_mode,
      'snapshotted_at', now()
    ),
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
