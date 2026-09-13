-- DECLARED FINAL STATE (Git) de fn_validate_document_transition
-- fuente: 20260913000001_rem_inv_3c_restore_document_transition_validator.sql stmt#0

CREATE OR REPLACE FUNCTION public.fn_validate_document_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_table_name TEXT := TG_ARGV[0];
  v_old_status TEXT;
  v_new_status TEXT;
  v_valid_transitions JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_new_status := NEW.status;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_status := NULL;
    v_new_status := NEW.status;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_old_status IS NOT NULL AND v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  v_valid_transitions := jsonb_build_object(
    'production_orders', jsonb_build_object(
      'draft',       '["approved","in_progress","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["paused","completed","voided","reversed"]'::jsonb,
      'paused',      '["in_progress","voided","reversed"]'::jsonb,
      'completed',   '["closed","reversed","voided"]'::jsonb,
      'closed',      '["reversed","voided"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'transactions', jsonb_build_object(
      'pending',     '["completed","voided"]'::jsonb,
      'completed',   '["voided","reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'devolutions', jsonb_build_object(
      'pending',   '["completed","voided"]'::jsonb,
      'completed', '["reversed","voided"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'receipts', jsonb_build_object(
      'pending',   '["confirmed","active","voided"]'::jsonb,
      'confirmed', '["active","reversed","voided"]'::jsonb,
      'active',    '["reversed","voided"]'::jsonb,
      'partial',   '["active","confirmed","reversed","voided"]'::jsonb,
      'reversed',  '[]'::jsonb,
      'voided',    '[]'::jsonb
    ),
    'transfers', jsonb_build_object(
      'PENDIENTE',  '["CONFIRMADA","CANCELADA"]'::jsonb,
      'CONFIRMADA', '["REVERSADA"]'::jsonb,
      'CANCELADA',  '[]'::jsonb,
      'REVERSADA',  '[]'::jsonb
    ),
    'inventory_adjustments', jsonb_build_object(
      'pending',   '["confirmed","reversed","voided"]'::jsonb,
      'confirmed', '["reversed"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    )
  );

  IF v_old_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF (v_valid_transitions->v_table_name) IS NULL
     OR NOT COALESCE((v_valid_transitions->v_table_name) ? v_old_status, false)
     OR NOT COALESCE((v_valid_transitions->v_table_name->v_old_status) ? v_new_status, false) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % no puede pasar de % a %',
      v_table_name, v_old_status, v_new_status;
  END IF;

  RETURN NEW;
END;
$function$
