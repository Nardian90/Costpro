-- E6: quién llama a fn_recalc_wac y a register_stock_movement (matriz de escritores)
SELECT p.proname AS caller,
       (p.prosrc ~* 'fn_recalc_wac\s*\(') AS calls_recalc_wac,
       (p.prosrc ~* 'register_stock_movement\s*\(') AS calls_register,
       (p.prosrc ~* 'insert into public\.stock_movements|insert into stock_movements') AS inserts_movements_direct
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
  AND (p.prosrc ~* 'fn_recalc_wac\s*\(|insert into (public\.)?stock_movements')
ORDER BY caller;
