SELECT jsonb_build_object(
  'fn_validate_document_transition', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_validate_document_transition'),
  'amount_cup_expr', (SELECT c.column_default FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='payment_transactions' AND c.column_name='amount_cup'),
  'reverse_commissions_on_sale_void', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reverse_commissions_on_sale_void'),
  'protect_transactions_total_amount', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='protect_transactions_total_amount')
) AS fns;
