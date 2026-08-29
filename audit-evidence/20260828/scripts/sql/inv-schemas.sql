-- inventario de alcance: SOLO catálogos (metadatos, cero datos de negocio)
select n.nspname as schema,
       case when n.nspname = 'public' then 'public'
            when n.nspname in ('auth','storage','supabase_functions','supabase_migrations',
                               'extensions','graphql','graphql_public','pgsodium','pgsodium_masks',
                               'vault','net','pgtle','realtime','cron','pgbouncer','analytics')
            then 'platform' else 'other' end as class,
       count(distinct c.oid) filter (where c.relkind in ('r','p')) as tables,
       count(distinct c.oid) filter (where c.relkind in ('v','m')) as views,
       count(distinct p.oid) as routines,
       count(distinct t.oid) filter (where t.typtype='e') as enums,
       count(distinct d.oid) as domains,
       count(distinct c2.oid) as composite_types
from pg_namespace n
left join pg_class c on c.relnamespace = n.oid
left join pg_proc p on p.pronamespace = n.oid
left join pg_type t on t.typnamespace = n.oid and t.typtype='e'
left join pg_type d on d.typnamespace = n.oid and d.typtype='d'
left join pg_type c2 on c2.typnamespace = n.oid and c2.typtype='c'
where n.nspname not in ('information_schema','pg_catalog')
  and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
group by n.nspname
order by n.nspname;
