-- E3: quién escribe cost_average / cost_price (buscadores de WAC)
SELECT p.proname, length(p.prosrc) AS src_len,
       (p.prosrc ~* 'cost_average') AS writes_cost_average,
       (p.prosrc ~* 'cost_price') AS touches_cost_price
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ~* 'cost_average'
ORDER BY p.proname;
