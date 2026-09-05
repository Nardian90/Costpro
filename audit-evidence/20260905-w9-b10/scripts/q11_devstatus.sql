SELECT substring(pg_get_functiondef('public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text)'::regprocedure) from '''completed''[^;]*') AS init_status
UNION ALL
SELECT 'LIVE DISTRIBUTION: ' || coalesce(string_agg(status || '=' || n::text, ', '), 'empty')
FROM (SELECT status, count(*)::int AS n FROM public.devolutions GROUP BY status) s
UNION ALL
SELECT 'ADJ: ' || coalesce(string_agg(status || '=' || n::text, ', '), 'empty')
FROM (SELECT status, count(*)::int AS n FROM public.inventory_adjustments GROUP BY status) s
UNION ALL
SELECT 'RECEIPTS: ' || coalesce(string_agg(status || '=' || n::text, ', '), 'empty')
FROM (SELECT status, count(*)::int AS n FROM public.receipts GROUP BY status) s
UNION ALL
SELECT 'TRANSFERS: ' || coalesce(string_agg(status || '=' || n::text, ', '), 'empty')
FROM (SELECT status, count(*)::int AS n FROM public.transfers GROUP BY status) s
UNION ALL
SELECT 'PROD: ' || coalesce(string_agg(status || '=' || n::text, ', '), 'empty')
FROM (SELECT status, count(*)::int AS n FROM public.production_orders GROUP BY status) s;
