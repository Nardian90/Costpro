-- esquemas no-plataforma (lista simple, sin joins)
select n.nspname
from pg_namespace n
where n.nspname not in ('information_schema','pg_catalog','auth','storage','supabase_functions',
      'supabase_migrations','extensions','graphql','graphql_public','pgsodium','pgsodium_masks',
      'vault','net','pgtle','realtime','cron','pgbouncer','analytics')
  and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
order by 1;
