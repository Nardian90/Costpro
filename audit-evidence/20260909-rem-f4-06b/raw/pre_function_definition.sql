# SQL RUN — 2026-09-09T22:47:42.709Z
# file: p7_pre_def_capture.sql
# endpoint: Management API query (project ********************)

===== STATEMENT: PRE_FUNCTION_DEFINITION_FOR_ROLLBACK =====
HTTP 201
[
  {
    "pre_definition": "CREATE OR REPLACE FUNCTION public.audit_fiscal_closings_changes()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'\nAS $function$\nDECLARE\n  v_action text;\nBEGIN\n  IF TG_OP = 'INSERT' THEN\n    v_action := 'FISCAL_CLOSING_CREATED';\n  ELSIF TG_OP = 'UPDATE' THEN\n    v_action := 'FISCAL_CLOSING_UPDATED';\n  END IF;\n\n  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)\n  VALUES (v_action, 'fiscal_closings',\n    CASE WHEN TG_OP = 'INSERT' THEN NEW.id::text ELSE NEW.id::text END,\n    CASE WHEN TG_OP = 'INSERT' THEN NEW.store_id ELSE NEW.store_id END,\n    auth.uid(),\n    jsonb_build_object(\n      'tg_op', TG_OP,\n      'year', CASE WHEN TG_OP != 'DELETE' THEN NEW.year ELSE NULL END,\n      'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.month ELSE NULL END,\n      'status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END\n    ));\n\n  RETURN NEW;\nEND;\n$function$\n"
  }
]

===== STATEMENT: PRE_PROPERTIES =====
HTTP 201
[
  {
    "owner": "postgres",
    "security_definer": true,
    "config": "search_path=public, pg_temp",
    "signature": "audit_fiscal_closings_changes()"
  }
]

===== RUN RESULT: OK =====
