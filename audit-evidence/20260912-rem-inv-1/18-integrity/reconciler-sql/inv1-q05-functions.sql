-- Fase 1: funciones RPC del modelo económico (nombre, args, security, volatile)
SELECT p.proname AS fn_name,
       pg_get_function_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       l.lanname AS language
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public'
  AND (p.proname ~* 'stock|invent|kardex|receip|transfer|devol|return|production|wac|cost|adjust|reverse|void|movement|deduct|warehouse|lot|prorrate|distribut|reconcil')
ORDER BY p.proname, 2;
